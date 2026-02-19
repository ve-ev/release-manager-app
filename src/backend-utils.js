
/**
 * Builds an index map from id to item for an array of objects with id property.
 * @param {Array} items
 * @returns {Object}
 */
function buildIdMap(items) {
    const map = {};
    for (let i = 0; i < items.length; i++) {
        if (items[i] && items[i].id) { map[items[i].id] = items[i]; }
    }
    return map;
}


/**
 * Builds a set (object with true values) from an array of strings.
 * @param {string[]} arr
 * @returns {Object}
 */
function buildIdSet(arr) {
    const set = {};
    for (let i = 0; i < arr.length; i++) { set[arr[i]] = true; }
    return set;
}


/**
 * Builds a lowercase-to-actual-key map from an object's keys.
 * @param {Object} obj
 * @returns {Object}
 */
function buildLowerKeyMap(obj) {
    const map = {};
    try {
        Object.keys(obj).forEach(function (k) { map[k.toLowerCase()] = k; });
    } catch {
        // ignore
    }
    return map;
}


/**
 * Builds a snapshot of planned issues (id + summary) from a release version.
 * @param {Object} rv
 * @returns {Array<{id: string, summary: string}>}
 */
function buildPlannedIssuesSnapshot(rv) {
    const items = (rv && rv.plannedIssues) ? rv.plannedIssues : [];
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it && it.id) {
            out.push({ id: it.id, summary: it.summary || '' });
        }
    }
    return out;
}


/**
 * Computes added and removed items between two id arrays.
 * @param {string[]} prevIds
 * @param {string[]} currIds
 * @param {Object} prevById - map of id to item
 * @param {Object} currById - map of id to item
 * @returns {{added: string[], removed: string[], addedIssues: Array, removedIssues: Array}}
 */
function computeIdDiff(prevIds, currIds, prevById, currById) {
    const prevSet = buildIdSet(prevIds);
    const currSet = buildIdSet(currIds);
    const addedResult = findNewIds(currIds, prevSet, currById);
    const removedResult = findNewIds(prevIds, currSet, prevById);
    return { added: addedResult.ids, removed: removedResult.ids, addedIssues: addedResult.issues, removedIssues: removedResult.issues };
}


/**
 * Ensures an issue is present in a release's plannedIssues. Returns true if added.
 * @param {Object} rv
 * @param {string} issueId
 * @param {string} issueSummary
 * @returns {boolean}
 */
function ensureIssueInPlanned(rv, issueId, issueSummary) {
    const before = Array.isArray(rv.plannedIssues) ? rv.plannedIssues : [];
    if (isIssueInList(before, issueId)) { return false; }
    const list = before.slice();
    list.push({ id: issueId, summary: issueSummary || '' });
    rv.plannedIssues = list;
    return true;
}


/**
 * Extracts non-null ids from an array of objects with id property.
 * @param {Array} items
 * @returns {string[]}
 */
function extractIds(items) {
    return (items || []).map(function (x) { return x && x.id; }).filter(Boolean);
}


/**
 * Filters an issue out of a release's linkedIssues if present.
 * @param {Object} rv - release version
 * @param {string} issueId
 * @returns {boolean} true if the issue was removed
 */
function filterIssueFromLinked(rv, issueId) {
    const before = Array.isArray(rv.linkedIssues) ? rv.linkedIssues : [];
    const after = before.filter(function(it){ return it && it.id !== issueId; });
    if (after.length === before.length) { return false; }
    rv.linkedIssues = after;
    return true;
}


/**
 * Finds the first matching key in a lowercase map from a list of candidates.
 * @param {Object} lowerMap
 * @param {string[]} candidates
 * @returns {string|null}
 */
function findFirstMatchingKey(lowerMap, candidates) {
    for (let i = 0; i < candidates.length; i++) {
        const key = normalizeCandidate(candidates[i]);
        if (key && lowerMap[key]) { return lowerMap[key]; }
    }
    return null;
}


/**
 * Finds ids present in source but not in excludeSet, with summary from map.
 * @param {string[]} sourceIds
 * @param {Object} excludeSet
 * @param {Object} byIdMap
 * @returns {{ids: string[], issues: Array}}
 */
function findNewIds(sourceIds, excludeSet, byIdMap) {
    const ids = [];
    const issues = [];
    for (let i = 0; i < sourceIds.length; i++) {
        if (!excludeSet[sourceIds[i]]) {
            ids.push(sourceIds[i]);
            const it = byIdMap[sourceIds[i]];
            issues.push({ id: sourceIds[i], summary: (it && it.summary) ? it.summary : '' });
        }
    }
    return { ids: ids, issues: issues };
}


/**
 * Extracts the string name from a field value object.
 * @param {Object|null} fieldObj
 * @returns {string|null}
 */
function getFieldStringValue(fieldObj) {
    return fieldObj && (typeof fieldObj.name === 'string' ? fieldObj.name : null);
}


/**
 * Gets a copy of a release's linkedIssues array.
 * @param {Object} rv
 * @returns {Array}
 */
function getLinkedIssuesCopy(rv) {
    return Array.isArray(rv.linkedIssues) ? rv.linkedIssues.slice() : [];
}


/**
 * Checks if any issue membership lists changed between prev and updated.
 * @param {Object} prev
 * @param {Object} updated
 * @returns {boolean}
 */
function hasMembershipChanged(prev, updated) {
    if (!sameArray(extractIds(prev.plannedIssues), extractIds(updated.plannedIssues))) { return true; }
    if (!sameArray(extractIds(prev.linkedIssues), extractIds(updated.linkedIssues))) { return true; }
    return JSON.stringify(prev.metaIssues || []) !== JSON.stringify(updated.metaIssues || []);
}


/**
 * Checks if a status is Fixed or Merged.
 * @param {string} status
 * @returns {boolean}
 */
function isFixedOrMerged(status) {
    return status === 'Fixed' || status === 'Merged';
}


/**
 * Checks if an issue is already in a linked issues list.
 * @param {Array} list
 * @param {string} issueId
 * @returns {boolean}
 */
function isIssueInList(list, issueId) {
    return list.some(function(it){ return it && it.id === issueId; });
}

/**
 * Release Manager — Pure utility functions
 *
 * These helpers have no dependency on the YouTrack scripting API and can be
 * reused across backend modules.
 */

/**
 * Error logger utility function
 * @param {string} message - Error context message
 * @param {Error|string} error - The error object or message
 */
function logError(message, error) {
    console.log(`${message}: ${error.message || error}`);
}


/**
 * Normalizes a candidate field name to a trimmed lowercase string.
 * @param {*} candidate
 * @returns {string}
 */
function normalizeCandidate(candidate) {
    return (candidate || '').toString().trim().toLowerCase();
}


/**
 * Normalizes a value (or array of values) to an array of trimmed non-empty strings.
 * @param {Array<string>|string|null} values
 * @returns {string[]}
 */
function normalizeStringValues(values) {
    let rawValues = Array.isArray(values) ? values : (values ? [values] : []);
    let result = [];
    for (let i = 0; i < rawValues.length; i++) {
        let v = typeof rawValues[i] === 'string' ? rawValues[i].trim() : '';
        if (v) { result.push(v); }
    }
    return result;
}


/**
 * Normalizes targetReleases to an array.
 * @param {Array<Object>|Object|null} targetReleases
 * @returns {Array}
 */
function normalizeTargetReleases(targetReleases) {
    if (!targetReleases) { return []; }
    return Array.isArray(targetReleases) ? targetReleases : [targetReleases];
}


/**
 * Removes an issue from a release's plannedIssues. Returns true if removed.
 * @param {Object} rv
 * @param {string} issueId
 * @returns {boolean}
 */
function removeIssueFromPlanned(rv, issueId) {
    const before = Array.isArray(rv.plannedIssues) ? rv.plannedIssues : [];
    const after = before.filter(function (it) { return it && it.id !== issueId; });
    if (after.length === before.length) { return false; }
    rv.plannedIssues = after;
    return true;
}


/**
 * Checks if any transition flag requires manager permissions.
 * @param {Object} flags
 * @returns {boolean}
 */
function requiresManagerPermission(flags) {
    return flags.freezeConfirmRequestedNow || flags.unfreezeRequested || flags.releasedNow || flags.unreleaseNow;
}


/**
 * Resolves first matching issue field name from a list, case-insensitive.
 * @param {Object} issue
 * @param {string[]} candidates
 * @returns {string|null}
 */
function resolveFieldNameCaseInsensitive(issue, candidates) {
    if (!issue || !issue.fields) { return null; }
    if (!Array.isArray(candidates) || candidates.length === 0) { return null; }
    return findFirstMatchingKey(buildLowerKeyMap(issue.fields), candidates);
}


/**
 * Extracts issue ID from an issue object or string.
 * @param {Object|string} issue
 * @returns {string|null}
 */
function resolveIssueId(issue) {
    return typeof issue === 'string' ? issue : (issue && issue.id) || null;
}


/**
 * Restores membership fields from prev to updated.
 * @param {Object} prev
 * @param {Object} updated
 */
function restoreMembershipFields(prev, updated) {
    updated.plannedIssues = prev.plannedIssues;
    updated.linkedIssues = prev.linkedIssues;
    updated.metaIssues = prev.metaIssues;
    updated.freezeConfirmed = true;
}


/**
 * Safely extracts an object property, returning {} if not a valid object.
 * @param {Object} obj
 * @param {string} key
 * @returns {Object}
 */
function safeObjectProp(obj, key) {
    return (obj && obj[key] && typeof obj[key] === 'object') ? obj[key] : {};
}


/**
 * Compares two arrays for strict element-wise equality.
 * @param {Array} a
 * @param {Array} b
 * @returns {boolean}
 */
function sameArray(a, b) {
    if (a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) { return false; }
    }
    return true;
}


/**
 * Checks if a release should be skipped during removal.
 * @param {Object} rv
 * @param {string|null} exceptReleaseId
 * @returns {boolean}
 */
function shouldSkipRelease(rv, exceptReleaseId) {
    return exceptReleaseId && rv.id === exceptReleaseId;
}


/**
 * Converts an array of values to lowercase strings, skipping nulls.
 * @param {Array} arr
 * @returns {string[]}
 */
function toLowerArr(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s === null || s === undefined) { continue; }
        out.push(s.toString().toLowerCase());
    }
    return out;
}


/**
 * Truncates a string to a maximum length, appending ellipsis if needed.
 * @param {string} s
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(s, maxLen) {
    if (typeof s !== 'string') { return s; }
    if (s.length <= maxLen) { return s; }
    return s.slice(0, maxLen) + '…';
}

exports.logError = logError;
exports.safeObjectProp = safeObjectProp;
exports.buildLowerKeyMap = buildLowerKeyMap;
exports.normalizeCandidate = normalizeCandidate;
exports.findFirstMatchingKey = findFirstMatchingKey;
exports.resolveFieldNameCaseInsensitive = resolveFieldNameCaseInsensitive;
exports.sameArray = sameArray;
exports.extractIds = extractIds;
exports.getFieldStringValue = getFieldStringValue;
exports.toLowerArr = toLowerArr;
exports.truncateText = truncateText;
exports.buildPlannedIssuesSnapshot = buildPlannedIssuesSnapshot;
exports.buildIdMap = buildIdMap;
exports.buildIdSet = buildIdSet;
exports.findNewIds = findNewIds;
exports.computeIdDiff = computeIdDiff;
exports.normalizeStringValues = normalizeStringValues;
exports.normalizeTargetReleases = normalizeTargetReleases;
exports.resolveIssueId = resolveIssueId;
exports.isIssueInList = isIssueInList;
exports.filterIssueFromLinked = filterIssueFromLinked;
exports.shouldSkipRelease = shouldSkipRelease;
exports.getLinkedIssuesCopy = getLinkedIssuesCopy;
exports.requiresManagerPermission = requiresManagerPermission;
exports.isFixedOrMerged = isFixedOrMerged;
exports.hasMembershipChanged = hasMembershipChanged;
exports.restoreMembershipFields = restoreMembershipFields;
exports.ensureIssueInPlanned = ensureIssueInPlanned;
exports.removeIssueFromPlanned = removeIssueFromPlanned;
