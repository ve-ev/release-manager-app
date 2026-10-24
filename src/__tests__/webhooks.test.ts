import {describe, expect, it} from 'vitest';
import {loadWebhooks, type HttpResponse} from './helpers/load-webhooks';

const SECRET = 's'.repeat(40);
const HOOK = {id: 'h1', name: 'CI', url: 'https://ci.example.com/hook', secret: SECRET, events: ['STATUS_CHANGED'], enabled: true};

function setup(respond?: (url: string) => HttpResponse) {
  const {webhooks, calls} = loadWebhooks(respond);
  const stored: Record<string, unknown> = {};
  const invokes: { name: string; delay: number }[] = [];
  const project = {shortName: 'DEMO', name: 'Demo', extensionProperties: {webhooks: JSON.stringify([HOOK])} as Record<string, string | null>};
  const newCtx = () => ({
    settings: {outboundWebhooks: true},
    currentUser: {login: 'jdoe', fullName: 'John Doe'},
    project,
    store: (k: string, v: unknown) => { stored[k] = v; },
    load: (k: string) => stored[k],
    invokeAsync: (name: string, delay: number) => { invokes.push({name, delay}); }
  });
  const outbox = () => JSON.parse(project.extensionProperties.webhookOutbox || '[]');
  const hook = () => JSON.parse(project.extensionProperties.webhooks!)[0];
  return {webhooks, calls, invokes, project, newCtx, outbox, hook};
}

const statusChange = {type: 'STATUS_CHANGED', at: '2026-01-15T12:00:00Z', by: 'jdoe', releaseId: '1', releaseVersion: '2.4.0', fromStatus: 'Planning', toStatus: 'In progress'};
const before = [{id: '1', version: '2.4.0', status: 'Planning', auditEvents: []}];
const after = [{id: '1', version: '2.4.0', status: 'In progress', plannedIssues: [{id: 'DEMO-1'}], auditEvents: [statusChange]}];

describe('collectEvents', () => {
  it('finds new audit events, created releases, and deleted releases, but not stored events', () => {
    const {webhooks} = setup();
    const old = {type: 'DESCRIPTION_CHANGED', at: 'a'};
    const events = webhooks.collectEvents(
      [{id: '1', auditEvents: [old]}, {id: '3'}],
      [{id: '1', auditEvents: [old, statusChange, {type: 'NOT_A_WEBHOOK_EVENT'}]}, {id: '2'}],
      'now'
    );
    expect(events.map((e: { event: string }) => e.event)).toEqual(['STATUS_CHANGED', 'RELEASE_CREATED', 'RELEASE_DELETED']);
  });
});

describe('toCloudEvent', () => {
  it('builds a CloudEvents 1.0 event with the release data', () => {
    const {webhooks, project} = setup();
    const [item] = webhooks.collectEvents(before, after, 'now');
    const ce = webhooks.toCloudEvent(item, project, {login: 'jdoe', fullName: 'John Doe'});
    expect(ce).toMatchObject({
      specversion: '1.0',
      source: '/projects/DEMO/release-manager',
      type: 'youtrack.release-manager.release.status-changed',
      subject: '2.4.0',
      time: '2026-01-15T12:00:00Z',
      datacontenttype: 'application/json',
      data: {
        event: 'STATUS_CHANGED',
        release: {id: '1', status: {from: 'Planning', to: 'In progress'}, plannedIssues: ['DEMO-1']},
        actor: {login: 'jdoe', fullName: 'John Doe'},
        details: {fromStatus: 'Planning', toStatus: 'In progress'}
      }
    });
    expect(ce.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ce.data.details.type).toBeUndefined();
  });
});

describe('mergeWebhooks', () => {
  it('rejects unknown events and short secrets', () => {
    const {webhooks} = setup();
    expect(webhooks.mergeWebhooks([{...HOOK, id: undefined, events: ['NOPE']}], []).error).toMatch(/Unknown events/);
    expect(webhooks.mergeWebhooks([{...HOOK, id: undefined, secret: 'short'}], []).error).toMatch(/secret/);
  });

  it('keeps the stored secret only while the URL stays the same', () => {
    const {webhooks} = setup();
    const stored = [{...HOOK}];
    const sameUrl = webhooks.mergeWebhooks([{...HOOK, name: 'Renamed', secret: ''}], stored);
    expect(sameUrl.webhooks[0].secret).toBe(SECRET);
    for (const url of ['https://attacker.example.net/hook', 'https://ci.example.com:8443/hook', 'https://ci.example.com/other-user']) {
      expect(webhooks.mergeWebhooks([{...HOOK, url, secret: ''}], stored).error).toMatch(/Enter the secret again/);
    }
    const newSecret = webhooks.mergeWebhooks([{...HOOK, url: 'https://attacker.example.net/hook', secret: 'n'.repeat(40)}], stored);
    expect(newSecret.webhooks[0].secret).toBe('n'.repeat(40));
  });

  it('gives a new webhook an id', () => {
    const {webhooks} = setup();
    const {webhooks: merged} = webhooks.mergeWebhooks([{...HOOK, id: undefined}], []);
    expect(merged[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('enqueue and deliverWebhooks', () => {
  it('does nothing when the feature is off', () => {
    const {webhooks, newCtx, outbox, invokes} = setup();
    webhooks.enqueue({...newCtx(), settings: {outboundWebhooks: false}}, before, after);
    expect(outbox()).toEqual([]);
    expect(invokes).toEqual([]);
  });

  it('schedules delivery once per execution and sends the event after the commit', () => {
    const {webhooks, newCtx, outbox, invokes, calls, hook} = setup();
    const ctx = newCtx();
    webhooks.enqueue(ctx, before, after);
    webhooks.enqueue(ctx, before, after);
    expect(outbox()).toHaveLength(2);
    expect(invokes).toEqual([{name: 'deliverWebhooks', delay: 0}]);

    webhooks.deliverWebhooks(newCtx());
    expect(calls).toHaveLength(2);
    expect(calls[0].headers).toMatchObject({'Content-Type': 'application/cloudevents+json', Authorization: 'Bearer ' + SECRET});
    expect(JSON.parse(calls[0].payload).type).toBe('youtrack.release-manager.release.status-changed');
    expect(outbox()).toEqual([]);
    expect(hook().lastDelivery).toMatchObject({code: 200, error: null});
  });

  it('retries a failed delivery and drops it after 3 attempts', () => {
    const {webhooks, newCtx, outbox, invokes, calls, hook, project} = setup(() => ({code: 500, isSuccess: false}));
    webhooks.enqueue(newCtx(), before, after);
    for (let attempt = 1; attempt <= 3; attempt++) {
      webhooks.deliverWebhooks(newCtx());
      // the test does not wait for the retry delay
      const pending = outbox().map((e: object) => ({...e, notBefore: 0}));
      project.extensionProperties.webhookOutbox = pending.length ? JSON.stringify(pending) : null;
    }
    expect(calls).toHaveLength(3);
    expect(outbox()).toEqual([]);
    expect(hook().lastDelivery).toMatchObject({code: 500, error: 'HTTP 500'});
    expect(invokes.slice(1).every(i => i.delay > 0)).toBe(true);
  });

  it('treats a redirect as a failed delivery, because the YouTrack client does not follow it', () => {
    // The YouTrack http client sets isSuccess for 3xx too (checked on YouTrack 2026.2)
    const {webhooks, newCtx, hook, outbox} = setup(() => ({code: 302, isSuccess: true}));
    webhooks.enqueue(newCtx(), before, after);
    webhooks.deliverWebhooks(newCtx());
    expect(hook().lastDelivery).toMatchObject({code: 302, error: expect.stringMatching(/redirects are not followed/)});
    expect(outbox()[0].attempt).toBe(1);
  });

  it('reports a timeout when there is no response code', () => {
    const {webhooks, newCtx, hook} = setup(() => ({isSuccess: false}));
    webhooks.enqueue(newCtx(), before, after);
    webhooks.deliverWebhooks(newCtx());
    expect(hook().lastDelivery.error).toMatch(/No response/);
  });
});

describe('validateWebhookUrl', () => {
  it.each([
    'https://hooks.example.com/webhook/abc',
    'https://ci.example.com:8443/hook?x=1',
    'https://172.15.0.1/hook',
    'https://locallab.example.com/hook'
  ])('accepts %s', (url) => {
    const {webhooks} = setup();
    expect(webhooks.validateWebhookUrl(url)).toBeNull();
  });

  it.each([
    'http://hooks.example.com/hook',
    'ftp://hooks.example.com/hook',
    'hooks.example.com/hook',
    'https://localhost/hook',
    'https://127.0.0.1/hook',
    'https://10.1.2.3/hook',
    'https://172.16.0.1/hook',
    'https://192.168.1.1/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://user:pass@hooks.example.com/hook',
    'https://localhost./hook',
    'https://app.localhost/hook',
    'https://0.0.0.0/hook',
    'https://100.64.0.1/hook',
    'https://2130706433/hook',
    'https://0x7f.0.0.1/hook',
    'https://0177.0.0.1/hook',
    'https://intranet/hook',
    'https://ci.internal/hook',
    'https://printer.local/hook',
    'https://nas.home.arpa/hook',
    'https://10.0.0.1.nip.io/hook',
    'https://app.10.0.0.1.sslip.io/hook',
    'https://lvh.me/hook',
    'https://app.vcap.me/hook',
    'https://x.traefik.me/hook',
    'https://10.0.0.1.xip.io/hook',
    'https://a.localhost.direct/hook',
    'https://make-127-0-0-1-rr.1u.ms/hook'
  ])('rejects %s', (url) => {
    const {webhooks} = setup();
    expect(webhooks.validateWebhookUrl(url)).toEqual(expect.any(String));
  });
});
