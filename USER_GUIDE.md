# Release Manager — User Guide

## Overview

Release Manager is a YouTrack app for planning, tracking, and communicating product releases. It adds a **Release Manager** tab to each project's settings page where your team can:

- Create and manage release versions with target dates and feature freeze dates
- Track planned issues and their progress toward completion
- Freeze releases with a progress snapshot
- Generate release notes
- Tag releases with color-coded labels
- Send release changes to other tools with outbound webhooks

---

## Roles & Permissions

Roles are configured by a YouTrack administrator under **Administration → Apps → Release Manager → Settings**.

| Role | Can do |
|---|---|
| **Release Manager** | Everything: create/edit/delete releases, freeze/unfreeze, access settings, configure webhooks, view audit trail |
| **Light Release Manager** | Edit existing releases (title, dates, description, planned issues). Cannot create/delete releases, cannot access settings |
| **Viewer** (everyone else) | Read-only view of releases and their progress |

Roles are assigned to **YouTrack user groups**, not individual users. Add users to the appropriate group in YouTrack to grant access.

---

## Settings Reference

Open the settings form by clicking the gear icon in the Release Manager header. Settings are saved per project.

### Progress Tracking Settings

**Custom Field Name(s)**
Enter the name(s) of the YouTrack issue custom field to use for progress tracking (e.g. `State`, `Status`, `Progress`). Separate multiple names with a comma or semicolon — the app tries each name in order and uses the first one found on an issue. This lets you support projects with differently named state fields.

**Zone Values**

Map individual field values to a color zone that drives the release progress bar:

| Zone | Color | Meaning | Example values |
|---|---|---|---|
| Green | ✅ Green | Issue is done | `Fixed`, `Verified`, `Closed` |
| Yellow | 🟡 Yellow | Issue is in progress | `In Progress`, `In Review` |
| Red | 🔴 Red | Issue is blocked or at risk | `Blocked`, `Stuck`, `Reopened` |

Issues whose field value is not in any zone are counted as unstarted (grey).

### Custom Field Mapping *(requires feature flag)*

> Only visible when the **Custom Field Sync** feature flag is enabled by an administrator.

**Release Field**
The name of the YouTrack custom field that stores the planned release value for an issue (e.g. `Fix versions`, `Release Version`). When an issue's value in this field changes, the workflow automatically adds or removes it from the corresponding release in Release Manager.

**Use existing field values**
When checked, the release creation form shows a dropdown populated with existing values from the configured custom field, so new releases stay in sync with field values already used in your project.

- **Include archived versions** — also show archived field values in the dropdown
- **Include released versions** — also show field values that correspond to already-released versions (on by default)

**Import Release Versions from Custom Field Values**
A button that appears once a Release Field is configured. Creates Release Manager versions for each existing value in the configured custom field, allowing you to bootstrap the app from existing data.

### Tags

Color-coded labels you can attach to release versions. Tags are project-scoped and appear as colored badges on each release. Use them to group releases by product area, team, or release type.

### Webhooks *(requires feature flag)*

When **Outbound Webhooks** is on, the settings have two tabs: **General** and **Webhooks**. Only Release Managers can see and change webhooks.

Each tab has its own **Save**. **Save** saves the changes on that tab and closes the settings. The other button is **Close** when the tab has no unsaved changes, and **Cancel** when it has unsaved changes. **Cancel** drops these changes.

Select **Add webhook** to add a card. A project can have up to 5 webhooks. Each card has these fields:

- **Name** — optional. The card header shows it.
- **URL** — the HTTPS address of the receiver.
- **Secret** — 32 to 500 characters. The app sends it in the `Authorization` header. Nobody can see a saved secret. When you change the URL of a saved webhook, enter the secret again.
- **Events** — the release events that this webhook sends. The **Auto-attach** group is shown only when **Auto-attach by Filter** is on.
- **Enabled** — clear it to stop deliveries and keep the webhook.

Card actions:

- **Send test event** sends a test event with the values that are in the card now. You can test a webhook before you save it. The result is shown next to the button.
- **Delete** removes the webhook. The deletion is saved when you select **Save**.
- **Show delivery log** shows the newest delivery attempts of this webhook: time, event, release, and result.

The card header shows the result of the last delivery. If a webhook has an error when you save, the error is shown in the card of that webhook.

---

## Feature Flags

Feature flags are enabled by a YouTrack administrator under **Administration → Apps → Release Manager → Settings**. Each flag is off by default.

### Manual Issue Management

When enabled, release managers can manually override the progress status of a planned issue inside a release — marking it as **Fixed**, **Merged**, or **Descoped** — without changing the issue's actual field value in YouTrack.

**Use when:**
- An issue is closed via a non-standard workflow that doesn't match your zone values
- An issue should be excluded from progress tracking but kept in the release for visibility

### Meta Issues

When enabled, release managers can create **meta-issues** inside a release — named placeholder entries that represent a group of related work (e.g. an epic or feature). Meta-issues appear in the release list alongside regular planned issues.

**Use when:**
- You want to track an epic or feature as a single release entry
- You need a placeholder for work that isn't yet broken into individual YouTrack issues

### Custom Field Sync

When enabled, a **Custom Field Mapping** section appears in the project's app settings (see above). Configure a YouTrack custom field so that updating an issue's field value automatically moves it between releases.

**Requires:** The **Update Releases on Custom Field Change** workflow must be active in your project (see Workflow Setup below).

### Auto-attach by Filter

When enabled, the release form shows an **Auto-attach filter** input under Planned Issues. Type a YouTrack search query, for example `tag: release-2.0 Type: Bug`. The form shows how many issues match the query.

- When you save the release, the app adds all issues in the project that match the filter. These issues show an **auto** badge.
- When an issue changes and now matches the filter, the app adds it to the release. When an issue that the filter added stops matching, the app removes it. This occurs a few seconds after the change.
- The filter never removes issues that you added by hand.
- **Sync now** in the release **Actions** menu runs the filter again.
- When you clear the filter, the issues that it added stay in the release as manual issues.
- Frozen and released releases do not change.

**Limits:**
- One filter can add a maximum of 256 issues to one release. If the filter matches more issues when you save or select **Sync now**, the app adds nothing and shows an error. If the limit is reached when an issue changes, the release shows **Filter limit reached**.
- The filter works only when **Custom Field Sync** is off.

**Requires:** YouTrack 2026.2 or later. The **Auto-attach Issues by Filter** workflow must be active in your project (see Workflow Setup below).

### Outbound Webhooks

When enabled, the app settings get a **Webhooks** tab (see Settings Reference above). A webhook sends a POST request to an HTTPS URL after a selected release event is saved. For example, use it to start a CI/CD pipeline or to post to a chat through a relay such as n8n.

**Events**

| Event | Sent when | CloudEvents `type` |
|---|---|---|
| Release created | A release is created | `youtrack.release-manager.release.created` |
| Release deleted | A release is deleted | `youtrack.release-manager.release.deleted` |
| Status changed | The status of a release changes | `youtrack.release-manager.release.status-changed` |
| Released | The status changes to **Released** | `youtrack.release-manager.release.completed` |
| Feature freeze confirmed | A release manager confirms the feature freeze | `youtrack.release-manager.release.freeze-confirmed` |
| Unfrozen | A release manager cancels the feature freeze | `youtrack.release-manager.release.unfrozen` |
| Planned issues changed | Issues are added to or removed from a release | `youtrack.release-manager.release.planned-issues-changed` |
| Description changed | The description of a release changes | `youtrack.release-manager.release.description-changed` |
| Issues auto-attached | The filter adds issues to a release | `youtrack.release-manager.release.issues-auto-attached` |
| Issues auto-detached | The filter removes issues from a release | `youtrack.release-manager.release.issues-auto-detached` |

A change to the status to **Released** sends two events: **Status changed** and **Released**.

**Request**

The request uses the [CloudEvents 1.0](https://cloudevents.io/) format in structured mode:

- `Content-Type: application/cloudevents+json`
- `Authorization: Bearer <secret>`. The receiver must check this header.

```json
{
  "specversion": "1.0",
  "id": "5ecfaae7-8fe2-47af-b19e-649a36439c53",
  "source": "/projects/DEMO/release-manager",
  "type": "youtrack.release-manager.release.status-changed",
  "subject": "2.4.0",
  "time": "2026-01-15T12:34:56.000Z",
  "datacontenttype": "application/json",
  "data": {
    "event": "STATUS_CHANGED",
    "project": { "shortName": "DEMO", "name": "Demo Project" },
    "release": {
      "id": "1792845044604",
      "version": "2.4.0",
      "product": "",
      "status": { "from": "Planning", "to": "In progress" },
      "freezeConfirmed": false,
      "featureFreezeDate": "2026-01-05",
      "releaseDate": "2026-01-15",
      "plannedIssues": ["DEMO-101", "DEMO-114"]
    },
    "actor": { "login": "jdoe", "fullName": "John Doe" },
    "details": { "fromStatus": "Planning", "toStatus": "In progress" }
  }
}
```

- `subject` is the release version.
- `data.event` is the event name. `data.details` has the data of the audit event, for example the added and removed issues.
- Each event has a unique `id`. A retry sends the same `id`, so the receiver can ignore duplicates.
- A test event has the type `youtrack.release-manager.webhook.test`, no `subject`, and `"release": null`.

**Delivery**

- The app sends an event after the change is saved, usually in approximately one second. If the save fails, the app sends nothing.
- Only a 2xx response is a successful delivery. The app does not follow redirects, so use the final URL.
- If a delivery fails, or the receiver does not respond in 3 seconds, the app tries again after 1 minute and after 2 more minutes. After 3 attempts, the app stops.
- A failed delivery never blocks the change to the release.
- The project keeps the newest 100 delivery attempts for the delivery log. The log does not keep the request body.

**Limits and security**

- A project can have up to 5 webhooks.
- The URL must use HTTPS. These URLs are not allowed: URLs with a user name or password, IP addresses in private, loopback, link-local, or reserved ranges, IPv6 addresses, host names without a dot, and internal host names such as `localhost`, `*.local`, `*.internal`, or `*.nip.io`.
- These checks do not give full protection: a public host name can point to an internal address. On a YouTrack server in your own network, use webhooks only with receivers that you trust.
- Slack, Microsoft Teams, and GitHub do not accept CloudEvents. Send the events to a relay, such as n8n or a small function, that converts them.

---

## Workflow Setup

The **Update Releases on Custom Field Change** workflow keeps release membership in sync when issues are updated outside of Release Manager.

### When to enable it

Enable this workflow when you have configured a **Release Field** in Custom Field Mapping and want changes to that field on any issue to be automatically reflected in Release Manager.

### How to enable it

1. Go to **Project Settings → Workflow** in YouTrack
2. Find **Update Releases on Custom Field Change** in the list
3. Enable it

Once active, whenever an issue's configured release field changes, the workflow adds the issue to the new release and removes it from the old one. A guard prevents infinite loops if Release Manager itself triggers a field update.

### Auto-attach Issues by Filter

Enable the **Auto-attach Issues by Filter** workflow in the same way when you use the **Auto-attach by Filter** feature. The workflow checks each changed issue against the filters of the open releases.
