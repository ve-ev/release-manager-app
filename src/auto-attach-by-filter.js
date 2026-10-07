/* eslint-disable @typescript-eslint/no-require-imports */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const api = require('./backend.js');

// Debounce window: quick changes to one issue merge into one search
const AUTO_ATTACH_DELAY_MS = 5000;

exports.rule = entities.Issue.onChange({
    title: 'Auto-attach Issues by Filter',
    guard: (ctx) => !!ctx.settings.autoAttachByFilter &&
        !ctx.settings.customFieldsMapping &&
        ctx.issue.isReported &&
        // ponytail: substring check instead of JSON.parse keeps the guard cheap; a release
        // that is frozen or released still passes here and is skipped in autoAttachIssue
        (ctx.project.extensionProperties.releases || '').indexOf('"autoAttachQuery"') !== -1,
    action: (ctx) => {
        // Same loop guard as update-releases-on-cf-change.js
        if (ctx.issue.extensionProperties.updatedByReleaseManager) {
            ctx.issue.extensionProperties.updatedByReleaseManager = false;
            return;
        }
        ctx.store('issue', ctx.issue);
        ctx.store('user', ctx.currentUser);
        ctx.invokeAsync('autoAttach', AUTO_ATTACH_DELAY_MS, 'auto-attach-' + ctx.issue.id);
    },
    asyncFunctions: {
        autoAttach: (ctx) => {
            api.autoAttachIssue(ctx, ctx.load('issue'), ctx.load('user'));
        }
    },
    requirements: {}
});
