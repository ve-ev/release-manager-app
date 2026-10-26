/**
 * Outbound webhooks: release changes are sent as CloudEvents 1.0 to the URLs that release managers configure.
 *
 * saveReleaseVersions calls enqueue() in the same transaction as the release write, so an event is
 * delivered only when the save commits. deliverWebhooks() runs as an async function after the commit.
 * Each execution sends one event with postAsync; onWebhookResponse() records the result and sends the next event.
 * A test event from the widget is sent with postSync, so the user sees the result at once.
 */
/* eslint-disable func-names */
/* eslint-disable complexity */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('@jetbrains/youtrack-scripting-api/http');

const TYPE_PREFIX = 'youtrack.release-manager.';

/** Event name (as in the audit trail) -> CloudEvents type suffix */
const EVENT_TYPES = {
    RELEASE_CREATED: 'release.created',
    RELEASE_DELETED: 'release.deleted',
    STATUS_CHANGED: 'release.status-changed',
    RELEASE_COMPLETED: 'release.completed',
    FREEZE_CONFIRMED: 'release.freeze-confirmed',
    UNFROZEN: 'release.unfrozen',
    PLANNED_ISSUES_CHANGED: 'release.planned-issues-changed',
    DESCRIPTION_CHANGED: 'release.description-changed',
    AUTO_ATTACHED: 'release.issues-auto-attached',
    AUTO_DETACHED: 'release.issues-auto-detached'
};
const TEST_TYPE = 'webhook.test';

const MAX_WEBHOOKS = 5;
const MAX_NAME_LENGTH = 100;
// Same minimum as the JetBrains Webhook Triggers app
const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 500;
const TIMEOUT_MS = 3000;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60000;
// A sent event is not sent again during this time. If the response handler does not run, the next run sends the event again.
const LEASE_MS = 30000;
// ponytail: a receiver that is down for a long time must not grow the project property without limit
const MAX_OUTBOX = 200;
// ponytail: newest entries only, for the whole project; a longer history needs its own storage
const MAX_DELIVERY_LOG = 100;
const ASYNC_FUNCTION = 'deliverWebhooks';
const RESPONSE_HANDLER = 'onWebhookResponse';
const PROJECT_KEY = 'webhookProject';
const EVENT_ID_KEY = 'webhookEventId';

// One execution can schedule only one async call (invokeAsync or postAsync); module state is shared between
// executions, so the guard is keyed by the ctx object of the execution
const scheduled = new WeakSet();

/* eslint-disable no-console */
function log(message) {
    console.log('[ReleaseManager] webhooks: ' + message);
}
/* eslint-enable no-console */

const HEX = 16;
// RFC 4122 variant: the "y" digit is 8, 9, a, or b
const VARIANT_BASE = 8;
const VARIANT_RANGE = 4;

// ponytail: Math.random UUID v4; unique enough for CloudEvents ids, not for secrets
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.floor(Math.random() * HEX);
        return (c === 'x' ? r : ((r % VARIANT_RANGE) + VARIANT_BASE)).toString(HEX);
    });
}

function readJson(project, property, fallback) {
    try {
        const json = project && project.extensionProperties[property];
        return json ? JSON.parse(json) : fallback;
    } catch (e) {
        log('cannot parse ' + property + ': ' + (e && (e.message || e)));
        return fallback;
    }
}

function readWebhooks(project) {
    const hooks = readJson(project, 'webhooks', []);
    return Array.isArray(hooks) ? hooks : [];
}

function writeWebhooks(project, hooks) {
    project.extensionProperties.webhooks = JSON.stringify(hooks);
}

function hostOf(url) {
    const match = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
    return match ? match[1].toLowerCase() : '';
}

/**
 * Delivery log entry for one attempt. The request body is not stored: it is large and has release data.
 * @param {Object} hook
 * @param {Object} cloudEvent
 * @param {{at: string, code: (number|null), error: (string|null)}} result
 * @param {number} attempt 1 for the first attempt
 */
function deliveryLogEntry(hook, cloudEvent, result, attempt) {
    return {
        id: cloudEvent.id,
        hookId: hook.id,
        event: cloudEvent.data.event,
        subject: cloudEvent.subject || null,
        host: hostOf(hook.url),
        at: result.at,
        attempt: attempt,
        code: result.code,
        error: result.error
    };
}

function appendDeliveryLog(project, entries) {
    if (entries.length === 0) { return; }
    const entriesLog = readJson(project, 'webhookDeliveries', []).concat(entries);
    project.extensionProperties.webhookDeliveries = JSON.stringify(entriesLog.slice(-MAX_DELIVERY_LOG));
}

/**
 * Delivery log of the webhooks that still exist, newest first.
 * @param {Object} project
 * @returns {Array}
 */
function readDeliveryLog(project) {
    const ids = {};
    readWebhooks(project).forEach(function (h) { ids[h.id] = true; });
    const entries = readJson(project, 'webhookDeliveries', []);
    return (Array.isArray(entries) ? entries : []).filter(function (e) { return ids[e.hookId]; }).reverse();
}

/**
 * Webhook as the widget sees it: the secret is never returned.
 * @param {Object} hook
 * @returns {Object}
 */
function maskWebhook(hook) {
    const copy = Object.assign({}, hook, {hasSecret: !!hook.secret});
    delete copy.secret;
    return copy;
}

const IPV4_PARTS = 4;
const MAX_OCTET = 255;
const MAX_PORT = 65535;
const HOST_AND_PORT = 2;
// Single-label hosts are rejected separately. The DNS services after home.arpa resolve a name to loopback
// or to the IP address in the name.
// ponytail: a suffix list is not a full SSRF control (any public name can resolve to a private address, and
// the scripting API has no DNS lookup); an admin allowlist of receiver domains is the upgrade
const INTERNAL_HOST_SUFFIX = new RegExp('(^|\\.)(localhost|local|internal|lan|localdomain|home\\.arpa|' +
    'nip\\.io|sslip\\.io|xip\\.io|localtest\\.me|lvh\\.me|vcap\\.me|traefik\\.me|localhost\\.direct|1u\\.ms)$');

/**
 * Checks that a webhook URL is safe to send release data and the secret to.
 * @param {string} url
 * @returns {string|null} An error message, or null when the URL is accepted
 */
function validateWebhookUrl(url) {
    if (typeof url !== 'string' || !url) {
        return 'URL is required';
    }
    if (/\s/.test(url)) { return 'URL must not contain spaces'; }
    const match = url.match(/^https:\/\/([^/?#]*)/i);
    if (!match) { return 'URL must start with https://'; }
    const authority = match[1];
    if (authority.indexOf('@') !== -1) { return 'URL must not contain a user name or password'; }
    // ponytail: every IPv6 literal is rejected, also public ones; parse IPv6 ranges if a receiver needs one
    if (authority.charAt(0) === '[') { return 'IPv6 addresses are not allowed'; }
    const parts = authority.split(':');
    if (parts.length > HOST_AND_PORT || (parts.length === HOST_AND_PORT && !isPort(parts[1]))) { return 'URL has an incorrect port'; }
    const host = parts[0].toLowerCase().replace(/\.$/, '');
    const labels = host.split('.');
    if (!host || labels.some(function (l) { return !/^[a-z0-9-]+$/.test(l); })) { return 'URL has an incorrect host name'; }
    if (labels.length < HOST_AND_PORT || INTERNAL_HOST_SUFFIX.test(host)) { return 'Local and internal host names are not allowed'; }
    // Numeric hosts: only the plain dotted-quad form is parsed, so decimal, octal, and hex forms of 127.0.0.1 are rejected.
    // ponytail: a host name that resolves to a private address is not detected; the scripting API has no DNS lookup
    if (labels.every(function (l) { return /^(\d+|0x[0-9a-f]*)$/.test(l); })) {
        const octets = labels.map(function (l) { return /^(0|[1-9]\d{0,2})$/.test(l) ? Number(l) : NaN; });
        if (octets.length !== IPV4_PARTS || octets.some(function (o) { return !(o <= MAX_OCTET); })) {
            return 'IP address must have four decimal numbers from 0 to 255';
        }
        if (isBlockedIpv4(octets[0], octets[1])) { return 'Private, local, and reserved IP addresses are not allowed'; }
    }
    return null;
}

function isPort(text) {
    return /^\d{1,5}$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_PORT;
}

/**
 * Blocked IPv4 ranges, by the first two octets:
 * 0/8, 10/8, 127/8 (loopback), 100.64/10 (carrier-grade NAT), 169.254/16 (link-local, cloud metadata),
 * 172.16/12, 192.168/16, 224/3 (multicast and reserved).
 */
function isBlockedIpv4(a, b) {
    /* eslint-disable no-magic-numbers */
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168);
    /* eslint-enable no-magic-numbers */
}

/**
 * Picks the secret to use for a webhook from the widget: the new secret, or else the stored one.
 * The stored secret is used only for the same URL. Shared receiver hosts tell users apart by the path,
 * so a changed path could also send the secret to another person.
 * @param {Object} input Webhook from the widget, with url and an optional new secret
 * @param {Object|null} prev Stored webhook with the same id
 * @returns {{secret?: string, error?: string}}
 */
function resolveSecret(input, prev) {
    const newSecret = (typeof input.secret === 'string' && input.secret) ? input.secret : '';
    if (!newSecret && prev && prev.secret && prev.url !== input.url) {
        return {error: 'Enter the secret again: the URL changed'};
    }
    const secret = newSecret || (prev && prev.secret) || '';
    if (secret.length < MIN_SECRET_LENGTH || secret.length > MAX_SECRET_LENGTH) {
        return {error: 'The secret must have ' + MIN_SECRET_LENGTH + ' to ' + MAX_SECRET_LENGTH + ' characters'};
    }
    return {secret: secret};
}

/**
 * Validates the webhooks from the widget and merges them with the stored ones.
 * An empty secret keeps the stored secret; lastDelivery is never taken from the request.
 * @param {Array} incoming
 * @param {Array} stored
 * @returns {{webhooks?: Array, error?: string, index?: number}} index is the webhook that has the error, if one has it
 */
function mergeWebhooks(incoming, stored) {
    if (!Array.isArray(incoming)) { return {error: 'webhooks must be an array'}; }
    if (incoming.length > MAX_WEBHOOKS) { return {error: 'A project can have at most ' + MAX_WEBHOOKS + ' webhooks'}; }
    const storedById = {};
    stored.forEach(function (h) { storedById[h.id] = h; });
    const result = [];
    for (let i = 0; i < incoming.length; i++) {
        const h = incoming[i] || {};
        const prev = (h.id && storedById[h.id]) || null;
        const name = typeof h.name === 'string' ? h.name.trim() : '';
        if (name.length > MAX_NAME_LENGTH) { return {error: 'The name is longer than ' + MAX_NAME_LENGTH + ' characters', index: i}; }
        const urlError = validateWebhookUrl(h.url);
        if (urlError) { return {error: urlError, index: i}; }
        const events = Array.isArray(h.events) ? h.events : [];
        const unknown = events.filter(function (e) { return !EVENT_TYPES[e]; });
        if (unknown.length > 0) { return {error: 'Unknown events: ' + unknown.join(', '), index: i}; }
        const resolved = resolveSecret(h, prev);
        if (resolved.error) { return {error: resolved.error, index: i}; }
        const secret = resolved.secret;
        result.push({
            id: prev ? prev.id : uuid(),
            name: name,
            url: h.url,
            secret: secret,
            events: events,
            enabled: h.enabled !== false,
            lastDelivery: prev ? prev.lastDelivery || null : null
        });
    }
    return {webhooks: result};
}

/**
 * Finds the webhook events of one save: new audit events, created releases, and deleted releases.
 * Audit events that are already stored are old, so they are not sent again.
 * @param {Array} storedReleases
 * @param {Array} nextReleases
 * @param {string} now ISO time for created and deleted releases
 * @returns {Array<{event: string, release: Object, prevStatus: (string|null), audit: (Object|null), at: string}>}
 */
function collectEvents(storedReleases, nextReleases, now) {
    const out = [];
    const storedById = {};
    (storedReleases || []).forEach(function (rv) { if (rv && rv.id) { storedById[rv.id] = rv; } });
    const nextIds = {};
    (nextReleases || []).forEach(function (rv) {
        if (!rv || !rv.id) { return; }
        nextIds[rv.id] = true;
        const prev = storedById[rv.id];
        if (!prev) {
            out.push({event: 'RELEASE_CREATED', release: rv, prevStatus: null, audit: null, at: now});
            return;
        }
        const seen = {};
        (prev.auditEvents || []).forEach(function (e) { seen[JSON.stringify(e)] = true; });
        (rv.auditEvents || []).forEach(function (e) {
            if (e && EVENT_TYPES[e.type] && !seen[JSON.stringify(e)]) {
                out.push({event: e.type, release: rv, prevStatus: prev.status || null, audit: e, at: e.at || now});
            }
        });
    });
    Object.keys(storedById).forEach(function (id) {
        if (!nextIds[id]) {
            const rv = storedById[id];
            out.push({event: 'RELEASE_DELETED', release: rv, prevStatus: rv.status || null, audit: null, at: now});
        }
    });
    return out;
}

/**
 * @param {Object} item An item from collectEvents
 * @param {Object} project YouTrack project
 * @param {Object} user YouTrack user who made the change
 * @returns {Object} CloudEvents 1.0 event in structured mode
 */
function toCloudEvent(item, project, user) {
    const rv = item.release;
    let details = null;
    if (item.audit) {
        details = Object.assign({}, item.audit);
        ['type', 'at', 'by', 'releaseId', 'releaseVersion'].forEach(function (k) { delete details[k]; });
    }
    const event = {
        specversion: '1.0',
        id: uuid(),
        source: '/projects/' + project.shortName + '/release-manager',
        type: TYPE_PREFIX + (EVENT_TYPES[item.event] || TEST_TYPE),
        time: item.at,
        datacontenttype: 'application/json',
        data: {
            event: item.event,
            project: {shortName: project.shortName, name: project.name},
            // A test event is not about a release
            release: rv ? {
                id: rv.id,
                version: rv.version,
                product: rv.product,
                status: {from: item.prevStatus, to: item.event === 'RELEASE_DELETED' ? null : rv.status || null},
                freezeConfirmed: !!rv.freezeConfirmed,
                featureFreezeDate: rv.featureFreezeDate || null,
                releaseDate: rv.releaseDate || null,
                plannedIssues: (rv.plannedIssues || []).map(function (it) { return it && it.id; }).filter(Boolean)
            } : null,
            actor: user ? {login: user.login, fullName: user.fullName} : null,
            details: details
        }
    };
    // CloudEvents: subject is optional, but when present it must be a non-empty string
    const subject = rv ? String(rv.version || rv.id || '') : '';
    if (subject) { event.subject = subject; }
    return event;
}

function scheduleDelivery(ctx, project, delayMs) {
    if (scheduled.has(ctx)) { return; }
    scheduled.add(ctx);
    try {
        // ponytail: an async chain has at most 10 hops; after that, the outbox waits for the next save
        ctx.store(PROJECT_KEY, project);
        ctx.invokeAsync(ASYNC_FUNCTION, delayMs || 0, 'webhooks-' + project.shortName);
    } catch (e) {
        // The events stay in the outbox; the next save schedules the delivery again
        log('cannot schedule delivery: ' + (e && (e.message || e)));
    }
}

/**
 * Adds the events of one save to the outbox and schedules the delivery. Never throws.
 * @param {Object} ctx
 * @param {Array} storedReleases Releases before the write
 * @param {Array} nextReleases Releases that are written
 */
function enqueue(ctx, storedReleases, nextReleases) {
    try {
        if (!ctx.settings || !ctx.settings.outboundWebhooks) { return; }
        const project = ctx.project;
        const hooks = readWebhooks(project).filter(function (h) { return h.enabled && h.events && h.events.length; });
        if (hooks.length === 0) { return; }
        const entries = [];
        collectEvents(storedReleases, nextReleases, new Date().toISOString()).forEach(function (item) {
            hooks.forEach(function (h) {
                if (h.events.indexOf(item.event) !== -1) {
                    entries.push({hookId: h.id, attempt: 0, notBefore: 0, event: toCloudEvent(item, project, ctx.currentUser)});
                }
            });
        });
        if (entries.length === 0) { return; }
        let outbox = readJson(project, 'webhookOutbox', []).concat(entries);
        if (outbox.length > MAX_OUTBOX) {
            log('outbox is full, ' + (outbox.length - MAX_OUTBOX) + ' oldest events are dropped');
            outbox = outbox.slice(-MAX_OUTBOX);
        }
        project.extensionProperties.webhookOutbox = JSON.stringify(outbox);
        scheduleDelivery(ctx, project, 0);
    } catch (e) {
        log('cannot enqueue events: ' + (e && (e.message || e)));
    }
}

/**
 * Converts the response of a webhook request to a delivery result.
 * @param {Object|null} response ctx.response of the async response handler
 * @param {string} at ISO time of the request
 * @returns {{at: string, code: (number|null), error: (string|null)}}
 */
function toResult(response, at) {
    // The response body is not stored: a receiver can reflect internal data
    const code = (response && response.code) || null;
    // isSuccess is also true for 3xx; the client does not follow redirects, so only 2xx is a delivery
    if (code >= HTTP_OK_MIN && code <= HTTP_OK_MAX) {
        return {at: at, code: code, error: null};
    }
    let error = 'HTTP ' + code;
    if (response && response.exception) {
        error = String(response.exception);
    } else if (!code) {
        error = 'No response in ' + TIMEOUT_MS + ' ms';
    } else if (code >= HTTP_REDIRECT_MIN && code <= HTTP_REDIRECT_MAX) {
        error = 'HTTP ' + code + ': redirects are not followed. Use the final URL.';
    }
    return {at: at, code: code, error: error};
}

function connectionFor(hook) {
    const connection = new http.Connection(hook.url, null, TIMEOUT_MS);
    connection.addHeader('Content-Type', 'application/cloudevents+json');
    if (hook.secret) { connection.bearerAuth(hook.secret); }
    return connection;
}

/**
 * Schedules the POST request for one outbox entry. The request runs after the commit, and
 * onWebhookResponse gets the response. Never throws.
 * @returns {boolean} true when the request is scheduled
 */
function post(ctx, project, hook, entry) {
    scheduled.add(ctx);
    try {
        ctx.store(PROJECT_KEY, project);
        ctx.store(EVENT_ID_KEY, entry.event.id);
        connectionFor(hook).postAsync('', null, JSON.stringify(entry.event), RESPONSE_HANDLER);
        return true;
    } catch (e) {
        // The event stays in the outbox; the next save schedules the delivery again
        log('cannot schedule the request: ' + (e && (e.message || e)));
        return false;
    }
}

/**
 * Records the result of one attempt: lastDelivery, the delivery log, and a retry if the attempt failed.
 * @param {Object} project
 * @param {Array} outbox Changed in place: the entry is removed or replaced by its retry
 * @param {Object} entry
 * @param {Object|null} hook null when the webhook was deleted
 * @param {{at: string, code: (number|null), error: (string|null)}} result
 */
function recordAttempt(project, outbox, entry, hook, result) {
    const attempt = entry.attempt + 1;
    const retry = [];
    if (hook) {
        writeWebhooks(project, readWebhooks(project).map(function (h) {
            return h.id === hook.id ? Object.assign({}, h, {lastDelivery: result}) : h;
        }));
        appendDeliveryLog(project, [deliveryLogEntry(hook, entry.event, result, attempt)]);
        if (result.error) {
            log('delivery to "' + (hook.name || hook.url) + '" failed: ' + result.error);
            if (attempt < MAX_ATTEMPTS) {
                retry.push(Object.assign({}, entry, {attempt: attempt, notBefore: Date.now() + RETRY_DELAY_MS * attempt, sentAt: 0}));
            }
        }
    }
    outbox.splice.apply(outbox, [outbox.indexOf(entry), 1].concat(retry));
}

function isInFlight(entry, now) {
    return entry.sentAt > now - LEASE_MS;
}

/**
 * Sends the next due event of the outbox, or schedules deliverWebhooks for the next retry.
 * @param {Object} ctx
 * @param {Object} project
 * @param {Array} outbox The outbox as read in this execution
 */
function sendNext(ctx, project, outbox) {
    if (!ctx.settings || !ctx.settings.outboundWebhooks) {
        project.extensionProperties.webhookOutbox = null;
        return;
    }
    const hooksById = {};
    readWebhooks(project).forEach(function (h) { hooksById[h.id] = h; });
    const now = Date.now();
    // Events of deleted webhooks and unsent events of disabled webhooks are dropped
    const pending = outbox.filter(function (e) {
        const h = hooksById[e.hookId];
        return h && (h.enabled || isInFlight(e, now));
    });
    let sent = false;
    let next = pending.find(function (e) { return !isInFlight(e, now) && e.notBefore <= now; });
    while (next && !sent) {
        const hook = hooksById[next.hookId];
        // Checked again at send time: a stored URL can be older than the current rules
        const urlError = validateWebhookUrl(hook.url);
        if (urlError) {
            recordAttempt(project, pending, next, hook, {at: new Date(now).toISOString(), code: null, error: 'Blocked: ' + urlError});
            next = pending.find(function (e) { return !isInFlight(e, now) && e.notBefore <= now; });
        } else {
            sent = true;
            if (post(ctx, project, hook, next)) { next.sentAt = now; }
        }
    }
    project.extensionProperties.webhookOutbox = pending.length ? JSON.stringify(pending) : null;
    if (sent) { return; }
    // In-flight events are handled by the chain that sent them
    const waiting = pending.filter(function (e) { return !isInFlight(e, now); });
    if (waiting.length > 0) {
        const nextAt = waiting.reduce(function (min, e) { return Math.min(min, e.notBefore); }, Infinity);
        scheduleDelivery(ctx, project, Math.max(0, nextAt - now));
    }
}

/**
 * Sends one CloudEvent and waits for the response. Never throws.
 * @param {Object} hook
 * @param {Object} cloudEvent
 * @returns {{at: string, code: (number|null), error: (string|null)}}
 */
function sendSync(hook, cloudEvent) {
    const at = new Date().toISOString();
    try {
        return toResult(connectionFor(hook).postSync('', null, JSON.stringify(cloudEvent)), at);
    } catch (e) {
        return {at: at, code: null, error: String((e && e.message) || e)};
    }
}

/**
 * Sends a test event to a webhook from the widget; the webhook does not need to be saved.
 * The result is recorded as lastDelivery only for a saved webhook with the same URL.
 * ponytail: postSync holds the HTTP handler for up to TIMEOUT_MS; it is one request that a release manager starts
 * @param {Object} ctx HTTP handler context
 * @param {{id?: string, url: string, secret?: string}} input
 * @returns {{error?: string, delivery?: {at: string, code: (number|null), error: (string|null)}, recorded?: boolean}}
 */
function sendTest(ctx, input) {
    const prev = (input.id && readWebhooks(ctx.project).find(function (h) { return h.id === input.id; })) || null;
    const urlError = validateWebhookUrl(input.url);
    if (urlError) { return {error: urlError}; }
    const resolved = resolveSecret(input, prev);
    if (resolved.error) { return {error: resolved.error}; }
    const event = toCloudEvent({event: 'TEST', release: null, prevStatus: null, audit: null, at: new Date().toISOString()},
        ctx.project, ctx.currentUser);
    const delivery = sendSync({url: input.url, secret: resolved.secret}, event);
    const recorded = !!prev && prev.url === input.url;
    if (recorded) {
        writeWebhooks(ctx.project, readWebhooks(ctx.project).map(function (h) {
            return h.id === prev.id ? Object.assign({}, h, {lastDelivery: delivery}) : h;
        }));
        appendDeliveryLog(ctx.project, [deliveryLogEntry(prev, event, delivery, 1)]);
    }
    return {delivery: delivery, recorded: recorded};
}

/**
 * Async function: starts the delivery of the outbox after a save or when a retry is due.
 * @param {Object} ctx Async function context
 */
function deliverWebhooks(ctx) {
    const project = ctx.load(PROJECT_KEY) || ctx.project;
    if (!project) { return; }
    const outbox = readJson(project, 'webhookOutbox', []);
    if (outbox.length === 0) { return; }
    sendNext(ctx, project, outbox);
}

/**
 * Async response handler of postAsync: records the result of one event and sends the next event.
 * @param {Object} ctx Async function context; ctx.response is the HTTP response
 */
function onWebhookResponse(ctx) {
    const project = ctx.load(PROJECT_KEY);
    if (!project) { return; }
    const eventId = ctx.load(EVENT_ID_KEY);
    const outbox = readJson(project, 'webhookOutbox', []);
    // The entry is missing when the outbox was cleared or another run already recorded this event
    const entry = outbox.find(function (e) { return e.event && e.event.id === eventId; });
    if (entry) {
        const hook = readWebhooks(project).find(function (h) { return h.id === entry.hookId; }) || null;
        recordAttempt(project, outbox, entry, hook, toResult(ctx.response, new Date(entry.sentAt || Date.now()).toISOString()));
    }
    sendNext(ctx, project, outbox);
}

exports.EVENT_TYPES = EVENT_TYPES;
exports.MAX_WEBHOOKS = MAX_WEBHOOKS;
exports.readWebhooks = readWebhooks;
exports.readDeliveryLog = readDeliveryLog;
exports.writeWebhooks = writeWebhooks;
exports.maskWebhook = maskWebhook;
exports.validateWebhookUrl = validateWebhookUrl;
exports.mergeWebhooks = mergeWebhooks;
exports.collectEvents = collectEvents;
exports.toCloudEvent = toCloudEvent;
exports.enqueue = enqueue;
exports.sendTest = sendTest;
exports.deliverWebhooks = deliverWebhooks;
exports.onWebhookResponse = onWebhookResponse;
exports.asyncFunctions = {deliverWebhooks: deliverWebhooks, onWebhookResponse: onWebhookResponse};
