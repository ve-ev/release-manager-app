# Release Manager — User Guide

## Overview

Release Manager is a YouTrack app for planning, tracking, and communicating product releases. It adds a **Release Manager** tab to each project's settings page where your team can:

- Create and manage release versions with target dates and feature freeze dates
- Track planned issues and their progress toward completion
- Freeze releases with a progress snapshot
- Generate release notes
- Tag releases with color-coded labels

---

## Roles & Permissions

Roles are configured by a YouTrack administrator under **Administration → Apps → Release Manager → Settings**.

| Role | Can do |
|---|---|
| **Release Manager** | Everything: create/edit/delete releases, freeze/unfreeze, access settings, view audit trail |
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
