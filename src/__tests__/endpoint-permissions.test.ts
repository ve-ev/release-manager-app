import {describe, expect, it} from 'vitest';
import source from '../backend.js?raw';
import {loadWebhooks} from './helpers/load-webhooks';

type Endpoint = { method: string; path: string; handle: (ctx: unknown) => void };

const issues: Record<string, { project: { shortName: string }; fields: Record<string, unknown>; extensionProperties: Record<string, unknown> }> = {
  'DEMO-1': {project: {shortName: 'DEMO'}, fields: {}, extensionProperties: {}},
  'OTHER-1': {project: {shortName: 'OTHER'}, fields: {}, extensionProperties: {}}
};
const entitiesStub = {Issue: {findById: (id: string) => issues[id] || null}, Project: {findByKey: () => null}};

// backend.js is a YouTrack CommonJS module; run it with stub YouTrack APIs
const moduleExports: { httpHandler?: { endpoints: Endpoint[] } } = {};
const {webhooks} = loadWebhooks();
// eslint-disable-next-line no-new-func
new Function('require', 'exports', source)(
  (name: string) => {
    if (name.includes('entities')) { return entitiesStub; }
    return name.includes('webhooks') ? webhooks : {};
  },
  moduleExports
);
const endpoints = moduleExports.httpHandler!.endpoints;

function call(method: string, path: string, role: 'rm' | 'lm' | 'none', body: unknown = {}, props: Record<string, string> = {}) {
  const endpoint = endpoints.find(e => e.method === method && e.path === path)!;
  const project = {
    shortName: 'DEMO',
    extensionProperties: {
      releases: JSON.stringify([{id: '1', version: '1.0', releaseDate: '2026-01-01', status: 'Planning'}]),
      appSettings: JSON.stringify({customFieldMapping: {plannedReleaseField: 'Fix versions'}}),
      ...props
    } as Record<string, string>,
    findFieldByName: (name: string) => ({name, findValueByName: () => null, createValue: (v: string) => ({name: v})})
  };
  const ctx = {
    settings: {releaseManagers: [{name: 'rm'}], lightManagers: [{name: 'lm'}], customFieldsMapping: true, outboundWebhooks: true},
    currentUser: {login: 'u', isInGroup: (group: string) => group === role},
    project,
    globalStorage: {extensionProperties: {}},
    request: {json: () => body, getParameter: () => '1'},
    response: {code: 200, body: undefined as unknown, json(value: unknown) { this.body = value; }}
  };
  endpoint.handle(ctx);
  return {code: ctx.response.code, project, body: ctx.response.body};
}

const FORBIDDEN = 403;

describe('write endpoints enforce roles on the server', () => {
  it.each([
    ['POST', 'releases'],
    ['DELETE', 'release'],
    ['PUT', 'app-settings'],
    ['POST', 'import-versions'],
    ['GET', 'webhooks'],
    ['PUT', 'webhooks'],
    ['POST', 'webhooks-test']
  ])('%s %s is for release managers only', (method, path) => {
    expect(call(method, path, 'lm').code).toBe(FORBIDDEN);
    expect(call(method, path, 'none').code).toBe(FORBIDDEN);
  });

  it.each([
    ['PUT', 'release'],
    ['PUT', 'issue-status'],
    ['PUT', 'issue-test-status'],
    ['POST', 'custom-field-set']
  ])('%s %s rejects users without a manager role', (method, path) => {
    const {code, project} = call(method, path, 'none', {issueId: 'DEMO-1', status: 'Fixed', testStatus: 'Tested'});
    expect(code).toBe(FORBIDDEN);
    expect(project.extensionProperties.issueStatusData).toBeUndefined();
  });

  it('lets a light manager change issue status', () => {
    expect(call('PUT', 'issue-status', 'lm', {issueId: 'DEMO-1', status: 'Fixed'}).code).toBe(200);
  });
});

describe('custom-field-set', () => {
  it('rejects issues from another project and unmapped fields', () => {
    expect(call('POST', 'custom-field-set', 'rm', {issueId: 'OTHER-1', fieldName: 'Fix versions', value: '1.0'}).code).toBe(400);
    expect(call('POST', 'custom-field-set', 'rm', {issueId: 'DEMO-1', fieldName: 'Assignee', value: 'x'}).code).toBe(400);
    expect(issues['OTHER-1'].extensionProperties.updatedByReleaseManager).toBeUndefined();
  });

  it('sets the mapped field on an issue of this project', () => {
    expect(call('POST', 'custom-field-set', 'lm', {issueId: 'DEMO-1', fieldName: 'Fix versions', value: '1.0'}).code).toBe(200);
    expect(issues['DEMO-1'].fields['Fix versions']).toEqual({name: '1.0'});
  });
});

function makeProject(releases: unknown[]) {
  return {shortName: 'DEMO', extensionProperties: {releases: JSON.stringify(releases)} as Record<string, string>, findFieldByName: () => null};
}

function putRelease(project: ReturnType<typeof makeProject>, body: Record<string, unknown>) {
  const endpoint = endpoints.find(e => e.method === 'PUT' && e.path === 'release')!;
  let responseBody: {revision?: number} = {};
  const ctx = {
    settings: {releaseManagers: [{name: 'rm'}]},
    currentUser: {login: 'u', isInGroup: (g: string) => g === 'rm'},
    project,
    request: {json: () => body, getParameter: () => '1'},
    response: {code: 200, json: (b: {revision?: number}) => { responseBody = b; }}
  };
  endpoint.handle(ctx);
  return {code: ctx.response.code, body: responseBody};
}

const storedRelease = (project: ReturnType<typeof makeProject>) => JSON.parse(project.extensionProperties.releases)[0];
const release = {id: '1', version: '1.0', releaseDate: '2026-01-01', status: 'Planning'};

describe('audit events', () => {
  it('keeps only the newest events of a release on save', () => {
    const auditEvents = Array.from({length: 250}, (_, i) => ({type: 'STATUS_CHANGED', at: String(i)}));
    const project = makeProject([{...release, auditEvents}]);
    expect(putRelease(project, {...release, description: 'x'}).code).toBe(200);
    const saved = storedRelease(project).auditEvents;
    expect(saved).toHaveLength(200);
    expect(saved[saved.length - 1].type).toBe('DESCRIPTION_CHANGED');
  });
});

describe('release revisions', () => {
  it('treats a release saved before revisions existed as revision 0 and increments it on change', () => {
    const project = makeProject([release]);
    const {code, body} = putRelease(project, {...release, revision: 0, description: 'x'});
    expect(code).toBe(200);
    expect(body.revision).toBe(1);
    expect(storedRelease(project).revision).toBe(1);
  });

  it('rejects a save based on a stale revision and keeps the stored release', () => {
    const project = makeProject([{...release, revision: 3, plannedIssues: [{id: 'DEMO-1'}]}]);
    expect(putRelease(project, {...release, revision: 2, plannedIssues: []}).code).toBe(409);
    expect(storedRelease(project).plannedIssues).toEqual([{id: 'DEMO-1'}]);
  });

  it('accepts a save without a revision (a client loaded before the update)', () => {
    const project = makeProject([{...release, revision: 3}]);
    expect(putRelease(project, {...release, description: 'x'}).code).toBe(200);
    expect(storedRelease(project).revision).toBe(4);
  });

  it('increments the revision when a workflow changes the release', () => {
    const project = makeProject([{...release, revision: 3}]);
    const addIssueToRelease = (moduleExports as unknown as {addIssueToRelease: (ctx: unknown, releaseId: string, issueId: string) => void}).addIssueToRelease;
    addIssueToRelease({project}, '1', 'DEMO-1');
    expect(storedRelease(project).revision).toBe(4);
    expect(putRelease(project, {...release, revision: 3}).code).toBe(409);
  });
});

describe('webhooks endpoints', () => {
  const SECRET = 's'.repeat(40);
  const stored = JSON.stringify([{
    id: 'h1', name: 'CI', url: 'https://ci.example.com/hook', secret: SECRET,
    events: ['RELEASE_COMPLETED'], enabled: true, lastDelivery: {at: 't', code: 200, error: null}
  }]);

  it('GET never returns the secret', () => {
    const {body} = call('GET', 'webhooks', 'rm', {}, {webhooks: stored});
    const hooks = (body as { webhooks: Record<string, unknown>[] }).webhooks;
    expect(hooks[0].secret).toBeUndefined();
    expect(hooks[0].hasSecret).toBe(true);
  });

  it('PUT keeps the stored secret and lastDelivery when the widget sends an empty secret', () => {
    const {code, project} = call('PUT', 'webhooks', 'rm', {
      webhooks: [{id: 'h1', name: 'CI 2', url: 'https://ci.example.com/hook', secret: '', events: ['STATUS_CHANGED'], lastDelivery: null}]
    }, {webhooks: stored});
    expect(code).toBe(200);
    const saved = JSON.parse(project.extensionProperties.webhooks);
    expect(saved[0]).toMatchObject({id: 'h1', name: 'CI 2', secret: SECRET, events: ['STATUS_CHANGED']});
    expect(saved[0].lastDelivery).toMatchObject({code: 200});
  });

  it('PUT rejects more than 5 webhooks and leaves the stored ones', () => {
    const hook = {url: 'https://ci.example.com/hook', secret: SECRET, events: []};
    const {code, project} = call('PUT', 'webhooks', 'rm', {webhooks: Array(6).fill(hook)}, {webhooks: stored});
    expect(code).toBe(400);
    expect(project.extensionProperties.webhooks).toBe(stored);
  });
});

describe('webhooks validation errors', () => {
  it('PUT tells which webhook has the error', () => {
    const ok = {url: 'https://ci.example.com/hook', secret: 's'.repeat(40), events: []};
    const {code, body} = call('PUT', 'webhooks', 'rm', {webhooks: [ok, {...ok, secret: 'short'}]});
    expect(code).toBe(400);
    expect(body).toMatchObject({webhookIndex: 1, error: expect.stringMatching(/secret/)});
  });
});
