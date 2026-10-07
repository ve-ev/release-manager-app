import {describe, expect, it} from 'vitest';
import source from '../backend.js?raw';

type Endpoint = { method: string; path: string; handle: (ctx: unknown) => void };

const issues: Record<string, { project: { shortName: string }; fields: Record<string, unknown>; extensionProperties: Record<string, unknown> }> = {
  'DEMO-1': {project: {shortName: 'DEMO'}, fields: {}, extensionProperties: {}},
  'OTHER-1': {project: {shortName: 'OTHER'}, fields: {}, extensionProperties: {}}
};
const entitiesStub = {Issue: {findById: (id: string) => issues[id] || null}, Project: {findByKey: () => null}};

// backend.js is a YouTrack CommonJS module; run it with stub YouTrack APIs
const moduleExports: { httpHandler?: { endpoints: Endpoint[] } } = {};
// eslint-disable-next-line no-new-func
new Function('require', 'exports', source)(
  (name: string) => (name.includes('entities') ? entitiesStub : {}),
  moduleExports
);
const endpoints = moduleExports.httpHandler!.endpoints;

function call(method: string, path: string, role: 'rm' | 'lm' | 'none', body: unknown = {}) {
  const endpoint = endpoints.find(e => e.method === method && e.path === path)!;
  const project = {
    shortName: 'DEMO',
    extensionProperties: {
      releases: JSON.stringify([{id: '1', version: '1.0', releaseDate: '2026-01-01', status: 'Planning'}]),
      appSettings: JSON.stringify({customFieldMapping: {plannedReleaseField: 'Fix versions'}})
    } as Record<string, string>,
    findFieldByName: (name: string) => ({name, findValueByName: () => null, createValue: (v: string) => ({name: v})})
  };
  const ctx = {
    settings: {releaseManagers: [{name: 'rm'}], lightManagers: [{name: 'lm'}], customFieldsMapping: true},
    currentUser: {login: 'u', isInGroup: (group: string) => group === role},
    project,
    globalStorage: {extensionProperties: {}},
    request: {json: () => body, getParameter: () => '1'},
    response: {code: 200, json: () => {}}
  };
  endpoint.handle(ctx);
  return {code: ctx.response.code, project};
}

const FORBIDDEN = 403;

describe('write endpoints enforce roles on the server', () => {
  it.each([
    ['POST', 'releases'],
    ['DELETE', 'release'],
    ['PUT', 'app-settings'],
    ['POST', 'import-versions']
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

describe('audit events', () => {
  it('keeps only the newest events of a release on save', () => {
    const auditEvents = Array.from({length: 250}, (_, i) => ({type: 'STATUS_CHANGED', at: String(i)}));
    const releases = [{id: '1', version: '1.0', releaseDate: '2026-01-01', status: 'Planning', auditEvents}];
    const {project} = call('PUT', 'expanded-version', 'rm');
    project.extensionProperties.releases = JSON.stringify(releases);
    const endpoint = endpoints.find(e => e.method === 'PUT' && e.path === 'release')!;
    const ctx = {
      settings: {releaseManagers: [{name: 'rm'}]},
      currentUser: {login: 'u', isInGroup: (g: string) => g === 'rm'},
      project,
      request: {json: () => ({...releases[0], auditEvents: undefined, description: 'x'}), getParameter: () => '1'},
      response: {code: 200, json: () => {}}
    };
    endpoint.handle(ctx);
    const saved = JSON.parse(project.extensionProperties.releases)[0].auditEvents;
    expect(saved).toHaveLength(200);
    expect(saved[saved.length - 1].type).toBe('DESCRIPTION_CHANGED');
  });
});
