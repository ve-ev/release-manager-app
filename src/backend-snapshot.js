/**
 * Release Manager — Frozen snapshot / zone computation
 *
 * Functions for computing progress zones and capturing frozen snapshots
 * when a release is marked as Released.
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const utils = require('./backend-utils.js');


/**
 * Accumulates zone flags from a zone value.
 * @param {string} z
 * @param {Object} acc - { hasRed, hasYellow, allGreen, hasGreen }
 */
function accumulateZone(z, acc) {
    if (z === 'red') { acc.hasRed = true; }
    if (z === 'yellow') { acc.hasYellow = true; }
    if (z === 'green') { acc.hasGreen = true; } else { acc.allGreen = false; }
}


/**
 * Aggregates zones from a list of issue IDs by inspecting their field values.
 * @param {string[]} subIds
 * @param {string} fieldName
 * @param {Object} settings
 * @returns {'green'|'yellow'|'red'|'grey'}
 */
function aggregateSubtaskZones(subIds, fieldName, settings) {
    let hasRed = false;
    let hasYellow = false;
    let allGreen = true;
    let hasGreen = false;

    for (let i = 0; i < subIds.length; i++) {
        const z = getSubtaskZone(subIds[i], fieldName, settings);
        if (z === null) { allGreen = false; continue; }
        if (z === 'red') { hasRed = true; }
        if (z === 'yellow') { hasYellow = true; }
        if (z === 'green') { hasGreen = true; } else { allGreen = false; }
    }

    return resolveWorstZone(hasRed, hasYellow, allGreen, hasGreen);
}


/**
 * Builds a snapshot entry for a meta issue.
 * @param {Object} ref
 * @param {string[]} related
 * @param {Object} issueStatuses
 * @param {string[]} fieldNames
 * @param {Object} settings
 * @returns {{entry: Object, zone: string}}
 */
function buildMetaIssueSnapshotEntry(ref, related, issueStatuses, fieldNames, settings) {
    const zone = computeMetaIssueZone(related, issueStatuses, fieldNames, settings);
    const subtaskFieldValues = related.map(function (rid) {
        const relIssue = entities.Issue.findById(rid);
        const resolved = resolveIssueFieldValue(relIssue, fieldNames);
        return { id: rid, idReadable: relIssue ? relIssue.idReadable : undefined, fieldValue: resolved.parentValue };
    });

    return {
        entry: {
            id: ref.id, idReadable: ref.idReadable, summary: ref.summary || '',
            isMeta: true, metaRelatedIssueIds: related, zone: zone,
            fieldName: null, fieldValue: null, parentFieldValue: null,
            subtaskFieldValues: subtaskFieldValues
        },
        zone: zone
    };
}


/**
 * Builds a snapshot entry for a regular (non-meta) issue.
 * @param {Object} ref
 * @param {Object} issueStatuses
 * @param {Object} testStatuses
 * @param {string[]} fieldNames
 * @param {Object} settings
 * @returns {{entry: Object, zone: string, manualStatus: string}}
 */
function buildRegularIssueSnapshotEntry(ref, issueStatuses, testStatuses, fieldNames, settings) {
    const manualStatus = issueStatuses[ref.id] || 'Unresolved';
    const issue = entities.Issue.findById(ref.id);
    const usedField = utils.resolveFieldNameCaseInsensitive(issue, fieldNames);
    const computed = computeIssueZoneAtFreeze(issue, usedField, settings, manualStatus);
    const enriched = enrichRefFromIssue(ref, issue);
    const parentFieldValue = (issue && usedField) ? safeReadFieldValue(issue, usedField) : null;

    return {
        entry: {
            id: ref.id, idReadable: enriched.readable, summary: enriched.summary,
            isMeta: false, manualStatus: manualStatus, manualTestStatus: testStatuses[ref.id],
            zone: computed.zone, fieldName: usedField, fieldValue: computed.fieldValue,
            parentFieldValue: parentFieldValue,
            subtaskFieldValues: collectSubtaskFieldValues(issue, usedField)
        },
        zone: computed.zone, manualStatus: manualStatus
    };
}


/**
 * Captures frozen progress snapshot for a release.
 * @param {Object} ctx
 * @param {Object} release
 * @param {string} freezeTimestamp
 * @param {Function} getAppSettings - function(ctx) returning settings
 * @param {Function} getIssueStatusData - function(ctx) returning {issueStatuses, testStatuses}
 * @returns {Object} FrozenProgressSnapshot
 */
function captureFrozenSnapshot(ctx, release, freezeTimestamp, getAppSettings, getIssueStatusData) {
    const settings = getAppSettings(ctx) || {};
    const statusData = getIssueStatusData(ctx);
    const planned = Array.isArray(release.plannedIssues) ? release.plannedIssues : [];

    const snapshotCtx = {
        issueStatuses: statusData.issueStatuses || {},
        testStatuses: statusData.testStatuses || {},
        fieldNames: Array.isArray(settings.customFieldNames) ? settings.customFieldNames : [],
        settings: settings,
        issues: [],
        excludedIssueIds: [],
        progress: { green: 0, yellow: 0, red: 0, grey: 0, total: 0 }
    };

    for (let i = 0; i < planned.length; i++) {
        processSnapshotItem(planned[i], snapshotCtx);
    }

    return {
        capturedAt: new Date().toISOString(),
        freezeTimestamp: freezeTimestamp,
        issues: snapshotCtx.issues,
        excludedIssueIds: snapshotCtx.excludedIssueIds,
        progress: snapshotCtx.progress
    };
}


/**
 * Collects subtask field values for an issue.
 * @param {Object|null} issue
 * @param {string|null} usedField
 * @returns {Array<{id: string, idReadable: string|undefined, fieldValue: string|null}>}
 */
function collectSubtaskFieldValues(issue, usedField) {
    const out = [];
    if (!issue || !usedField) { return out; }
    const subIds = getSubtaskIds(issue);
    for (let si = 0; si < subIds.length; si++) {
        const sub = entities.Issue.findById(subIds[si]);
        out.push({ id: subIds[si], idReadable: sub ? sub.idReadable : undefined, fieldValue: safeReadFieldValue(sub, usedField) });
    }
    return out;
}


/**
 * Computes zone for a regular issue at freeze time.
 * @param {Object} issue
 * @param {string|null} usedFieldName
 * @param {Object} settings
 * @param {'Unresolved'|'Fixed'|'Merged'|'Discoped'} manualStatus
 * @returns {{zone: 'green'|'yellow'|'red'|'grey', fieldValue: (string|null)}}
 */
function computeIssueZoneAtFreeze(issue, usedFieldName, settings, manualStatus) {
    const manualResult = zoneForManualStatus(manualStatus);
    if (manualResult) { return manualResult; }
    if (!issue || !usedFieldName || !issue.fields || !issue.fields[usedFieldName]) { return greyZoneResult(); }
    return computeZoneFromField(issue, usedFieldName, settings);
}


/**
 * Computes the zone for a meta issue based on its related issues.
 * @param {string[]} related
 * @param {Object} issueStatuses
 * @param {string[]} fieldNames
 * @param {Object} settings
 * @returns {string} zone
 */
function computeMetaIssueZone(related, issueStatuses, fieldNames, settings) {
    let considered = 0;
    const acc = { hasRed: false, hasYellow: false, allGreen: true, hasGreen: false };

    for (let j = 0; j < related.length; j++) {
        if (!related[j]) { continue; }
        const z = computeRelatedIssueZone(related[j], issueStatuses, fieldNames, settings);
        if (z === 'discoped') { continue; }
        considered++;
        accumulateZone(z, acc);
    }

    return considered === 0 ? 'grey' : resolveWorstZone(acc.hasRed, acc.hasYellow, acc.allGreen, acc.hasGreen);
}


/**
 * Computes the zone for a single related issue in a meta-issue context.
 * @param {string} relId
 * @param {Object} issueStatuses
 * @param {string[]} fieldNames
 * @param {Object} settings
 * @returns {'green'|'yellow'|'red'|'grey'|'discoped'}
 */
function computeRelatedIssueZone(relId, issueStatuses, fieldNames, settings) {
    const relManual = issueStatuses[relId] || 'Unresolved';
    if (relManual === 'Discoped') { return 'discoped'; }
    if (relManual === 'Fixed' || relManual === 'Merged') { return 'green'; }

    const relIssue = entities.Issue.findById(relId);
    const resolved = resolveIssueFieldValue(relIssue, fieldNames);
    if (!resolved.usedField || resolved.parentValue === null) { return 'grey'; }
    return getZoneForValueBackend(resolved.parentValue, settings);
}


/**
 * Computes zone from issue field, falling back to subtask aggregation.
 * @param {Object} issue
 * @param {string} fieldName
 * @param {Object} settings
 * @returns {{zone: string, fieldValue: string|null}}
 */
function computeZoneFromField(issue, fieldName, settings) {
    const parentValue = utils.getFieldStringValue(issue.fields[fieldName]);
    if (parentValue !== null && parentValue !== undefined) {
        return { zone: getZoneForValueBackend(parentValue, settings), fieldValue: parentValue };
    }
    const subIds = getSubtaskIds(issue);
    return subIds.length === 0 ? greyZoneResult() : { zone: aggregateSubtaskZones(subIds, fieldName, settings), fieldValue: null };
}


/**
 * Enriches a ref with live issue data (idReadable, summary).
 * @param {Object} ref
 * @param {Object|null} issue
 * @returns {{readable: string, summary: string}}
 */
function enrichRefFromIssue(ref, issue) {
    let readable = ref.idReadable;
    let summary = ref.summary || '';
    try {
        if (issue) { readable = readable || issue.idReadable; summary = summary || issue.summary; }
    } catch { /* ignore */ }
    return { readable: readable, summary: summary };
}


/**
 * Retrieves subtask IDs for an issue via the 'parent for' link.
 * @param {Object} issue
 * @returns {string[]}
 */
function getSubtaskIds(issue) {
    const ids = [];
    try {
        issue.links['parent for'].forEach(function (subTask) {
            ids.push(subTask.id);
        });
    } catch {
        // ignore
    }
    return ids;
}


/**
 * Computes the zone for a single subtask by its field value.
 * @param {string} subId
 * @param {string} fieldName
 * @param {Object} settings
 * @returns {'green'|'yellow'|'red'|'grey'|null} null if issue/field not found
 */
function getSubtaskZone(subId, fieldName, settings) {
    const sub = entities.Issue.findById(subId);
    if (!sub || !sub.fields || !sub.fields[fieldName]) { return null; }
    return getZoneForValueBackend(utils.getFieldStringValue(sub.fields[fieldName]), settings);
}


/**
 * Maps a field value to zone based on app settings.
 * @param {string|null} value
 * @param {Object} settings
 * @returns {'green'|'yellow'|'red'|'grey'}
 */
function getZoneForValueBackend(value, settings) {
    if (value === null || value === undefined) { return 'grey'; }
    const vLower = value.toString().toLowerCase();
    if (getZoneValues(settings, 'greenZoneValues').indexOf(vLower) !== -1) { return 'green'; }
    if (getZoneValues(settings, 'yellowZoneValues').indexOf(vLower) !== -1) { return 'yellow'; }
    if (getZoneValues(settings, 'redZoneValues').indexOf(vLower) !== -1) { return 'red'; }
    return 'grey';
}


/**
 * Extracts a zone array from settings, lowercased.
 * @param {Object} settings
 * @param {string} key
 * @returns {string[]}
 */
function getZoneValues(settings, key) {
    return utils.toLowerArr(Array.isArray(settings[key]) ? settings[key] : []);
}


/**
 * Returns a grey zone result with null fieldValue.
 * @returns {{zone: 'grey', fieldValue: null}}
 */
function greyZoneResult() {
    return { zone: 'grey', fieldValue: null };
}


/**
 * Processes a single planned issue reference for the frozen snapshot.
 * @param {Object} ref
 * @param {Object} snapshotCtx
 */
function processSnapshotItem(ref, snapshotCtx) {
    if (!ref || !ref.id) { return; }

    const related = Array.isArray(ref.metaRelatedIssueIds) ? ref.metaRelatedIssueIds : [];
    if (ref.isMeta && related.length > 0) {
        const result = buildMetaIssueSnapshotEntry(ref, related, snapshotCtx.issueStatuses, snapshotCtx.fieldNames, snapshotCtx.settings);
        snapshotCtx.issues.push(result.entry);
        snapshotCtx.progress[result.zone] += 1;
        snapshotCtx.progress.total += 1;
        return;
    }

    const result = buildRegularIssueSnapshotEntry(ref, snapshotCtx.issueStatuses, snapshotCtx.testStatuses, snapshotCtx.fieldNames, snapshotCtx.settings);
    snapshotCtx.issues.push(result.entry);
    if (result.manualStatus === 'Discoped') {
        snapshotCtx.excludedIssueIds.push(ref.id);
    } else {
        snapshotCtx.progress[result.zone] += 1;
        snapshotCtx.progress.total += 1;
    }
}


/**
 * Resolves the parent field value for an issue given candidate field names.
 * @param {Object|null} issue
 * @param {string[]} fieldNames
 * @returns {{usedField: string|null, parentValue: string|null}}
 */
function resolveIssueFieldValue(issue, fieldNames) {
    const usedField = utils.resolveFieldNameCaseInsensitive(issue, fieldNames);
    let parentValue = null;
    try {
        if (issue && usedField && issue.fields && issue.fields[usedField]) {
            parentValue = utils.getFieldStringValue(issue.fields[usedField]);
        }
    } catch {
        parentValue = null;
    }
    return { usedField: usedField, parentValue: parentValue };
}


/**
 * Resolves the worst zone from zone flags.
 * @param {boolean} hasRed
 * @param {boolean} hasYellow
 * @param {boolean} allGreen
 * @param {boolean} hasGreen
 * @returns {'green'|'yellow'|'red'|'grey'}
 */
function resolveWorstZone(hasRed, hasYellow, allGreen, hasGreen) {
    if (hasRed) { return 'red'; }
    if (hasYellow) { return 'yellow'; }
    if (allGreen && hasGreen) { return 'green'; }
    return 'grey';
}


/**
 * Safely reads a field string value from an issue.
 * @param {Object|null} issue
 * @param {string} fieldName
 * @returns {string|null}
 */
function safeReadFieldValue(issue, fieldName) {
    try {
        if (issue && issue.fields && issue.fields[fieldName]) {
            return utils.getFieldStringValue(issue.fields[fieldName]);
        }
    } catch {
        // ignore
    }
    return null;
}


/**
 * Returns a zone result for manual status overrides, or null if not applicable.
 * @param {string} manualStatus
 * @returns {{zone: string, fieldValue: null}|null}
 */
function zoneForManualStatus(manualStatus) {
    if (manualStatus === 'Fixed' || manualStatus === 'Merged') { return { zone: 'green', fieldValue: null }; }
    if (manualStatus === 'Discoped') { return { zone: 'grey', fieldValue: null }; }
    return null;
}

exports.getZoneForValueBackend = getZoneForValueBackend;
exports.getSubtaskIds = getSubtaskIds;
exports.computeIssueZoneAtFreeze = computeIssueZoneAtFreeze;
exports.resolveIssueFieldValue = resolveIssueFieldValue;
exports.safeReadFieldValue = safeReadFieldValue;
exports.captureFrozenSnapshot = captureFrozenSnapshot;
