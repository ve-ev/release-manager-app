/**
 * Release Manager Backend API
 *
 * This module provides the backend functionality for the Release Manager application.
 * It includes utilities for managing release versions and HTTP endpoints for CRUD operations.
 */
const utils = require('./backend-utils');
const audit = require('./backend-audit');
const cf = require('./backend-custom-fields');
const snapshot = require('./backend-snapshot');

// Re-export frequently used helpers from dedicated modules
const logError = utils.logError;
const extractIds = utils.extractIds;
const buildPlannedIssuesSnapshot = utils.buildPlannedIssuesSnapshot;
const normalizeStringValues = utils.normalizeStringValues;
const normalizeTargetReleases = utils.normalizeTargetReleases;
const resolveIssueId = utils.resolveIssueId;
const isIssueInList = utils.isIssueInList;
const filterIssueFromLinked = utils.filterIssueFromLinked;
const shouldSkipRelease = utils.shouldSkipRelease;
const getLinkedIssuesCopy = utils.getLinkedIssuesCopy;
const requiresManagerPermission = utils.requiresManagerPermission;
const isFixedOrMerged = utils.isFixedOrMerged;
const hasMembershipChanged = utils.hasMembershipChanged;
const restoreMembershipFields = utils.restoreMembershipFields;
const ensureIssueInPlanned = utils.ensureIssueInPlanned;
const removeIssueFromPlanned = utils.removeIssueFromPlanned;
const getAuditUser = audit.getAuditUser;
const buildReleaseInfo = audit.buildReleaseInfo;
const auditFieldChanges = audit.auditFieldChanges;
const auditPlannedIssuesChanges = audit.auditPlannedIssuesChanges;
const defaultAppSettings = cf.defaultAppSettings;
const migrateAppSettings = cf.migrateAppSettings;
const ensureCustomFieldValueForRelease = cf.ensureCustomFieldValueForRelease;
const applyCustomFieldAction = cf.applyCustomFieldAction;
const resolveCustomFieldTarget = cf.resolveCustomFieldTarget;

const captureFrozenSnapshot = snapshot.captureFrozenSnapshot;

/**
 * HTTP status codes used throughout the application
 */
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404
};


function addIssueToRelease(ctx, releaseId, issueId, issueSummary) {
    if (!releaseId || !issueId) { return; }
    const releaseVersions = getReleaseVersions(ctx);
    const found = findReleaseVersionById(releaseVersions, releaseId);
    if (!found) { return; }
    const list = getLinkedIssuesCopy(found.rv);
    if (isIssueInList(list, issueId)) { return; }
    list.push({ id: issueId, summary: issueSummary || '' });
    found.rv.linkedIssues = list;
    saveReleaseVersions(ctx, releaseVersions);
    console.log('[ReleaseManager][Backend] Issue', issueId, 'added to release', found.rv.version || found.rv.id);
}


/**
 * Applies freeze/unfreeze/unrelease state transitions to the updated release.
 * @param {Object} updated - updated release version (mutated in place)
 * @param {Object} flags - transition flags
 * @param {Object} auditCtx - { auditEvents, now, by, releaseInfo }
 */
function applyFreezeTransitions(updated, flags, auditCtx) {
    if (flags.unreleaseNow) {
        updated.freezeTimestamp = undefined;
        updated.snapshot = undefined;
    }

    if (flags.freezeConfirmRequestedNow) {
        updated.freezeConfirmed = true;
        auditCtx.auditEvents.push({
            type: 'FREEZE_CONFIRMED',
            at: auditCtx.now,
            by: auditCtx.by,
            releaseId: auditCtx.releaseInfo.releaseId,
            releaseVersion: auditCtx.releaseInfo.releaseVersion,
            plannedIssuesSnapshot: buildPlannedIssuesSnapshot(updated)
        });
    }

    if (flags.unfreezeRequested) {
        updated.freezeConfirmed = false;
        updated.freezeTimestamp = undefined;
        updated.snapshot = undefined;
        auditCtx.auditEvents.push({
            type: 'UNFROZEN',
            at: auditCtx.now,
            by: auditCtx.by,
            releaseId: auditCtx.releaseInfo.releaseId,
            releaseVersion: auditCtx.releaseInfo.releaseVersion
        });
    }
}


/**
 * Applies the Released status transition: captures snapshot and adds audit event.
 * @param {Object} ctx
 * @param {Object} updated - updated release version (mutated in place)
 * @param {Object} auditCtx - { auditEvents, now, by, releaseInfo }
 * @returns {string|null} error message or null if successful
 */
function applyReleaseTransition(ctx, updated, auditCtx) {
    updated.freezeTimestamp = auditCtx.now;
    updated.freezeConfirmed = true;

    try {
        updated.snapshot = captureFrozenSnapshot(ctx, updated, auditCtx.now, getAppSettings, getIssueStatusData);
    } catch (e) {
        logError('Failed to capture frozen snapshot', e);
        return 'Failed to release: could not capture progress snapshot';
    }

    auditCtx.auditEvents.push({
        type: 'RELEASE_COMPLETED',
        at: auditCtx.now,
        by: auditCtx.by,
        releaseId: auditCtx.releaseInfo.releaseId,
        releaseVersion: auditCtx.releaseInfo.releaseVersion,
        plannedIssuesSnapshot: buildPlannedIssuesSnapshot(updated)
    });
    return null;
}


/**
 * Applies all audit, freeze, and release transitions to an update.
 * Returns error message string on failure, null on success.
 * @param {Object} ctx
 * @param {Object} prev
 * @param {Object} updated
 * @param {Object} flags
 * @param {Object} auditCtx
 * @returns {string|null}
 */
function applyReleaseUpdateTransitions(ctx, prev, updated, flags, auditCtx) {
    auditFieldChanges(prev, updated, auditCtx);
    applyFreezeTransitions(updated, flags, auditCtx);
    auditPlannedIssuesChanges(prev, updated, auditCtx);

    const freezeError = enforceFreezeImmutability(prev, updated, flags);
    if (freezeError) { return freezeError; }

    if (flags.releasedNow) {
        const releaseError = applyReleaseTransition(ctx, updated, auditCtx);
        if (releaseError) { return releaseError; }
    }
    return null;
}


/**
 * Checks permission and lock errors for a release update. Returns error message or null.
 * @param {Object} ctx
 * @param {Object} prev
 * @param {Object} updatedReleaseVersion
 * @param {Object} flags
 * @returns {string|null}
 */
function checkReleaseUpdateErrors(ctx, prev, updatedReleaseVersion, flags) {
    const permError = validateReleasePermissions(ctx, flags, prev);
    if (permError) { return permError; }
    if (prev.status === 'Released' && updatedReleaseVersion.status === 'Released') {
        return 'Release is Released: it cannot be modified';
    }
    return null;
}


/**
 * Computes transition flags for a release update.
 * @param {Object} prev - previous release version
 * @param {Object} updated - updated release version
 * @returns {Object} transition flags
 */
function computeReleaseTransitionFlags(prev, updated) {
    const prevFreezeConfirmed = !!prev.freezeConfirmed;
    return {
        prevFreezeConfirmed: prevFreezeConfirmed,
        freezeConfirmRequestedNow: !!updated.freezeConfirmed && !prevFreezeConfirmed,
        unfreezeRequested: prevFreezeConfirmed && updated.freezeConfirmed === false,
        releasedNow: (updated.status === 'Released') && (prev.status !== 'Released'),
        unreleaseNow: (prev.status === 'Released') && (updated.status !== 'Released')
    };
}


/**
 * Enforces membership immutability after feature freeze confirmation.
 * @param {Object} prev - previous release version
 * @param {Object} updated - updated release version
 * @param {Object} flags - transition flags
 * @returns {string|null} error message or null if valid
 */
function enforceFreezeImmutability(prev, updated, flags) {
    if (!flags.prevFreezeConfirmed || flags.unfreezeRequested || prev.status === 'Released') {
        return null;
    }
    if (hasMembershipChanged(prev, updated)) {
        return 'Release is frozen: issues list cannot be changed after freeze';
    }
    restoreMembershipFields(prev, updated);
    return null;
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
 * Validates and finds the release to update. Returns null with error response if invalid.
 * @param {Object} ctx
 * @param {string} id
 * @param {Object} updatedReleaseVersion
 * @returns {{releaseVersions: Array, index: number, prev: Object}|null}
 */
function findReleaseForUpdate(ctx, id, updatedReleaseVersion) {
    const validationErrors = validateReleaseVersion(updatedReleaseVersion);
    if (validationErrors.length > 0) { return null; }

    const releaseVersions = getReleaseVersions(ctx);
    const index = releaseVersions.findIndex(function(rv){ return rv.id === id; });
    if (index === -1) { return null; }

    return { releaseVersions: releaseVersions, index: index, prev: releaseVersions[index] };
}


/**
 * Finds a release version by id in the list.
 * @param {Array} releaseVersions
 * @param {string} releaseId
 * @returns {{rv: Object, idx: number}|null}
 */
function findReleaseVersionById(releaseVersions, releaseId) {
    const idx = releaseVersions.findIndex(function(rv){ return rv.id === releaseId; });
    return idx === -1 ? null : { rv: releaseVersions[idx], idx: idx };
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
 * Reads issue status override map from project extension properties.
 * Stored by Release Manager as: { issueStatuses: { [id]: status }, testStatuses: {...} }
 * @param {Object} ctx
 * @returns {{issueStatuses: Object, testStatuses: Object}}
 */
function getIssueStatusData(ctx) {
    try {
        return parseIssueStatusData(loadIssueStatusDataJson(ctx));
    } catch (e) {
        logError('Failed to parse issue status data', e);
        return { issueStatuses: {}, testStatuses: {} };
    }
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
 * Reads raw issue status JSON from project extension properties or settings.
 * @param {Object} ctx
 * @returns {string|null}
 */
function loadIssueStatusDataJson(ctx) {
    return (ctx.project && ctx.project.extensionProperties && ctx.project.extensionProperties.issueStatusData)
        || (ctx.settings && ctx.settings.issueStatusData)
        || null;
}


/**
 * Matches version strings to existing releases.
 * @param {Object} ctx
 * @param {string[]} versionValues
 * @returns {{matched: Array, unmatched: string[]}}
 */
function matchReleasesForValues(ctx, versionValues) {
    let matched = [];
    let unmatched = [];
    for (let i = 0; i < versionValues.length; i++) {
        let release = findReleaseByVersion(ctx, versionValues[i]);
        if (release) { matched.push(release); }
        else { unmatched.push(versionValues[i]); }
    }
    return { matched: matched, unmatched: unmatched };
}


function parseIssueStatusData(dataJson) {
    const data = dataJson ? JSON.parse(dataJson) : {};
    return {
        issueStatuses: utils.safeObjectProp(data, 'issueStatuses'),
        testStatuses: utils.safeObjectProp(data, 'testStatuses')
    };
}


/**
 * Persists issue status data to both project extension properties and settings.
 * @param {Object} ctx
 * @param {Object} data - { issueStatuses, testStatuses }
 */
function persistIssueStatusData(ctx, data) {
    const serialized = JSON.stringify(data);
    if (ctx.project && ctx.project.extensionProperties) {
        ctx.project.extensionProperties.issueStatusData = serialized;
    }
    if (ctx.settings) {
        ctx.settings.issueStatusData = serialized;
    }
}


/**
 * Post-processes newly linked issues after a release update.
 * @param {Object} ctx
 * @param {string} releaseId
 * @param {string[]} prevLinkedIds
 * @param {Object} updatedReleaseVersion
 */
function postProcessNewlyLinkedIssues(ctx, releaseId, prevLinkedIds, updatedReleaseVersion) {
    try {
        const currIds = extractIds(updatedReleaseVersion.linkedIssues);
        for (let i = 0; i < currIds.length; i++) {
            if (prevLinkedIds.indexOf(currIds[i]) === -1) {
                addIssueToRelease(ctx, releaseId, currIds[i]);
            }
        }
    } catch (e) {
        logError('Failed to post-process updateReleaseById', e);
    }
}


/**
 * Removes an issue from plannedIssues of all releases.
 * @param {Array} releaseVersions
 * @param {string} issueId
 * @returns {{changed: boolean, removedFrom: string[]}}
 */
function removeIssueFromAllPlanned(releaseVersions, issueId) {
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
    return { changed: changed, removedFrom: removedFrom };
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
        if (shouldSkipRelease(releaseVersions[i], exceptReleaseId)) { continue; }
        if (filterIssueFromLinked(releaseVersions[i], issueId)) {
            changed = true;
            removedFrom.push(releaseVersions[i].version || releaseVersions[i].id);
        }
    }
    if (changed) {
        saveReleaseVersions(ctx, releaseVersions);
        console.log('[ReleaseManager][Backend] Issue', issueId, 'removed from releases', removedFrom.join(', ') || '<none>');
    }
}


/**
 * Validates a value is in an allowed list and sends error if not.
 * @param {Object} ctx
 * @param {*} value
 * @param {Array} allowed
 * @param {string} message
 * @returns {boolean} true if valid
 */
function requireAllowedValue(ctx, value, allowed, message) {
    if (!allowed.includes(value)) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, message); return false; }
    return true;
}


/**
 * Validates a required body field and sends error if missing.
 * @param {Object} ctx
 * @param {*} value
 * @param {string} message
 * @returns {boolean} true if valid
 */
function requireBodyField(ctx, value, message) {
    if (!value) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, message); return false; }
    return true;
}


/**
 * Saves release versions and logs the membership change.
 * @param {Object} ctx
 * @param {Array} releaseVersions
 * @param {string} issueId
 * @param {Object} result - { changed, addedTo?, removedFrom }
 * @param {boolean} isRemoveAll
 */
function savePlannedMembershipChange(ctx, releaseVersions, issueId, result, isRemoveAll) {
    if (!result.changed) { return; }
    saveReleaseVersions(ctx, releaseVersions);
    if (isRemoveAll) {
        console.log('[ReleaseManager][Backend] Issue', issueId, 'removed from planned issues for releases', result.removedFrom.join(', ') || '<none>');
    } else {
        console.log('[ReleaseManager][Backend] Issue', issueId, 'linked to planned releases', result.addedTo.join(', ') || '<none>',
            'and removed from planned releases', result.removedFrom.join(', ') || '<none>');
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
 * Sends an error response with appropriate HTTP status code.
 * @param {Object} ctx
 * @param {string} error
 */
function sendReleaseUpdateError(ctx, error) {
    const code = error.indexOf('managers') !== -1 ? HTTP_STATUS.FORBIDDEN : HTTP_STATUS.BAD_REQUEST;
    sendErrorResponse(ctx, code, error);
}


function setIssuePlannedMembership(ctx, issueId, targetReleases, issueSummary) {
    let targets = normalizeTargetReleases(targetReleases);
    let targetIds = targets.map(function (r) { return r.id; });
    const releaseVersions = getReleaseVersions(ctx);

    if (targets.length === 0) {
        savePlannedMembershipChange(ctx, releaseVersions, issueId, removeIssueFromAllPlanned(releaseVersions, issueId), true);
        return;
    }

    savePlannedMembershipChange(ctx, releaseVersions, issueId, syncPlannedMembership(releaseVersions, issueId, targetIds, issueSummary || ''), false);
}


/**
 * Stores the expanded version for the current user.
 * @param {Object} ctx
 * @param {*} value
 */
function storeExpandedVersion(ctx, value) {
    if (!ctx.currentUser || !ctx.currentUser.extensionProperties) { return; }
    if (value === null) {
        delete ctx.currentUser.extensionProperties.expandedVersion;
    } else {
        ctx.currentUser.extensionProperties.expandedVersion = value;
    }
}

/**
 * HTTP endpoints handler
 */


/**
 * Removes audit event records from release objects for users who are not release managers.
 * NOTE: This only affects HTTP responses, not persisted storage.
 *
 * @param {Object} releaseVersion
 * @param {boolean} canViewAudit
 * @returns {Object}
 */
function stripAuditEventsIfNeeded(releaseVersion, canViewAudit) {
    if (canViewAudit) { return releaseVersion; }
    if (!releaseVersion || typeof releaseVersion !== 'object') { return releaseVersion; }
    if (!('auditEvents' in releaseVersion)) { return releaseVersion; }
    const copy = Object.assign({}, releaseVersion);
    delete copy.auditEvents;
    return copy;
}


/**
 * Syncs an issue's planned membership across releases: adds to targets, removes from others.
 * @param {Array} releaseVersions
 * @param {string} issueId
 * @param {string[]} targetIds
 * @param {string} issueSummary
 * @returns {{changed: boolean, addedTo: string[], removedFrom: string[]}}
 */
function syncPlannedMembership(releaseVersions, issueId, targetIds, issueSummary) {
    let changed = false;
    const addedTo = [];
    const removedFrom = [];

    for (let i = 0; i < releaseVersions.length; i++) {
        const rv = releaseVersions[i];
        const isTarget = targetIds.indexOf(rv.id) !== -1;
        const label = rv.version || rv.id;

        if (isTarget && ensureIssueInPlanned(rv, issueId, issueSummary)) {
            changed = true;
            addedTo.push(label);
        } else if (!isTarget && removeIssueFromPlanned(rv, issueId)) {
            changed = true;
            removedFrom.push(label);
        }
    }
    return { changed: changed, addedTo: addedTo, removedFrom: removedFrom };
}


function updateReleaseById(ctx, id, updatedReleaseVersion) {
    const found = findReleaseForUpdate(ctx, id, updatedReleaseVersion);
    if (!found) { return null; }

    const prev = found.prev;
    const flags = computeReleaseTransitionFlags(prev, updatedReleaseVersion);

    const error = checkReleaseUpdateErrors(ctx, prev, updatedReleaseVersion, flags);
    if (error) { sendReleaseUpdateError(ctx, error); return null; }

    const auditCtx = {
        auditEvents: Array.isArray(prev.auditEvents) ? prev.auditEvents.slice() : [],
        now: new Date().toISOString(),
        by: getAuditUser(ctx),
        releaseInfo: buildReleaseInfo(id, updatedReleaseVersion, prev)
    };

    const transitionError = applyReleaseUpdateTransitions(ctx, prev, updatedReleaseVersion, flags, auditCtx);
    if (transitionError) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, transitionError); return null; }

    updatedReleaseVersion.auditEvents = auditCtx.auditEvents;
    updatedReleaseVersion.id = id;
    found.releaseVersions[found.index] = updatedReleaseVersion;

    if (!saveReleaseVersions(ctx, found.releaseVersions)) { return null; }

    postProcessNewlyLinkedIssues(ctx, id, extractIds(prev.linkedIssues), updatedReleaseVersion);
    return updatedReleaseVersion;
}


/**
 * Adds/Removes issue membership in releases based on version values.
 * @param {Object} ctx
 * @param {Object|string} issue
 * @param {Array<string>|string|null} values
 */
function updateReleasesForIssue(ctx, issue, values) {
    const issueId = resolveIssueId(issue);
    if (!issueId) { return; }

    let result = matchReleasesForValues(ctx, normalizeStringValues(values));

    if (result.unmatched.length > 0) {
        console.log('[ReleaseManager][Backend] No matching releases found for values', result.unmatched.join(', '), '— issue', issueId);
    }

    if (result.matched.length === 0) {
        console.log('[ReleaseManager][Backend] No matching releases found — issue', issueId, 'removed from all planned releases');
        setIssuePlannedMembership(ctx, issueId, null);
        return;
    }

    setIssuePlannedMembership(ctx, issueId, result.matched, (issue && typeof issue === 'object' && issue.summary) || '');
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
 * Validates permissions for manager-only release actions.
 * @param {Object} ctx
 * @param {Object} flags - transition flags
 * @param {Object} prev - previous release version
 * @returns {string|null} error message or null if valid
 */
function validateReleasePermissions(ctx, flags, prev) {
    if (requiresManagerPermission(flags) && !isReleaseManager(ctx)) {
        return 'Only release managers can perform this action';
    }
    if (flags.unfreezeRequested && prev.status === 'Released') {
        return 'Release is Released: unfreeze is not allowed';
    }
    return null;
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
                    const progressSettingsJson = ctx.project.extensionProperties.appSettings;
                    let progressSettings = progressSettingsJson ? JSON.parse(progressSettingsJson) : defaultAppSettings();
                    ctx.response.json(migrateAppSettings(progressSettings));
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
                    const canViewAudit = isReleaseManager(ctx);
                    const out = canViewAudit
                        ? releaseVersions
                        : releaseVersions.map(function (rv) { return stripAuditEventsIfNeeded(rv, canViewAudit); });
                    ctx.response.json(out);
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
                        const canViewAudit = isReleaseManager(ctx);
                        ctx.response.json(stripAuditEventsIfNeeded(releaseVersion, canViewAudit));
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
                        try {
                            ensureCustomFieldValueForRelease(ctx, releaseVersion.version);
                        } catch (e) {
                            logError('Failed to create custom field value for new release', e);
                        }

                        ctx.response.code = HTTP_STATUS.CREATED;
                        const canViewAudit = isReleaseManager(ctx);
                        ctx.response.json(stripAuditEventsIfNeeded(releaseVersion, canViewAudit));
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
                        const canViewAudit = isReleaseManager(ctx);
                        ctx.response.json(stripAuditEventsIfNeeded(updated, canViewAudit));
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
                    const data = parseIssueStatusData(loadIssueStatusDataJson(ctx));
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
                    if (!requireBodyField(ctx, body && body.issueId, 'issueId is required')) { return; }
                    if (!requireAllowedValue(ctx, body.status, ['Unresolved', 'Fixed', 'Merged', 'Discoped'], 'Invalid status value')) { return; }
                    const data = parseIssueStatusData(loadIssueStatusDataJson(ctx));
                    data.issueStatuses[body.issueId] = body.status;
                    if (!isFixedOrMerged(body.status)) { data.testStatuses[body.issueId] = 'Not tested'; }
                    persistIssueStatusData(ctx, data);
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
                    if (!requireBodyField(ctx, body && body.issueId, 'issueId is required')) { return; }
                    if (!requireAllowedValue(ctx, body.testStatus, ['Tested', 'Not tested', 'Test NA'], 'Invalid testStatus value')) { return; }
                    const data = parseIssueStatusData(loadIssueStatusDataJson(ctx));
                    data.testStatuses[body.issueId] = isFixedOrMerged(data.issueStatuses[body.issueId]) ? body.testStatus : 'Not tested';
                    persistIssueStatusData(ctx, data);
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
                    storeExpandedVersion(ctx, value);
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
                    if (!requireBodyField(ctx, ctx.settings.customFieldsMapping, 'Custom fields mapping feature is disabled')) { return; }
                    const payload = ctx.request.json();
                    const target = resolveCustomFieldTarget(payload);
                    if (!requireBodyField(ctx, target, 'Issue or field not found')) { return; }
                    const err = applyCustomFieldAction(target.issue, target.field, payload);
                    if (!requireBodyField(ctx, !err, err || '')) { return; }
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
exports.updateReleasesForIssueByVersion = updateReleasesForIssue;
exports.addIssueToRelease = addIssueToRelease;
exports.removeIssueFromOtherReleases = removeIssueFromOtherReleases;
exports.getAppSettings = getAppSettings;
