/**
 * Release Manager Backend API
 *
 * This module provides the backend functionality for the Release Manager application.
 * It includes utilities for managing release versions and HTTP endpoints for CRUD operations.
 */
/* eslint-disable func-names */

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
            // eslint-disable-next-line complexity
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

                    // Validate release version
                    const validationErrors = validateReleaseVersion(updatedReleaseVersion);
                    if (validationErrors.length > 0) {
                        sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, {errors: validationErrors});
                        return;
                    }

                    // Get existing release versions
                    const releaseVersions = getReleaseVersions(ctx);

                    // Find and update release version
                    const index = releaseVersions.findIndex(rv => rv.id === id);

                    if (index !== -1) {
                        // Preserve ID and update
                        updatedReleaseVersion.id = id;
                        releaseVersions[index] = updatedReleaseVersion;

                        // Save to extension properties
                        if (saveReleaseVersions(ctx, releaseVersions)) {
                            ctx.response.json(updatedReleaseVersion);
                        } else {
                            sendErrorResponse(ctx, HTTP_STATUS.BAD_REQUEST, 'Failed to save release version');
                        }
                    } else {
                        sendErrorResponse(ctx, HTTP_STATUS.NOT_FOUND, 'Release version not found');
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
            // eslint-disable-next-line complexity
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
            // eslint-disable-next-line complexity
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
            // eslint-disable-next-line complexity
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
            // eslint-disable-next-line complexity
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
        }
    ]
};
