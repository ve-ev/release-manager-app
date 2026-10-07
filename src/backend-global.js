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
 * Diagnostic logging utility
 *
 * @param {string} message - Log message
 */
function log(message) {
    // eslint-disable-next-line no-console
    console.log('[ReleaseCalendar] ' + message);
}

/**
 * Returns true if the current user is in one of the project's Release Manager groups.
 * Reads the releaseManagerGroups extension property (mirrored by backend.js).
 *
 * @param {Object} project - YouTrack project entity
 * @param {Object} currentUser - ctx.currentUser
 * @returns {boolean}
 */
function isUserRmForProject(project, currentUser) {
    try {
        var groupsJson = project.extensionProperties && project.extensionProperties.releaseManagerGroups;
        var groups = groupsJson ? JSON.parse(groupsJson) : [];
        if (!Array.isArray(groups)) { return false; }
        return groups.some(function (groupName) {
            try {
                if (currentUser.isInGroup && currentUser.isInGroup(groupName)) { return true; }
            } catch { /* fall back to currentUser.groups */ }
            let matched = false;
            try {
                currentUser.groups.forEach(function (g) {
                    if (g && g.name === groupName) { matched = true; }
                });
            } catch { /* not available */ }
            return matched;
        });
    } catch (e) {
        log('isUserRmForProject error: ' + (e && (e.message || e)));
        return false;
    }
}

/**
 * Returns the issue when it exists and the current user can read it, otherwise null.
 * Global handlers are not tied to a project, so access is checked per issue.
 *
 * @param {Object} ctx
 * @param {string} issueId
 * @returns {Object|null}
 */
function findReadableIssue(ctx, issueId) {
    const issue = entities.Issue.findById(issueId);
    return issue && issue.isVisibleTo(ctx.currentUser) ? issue : null;
}

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
 * @param {Object} ctx - The context object
 * @param {Object} issue - The issue object
 * @returns {Object|null} Formatted issue data or null if issue is not provided
 */
function prepareIssueData(ctx, issue) {
    if (!issue) {
        return null;
    }

    const subTaskIds = []
    issue.links['parent for'].forEach(
        function (subTask) {
            if (subTask.isVisibleTo(ctx.currentUser)) {
                subTaskIds.push(subTask.id)
            }
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

                    const foundIssue = findReadableIssue(ctx, issueId);

                    if (foundIssue) {
                        const data = prepareIssueData(ctx, foundIssue);
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
                        const foundIssue = findReadableIssue(ctx, issueId);
                        if (foundIssue) {
                            return {
                                found: true,
                                issue: prepareIssueData(ctx, foundIssue)
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
            method: 'POST',
            path: 'issue-field-bulk-batch',
            permissions: ['READ_ISSUE'],
            handle: function handle(ctx) {
                try {
                    const payload = ctx.request.json();
                    const issueIds = payload.issueIds || [];
                    const fieldNames = payload.fieldNames || [];

                    if (!Array.isArray(issueIds) || issueIds.length === 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Issue IDs array is required');
                        return;
                    }
                    if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Field names array is required');
                        return;
                    }

                    // Result structure: { issueId: { items: [...], usedField: string } }
                    const results = {};

                    for (let i = 0; i < issueIds.length; i++) {
                        const issueId = issueIds[i];
                        const parent = findReadableIssue(ctx, issueId);

                        if (!parent) {
                            results[issueId] = {items: [], usedField: null};
                            continue;
                        }

                        // Resolve which field name exists on this issue
                        const selectedActualName = resolveFieldNameCaseInsensitive(parent, fieldNames);

                        if (!selectedActualName) {
                            results[issueId] = {items: [], usedField: null};
                            continue;
                        }

                        // Collect ids: parent first, then all subtasks
                        const ids = [issueId];
                        parent.links['parent for'].forEach(function (subTask) {
                            if (subTask.isVisibleTo(ctx.currentUser)) {
                                ids.push(subTask.id);
                            }
                        });

                        const items = [];
                        for (let j = 0; j < ids.length; j++) {
                            const id = ids[j];
                            const it = findReadableIssue(ctx, id);
                            let value = null;
                            if (it && it.fields) {
                                const fld = it.fields[selectedActualName];
                                if (fld) {
                                    value = (typeof fld.name === 'string') ? fld.name : null;
                                }
                            }
                            items.push({id: id, value: value});
                        }

                        results[issueId] = {
                            items: items,
                            usedField: selectedActualName
                        };
                    }

                    ctx.response.json(results);
                } catch (error) {
                    logError('Failed to get issue field bulk batch', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * GET /my-rm-projects
         * Returns the list of projects where the current user has the Release Manager role.
         * Projects come from the registry that backend.js /refresh-calendar-data writes on each RM widget visit.
         */
        {
            method: 'GET',
            path: 'my-rm-projects',
            handle: function handle(ctx) {
                try {
                    // Read global registry of RM-enabled project shortNames (written by backend.js)
                    var shortNamesRaw = ctx.globalStorage && ctx.globalStorage.extensionProperties && ctx.globalStorage.extensionProperties.rmProjectShortNames;
                    var shortNames = [];
                    if (shortNamesRaw) {
                        try { shortNames = JSON.parse(shortNamesRaw); } catch { shortNames = []; }
                        if (!Array.isArray(shortNames)) { shortNames = []; }
                    }

                    var result = [];
                    for (var i = 0; i < shortNames.length; i++) {
                        try {
                            var project = entities.Project.findByKey(shortNames[i]);
                            if (!project) { continue; }
                            if (isUserRmForProject(project, ctx.currentUser)) {
                                result.push({
                                    id: project.shortName,
                                    shortName: project.shortName,
                                    name: project.name || project.shortName
                                });
                            }
                        } catch (e) {
                            log('  error checking project ' + shortNames[i] + ': ' + (e && e.message));
                        }
                    }

                    ctx.response.json(result);
                } catch (error) {
                    logError('Failed to get my-rm-projects', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        },
        /**
         * POST /calendar-releases
         * Body: { projects: Array<{ id: string, shortName: string }> }
         * Returns releases stripped to calendar-essential fields for each permitted project.
         */
        {
            method: 'POST',
            path: 'calendar-releases',
            handle: function handle(ctx) {
                try {
                    var payload = ctx.request.json();
                    var projects = Array.isArray(payload.projects) ? payload.projects : [];
                    var result = [];

                    for (var i = 0; i < projects.length; i++) {
                        var projectRef = projects[i];
                        if (!projectRef || !projectRef.shortName) { continue; }
                        try {
                            var project = entities.Project.findByKey(projectRef.shortName);
                            if (!project) { continue; }
                            if (!(project.extensionProperties.calendarSnapshot || project.extensionProperties.releases)) { continue; }
                            if (!isUserRmForProject(project, ctx.currentUser)) { continue; }
                            var calendarReleases;
                            var projectName = project.name || project.shortName || projectRef.shortName;
                            var snapshotJson = project.extensionProperties && project.extensionProperties.calendarSnapshot;
                            if (snapshotJson) {
                                var snapshot = JSON.parse(snapshotJson);
                                calendarReleases = snapshot.releases || [];
                                projectName = snapshot.projectName || snapshot.projectShortName || projectName;
                            } else {
                                var rawReleases = JSON.parse(project.extensionProperties.releases);
                                calendarReleases = rawReleases.map(function (r) {
                                    return {
                                        id: r.id,
                                        version: r.version,
                                        featureFreezeDate: r.featureFreezeDate !== undefined ? r.featureFreezeDate : null,
                                        releaseDate: r.releaseDate,
                                        status: r.status || 'Planning',
                                        product: r.product || undefined
                                    };
                                });
                            }
                            result.push({
                                projectId: projectRef.id,
                                projectName: projectName,
                                releases: calendarReleases
                            });
                        } catch {
                            // project not found or inaccessible — skip silently
                        }
                    }

                    ctx.response.json(result);
                } catch (error) {
                    logError('Failed to get calendar releases', error);
                    sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, error.message || error);
                }
            }
        }
    ]
};
