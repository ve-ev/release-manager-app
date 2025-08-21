# Release Manager App

A YouTrack project settings app for planning, tracking, and communicating product releases. 
It provides a single place to define "Release Versions" with dates, status, planned/meta issues, and product tags; to visualize progress; and to generate release notes. 
The app ships as a widget for PROJECT_SETTINGS and uses a lightweight backend to persist data in project extension properties.

## Getting Started
1. In YouTrack, install or upload the app bundle.
2. Open a project’s settings and set the “Release Manager” group.
3. Open App > Settings, enter custom field names and value zones, and optionally define products.
4. Create your first release version, add planned issues or meta issues.
5. Use filters and sorting to navigate; expand rows to review details and generate release notes.

## Highlights
- Plan releases per project with Release Versions (version, status, dates, product) and details (description, additional info)
- Track progress based on configurable custom fields and value zones (green/yellow/red)
- Manage planned issues per release, with optional meta-issues aggregation
- Inline status and test-status tracking for issues when manual issue management is enabled
- Filters and sorting for quick navigation across releases
- Visual indicators for feature freeze and release deadlines (today/overdue)
- Generate Markdown release notes from the release definition and planned issues
- Per-user expansion state remembered to keep context across sessions

## Feature Overview

1. Release Versions
   - Fields: id, product, version, description, additionalInfo, featureFreezeDate, releaseDate, status (Planning | In progress | Released | Overdue | Canceled), freezeConfirmed (flag), plannedIssues, linkedIssues, metaIssues.
   - Validation (enforced server-side):
     - version is required
     - releaseDate is required
     - featureFreezeDate must be before releaseDate when both provided
     - status defaults to Planning if absent and must be one of the allowed values
     - linkedIssues must be an array when present
   - CRUD operations available depending on permissions.

2. Planned Issues and Meta Issues
   - plannedIssues: list of issues referenced by id (with optional idReadable) and summary.
   - meta issues (optional feature): a meta item that aggregates relatedIssueIds; the UI can open a meta-issue form for quick definition.
   - Manual issue management mode (feature flag) unlocks tracking of issue status and test status with dedicated endpoints and safeguards (e.g., test status can only be set when issue status is Fixed or Merged).

3. Progress Tracking
   - Configured via Settings per project: customFieldNames (ordered list of field names to probe, case-insensitive), and value zones:
     - greenZoneValues (Completed), yellowZoneValues (In Progress), redZoneValues (Blocked).
   - The app tries the first available custom field name across issues (parent/meta and subtasks) to derive per-issue values.
   - A progress bar summarizes the current state (UI components and styles under components/table/progress and styles/progress-bar.css).

4. Products
   - Optional list of products configured in Settings, each with a color. Color can be edited or auto-generated deterministically based on product name.
   - When products exist, the table shows a Product column and a product filter.

5. Release Status and Date Indicators
   - Derived display status can become Overdue when the release date has passed and status is not Released/Canceled.
   - Indicators:
     - Feature freeze indicator when featureFreezeDate is today and status is Planning/In progress.
     - Release today indicator when releaseDate is today and status is not Released/Canceled/Overdue.
   - Dates are highlighted when today/expired under the same conditions.

6. Filters and Sorting
   - Filters: by product (exact), version (substring), and status (exact).
   - Sorting: by product, version, progress (approx. by planned issue count), status (predefined order), featureFreezeDate, and releaseDate (default desc for dates, asc for others). Sorting is toggled via the header.

7. Permissions Model
   - Derived from backend /permissions endpoint, based on groups configured in app settings:
     - isManager: full access (settings, create, edit, delete)
     - isLightManager: limited access (edit only)
   - UI permissions:
     - canAccessSettings: managers
     - canCreate: managers
     - canEdit: light managers or managers
     - canDelete: managers

8. UX Details
   - Empty state page guiding first-time users to configure settings or create the first release.
   - Row expansion reveals detailed sections (description, additional info, planned issues, overdue/freeze notices). Only one row can be expanded at a time.
   - Expansion and info section toggles are coordinated to avoid jitter. The last expanded release id is stored per user.
   - Auto-refresh: polling every 5 seconds reconciles the list with minimal re-renders.
   - Inline success alerts for create/update/delete operations and confirmation dialogs for delete.

9. Release Notes
   - Generate Markdown based on release data and planned issues. When manual issue management is enabled and issue statuses are available, Discoped issues are excluded.
   - The dialog shows the generated Markdown for copy/paste or further processing.

## Backend Endpoints
Project-scoped (src/backend.js):
- GET /backend/config → { manualIssueManagement, metaIssuesEnabled }
- GET /backend/permissions → { isManager, isLightManager }
- GET /backend/app-settings → progress settings and products
- PUT /backend/app-settings → update settings; requires at least one customFieldName
- GET /backend/releases → list of releases
- GET /backend/release?id=… → single release
- POST /backend/releases → create release (validates fields, assigns id)
- PUT /backend/release?id=… → update release (validates, preserves id)
- DELETE /backend/release?id=… → delete release
- GET /backend/issue-statuses → { issueStatuses, testStatuses }
- PUT /backend/issue-status → set issue status (Unresolved|Fixed|Merged|Discoped); resets test status unless Fixed/Merged
- PUT /backend/issue-test-status → set test status (Tested|Not tested|Test NA); only meaningful when issue is Fixed/Merged
- GET /backend/expanded-version → { expandedVersion }
- PUT /backend/expanded-version → store per-user expanded version id

Global (src/backend-global.js):
- GET /backend-global/issue?issueId=… → { id, summary, state, subtasks }
- GET /backend-global/issue-field?issueId=…&fieldName=… → resolve field value (supports multiple candidate names, case-insensitive)
- GET /backend-global/issue-field-exists?issueId=…&fieldName=… → { exists, resolvedName }
- GET /backend-global/issue-field-bulk?issueId=…&fieldName=… → per-issue values for parent and subtasks using the resolved field name

Data persistence:
- Releases and settings are stored in project extensionProperties.
- Issue statuses and test statuses stored in either project extensionProperties or settings (backward compatibility path).
- Per-user expanded version stored in currentUser.extensionProperties.

## Build, Run, and Deploy
- Scripts (package.json):
  - npm run dev → start Vite dev server
  - npm run build → type-check (tsc -p tsconfig.app.json), build with Vite, validate YouTrack app bundle (youtrack-app validate dist)
  - npm run pack → zip the dist folder into release-manager-app.zip
  - npm run upload → build and upload the dist to YouTrack via youtrack-app CLI
- Build config: vite.config.ts (root: src; output: dist; assets under widgets/* copied; manifest and public copied to dist)
- Manifest: manifest.json declares the widget (key: releases) for the PROJECT_SETTINGS extension point; widget entry at widgets/release-manager-page/index.html; icon at widgets/release-manager-page/widget-icon.svg.

## Known Behaviors and Edge Cases
- Manual issue management mode affects release notes generation and enables status/test-status editing flows.
- When multiple custom field names are set, the backend resolves the first existing name on the issue; name matching is case-insensitive.

