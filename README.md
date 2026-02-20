# Release Manager App

A [YouTrack](https://www.jetbrains.com/youtrack/) app for planning, tracking, and communicating product releases — right from your project settings.

[![JetBrains Plugin](https://img.shields.io/badge/JetBrains_Marketplace-Release_Manager-blue)](https://plugins.jetbrains.com/plugin/28255-release-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Release Versions** — Create and manage releases with version, status, dates, tags, and descriptions
- **Progress Tracking** — Visualize release progress using configurable custom field value zones (green/yellow/red)
- **Planned & Meta Issues** — Attach issues to releases; optionally group them under meta-issues
- **Custom Field Mapping** — Keep releases in sync with a YouTrack custom field on issues
- **Release Notes** — Generate Markdown release notes from release data and planned issues
- **Filters & Sorting** — Filter by tag, version, or status; sort by any column
- **Audit Log** — Track key changes to release versions (status transitions, freeze events, issue changes)
- **Permissions** — Role-based access: full managers, light managers (edit-only), and viewers

## Getting Started

1. Install from the [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/28255-release-manager) or upload the app bundle manually in YouTrack.
2. Open a project's **Settings → Apps → Release Manager**.
3. Configure custom field names and value zones in **App Settings**.
4. Create your first release version and start adding planned issues.

## Mental Model

The app follows a three-layer architecture running inside the YouTrack platform:

```
┌─────────────────────────────────────────────────────────────────┐
│                        YouTrack Host                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Frontend Widget  (React + TypeScript, Vite)              │  │
│  │                                                           │  │
│  │  app.tsx ─── hooks/ ─── components/                       │  │
│  │    │          │           ├── table/     (version list,   │  │
│  │    │          │           │               progress bars,  │  │
│  │    │          │           │               linked issues)  │  │
│  │    │          │           ├── form/      (create/edit     │  │
│  │    │          │           │               release)        │  │
│  │    │          │           ├── settings/  (field mapping,  │  │
│  │    │          │           │               progress zones, │  │
│  │    │          │           │               import)         │  │
│  │    │          │           └── dialogs    (release notes,  │  │
│  │    │          │                           audit log,      │  │
│  │    │          │                           add issue)      │  │
│  │    │          │                                           │  │
│  │    │          ├── useReleaseVersions   (CRUD state)       │  │
│  │    │          ├── useAppSettings       (config state)     │  │
│  │    │          ├── useVersionProgress   (progress calc)    │  │
│  │    │          └── usePermissions       (role checks)      │  │
│  │    │                                                      │  │
│  │    └──▶ api.ts  (API class — HTTP calls to backend)       │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │  HTTP (fetch)                       │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │  Backend  (backend.js — YouTrack Scripting API)           │  │
│  │                                                           │  │
│  │  • REST endpoints: CRUD for release versions              │  │
│  │  • Validation, audit events, freeze snapshots             │  │
│  │  • Custom field sync (set field on issues)                │  │
│  │  • Storage: project-level extensionProperties (JSON)      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Workflow  (update-releases-on-cf-change.js)              │  │
│  │                                                           │  │
│  │  Issue.onChange → detects custom field edits on issues    │  │
│  │  and calls backend to add/remove the issue from releases  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **Release Version** — the core entity stored as JSON in YouTrack project extension properties. Contains version name, status, dates, planned issues, freeze snapshots, and audit trail.
- **Progress Zones** — issues linked to a release are categorized into green/yellow/red/grey zones based on a configurable custom field, powering the progress bar.
- **Freeze & Snapshot** — when a release is frozen, the backend captures an immutable snapshot of all issue statuses for historical reference.
- **Custom Field Mapping** — bidirectional sync: the workflow updates releases when an issue's custom field changes; the backend updates the issue's custom field when it is added/removed from a release.
- **Permissions** — three roles: Manager (full access), Light Manager (edit-only), Viewer (read-only), resolved via the YouTrack permissions API.

### Data Flow

1. User interacts with the **widget UI** (create release, add issues, change settings)
2. The **API class** sends HTTP requests to **backend.js** endpoints
3. The **backend** validates, updates project extension properties (JSON storage), and optionally sets custom fields on issues
4. The **workflow** listens for issue custom field changes and calls the backend to keep releases in sync
5. Hooks re-fetch data and React re-renders the UI

## Development

### Prerequisites

- Node.js
- npm
- [YouTrack Apps CLI](https://www.npmjs.com/package/@jetbrains/youtrack-apps-tools)

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check, build, and validate the app bundle |
| `npm run pack` | Package `dist/` into `release-manager-app.zip` |
| `npm run upload` | Build and upload to YouTrack |
| `npm run lint` | Run ESLint |

## Links

- [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/28255-release-manager)
- [GitHub Repository](https://github.com/ve-ev/release-manager-app)

## License

[MIT](LICENSE) © Evgenii Venediktov
