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
