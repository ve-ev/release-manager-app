/**
 * Release Manager — Audit event helpers
 *
 * Functions for generating audit trail events during release updates.
 */
const utils = require('./backend-utils.js');


/**
 * Generates audit events for status and description changes.
 * @param {Object} prev
 * @param {Object} updated
 * @param {Object} auditCtx
 */
function auditFieldChanges(prev, updated, auditCtx) {
    if (updated.status !== prev.status) {
        auditCtx.auditEvents.push({
            type: 'STATUS_CHANGED', at: auditCtx.now, by: auditCtx.by,
            releaseId: auditCtx.releaseInfo.releaseId, releaseVersion: auditCtx.releaseInfo.releaseVersion,
            fromStatus: prev.status, toStatus: updated.status
        });
    }

    if ((updated.description || '') !== (prev.description || '')) {
        const maxLength = 500;
        auditCtx.auditEvents.push({
            type: 'DESCRIPTION_CHANGED', at: auditCtx.now, by: auditCtx.by,
            releaseId: auditCtx.releaseInfo.releaseId, releaseVersion: auditCtx.releaseInfo.releaseVersion,
            fromDescription: utils.truncateText(prev.description || '', maxLength),
            toDescription: utils.truncateText(updated.description || '', maxLength)
        });
    }
}


/**
 * Generates audit event for planned issues list changes.
 * @param {Object} prev
 * @param {Object} updated
 * @param {Object} auditCtx
 */
function auditPlannedIssuesChanges(prev, updated, auditCtx) {
    try {
        const prevPlannedIds = utils.extractIds(prev.plannedIssues);
        const currPlannedIds = utils.extractIds(updated.plannedIssues);

        if (utils.sameArray(prevPlannedIds, currPlannedIds)) { return; }

        const diff = utils.computeIdDiff(
            prevPlannedIds, currPlannedIds,
            utils.buildIdMap(prev.plannedIssues || []),
            utils.buildIdMap(updated.plannedIssues || [])
        );

        auditCtx.auditEvents.push({
            type: 'PLANNED_ISSUES_CHANGED',
            at: auditCtx.now,
            by: auditCtx.by,
            releaseId: auditCtx.releaseInfo.releaseId,
            releaseVersion: auditCtx.releaseInfo.releaseVersion,
            plannedIssuesSnapshot: utils.buildPlannedIssuesSnapshot(updated),
            fromPlannedCount: prevPlannedIds.length,
            toPlannedCount: currPlannedIds.length,
            addedPlannedIssueIds: diff.added,
            removedPlannedIssueIds: diff.removed,
            addedPlannedIssues: diff.addedIssues,
            removedPlannedIssues: diff.removedIssues,
            plannedReordered: (diff.added.length === 0 && diff.removed.length === 0)
        });
    } catch {
        // ignore audit generation errors
    }
}


/**
 * Builds a release info object for audit events.
 * @param {string} id
 * @param {Object} updated
 * @param {Object} prev
 * @returns {{releaseId: string, releaseVersion: string}}
 */
function buildReleaseInfo(id, updated, prev) {
    return {
        releaseId: id,
        releaseVersion: (updated && (updated.version || updated.id)) || prev.version || prev.id || id
    };
}


/**
 * Resolves the current user identifier for audit logging.
 * @param {Object} ctx
 * @returns {string|undefined}
 */
function getAuditUser(ctx) {
    return (ctx.currentUser && (ctx.currentUser.login || ctx.currentUser.name)) || undefined;
}

exports.getAuditUser = getAuditUser;
exports.buildReleaseInfo = buildReleaseInfo;
exports.auditFieldChanges = auditFieldChanges;
exports.auditPlannedIssuesChanges = auditPlannedIssuesChanges;
