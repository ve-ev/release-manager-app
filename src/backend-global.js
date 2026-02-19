/**
 * Release Manager Backend API
 *
 * This module provides the backend functionality for the Release Manager application.
 * It includes utilities for managing release versions and HTTP endpoints for CRUD operations.
 */
// External dependencies
const entities = require("@jetbrains/youtrack-scripting-api/entities.js");
const utils = require('./backend-utils');

const logError = utils.logError;
const resolveFieldNameCaseInsensitive = utils.resolveFieldNameCaseInsensitive;

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
 * Builds bulk batch results for multiple issues and field names.
 * @param {string[]} issueIds
 * @param {string[]} fieldNames
 * @returns {Object}
 */
function buildBulkBatchResults(issueIds, fieldNames) {
    const results = {};
    for (let i = 0; i < issueIds.length; i++) {
        const issueId = issueIds[i];
        const parent = entities.Issue.findById(issueId);
        if (!parent) { results[issueId] = {items: [], usedField: null}; continue; }
        const selectedActualName = resolveFieldNameCaseInsensitive(parent, fieldNames);
        if (!selectedActualName) { results[issueId] = {items: [], usedField: null}; continue; }
        const ids = collectIssueAndSubtaskIds(parent, issueId);
        results[issueId] = { items: collectFieldValues(ids, selectedActualName), usedField: selectedActualName };
    }
    return results;
}


/**
 * Collects field values for a list of issue IDs.
 * @param {string[]} ids
 * @param {string|null} fieldName
 * @returns {Array<{id: string, value: string|null}>}
 */
function collectFieldValues(ids, fieldName) {
    const items = [];
    for (let i = 0; i < ids.length; i++) {
        const it = entities.Issue.findById(ids[i]);
        items.push({id: ids[i], value: fieldName ? readFieldStringValue(it, fieldName) : null});
    }
    return items;
}


/**
 * Sets error response with appropriate status code and message
 *
 * @param {Object} ctx - The context object
 * @param {number} statusCode - HTTP status code
 * @param {string|Object} errorMessage - Error message or object
 */
/**
 * Collects parent issue ID and all subtask IDs.
 * @param {Object} parent
 * @param {string} parentId
 * @returns {string[]}
 */
function collectIssueAndSubtaskIds(parent, parentId) {
    const ids = [parentId];
    parent.links['parent for'].forEach(function (subTask) {
        ids.push(subTask.id);
    });
    return ids;
}


/**
 * Parses a semicolon/comma-separated field name string into an ordered array.
 * @param {string} fieldName
 * @returns {string[]}
 */
function parseFieldNames(fieldName) {
    const names = (fieldName || '')
        .toString()
        .split(/[;,]/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return !!s; });
    return names.length > 0 ? names : [fieldName];
}


function prepareCustomFieldData(issue, fieldName) {
    if (!issue) { return null; }
    const orderedNames = parseFieldNames(fieldName);
    var selectedName = orderedNames[0] || fieldName;
    var value = null;
    var actualName = resolveFieldNameCaseInsensitive(issue, orderedNames);
    if (actualName) {
        selectedName = actualName;
        value = readFieldStringValue(issue, actualName);
    }
    return { name: selectedName, value: value };
}


/**
 * Prepares issue data for API response
 *
 * @param {Object} issue - The issue object
 * @returns {Object|null} Formatted issue data or null if issue is not provided
 */
function prepareIssueData(issue) {
    if (!issue) {
        return null;
    }

    const subTaskIds = []
    issue.links['parent for'].forEach(
        function (subTask) {
            subTaskIds.push(subTask.id)
        }
    )

    return {
        id: issue.id,
        summary: issue.summary,
        state: issue.fields && issue.fields.State ? issue.fields.State.name : 'Unknown',
        subtasks: subTaskIds
    };
}


/**
 * Reads a field's string value from an issue.
 * @param {Object} issue
 * @param {string} fieldName
 * @returns {string|null}
 */
function readFieldStringValue(issue, fieldName) {
    if (!issue || !issue.fields) { return null; }
    var fld = issue.fields[fieldName];
    return (fld && typeof fld.name === 'string') ? fld.name : null;
}


function sendErrorResponse(ctx, statusCode, errorMessage) {
    ctx.response.code = statusCode;

    if (typeof errorMessage === 'string') {
        ctx.response.json({error: errorMessage});
    } else {
        ctx.response.json(errorMessage);
    }
}

/**
 * HTTP endpoints handler
 */

exports.httpHandler = {
    endpoints: [
        /**
         * GET /issue - Retrieve issue details by ID
         */
        {
            method: 'GET',
            path: 'issue',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const issueId = ctx.request.getParameter('issueId');

                    if (!issueId) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue ID is required');
                        return;
                    }

                    const foundIssue = entities.Issue.findById(issueId);

                    if (foundIssue) {
                        const data = prepareIssueData(foundIssue);
                        ctx.response.json(data);
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Issue not found');
                    }
                } catch (error) {
                    logError('Failed to get issue', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'POST',
            path: 'issues-batch',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const payload = ctx.request.json();
                    const issueIds = payload.issueIds || [];

                    if (!Array.isArray(issueIds) || issueIds.length === 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue IDs array is required');
                        return;
                    }

                    // Fetch all issues and return results with found/not found status
                    const results = issueIds.map(function (issueId) {
                        const foundIssue = entities.Issue.findById(issueId);
                        if (foundIssue) {
                            return {
                                found: true,
                                issue: prepareIssueData(foundIssue)
                            };
                        } else {
                            return {
                                found: false,
                                issueId: issueId
                            };
                        }
                    });

                    ctx.response.json(results);
                } catch (error) {
                    logError('Failed to get issues batch', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'GET',
            path: 'issue-field',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const issueId = ctx.request.getParameter('issueId');
                    const fieldName = ctx.request.getParameter('fieldName');

                    if (!issueId) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue ID is required');
                        return;
                    }
                    if (!fieldName) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field name is required');
                        return;
                    }
                    const foundIssue = entities.Issue.findById(issueId);
                    if (foundIssue) {
                        const data = prepareCustomFieldData(foundIssue, fieldName)
                        ctx.response.json(data);
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Issue not found');
                    }
                } catch (error) {
                    logError('Failed to get issue field', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'GET',
            path: 'issue-field-exists',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const issueId = ctx.request.getParameter('issueId');
                    const fieldName = ctx.request.getParameter('fieldName');
                    if (!issueId) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue ID is required'); return; }
                    if (!fieldName) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field name is required'); return; }
                    const issue = entities.Issue.findById(issueId);
                    if (!issue) { sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Issue not found'); return; }
                    const actual = resolveFieldNameCaseInsensitive(issue, parseFieldNames(fieldName));
                    ctx.response.json({exists: !!actual, resolvedName: actual});
                } catch (error) {
                    logError('Failed to check issue field existence', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'GET',
            path: 'issue-field-bulk',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const issueId = ctx.request.getParameter('issueId');
                    const fieldName = ctx.request.getParameter('fieldName');
                    if (!issueId) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue ID is required'); return; }
                    if (!fieldName) { sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field name is required'); return; }
                    const parent = entities.Issue.findById(issueId);
                    if (!parent) { sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Issue not found'); return; }
                    const ids = collectIssueAndSubtaskIds(parent, issueId);
                    const selectedActualName = resolveFieldNameCaseInsensitive(parent, parseFieldNames(fieldName));
                    ctx.response.json({
                        parentIssueId: issueId,
                        fieldName: selectedActualName || fieldName,
                        items: collectFieldValues(ids, selectedActualName)
                    });
                } catch (error) {
                    logError('Failed to get issue field bulk', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        {
            method: 'POST',
            path: 'issue-field-bulk-batch',
            permissions: ['READ_ISSUE'],
            // eslint-disable-next-line complexity
            handle: function handle(ctx) {
                try {
                    const payload = ctx.request.json();
                    const issueIds = payload.issueIds || [];
                    const fieldNames = payload.fieldNames || [];
                    if (!Array.isArray(issueIds) || issueIds.length === 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue IDs array is required'); return;
                    }
                    if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field names array is required'); return;
                    }
                    ctx.response.json(buildBulkBatchResults(issueIds, fieldNames));
                } catch (error) {
                    logError('Failed to get issue field bulk batch', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        }
    ]
};
