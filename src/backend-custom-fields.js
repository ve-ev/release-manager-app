/**
 * Release Manager — Custom field operations
 *
 * Functions for managing custom field values on issues, including
 * multi-value field support and bundle value creation.
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');


/**
 * Applies a custom field action (set/add/remove) to an issue.
 * @param {Object} issue
 * @param {Object} field
 * @param {Object} payload - { action, value }
 * @returns {string|null} error message or null on success
 */
function applyCustomFieldAction(issue, field, payload) {
    const action = payload.action || 'set';
    const isMulti = isMultiValueField(issue, field);
    const hasValue = payload.value && payload.value !== '';

    if (action === 'set' && !hasValue) { issue.fields[field.name] = null; return null; }
    if (action === 'remove') { handleCustomFieldRemove(issue, field, payload.value, isMulti); return null; }
    if (!hasValue) { return 'Value is required for this action'; }

    handleCustomFieldSetOrAdd(issue, field, payload.value, action, isMulti);
    return null;
}


/**
 * Default app settings structure.
 * @returns {Object}
 */
function defaultAppSettings() {
    return {
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
}


/**
 * Ensures a custom field bundle value exists for a release version name.
 * @param {Object} ctx
 * @param {string} releaseVersionName
 * @param {Function} getAppSettings - function(ctx) returning settings
 */
function ensureCustomFieldValueForRelease(ctx, releaseVersionName, getAppSettings) {
    if (!ctx.settings.customFieldsMapping || !releaseVersionName) { return; }
    const fieldName = getPlannedReleaseFieldName(ctx, getAppSettings);
    if (!fieldName) { return; }
    const field = ctx.project.findFieldByName(fieldName);
    if (!field) { return; }
    if (!field.findValueByName(releaseVersionName)) {
        field.createValue(releaseVersionName);
    }
}


/**
 * Finds or creates a custom field bundle value.
 * @param {Object} field
 * @param {string} valueName
 * @returns {Object} the field value
 */
function findOrCreateFieldValue(field, valueName) {
    var existingValue = field.findValueByName(valueName);
    if (!existingValue) {
        existingValue = field.createValue(valueName);
        console.log('[ReleaseManager][Backend] Created new bundle value', valueName, 'for field', field.name);
    }
    return existingValue;
}


/**
 * Resolves the planned release field name from app settings.
 * @param {Object} ctx
 * @param {Function} getAppSettings - function(ctx) returning settings
 * @returns {string|null}
 */
function getPlannedReleaseFieldName(ctx, getAppSettings) {
    const appSettings = getAppSettings(ctx);
    const settings = typeof appSettings === 'string' ? JSON.parse(appSettings) : appSettings;
    return (settings && settings.customFieldMapping && settings.customFieldMapping.plannedReleaseField) || null;
}


/**
 * Handles the 'remove' action for a custom field.
 * @param {Object} issue
 * @param {Object} field
 * @param {string} valueName
 * @param {boolean} isMulti
 */
function handleCustomFieldRemove(issue, field, valueName, isMulti) {
    if (isMulti) { removeCustomFieldValue(issue, field, valueName); }
    else { issue.fields[field.name] = null; }
}


/**
 * Handles the 'set' or 'add' action for a custom field.
 * @param {Object} issue
 * @param {Object} field
 * @param {string} valueName
 * @param {string} action
 * @param {boolean} isMulti
 */
function handleCustomFieldSetOrAdd(issue, field, valueName, action, isMulti) {
    const resolvedValue = findOrCreateFieldValue(field, valueName);
    if (action === 'add' && isMulti) {
        issue.fields[field.name].add(resolvedValue);
    } else {
        issue.fields[field.name] = resolvedValue;
    }
}


/**
 * Checks if a field's current value is a multi-value Set-like collection.
 * @param {Object} issue
 * @param {Object} field
 * @returns {boolean}
 */
function isMultiValueField(issue, field) {
    const val = issue.fields[field.name];
    return val && typeof val.forEach === 'function' && typeof val.add === 'function';
}


/**
 * Migrates legacy customFieldName and ensures defaults.
 * @param {Object} settings
 * @returns {Object} migrated settings
 */
function migrateAppSettings(settings) {
    migrateLegacyFieldName(settings);
    if (!settings.customFieldMapping || typeof settings.customFieldMapping !== 'object') {
        settings.customFieldMapping = {};
    }
    if (!Array.isArray(settings.customFieldNames)) { settings.customFieldNames = []; }
    if (!Array.isArray(settings.products)) { settings.products = []; }
    return settings;
}


/**
 * Migrates legacy customFieldName to customFieldNames array.
 * @param {Object} settings
 */
function migrateLegacyFieldName(settings) {
    if (settings.customFieldName == null) { return; }
    if (settings.customFieldNames && Array.isArray(settings.customFieldNames)) { return; }
    const txt = String(settings.customFieldName || '');
    settings.customFieldNames = txt.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
    delete settings.customFieldName;
}


/**
 * Handles removing a value from a multi-value custom field.
 * @param {Object} issue
 * @param {Object} field
 * @param {string} valueName
 */
function removeCustomFieldValue(issue, field, valueName) {
    const currentValues = issue.fields[field.name];
    if (!currentValues) { return; }
    const valueToRemove = field.findValueByName(valueName);
    if (valueToRemove && typeof currentValues.delete === 'function') {
        currentValues.delete(valueToRemove);
    }
}


/**
 * Resolves issue and field for custom-field-set, marking the issue as app-updated.
 * @param {Object} payload
 * @returns {{issue: Object, field: Object}|null}
 */
function resolveCustomFieldTarget(payload) {
    const issue = entities.Issue.findById(payload.issueId);
    if (!issue) { return null; }
    if (issue.extensionProperties) { issue.extensionProperties.updatedByReleaseManager = true; }
    const field = issue.project.findFieldByName(payload.fieldName);
    if (!field) { return null; }
    return { issue: issue, field: field };
}

exports.defaultAppSettings = defaultAppSettings;
exports.migrateLegacyFieldName = migrateLegacyFieldName;
exports.migrateAppSettings = migrateAppSettings;
exports.getPlannedReleaseFieldName = getPlannedReleaseFieldName;
exports.ensureCustomFieldValueForRelease = ensureCustomFieldValueForRelease;
exports.removeCustomFieldValue = removeCustomFieldValue;
exports.findOrCreateFieldValue = findOrCreateFieldValue;
exports.isMultiValueField = isMultiValueField;
exports.applyCustomFieldAction = applyCustomFieldAction;
exports.resolveCustomFieldTarget = resolveCustomFieldTarget;
