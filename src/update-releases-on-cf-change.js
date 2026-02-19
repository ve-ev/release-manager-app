const entities = require('@jetbrains/youtrack-scripting-api/entities');
const api = require('./backend.js');
const {message} = require("@jetbrains/youtrack-scripting-api/workflow.js");

/**
 * Checks if custom fields mapping feature is enabled
 * @param {Object} ctx - The context object
 * @returns {boolean} True if feature is enabled
 */
function isCustomFieldsMappingEnabled(ctx) {
    return ctx.settings.customFieldsMapping || false;
}

/**
 * Retrieves and parses app settings from extension properties
 * @param {Object} ctx - The context object
 * @returns {Object} Parsed app settings object
 */
function parseAppSettings(ctx) {
    let appSettings = api.getAppSettings(ctx);
    try {
        if (typeof appSettings === 'string') {
            appSettings = JSON.parse(appSettings);
        }
    } catch {
        appSettings = {};
    }
    return appSettings;
}

/**
 * Retrieves the planned release field name from app settings
 * @param {Object} ctx - The context object
 * @returns {string|null} Field name or null if not configured
 */
function getPlannedReleaseFieldName(ctx) {
    const appSettings = parseAppSettings(ctx);
    return appSettings && appSettings.customFieldMapping && appSettings.customFieldMapping.plannedReleaseField || null;
}

exports.rule = entities.Issue.onChange({
    title: 'Update Releases on Custom Field Change',
    // eslint-disable-next-line complexity
    guard: (ctx) => {
        if (!isCustomFieldsMappingEnabled(ctx)) {
            return false;
        }

        // Skip processing when the change was initiated by the Release Manager app
        // We use an Issue extension property (updatedByReleaseManager) to mark
        // such updates in the backend custom-field-set handler.
        if (ctx.issue?.extensionProperties?.updatedByReleaseManager) {
            // Clear the marker so that subsequent manual changes are processed normally
            ctx.issue.extensionProperties.updatedByReleaseManager = false;
            return false;
        }

        const fieldName = getPlannedReleaseFieldName(ctx);
        if (!fieldName) {
            message(
                '⚠️ Release Manager Notification </br>Custom field mapping is not configured! </br>' +
                'Please configure this in the settings within the app or disable this feature.'
            );
            return false;
        }

        const field = ctx.issue.project.findFieldByName(fieldName);
        return field && ctx.issue.isChanged(field.name) && ctx.issue.isReported;
    },
    // eslint-disable-next-line complexity
    action: (ctx) => {
        if (!isCustomFieldsMappingEnabled(ctx)) {
            return;
        }

        const fieldName = getPlannedReleaseFieldName(ctx);
        if (!fieldName) {
            return;
        }

        const projectField = ctx.issue.project.findFieldByName(fieldName);
        if (!projectField) {
            return;
        }

        // Read new value(s) — supports both single and multi-value custom fields
        const issueField = ctx.issue.fields[projectField.name];
        let newValues = [];
        if (issueField && typeof issueField.forEach === 'function') {
            // Multi-value field (Set-like): iterate to collect all values
            issueField.forEach(v => { if (v && v.name) { newValues.push(v.name); } });
        } else if (issueField && typeof issueField.name === 'string') {
            // Single-value field
            newValues.push(issueField.name);
        }

        console.log('[ReleaseManager][Workflow] Planned release field changed for issue', ctx.issue.id, 'new value =', newValues || '<empty>');

        try {
            // Update releases: remove from all if null, otherwise add to selected and remove from others
            api.updateReleasesForIssueByVersion(ctx, ctx.issue, newValues);
            message(
                '🔄 Release Manager Notification</br> ' +
                'Update releases triggered due to the "' + projectField.name + '" custom field change'
            );
        } catch (e) {
            console.log('Failed to update releases on custom field change: ' + (e && e.message ? e.message : e));
        }
    },
    requirements: {}
});
