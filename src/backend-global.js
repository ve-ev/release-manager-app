/**
 * Release Manager Backend API
 *
 * This module provides the backend functionality for the Release Manager application.
 * It includes utilities for managing release versions and HTTP endpoints for CRUD operations.
 */
/* eslint-disable vars-on-top, func-names, complexity */

// External dependencies
// Using import-like comment to satisfy ESLint while maintaining compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const entities = require("@jetbrains/youtrack-scripting-api/entities.js");

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

function resolveFieldNameCaseInsensitive(issue, orderedNames) {
    if (!issue || !issue.fields) {
        return null;
    }
    // Build a map of lowercase field keys to actual keys
    var keyMap = {};
    for (var key in issue.fields) {
        if (Object.prototype.hasOwnProperty.call(issue.fields, key)) {
            keyMap[key.toLowerCase()] = key;
        }
    }
    for (var i = 0; i < orderedNames.length; i++) {
        var candidate = orderedNames[i];
        var actual = keyMap[candidate.toLowerCase()];
        if (actual) {
            return actual;
        }
    }
    return null;
}

function prepareCustomFieldData(issue, fieldName) {
    if (!issue) {
        return null;
    }
    // Support ordered list of field names (comma/semicolon separated). Pick the first existing.
    const names = (fieldName || '')
        .toString()
        .split(/[;,]/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return !!s; });
    const orderedNames = names.length > 0 ? names : [fieldName];

    var selectedName = orderedNames.length > 0 ? orderedNames[0] : fieldName;
    var value = null;
    if (issue && issue.fields) {
        var actualName = resolveFieldNameCaseInsensitive(issue, orderedNames);
        if (actualName) {
            selectedName = actualName;
            var fld = issue.fields[actualName];
            value = (fld && typeof fld.name === 'string') ? fld.name : null;
        }
    }
    return {
        name: selectedName,
        value: value
    };
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
                    if (!issueId) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue ID is required');
                        return;
                    }
                    if (!fieldName) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field name is required');
                        return;
                    }
                    const issue = entities.Issue.findById(issueId);
                    if (!issue) {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Issue not found');
                        return;
                    }
                    const names = (fieldName || '')
                        .toString()
                        .split(/[;,]/)
                        .map(function (s) { return s.trim(); })
                        .filter(function (s) { return !!s; });
                    const orderedNames = names.length > 0 ? names : [fieldName];
                    const actual = resolveFieldNameCaseInsensitive(issue, orderedNames);
                    ctx.response.json({ exists: !!actual, resolvedName: actual });
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
                    if (!issueId) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue ID is required');
                        return;
                    }
                    if (!fieldName) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field name is required');
                        return;
                    }
                    const parent = entities.Issue.findById(issueId);
                    if (!parent) {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Issue not found');
                        return;
                    }
                    // collect ids: parent first, then all subtasks
                    const ids = [issueId];
                    parent.links['parent for'].forEach(function (subTask) { ids.push(subTask.id); });

                    // Support multiple field names in order (comma/semicolon separated)
                    const names = (fieldName || '')
                        .toString()
                        .split(/[;,]/)
                        .map(function (s) { return s.trim(); })
                        .filter(function (s) { return !!s; });
                    const orderedNames = names.length > 0 ? names : [fieldName];

                    // First resolve actual field name on parent (case-insensitive). If not exists, skip fetching per-issue values
                    const selectedActualName = resolveFieldNameCaseInsensitive(parent, orderedNames);

                    const items = [];
                    for (let i = 0; i < ids.length; i++) {
                        const id = ids[i];
                        const it = entities.Issue.findById(id);
                        let value = null;
                        if (selectedActualName && it && it.fields) {
                            const fld = it.fields[selectedActualName];
                            if (fld) {
                                value = (typeof fld.name === 'string') ? fld.name : null;
                            }
                        }
                        items.push({ id: id, value: value });
                    }
                    ctx.response.json({ parentIssueId: issueId, fieldName: selectedActualName || fieldName, items: items });
                } catch (error) {
                    logError('Failed to get issue field bulk', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        }
    ]
};
