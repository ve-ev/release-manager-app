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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
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
    title: 'Update releases when mapped release custom field changes',
    guard: (ctx) => {
        if (!isCustomFieldsMappingEnabled(ctx)) {
            return false;
        }

        // Skip processing when the change was initiated by the Release Manager app
        // We use an Issue extension property (updatedByReleaseManager) to mark
        // such updates in the backend custom-field-set handler.
        if (ctx.issue && ctx.issue.extensionProperties && ctx.issue.extensionProperties.updatedByReleaseManager) {
            // Clear the marker so that subsequent manual changes are processed normally
            ctx.issue.extensionProperties.updatedByReleaseManager = false;
            return false;
        }

        const fieldName = getPlannedReleaseFieldName(ctx);
        if (!fieldName) {
            throw new Error('Custom field mapping is not configured');
        }

        const field = ctx.issue.project.findFieldByName(fieldName);
        return ctx.issue.isChanged(field) && ctx.issue.isReported;
    },
    action: (ctx) => {
        if (!isCustomFieldsMappingEnabled(ctx)) {
            return;
        }

        const fieldName = getPlannedReleaseFieldName(ctx);
        if (!fieldName) {
            return;
        }

        const field = ctx.issue.project.findFieldByName(fieldName);
        if (!field) {
            return;
        }

        // Read new value (string) or null when cleared
        const fldVal = ctx.issue.fields[field.name];
        const newValue = fldVal && typeof fldVal.name === 'string' ? fldVal.name : null;

        // eslint-disable-next-line no-console
        console.log('[ReleaseManager][Workflow] Planned release field changed for issue', ctx.issue.id, 'new value =', newValue || '<empty>');

        try {
            // Update releases: remove from all if null, otherwise add to selected and remove from others
            api.updateReleasesForIssueByVersion(ctx, ctx.issue, newValue);
            message('Release Manager App: Update releases triggered due to the '+ field.name +' custom field change');
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log('Failed to update releases on custom field change: ' + (e && e.message ? e.message : e));
        }
    },
    requirements: {}
});
