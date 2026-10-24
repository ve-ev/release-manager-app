/**
 * Outbound webhooks: release changes are sent as CloudEvents 1.0 to the URLs that release managers configure.
 *
 * saveReleaseVersions calls enqueue() in the same transaction as the release write, so an event is
 * delivered only when the save commits. deliverWebhooks() runs as an async function after the commit.
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
// ponytail: caps the time one async run keeps its transaction open (5 x TIMEOUT_MS); the rest waits for the next run
const MAX_SENDS_PER_RUN = 5;
// ponytail: a receiver that is down for a long time must not grow the project property without limit
const MAX_OUTBOX = 200;
const ASYNC_FUNCTION = 'deliverWebhooks';
const PROJECT_KEY = 'webhookProject';

// invokeAsync throws when it is called twice in one execution; module state is shared between executions,
// so the guard is keyed by the ctx object of the execution
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
    if (host === 'localhost' || /\.localhost$/.test(host)) { return 'Local addresses are not allowed'; }
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
 * Validates the webhooks from the widget and merges them with the stored ones.
 * An empty secret keeps the stored secret; lastDelivery is never taken from the request.
 * @param {Array} incoming
 * @param {Array} stored
 * @returns {{webhooks?: Array, error?: string}}
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
        if (name.length > MAX_NAME_LENGTH) { return {error: 'Webhook name is longer than ' + MAX_NAME_LENGTH + ' characters'}; }
        const urlError = validateWebhookUrl(h.url);
        if (urlError) { return {error: (name || 'Webhook ' + (i + 1)) + ': ' + urlError}; }
        const events = Array.isArray(h.events) ? h.events : [];
        const unknown = events.filter(function (e) { return !EVENT_TYPES[e]; });
        if (unknown.length > 0) { return {error: 'Unknown events: ' + unknown.join(', ')}; }
        const secret = (typeof h.secret === 'string' && h.secret) ? h.secret : (prev && prev.secret) || '';
        if (secret.length < MIN_SECRET_LENGTH || secret.length > MAX_SECRET_LENGTH) {
            return {error: (name || 'Webhook ' + (i + 1)) + ': the secret must have ' + MIN_SECRET_LENGTH + ' to ' + MAX_SECRET_LENGTH + ' characters'};
        }
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
    const rv = item.release || {};
    let details = null;
    if (item.audit) {
        details = Object.assign({}, item.audit);
        ['type', 'at', 'by', 'releaseId', 'releaseVersion'].forEach(function (k) { delete details[k]; });
    }
    return {
        specversion: '1.0',
        id: uuid(),
        source: '/projects/' + project.shortName + '/release-manager',
        type: TYPE_PREFIX + (EVENT_TYPES[item.event] || TEST_TYPE),
        subject: String(rv.version || rv.id || ''),
        time: item.at,
        datacontenttype: 'application/json',
        data: {
            event: item.event,
            project: {shortName: project.shortName, name: project.name},
            release: {
                id: rv.id,
                version: rv.version,
                product: rv.product,
                status: {from: item.prevStatus, to: item.event === 'RELEASE_DELETED' ? null : rv.status || null},
                freezeConfirmed: !!rv.freezeConfirmed,
                featureFreezeDate: rv.featureFreezeDate || null,
                releaseDate: rv.releaseDate || null,
                plannedIssues: (rv.plannedIssues || []).map(function (it) { return it && it.id; }).filter(Boolean)
            },
            actor: user ? {login: user.login, fullName: user.fullName} : null,
            details: details
        }
    };
}

function scheduleDelivery(ctx, project, delayMs) {
    if (scheduled.has(ctx)) { return; }
    scheduled.add(ctx);
    try {
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
 * Sends one CloudEvent. Never throws.
 * @param {Object} hook
 * @param {Object} cloudEvent
 * @returns {{at: string, code: (number|null), error: (string|null)}}
 */
function send(hook, cloudEvent) {
    const at = new Date().toISOString();
    // Checked again at send time: a stored URL can be older than the current rules
    const urlError = validateWebhookUrl(hook.url);
    if (urlError) { return {at: at, code: null, error: 'Blocked: ' + urlError}; }
    try {
        const connection = new http.Connection(hook.url, null, TIMEOUT_MS);
        connection.addHeader('Content-Type', 'application/cloudevents+json');
        if (hook.secret) { connection.bearerAuth(hook.secret); }
        const response = connection.postSync('', null, JSON.stringify(cloudEvent));
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
    } catch (e) {
        return {at: at, code: null, error: String((e && e.message) || e)};
    }
}

/**
 * Sends a test event to one webhook and records the result.
 * @param {Object} ctx HTTP handler context
 * @param {Object} hook Stored webhook
 * @returns {{at: string, code: (number|null), error: (string|null)}}
 */
function sendTest(ctx, hook) {
    const event = toCloudEvent({event: 'TEST', release: {}, prevStatus: null, audit: null, at: new Date().toISOString()},
        ctx.project, ctx.currentUser);
    const result = send(hook, event);
    const hooks = readWebhooks(ctx.project).map(function (h) {
        return h.id === hook.id ? Object.assign({}, h, {lastDelivery: result}) : h;
    });
    writeWebhooks(ctx.project, hooks);
    return result;
}

/**
 * Async function: sends the events in the outbox, records lastDelivery, and retries failed events.
 * @param {Object} ctx Async function context
 */
function deliverWebhooks(ctx) {
    const project = ctx.load(PROJECT_KEY) || ctx.project;
    if (!project) { return; }
    const outbox = readJson(project, 'webhookOutbox', []);
    if (outbox.length === 0) { return; }
    if (!ctx.settings || !ctx.settings.outboundWebhooks) {
        project.extensionProperties.webhookOutbox = null;
        return;
    }
    const hooks = readWebhooks(project);
    const hooksById = {};
    hooks.forEach(function (h) { hooksById[h.id] = h; });
    const now = Date.now();
    const remaining = [];
    let sent = 0;
    let nextAt = 0;
    outbox.forEach(function (entry) {
        const hook = hooksById[entry.hookId];
        if (!hook || !hook.enabled) { return; }
        if (entry.notBefore > now || sent >= MAX_SENDS_PER_RUN) {
            remaining.push(entry);
            nextAt = nextAt ? Math.min(nextAt, entry.notBefore) : entry.notBefore;
            return;
        }
        sent++;
        const result = send(hook, entry.event);
        hook.lastDelivery = result;
        if (result.error) {
            log('delivery to "' + (hook.name || hook.url) + '" failed: ' + result.error);
            const attempt = entry.attempt + 1;
            if (attempt < MAX_ATTEMPTS) {
                const retryAt = now + RETRY_DELAY_MS * attempt;
                remaining.push(Object.assign({}, entry, {attempt: attempt, notBefore: retryAt}));
                nextAt = nextAt ? Math.min(nextAt, retryAt) : retryAt;
            }
        }
    });
    writeWebhooks(project, hooks);
    project.extensionProperties.webhookOutbox = remaining.length ? JSON.stringify(remaining) : null;
    if (remaining.length > 0) {
        scheduleDelivery(ctx, project, Math.max(0, nextAt - now));
    }
}

exports.EVENT_TYPES = EVENT_TYPES;
exports.MAX_WEBHOOKS = MAX_WEBHOOKS;
exports.readWebhooks = readWebhooks;
exports.writeWebhooks = writeWebhooks;
exports.maskWebhook = maskWebhook;
exports.validateWebhookUrl = validateWebhookUrl;
exports.mergeWebhooks = mergeWebhooks;
exports.collectEvents = collectEvents;
exports.toCloudEvent = toCloudEvent;
exports.enqueue = enqueue;
exports.sendTest = sendTest;
exports.deliverWebhooks = deliverWebhooks;
exports.asyncFunctions = {deliverWebhooks: deliverWebhooks};
