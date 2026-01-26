/**
 * Release Manager Backend API
 *
 * This module provides the backend functionality for the Release Manager application.
 * It includes utilities for managing release versions and HTTP endpoints for CRUD operations.
 */
/* eslint-disable func-names */
/* eslint-disable complexity */
/* eslint-disable func-style */
// YouTrack workflow entities API
// eslint-disable-next-line @typescript-eslint/no-require-imports
const entities = require('@jetbrains/youtrack-scripting-api/entities');

/**
 * HTTP status codes used throughout the application
 */
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    NOT_FOUND: 404
};

/**
 * Error logger utility function
 *
 * @param {string} message - Error context message
 * @param {Error|string} error - The error object or message
 */
function logError(message, error) {
    // eslint-disable-next-line no-console
    console.log(`${message}: ${error.message || error}`);
}

/**
 * Validates version field in release version object
 *
 * @param {Object} releaseVersion - The release version to validate
 * @param {Array} errors - Array to collect error messages
 */
function validateVersionField(releaseVersion, errors) {
    if (!releaseVersion.version) {
        errors.push('Version is required');
    }
}

/**
 * Validates status field in release version object
 *
 * @param {Object} releaseVersion - The release version to validate
 * @param {Array} errors - Array to collect error messages
 */
function validateStatusField(releaseVersion, errors) {
    const validStatuses = ['Planning', 'In progress', 'Released', 'Overdue', 'Canceled'];

    if (!releaseVersion.status) {
        // Default to 'Planning' if not provided
        releaseVersion.status = 'Planning';
    } else if (!validStatuses.includes(releaseVersion.status)) {
        errors.push('Status must be one of: ' + validStatuses.join(', '));
    }
}

/**
 * Validates date fields in release version object
 *
 * @param {Object} releaseVersion - The release version to validate
 * @param {Array} errors - Array to collect error messages
 */
function validateDateFields(releaseVersion, errors) {
    if (!releaseVersion.releaseDate) {
        errors.push('Release Date is required');
    }

    // Validate dates if both are provided
    if (releaseVersion.featureFreezeDate && releaseVersion.releaseDate) {
        const freezeDate = new Date(releaseVersion.featureFreezeDate);
        const releaseDate = new Date(releaseVersion.releaseDate);

        if (freezeDate > releaseDate) {
            errors.push('Feature Freeze Date must be before Release Date');
        }
    }
}

/**
 * Validates linked issues in release version object
 *
 * @param {Object} releaseVersion - The release version to validate
 * @param {Array} errors - Array to collect error messages
 */
function validateLinkedIssues(releaseVersion, errors) {
    if (releaseVersion.linkedIssues && !Array.isArray(releaseVersion.linkedIssues)) {
        errors.push('Linked Issues must be an array');
    }
}

/**
 * Validates a release version object
 *
 * @param {Object} releaseVersion - The release version to validate
 * @returns {Array} Array of validation error messages, empty if valid
 */
function validateReleaseVersion(releaseVersion) {
    const errors = [];

    validateVersionField(releaseVersion, errors);
    validateStatusField(releaseVersion, errors);
    validateDateFields(releaseVersion, errors);
    validateLinkedIssues(releaseVersion, errors);

    return errors;
}


/**
 * Retrieves release versions from extension properties
 *
 * @param {Object} ctx - The context object
 * @returns {Array} Array of release versions
 */
function getReleaseVersions(ctx) {
    try {
        const releaseVersionsJson = ctx.project.extensionProperties.releases;
        return releaseVersionsJson ? JSON.parse(releaseVersionsJson) : [];
    } catch (error) {
        logError('Error getting release versions', error);
        return [];
    }
}

/**
 * Saves release versions to extension properties
 *
 * @param {Object} ctx - The context object
 * @param {Array} releaseVersions - Array of release versions to save
 * @returns {boolean} True if successful, false otherwise
 */
function saveReleaseVersions(ctx, releaseVersions) {
    try {
        ctx.project.extensionProperties.releases = JSON.stringify(releaseVersions);
        return true;
    } catch (error) {
        logError('Error saving release versions', error);
        return false;
    }
}

/**
 * Sets error response with appropriate status code and message
 *
 * @param {Object} ctx - The context object
 * @param {number} statusCode - HTTP status code
 * @param {string|Object} errorMessage - Error message or object
 */
function sendErrorResponse(ctx, statusCode, errorMessage) {
    ctx.response.code = statusCode;

    if (typeof errorMessage === 'string') {
        ctx.response.json({error: errorMessage});
    } else {
        ctx.response.json(errorMessage);
    }
}

/**
 * Reads application settings stored in project extension properties
 * @param {Object} ctx
 * @returns {Object}
 */
function getAppSettings(ctx) {
    try {
        const json = ctx.project && ctx.project.extensionProperties && ctx.project.extensionProperties.appSettings;
        return json ? JSON.parse(json) : {};
    } catch (e) {
        logError('Failed to parse app settings', e);
        return {};
    }
}

/**
 * @param {Object} ctx
 * @returns {boolean}
 */
function isReleaseManager(ctx) {
    try {
        const settings = ctx.settings || {};
        if (!settings.releaseManagers) { return false; }
        return settings.releaseManagers.find(function (rm) {
            return ctx.currentUser && ctx.currentUser.isInGroup && ctx.currentUser.isInGroup(rm.name);
        }) != null;
    } catch {
        return false;
    }
}

/**
 * Reads issue status override map from project extension properties.
 * Stored by Release Manager as: { issueStatuses: { [id]: status }, testStatuses: {...} }
 * @param {Object} ctx
 * @returns {{issueStatuses: Object, testStatuses: Object}}
 */
function getIssueStatusData(ctx) {
    try {
        const dataJson = (ctx.project && ctx.project.extensionProperties && ctx.project.extensionProperties.issueStatusData) || (ctx.settings && ctx.settings.issueStatusData);
        const data = dataJson ? JSON.parse(dataJson) : {};
        return {
            issueStatuses: (data && data.issueStatuses && typeof data.issueStatuses === 'object') ? data.issueStatuses : {},
            testStatuses: (data && data.testStatuses && typeof data.testStatuses === 'object') ? data.testStatuses : {}
        };
    } catch (e) {
        logError('Failed to parse issue status data', e);
        return { issueStatuses: {}, testStatuses: {} };
    }
}

/**
 * Resolves first matching issue field name from a list, case-insensitive.
 * @param {Object} issue
 * @param {string[]} candidates
 * @returns {string|null}
 */
function resolveFieldNameCaseInsensitive(issue, candidates) {
    if (!issue || !issue.fields || !Array.isArray(candidates) || candidates.length === 0) {
        return null;
    }
    const lower = {};
    try {
        Object.keys(issue.fields).forEach(function (k) {
            lower[k.toLowerCase()] = k;
        });
    } catch {
        return null;
    }
    for (let i = 0; i < candidates.length; i++) {
        const c = (candidates[i] || '').toString().trim();
        if (!c) { continue; }
        const actual = lower[c.toLowerCase()];
        if (actual) { return actual; }
    }
    return null;
}

/**
 * Maps a field value to zone based on app settings.
 * @param {string|null} value
 * @param {Object} settings
 * @returns {'green'|'yellow'|'red'|'grey'}
 */
function getZoneForValueBackend(value, settings) {
    if (value === null || value === undefined) { return 'grey'; }
    // Frontend progress mapping is effectively case-insensitive (cached as lowercase),
    // so snapshot mapping must do the same to preserve yellow/red states correctly.
    const v = value.toString();
    const vLower = v.toLowerCase();
    const greens = Array.isArray(settings.greenZoneValues) ? settings.greenZoneValues : [];
    const yellows = Array.isArray(settings.yellowZoneValues) ? settings.yellowZoneValues : [];
    const reds = Array.isArray(settings.redZoneValues) ? settings.redZoneValues : [];
    const toLowerArr = function (arr) {
        const out = [];
        for (let i = 0; i < arr.length; i++) {
            const s = arr[i];
            if (s === null || s === undefined) { continue; }
            out.push(s.toString().toLowerCase());
        }
        return out;
    };
    const g = toLowerArr(greens);
    const y = toLowerArr(yellows);
    const r = toLowerArr(reds);

    if (g.indexOf(vLower) !== -1) { return 'green'; }
    if (y.indexOf(vLower) !== -1) { return 'yellow'; }
    if (r.indexOf(vLower) !== -1) { return 'red'; }
    return 'grey';
}

/**
 * Computes zone for a regular issue at freeze time.
 * Mirrors frontend logic: if parent field is null but subtasks have values,
 * compute zone based on worst subtask (red > yellow > green) with all-green shortcut.
 * Manual statuses override: Fixed/Merged => green; Discoped => excluded.
 * @param {Object} issue
 * @param {string|null} usedFieldName
 * @param {Object} settings
 * @param {'Unresolved'|'Fixed'|'Merged'|'Discoped'} manualStatus
 * @returns {{zone: 'green'|'yellow'|'red'|'grey', fieldValue: (string|null)}}
 */
function computeIssueZoneAtFreeze(issue, usedFieldName, settings, manualStatus) {
    if (manualStatus === 'Fixed' || manualStatus === 'Merged') {
        return { zone: 'green', fieldValue: null };
    }
    if (manualStatus === 'Discoped') {
        // Excluded from progress; keep zone grey for display.
        return { zone: 'grey', fieldValue: null };
    }
    if (!issue) {
        return { zone: 'grey', fieldValue: null };
    }

    const fieldName = usedFieldName;
    if (!fieldName || !issue.fields || !issue.fields[fieldName]) {
        return { zone: 'grey', fieldValue: null };
    }

    // Parent first
    const parentField = issue.fields[fieldName];
    const parentValue = parentField && (typeof parentField.name === 'string' ? parentField.name : null);
    if (parentValue !== null && parentValue !== undefined) {
        return { zone: getZoneForValueBackend(parentValue, settings), fieldValue: parentValue };
    }

    // If parent has no value, inspect subtasks
    const subIds = [];
    try {
        issue.links['parent for'].forEach(function (subTask) {
            subIds.push(subTask.id);
        });
    } catch {
        // ignore
    }

    if (subIds.length === 0) {
        return { zone: 'grey', fieldValue: null };
    }

    let hasRed = false;
    let hasYellow = false;
    let allGreen = true;
    let hasGreen = false;

    for (let i = 0; i < subIds.length; i++) {
        const sub = entities.Issue.findById(subIds[i]);
        if (!sub || !sub.fields || !sub.fields[fieldName]) {
            allGreen = false;
            continue;
        }
        const sf = sub.fields[fieldName];
        const sv = sf && (typeof sf.name === 'string' ? sf.name : null);
        const z = getZoneForValueBackend(sv, settings);
        if (z === 'red') { hasRed = true; }
        if (z === 'yellow') { hasYellow = true; }
        if (z === 'green') { hasGreen = true; } else { allGreen = false; }
    }

    if (hasRed) { return { zone: 'red', fieldValue: null }; }
    if (hasYellow) { return { zone: 'yellow', fieldValue: null }; }
    if (allGreen && hasGreen) { return { zone: 'green', fieldValue: null }; }
    return { zone: 'grey', fieldValue: null };
}

/**
 * Captures frozen progress snapshot for a release.
 * @param {Object} ctx
 * @param {Object} release
 * @param {string} freezeTimestamp
 * @returns {Object} FrozenProgressSnapshot
 */
function captureFrozenSnapshot(ctx, release, freezeTimestamp) {
    const settings = getAppSettings(ctx) || {};
    const fieldNames = Array.isArray(settings.customFieldNames) ? settings.customFieldNames : [];
    const statusData = getIssueStatusData(ctx);
    const issueStatuses = statusData.issueStatuses || {};
    const testStatuses = statusData.testStatuses || {};

    const planned = Array.isArray(release.plannedIssues) ? release.plannedIssues : [];
    const issues = [];
    const excludedIssueIds = [];

    const progress = { green: 0, yellow: 0, red: 0, grey: 0, total: 0 };

    for (let i = 0; i < planned.length; i++) {
        const ref = planned[i];
        if (!ref || !ref.id) { continue; }

        // Meta issue: compute based on related issues if present
        const isMeta = !!ref.isMeta;
        const related = Array.isArray(ref.metaRelatedIssueIds) ? ref.metaRelatedIssueIds : [];
        if (isMeta && related.length > 0) {
            let considered = 0;
            let hasRed = false;
            let hasYellow = false;
            let allGreen = true;
            let hasGreen = false;

            for (let j = 0; j < related.length; j++) {
                const relId = related[j];
                if (!relId) { continue; }
                const relManual = issueStatuses[relId] || 'Unresolved';
                if (relManual === 'Discoped') {
                    continue;
                }

                // Mirror frontend meta-issue logic:
                // - consider manual Fixed/Merged as green
                // - otherwise evaluate ONLY the parent field value (no subtask aggregation)
                considered++;
                if (relManual === 'Fixed' || relManual === 'Merged') {
                    hasGreen = true;
                    continue;
                }

                const relIssue = entities.Issue.findById(relId);
                const usedField = resolveFieldNameCaseInsensitive(relIssue, fieldNames);
                if (!relIssue || !usedField || !relIssue.fields || !relIssue.fields[usedField]) {
                    allGreen = false;
                    continue;
                }
                const parentField = relIssue.fields[usedField];
                const parentValue = parentField && (typeof parentField.name === 'string' ? parentField.name : null);
                const z = getZoneForValueBackend(parentValue, settings);
                if (z === 'red') { hasRed = true; }
                if (z === 'yellow') { hasYellow = true; }
                if (z === 'green') { hasGreen = true; } else { allGreen = false; }
            }

            let zone = 'grey';
            if (considered > 0) {
                if (hasRed) { zone = 'red'; }
                else if (hasYellow) { zone = 'yellow'; }
                else if (allGreen && hasGreen) { zone = 'green'; }
                else { zone = 'grey'; }
            } else {
                zone = 'grey';
            }

            issues.push({
                id: ref.id,
                idReadable: ref.idReadable,
                summary: ref.summary || '',
                isMeta: true,
                metaRelatedIssueIds: related,
                zone: zone,
                fieldName: null,
                fieldValue: null,
                parentFieldValue: null,
                subtaskFieldValues: related.map(function (rid) {
                    const relIssue = entities.Issue.findById(rid);
                    // For meta issues, snapshot what UI uses: related issue parent field value only
                    const usedField = resolveFieldNameCaseInsensitive(relIssue, fieldNames);
                    let parentValue = null;
                    try {
                        if (relIssue && usedField && relIssue.fields && relIssue.fields[usedField]) {
                            const pf = relIssue.fields[usedField];
                            parentValue = pf && (typeof pf.name === 'string' ? pf.name : null);
                        }
                    } catch {
                        parentValue = null;
                    }
                    return { id: rid, idReadable: relIssue ? relIssue.idReadable : undefined, fieldValue: parentValue };
                })
            });

            // Meta issue counts as one planned item in progress.
            progress[zone] += 1;
            progress.total += 1;

            continue;
        }

        const manualStatus = issueStatuses[ref.id] || 'Unresolved';
        const manualTestStatus = testStatuses[ref.id];
        if (manualStatus === 'Discoped') {
            excludedIssueIds.push(ref.id);
        }

        const issue = entities.Issue.findById(ref.id);
        const usedField = resolveFieldNameCaseInsensitive(issue, fieldNames);
        const computed = computeIssueZoneAtFreeze(issue, usedField, settings, manualStatus);
        const zone = computed.zone;

        let readable = ref.idReadable;
        let summary = ref.summary || '';
        try {
            if (issue) {
                readable = readable || issue.idReadable;
                summary = summary || issue.summary;
            }
        } catch {
            // ignore
        }

        issues.push({
            id: ref.id,
            idReadable: readable,
            summary: summary,
            isMeta: false,
            manualStatus: manualStatus,
            manualTestStatus: manualTestStatus,
            zone: zone,
            fieldName: usedField,
            fieldValue: computed.fieldValue,
            parentFieldValue: (function () {
                try {
                    if (issue && usedField && issue.fields && issue.fields[usedField]) {
                        const pf = issue.fields[usedField];
                        return pf && (typeof pf.name === 'string' ? pf.name : null);
                    }
                } catch {
                    // ignore
                }
                return null;
            })(),
            subtaskFieldValues: (function () {
                const out = [];
                if (!issue || !usedField) { return out; }
                const subIds = [];
                try {
                    issue.links['parent for'].forEach(function (subTask) {
                        subIds.push(subTask.id);
                    });
                } catch {
                    // ignore
                }
                for (let si = 0; si < subIds.length; si++) {
                    const sub = entities.Issue.findById(subIds[si]);
                    let v = null;
                    try {
                        if (sub && sub.fields && sub.fields[usedField]) {
                            const sf = sub.fields[usedField];
                            v = sf && (typeof sf.name === 'string' ? sf.name : null);
                        }
                    } catch {
                        v = null;
                    }
                    out.push({ id: subIds[si], idReadable: sub ? sub.idReadable : undefined, fieldValue: v });
                }
                return out;
            })()
        });

        if (manualStatus !== 'Discoped') {
            progress[zone] += 1;
            progress.total += 1;
        }
    }

    return {
        capturedAt: new Date().toISOString(),
        freezeTimestamp: freezeTimestamp,
        issues: issues,
        excludedIssueIds: excludedIssueIds,
        progress: progress
    };
}

/**
 * Finds a release by its display version value
 * @param {Object} ctx
 * @param {string} version
 * @returns {Object|null}
 */
function findReleaseByVersion(ctx, version) {
    const all = getReleaseVersions(ctx);
    return all.find(function(rv){ return rv && rv.version === version; }) || null;
}

/**
 * Adds an issue to a given release (by id) if not yet present and persists changes.
 * @param {Object} ctx
 * @param {string} releaseId
 * @param {string} issueId
 * @param {string} [issueSummary]
 */
function addIssueToRelease(ctx, releaseId, issueId, issueSummary) {
    if (!releaseId || !issueId) { return; }
    const releaseVersions = getReleaseVersions(ctx);
    const idx = releaseVersions.findIndex(function(rv){ return rv.id === releaseId; });
    if (idx === -1) { return; }
    const rv = releaseVersions[idx];
    const list = Array.isArray(rv.linkedIssues) ? rv.linkedIssues.slice() : [];
    if (!list.some(function(it){ return it && it.id === issueId; })) {
        list.push({ id: issueId, summary: issueSummary || '' });
        rv.linkedIssues = list;
        saveReleaseVersions(ctx, releaseVersions);

        // eslint-disable-next-line no-console
        console.log('[ReleaseManager][Backend] Issue', issueId, 'added to release', rv.version || rv.id);
    }
}

/**
 * Removes an issue from all releases except optionally one to keep.
 * @param {Object} ctx
 * @param {string} issueId
 * @param {string|null} exceptReleaseId
 */
function removeIssueFromOtherReleases(ctx, issueId, exceptReleaseId) {
    const releaseVersions = getReleaseVersions(ctx);
    let changed = false;
    let removedFrom = [];
    for (let i = 0; i < releaseVersions.length; i++) {
        if (exceptReleaseId && releaseVersions[i].id === exceptReleaseId) { continue; }
        const before = Array.isArray(releaseVersions[i].linkedIssues) ? releaseVersions[i].linkedIssues : [];
        const after = before.filter(function(it){ return it && it.id !== issueId; });
        if (after.length !== before.length) {
            releaseVersions[i].linkedIssues = after;
            changed = true;
            removedFrom.push(releaseVersions[i].version || releaseVersions[i].id);
        }
    }
    if (changed) {
        saveReleaseVersions(ctx, releaseVersions);
        // eslint-disable-next-line no-console
        console.log('[ReleaseManager][Backend] Issue', issueId, 'removed from releases', removedFrom.join(', ') || '<none>');
    }
}

/**
 * Updates a release by id. Extracted from the HTTP handler for reuse.
 * Also detects newly added issues and ensures they are properly linked.
 * @param {Object} ctx
 * @param {string} id
 * @param {Object} updatedReleaseVersion
 * @returns {Object|null} updated object or null if not found/failed
 */
function updateReleaseById(ctx, id, updatedReleaseVersion) {
    // Validate release version
    const validationErrors = validateReleaseVersion(updatedReleaseVersion);
    if (validationErrors.length > 0) {
        return null;
    }

    const releaseVersions = getReleaseVersions(ctx);
    const index = releaseVersions.findIndex(function(rv){ return rv.id === id; });
    if (index === -1) { return null; }

    // Capture old linked issues to detect additions
    const prev = releaseVersions[index];
    const prevIds = (prev.linkedIssues || []).map(function(x){ return x && x.id; }).filter(Boolean);

    const by = (ctx.currentUser && (ctx.currentUser.login || ctx.currentUser.name)) || undefined;
    const now = new Date().toISOString();
    const auditEvents = Array.isArray(prev.auditEvents) ? prev.auditEvents.slice() : [];

    const prevFreezeConfirmed = !!prev.freezeConfirmed;
    const freezeConfirmRequestedNow = !!updatedReleaseVersion.freezeConfirmed && !prevFreezeConfirmed;
    const unfreezeRequested = prevFreezeConfirmed && updatedReleaseVersion.freezeConfirmed === false;

    const releasedNow = (updatedReleaseVersion.status === 'Released') && (prev.status !== 'Released');
    const unreleaseNow = (prev.status === 'Released') && (updatedReleaseVersion.status !== 'Released');

    const manager = isReleaseManager(ctx);

    // Enforce manager-only actions
    if ((freezeConfirmRequestedNow || unfreezeRequested || releasedNow || unreleaseNow) && !manager) {
        sendErrorResponse(ctx, HTTP_STATUS.FORBIDDEN, 'Only release managers can perform this action');
        return null;
    }

    if (unfreezeRequested && prev.status === 'Released') {
        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Release is Released: unfreeze is not allowed');
        return null;
    }

    // Audit: log any status transition
    if (updatedReleaseVersion.status !== prev.status) {
        auditEvents.push({
            type: 'STATUS_CHANGED',
            at: now,
            by: by,
            fromStatus: prev.status,
            toStatus: updatedReleaseVersion.status
        });
    }

    // Full lock while Released (no mutations allowed until status changes)
    if (prev.status === 'Released' && updatedReleaseVersion.status === 'Released') {
        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Release is Released: it cannot be modified');
        return null;
    }

    // Apply unrelease: leaving Released unlocks, so clear progress-freeze snapshot
    if (unreleaseNow) {
        updatedReleaseVersion.freezeTimestamp = undefined;
        updatedReleaseVersion.snapshot = undefined;
        // Keep freezeConfirmed as-is (release may return to “freeze confirmed” state)
    }

    // Apply feature freeze confirmation (locks issue membership but does NOT freeze progress)
    if (freezeConfirmRequestedNow) {
        updatedReleaseVersion.freezeConfirmed = true;
        auditEvents.push({ type: 'FREEZE_CONFIRMED', at: now, by: by });
    }

    // Apply unfreeze (explicit action): unlock issue membership
    if (unfreezeRequested) {
        updatedReleaseVersion.freezeConfirmed = false;
        updatedReleaseVersion.freezeTimestamp = undefined;
        updatedReleaseVersion.snapshot = undefined;
        auditEvents.push({ type: 'UNFROZEN', at: now, by: by });
    }

    // Enforce membership immutability after feature freeze confirmation
    if (prevFreezeConfirmed && !unfreezeRequested && prev.status !== 'Released') {
        const prevPlannedIds = (prev.plannedIssues || []).map(function (x) { return x && x.id; }).filter(Boolean);
        const currPlannedIds = (updatedReleaseVersion.plannedIssues || []).map(function (x) { return x && x.id; }).filter(Boolean);
        const prevLinkedIds = (prev.linkedIssues || []).map(function (x) { return x && x.id; }).filter(Boolean);
        const currLinkedIds = (updatedReleaseVersion.linkedIssues || []).map(function (x) { return x && x.id; }).filter(Boolean);

        const sameArray = function (a, b) {
            if (a.length !== b.length) { return false; }
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) { return false; }
            }
            return true;
        };

        // Order matters in UI; treat different order as mutation.
        const plannedChanged = !sameArray(prevPlannedIds, currPlannedIds);
        const linkedChanged = !sameArray(prevLinkedIds, currLinkedIds);
        const metaChanged = JSON.stringify(prev.metaIssues || []) !== JSON.stringify(updatedReleaseVersion.metaIssues || []);

        if (plannedChanged || linkedChanged || metaChanged) {
            sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Release is frozen: issues list cannot be changed after freeze');
            return null;
        }

        // Force keeping membership fields
        updatedReleaseVersion.plannedIssues = prev.plannedIssues;
        updatedReleaseVersion.linkedIssues = prev.linkedIssues;
        updatedReleaseVersion.metaIssues = prev.metaIssues;
        updatedReleaseVersion.freezeConfirmed = true;
    }

    // Progress freeze happens only when moving to Released
    if (releasedNow) {
        updatedReleaseVersion.freezeTimestamp = now;
        updatedReleaseVersion.freezeConfirmed = true;

        try {
            updatedReleaseVersion.snapshot = captureFrozenSnapshot(ctx, updatedReleaseVersion, now);
        } catch (e) {
            logError('Failed to capture frozen snapshot', e);
            sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Failed to release: could not capture progress snapshot');
            return null;
        }

        auditEvents.push({ type: 'RELEASED_LOCKED', at: now, by: by });
    }

    // Always persist audit events
    updatedReleaseVersion.auditEvents = auditEvents;

    // Preserve id
    updatedReleaseVersion.id = id;
    releaseVersions[index] = updatedReleaseVersion;

    if (!saveReleaseVersions(ctx, releaseVersions)) { return null; }

    // Detect newly added issues and ensure proper linking
    try {
        const currIds = (updatedReleaseVersion.linkedIssues || []).map(function(x){ return x && x.id; }).filter(Boolean);
        for (let i = 0; i < currIds.length; i++) {
            const issueId = currIds[i];
            if (prevIds.indexOf(issueId) === -1) {
                // newly added
                addIssueToRelease(ctx, id, issueId);
            }
        }
    } catch (e) {
        logError('Failed to post-process updateReleaseById', e);
    }

    return updatedReleaseVersion;
}

/**
 * Ensures that an issue belongs to at most one release in the plannedIssues list.
 * This is used by workflow-based mapping from a single plannedRelease custom
 * field to the Release Manager app data model.
 *
 * Behaviour:
 *  - when targetRelease is null/undefined, the issue is removed from all releases.plannedIssues
 *  - otherwise the issue is added to targetRelease.plannedIssues and removed from
 *    all other releases.plannedIssues
 *
 * @param {Object} ctx
 * @param {string} issueId
 * @param {Object|null} targetRelease release object returned by findReleaseByVersion or null
 * @param {string} [issueSummary]
 */
function setIssueSinglePlannedMembership(ctx, issueId, targetRelease, issueSummary) {
    const releaseVersions = getReleaseVersions(ctx);

    if (!targetRelease) {
        // Remove from plannedIssues of all releases
        let changed = false;
        const removedFrom = [];
        for (let i = 0; i < releaseVersions.length; i++) {
            const before = Array.isArray(releaseVersions[i].plannedIssues) ? releaseVersions[i].plannedIssues : [];
            const after = before.filter(function (it) { return it && it.id !== issueId; });
            if (after.length !== before.length) {
                releaseVersions[i].plannedIssues = after;
                changed = true;
                removedFrom.push(releaseVersions[i].version || releaseVersions[i].id);
            }
        }
        if (changed) {
            saveReleaseVersions(ctx, releaseVersions);
            // eslint-disable-next-line no-console
            console.log('[ReleaseManager][Backend] Issue', issueId, 'removed from planned issues for releases', removedFrom.join(', ') || '<none>');
        }
        return;
    }

    let changed = false;
    const removedFrom = [];
    const targetId = targetRelease.id;

    for (let i = 0; i < releaseVersions.length; i++) {
        const rv = releaseVersions[i];
        const before = Array.isArray(rv.plannedIssues) ? rv.plannedIssues : [];

        if (rv.id === targetId) {
            // Ensure issue is present in the target release plannedIssues
            if (!before.some(function (it) { return it && it.id === issueId; })) {
                const list = before.slice();
                list.push({ id: issueId, summary: issueSummary || '' });
                rv.plannedIssues = list;
                changed = true;
            }
        } else {
            // Remove from other releases plannedIssues
            const after = before.filter(function (it) { return it && it.id !== issueId; });
            if (after.length !== before.length) {
                rv.plannedIssues = after;
                changed = true;
                removedFrom.push(rv.version || rv.id);
            }
        }
    }

    if (changed) {
        saveReleaseVersions(ctx, releaseVersions);
        // eslint-disable-next-line no-console
        console.log('[ReleaseManager][Backend] Issue', issueId, 'linked to planned release', targetRelease.version,
            'and removed from planned releases', removedFrom.join(', ') || '<none>');
    }
}

/**
 * Adds/Removes issue membership in releases based on version value.
 * If versionValue is null/empty or release with such version is not found, the issue is removed from all releases.
 * Intended to be safely callable both from HTTP handlers and workflow rules.
 *
 * @param {Object} ctx
 * @param {Object|string} issue - YouTrack issue entity or minimal object with id/summary or just issue id
 * @param {string|null} versionValue
 */
function updateReleasesForIssueByVersion(ctx, issue, versionValue) {
    const issueId = typeof issue === 'string' ? issue : issue && issue.id;
    if (!issueId) { return; }

    const trimmedValue = typeof versionValue === 'string' ? versionValue.trim() : null;
    const release = trimmedValue ? findReleaseByVersion(ctx, trimmedValue) : null;

    if (!release) {
        // eslint-disable-next-line no-console
        console.log('[ReleaseManager][Backend] No matching release found for value', trimmedValue || '<empty>', '— issue', issueId, 'removed from all planned releases');
        setIssueSinglePlannedMembership(ctx, issueId, null);
        return;
    }

    const issueSummary = (issue && typeof issue === 'object' && issue.summary) || '';
    setIssueSinglePlannedMembership(ctx, issueId, release, issueSummary);
}

/**
 * HTTP endpoints handler
 */
exports.httpHandler = {
    endpoints: [
        {
            method: 'GET',
            path: 'config',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const settings = ctx.settings;
                    ctx.response.json({
                        manualIssueManagement: settings.manualIssueManagement || false,
                        metaIssuesEnabled: settings.metaIssuesEnabled || false,
                        customFieldsMapping: settings.customFieldsMapping || false,
                    });
                } catch (error) {
                    logError('Failed to get ff', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'GET',
            path: 'permissions',
            scope: 'project',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const settings = ctx.settings;
                    const responseBody = {isManager: {}, isLightManager: {}};
                    if (settings.releaseManagers != null) {
                        responseBody.isManager = settings.releaseManagers.find(function (rm) {
                            return ctx.currentUser.isInGroup(rm.name);
                        }) != null;
                    } else {
                        responseBody.isManager = false
                    }

                    if (settings.lightManagers != null) {
                        responseBody.isLightManager = settings.lightManagers.find(function (lm) {
                            return ctx.currentUser.isInGroup(lm.name);
                        }) != null;
                    } else {
                        responseBody.isLightManager = false
                    }

                    // ctx.currentUser.isInGroup()
                    ctx.response.json(responseBody);
                } catch (error) {
                    logError('Failed to get permissions', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * GET /settings - Retrieve app settings
         */
        {
            method: 'GET',
            path: 'app-settings',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    // Return the progress settings (renamed endpoint)
                    const progressSettingsJson = ctx.project.extensionProperties.appSettings;
                    let progressSettings = progressSettingsJson ? JSON.parse(progressSettingsJson) : {
                        customFieldNames: [],
                        greenZoneValues: [],
                        yellowZoneValues: [],
                        redZoneValues: [],
                        greenColor: '#4CAF50',
                        yellowColor: '#FFC107',
                        redColor: '#F44336',
                        greyColor: '#9E9E9E',
                        products: []
                    };
                    // Backward compatibility: migrate customFieldName (string) to customFieldNames (string[])
                    if (progressSettings && progressSettings.customFieldName != null && (!progressSettings.customFieldNames || !Array.isArray(progressSettings.customFieldNames))) {
                        const txt = String(progressSettings.customFieldName || '');
                        progressSettings.customFieldNames = txt.split(/[;,]/).map(function (s) {
                            return s.trim();
                        }).filter(function (s) {
                            return !!s;
                        });
                        delete progressSettings.customFieldName;
                    }
                    // Ensure custom field mapping object exists; preserve if already present
                    if (!progressSettings.customFieldMapping || typeof progressSettings.customFieldMapping !== 'object') {
                        progressSettings.customFieldMapping = {};
                    }
                    if (!Array.isArray(progressSettings.customFieldNames)) { progressSettings.customFieldNames = []; }
                    if (!Array.isArray(progressSettings.products)) { progressSettings.products = []; }
                    ctx.response.json(progressSettings);
                } catch (error) {
                    logError('Failed to get settings', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * PUT /settings - Update progress tracking settings (renamed endpoint)
         */
        {
            method: 'PUT',
            path: 'app-settings',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const progressSettings = ctx.request.json();
                    if (!progressSettings.customFieldNames || !Array.isArray(progressSettings.customFieldNames) || progressSettings.customFieldNames.length === 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'At least one custom field name is required');
                        return;
                    }
                    ctx.project.extensionProperties.appSettings = JSON.stringify(progressSettings);
                    ctx.response.json(progressSettings);
                } catch (error) {
                    logError('Failed to update settings', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * GET /releases - Retrieve all release versions
         */
        {
            method: 'GET',
            path: 'releases',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const releaseVersions = getReleaseVersions(ctx);
                    ctx.response.json(releaseVersions);
                } catch (error) {
                    logError('Failed to get release versions', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * GET /release - Retrieve a specific release version by ID
         */
        {
            method: 'GET',
            path: 'release',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const id = ctx.request.getParameter('id');
                    const releaseVersions = getReleaseVersions(ctx);
                    const releaseVersion = releaseVersions.find(rv => rv.id === id);

                    if (releaseVersion) {
                        ctx.response.json(releaseVersion);
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Release version not found');
                    }
                } catch (error) {
                    logError('Failed to get release version', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },

        /**
         * POST /releases - Create a new release version
         */
        {
            method: 'POST',
            path: 'releases',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const releaseVersion = ctx.request.json();

                    // Validate release version
                    const validationErrors = validateReleaseVersion(releaseVersion);
                    if (validationErrors.length > 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, {errors: validationErrors});
                        return;
                    }

                    // Get existing release versions
                    const releaseVersions = getReleaseVersions(ctx);

                    // Generate ID for new release version
                    releaseVersion.id = Date.now().toString();

                    // Add to release versions and save
                    releaseVersions.push(releaseVersion);

                    if (saveReleaseVersions(ctx, releaseVersions)) {
                        // After creating release version, create custom field value if custom field mapping is configured
                        try {
                            // Check if custom fields mapping feature is enabled
                            if (ctx.settings.customFieldsMapping) {
                                const appSettings = getAppSettings(ctx);
                                let settings = appSettings;
                                if (typeof appSettings === 'string') {
                                    settings = JSON.parse(appSettings);
                                }

                                const fieldName = settings && settings.customFieldMapping && settings.customFieldMapping.plannedReleaseField;
                                if (fieldName && releaseVersion.version) {
                                    const field = ctx.project.findFieldByName(fieldName);
                                    if (field) {
                                        const existingValue = field.findValueByName(releaseVersion.version);
                                        if (!existingValue) {
                                            field.createValue(releaseVersion.version);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // Log error but don't fail the release creation
                            logError('Failed to create custom field value for new release', e);
                        }

                        ctx.response.code = HTTP_STATUS.CREATED;
                        ctx.response.json(releaseVersion);
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Failed to save release version');
                    }
                } catch (error) {
                    logError('Failed to create release version', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },

        /**
         * PUT /release - Update an existing release version
         */
        {
            method: 'PUT',
            path: 'release',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const id = ctx.request.getParameter('id');
                    const updatedReleaseVersion = ctx.request.json();
                    const updated = updateReleaseById(ctx, id, updatedReleaseVersion);
                    if (updated) {
                        ctx.response.json(updated);
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Failed to update release version');
                    }
                } catch (error) {
                    logError('Failed to update release version', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },

        /**
         * DELETE /release - Delete a release version
         */
        {
            method: 'DELETE',
            path: 'release',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const id = ctx.request.getParameter('id');

                    if (!id) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Release version ID is required');
                        return;
                    }

                    // Get existing release versions
                    const releaseVersions = getReleaseVersions(ctx);
                    const initialLength = releaseVersions.length;

                    // Filter out the release version to delete
                    const updatedReleaseVersions = releaseVersions.filter(rv => rv.id !== id);

                    if (updatedReleaseVersions.length < initialLength) {
                        // Save to extension properties
                        const saveResult = saveReleaseVersions(ctx, updatedReleaseVersions);

                        if (saveResult) {
                            ctx.response.code = HTTP_STATUS.NO_CONTENT;
                        } else {
                            sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Failed to delete release version');
                        }
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Release version not found');
                    }
                } catch (error) {
                    logError('Failed to delete release version', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * GET /issue-statuses - Retrieve issue and test statuses map
         */
        {
            method: 'GET',
            path: 'issue-statuses',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    // Try project-scoped storage first
                    let dataJson = ctx.project && ctx.project.extensionProperties && ctx.project.extensionProperties.issueStatusData;
                    // Fallback to app settings storage if not present
                    if (!dataJson && ctx.settings) {
                        dataJson = ctx.settings.issueStatusData;
                    }
                    let data = dataJson ? JSON.parse(dataJson) : {};
                    if (!data || typeof data !== 'object') { data = {}; }
                    if (!data.issueStatuses || typeof data.issueStatuses !== 'object') { data.issueStatuses = {}; }
                    if (!data.testStatuses || typeof data.testStatuses !== 'object') { data.testStatuses = {}; }
                    ctx.response.json({ issueStatuses: data.issueStatuses, testStatuses: data.testStatuses });
                } catch (error) {
                    logError('Failed to get issue statuses', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * PUT /issue-status - Update single issue status
         * Body: { issueId: string, status: 'Unresolved'|'Fixed'|'Merged'|'Discoped' }
         */
        {
            method: 'PUT',
            path: 'issue-status',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const body = ctx.request.json();
                    const issueId = body && body.issueId;
                    const status = body && body.status;
                    const allowed = ['Unresolved', 'Fixed', 'Merged', 'Discoped'];
                    if (!issueId) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'issueId is required'); return; }
                    if (!allowed.includes(status)) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Invalid status value'); return; }
                    const dataJson = (ctx.project && ctx.project.extensionProperties && ctx.project.extensionProperties.issueStatusData) || (ctx.settings && ctx.settings.issueStatusData);
                    let data = dataJson ? JSON.parse(dataJson) : {};
                    if (!data || typeof data !== 'object') { data = {}; }
                    if (!data.issueStatuses || typeof data.issueStatuses !== 'object') { data.issueStatuses = {}; }
                    if (!data.testStatuses || typeof data.testStatuses !== 'object') { data.testStatuses = {}; }
                    data.issueStatuses[issueId] = status;
                    // Reset test status when switching away from Fixed/Merged
                    if (!(status === 'Fixed' || status === 'Merged')) {
                        data.testStatuses[issueId] = 'Not tested';
                    }
                    const serialized = JSON.stringify(data);
                    if (ctx.project && ctx.project.extensionProperties) {
                        ctx.project.extensionProperties.issueStatusData = serialized;
                    }
                    if (ctx.settings) {
                        ctx.settings.issueStatusData = serialized;
                    }
                    ctx.response.json({ ok: true, issueStatuses: data.issueStatuses, testStatuses: data.testStatuses });
                } catch (error) {
                    logError('Failed to update issue status', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * PUT /issue-test-status - Update single issue test status
         * Body: { issueId: string, testStatus: 'Tested'|'Not tested'|'Test NA' }
         */
        {
            method: 'PUT',
            path: 'issue-test-status',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const body = ctx.request.json();
                    const issueId = body && body.issueId;
                    const testStatus = body && body.testStatus;
                    const allowed = ['Tested', 'Not tested', 'Test NA'];
                    if (!issueId) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'issueId is required'); return; }
                    if (!allowed.includes(testStatus)) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Invalid testStatus value'); return; }
                    const dataJson = (ctx.project && ctx.project.extensionProperties && ctx.project.extensionProperties.issueStatusData) || (ctx.settings && ctx.settings.issueStatusData);
                    let data = dataJson ? JSON.parse(dataJson) : {};
                    if (!data || typeof data !== 'object') { data = {}; }
                    if (!data.issueStatuses || typeof data.issueStatuses !== 'object') { data.issueStatuses = {}; }
                    if (!data.testStatuses || typeof data.testStatuses !== 'object') { data.testStatuses = {}; }
                    // Only allow setting test status when Fixed or Merged
                    const cur = data.issueStatuses && data.issueStatuses[issueId];
                    if (!(cur === 'Fixed' || cur === 'Merged')) {
                        data.testStatuses[issueId] = 'Not tested';
                    } else {
                        data.testStatuses[issueId] = testStatus;
                    }
                    const serialized = JSON.stringify(data);
                    if (ctx.project && ctx.project.extensionProperties) {
                        ctx.project.extensionProperties.issueStatusData = serialized;
                    }
                    if (ctx.settings) {
                        ctx.settings.issueStatusData = serialized;
                    }
                    ctx.response.json({ ok: true, issueStatuses: data.issueStatuses, testStatuses: data.testStatuses });
                } catch (error) {
                    logError('Failed to update issue test status', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'GET',
            path: 'expanded-version',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const userExpandedVersion = ctx.currentUser && ctx.currentUser.extensionProperties && ctx.currentUser.extensionProperties.expandedVersion;
                    ctx.response.json({ expandedVersion: userExpandedVersion || null });
                } catch (error) {
                    logError('Failed to get expanded version', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'PUT',
            path: 'expanded-version',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    const body = ctx.request.json();
                    const value = body && (body.expandedVersion !== undefined ? body.expandedVersion : null);
                    if (ctx.currentUser && ctx.currentUser.extensionProperties) {
                        if (value === null) {
                            // Clear stored value
                            delete ctx.currentUser.extensionProperties.expandedVersion;
                        } else {
                            ctx.currentUser.extensionProperties.expandedVersion = value;
                        }
                    }
                    ctx.response.json({ ok: true, expandedVersion: value });
                } catch (error) {
                    logError('Failed to set expanded version', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'POST',
            path: 'custom-field-set',
            scope: 'project',
            handle: function handle(ctx) {
                try {
                    // Check if custom fields mapping feature is enabled
                    if (!ctx.settings.customFieldsMapping) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Custom fields mapping feature is disabled');
                        return;
                    }

                    const payload = ctx.request.json();
                    const issue = entities.Issue.findById(payload.issueId);
                    if (!issue) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue not found');
                        return;
                    }

                    // Mark this issue as updated by Release Manager so the workflow
                    // rule (update-releases-on-cf-change.js) can distinguish app-
                    // driven changes from manual edits and avoid feedback loops.
                    if (issue.extensionProperties) {
                        issue.extensionProperties.updatedByReleaseManager = true;
                    }
                    const field = issue.project.findFieldByName(payload.fieldName);
                    if (!field) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field not found');
                        return;
                    }

                    // Handle empty value (clear field)
                    if (!payload.value || payload.value === '') {
                        issue.fields[field.name] = null;
                        ctx.response.json({ success: true });
                        return;
                    }

                    // Check if value already exists in field's allowed values
                    const existingValue = field.findValueByName(payload.value);

                    if (!existingValue) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Custom field value does not exist. Please create it first.');
                        return;
                    }

                    // Set the field value on the issue
                    issue.fields[field.name] = existingValue;
                    ctx.response.json({ success: true });
                } catch (error) {
                    logError('Failed to set custom field', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        }
    ]
};

// Expose selected helpers for workflows and other modules
exports.updateReleaseById = updateReleaseById;
exports.updateReleasesForIssueByVersion = updateReleasesForIssueByVersion;
exports.addIssueToRelease = addIssueToRelease;
exports.removeIssueFromOtherReleases = removeIssueFromOtherReleases;
exports.getAppSettings = getAppSettings;
