import { chromium } from 'playwright';
import { resolve, join, dirname, extname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { Buffer } from 'buffer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO     = resolve(__dirname, '../..');
const DIST_ROOT = join(REPO, 'dist');
const DIST      = join(REPO, 'dist/widgets');
const OUTPUT    = join(REPO, 'screenshots');

// Build the app if dist is missing
if (!existsSync(join(DIST, 'release-manager-page/index.html'))) {
  console.log('Building app...');
  execFileSync('npm', ['run', 'build'], { cwd: REPO, stdio: 'inherit' });
}

mkdirSync(OUTPUT, { recursive: true });

// ─── Local HTTP server (Chromium CORS blocks file:// → file:// for ES modules) ──
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};
const PORT = 4321;
const server = createServer(async (req, res) => {
  const safePath = req.url.split('?')[0].replace(/\.\./g, '');
  const filePath = join(DIST_ROOT, safePath === '/' ? 'index.html' : safePath);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

// ─── Mock data ────────────────────────────────────────────────────────────────

const SETTINGS = {
  customFieldNames: ['Fix versions'],
  greenZoneValues: ["Fixed", "Won't fix", "Duplicate"],
  yellowZoneValues: ['In Progress', 'Reopened'],
  redZoneValues: ['Open', 'Submitted'],
  products: [
    { id: 'backend',  name: 'Backend'  },
    { id: 'mobile',   name: 'Mobile'   },
    { id: 'web',      name: 'Web'      },
    { id: 'platform', name: 'Platform' },
  ],
};
const PERMISSIONS = { isManager: true, isLightManager: true };
const CONFIG = { manualIssueManagement: false, metaIssuesEnabled: false, customFieldsMapping: false };
// Config with all feature flags on — used for the settings screenshot
const CONFIG_FULL = { manualIssueManagement: true, metaIssuesEnabled: true, customFieldsMapping: true };

const mkIssues = (prefix, startIdx, count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${startIdx + i}`,
    idReadable: `${prefix}-${startIdx + i}`,
    summary: `Issue #${startIdx + i}`,
  }));

// Realistic summaries for the v1.4.0 In Progress release (shown expanded)
const IN_PROGRESS_ISSUES = [
  { id: 'ACME-101', idReadable: 'ACME-101', summary: 'Implement per-endpoint API rate limiting middleware' },
  { id: 'ACME-102', idReadable: 'ACME-102', summary: 'Add bulk CSV import with real-time progress tracking' },
  { id: 'ACME-103', idReadable: 'ACME-103', summary: 'Webhook retry logic with exponential backoff' },
  { id: 'ACME-104', idReadable: 'ACME-104', summary: 'Immutable audit trail for all data-mutating operations' },
  { id: 'ACME-105', idReadable: 'ACME-105', summary: 'Optimize slow queries in the reporting pipeline' },
  { id: 'ACME-106', idReadable: 'ACME-106', summary: 'Database connection pool tuning for high concurrency' },
];

const mkSnapshot = (green, total) => ({
  capturedAt: '2026-01-01T00:00:00Z',
  freezeTimestamp: '2026-01-01T00:00:00Z',
  issues: [], excludedIssueIds: [],
  progress: { green, yellow: 0, red: 0, grey: 0, total },
});

const RELEASES = [
  {
    id: '1', version: 'v1.0.0', status: 'Released', product: 'Backend',
    releaseDate: '2026-01-10', featureFreezeDate: '2025-12-15',
    freezeConfirmed: true, freezeTimestamp: '2025-12-15T00:00:00Z',
    snapshot: mkSnapshot(24, 24),
    plannedIssues: mkIssues('ACME', 1, 24),
    description: 'Initial stable release with core backend infrastructure.',
  },
  {
    id: '2', version: 'v1.1.0', status: 'Released', product: 'Mobile',
    releaseDate: '2026-02-15', featureFreezeDate: '2026-01-20',
    freezeConfirmed: true, freezeTimestamp: '2026-01-20T00:00:00Z',
    snapshot: mkSnapshot(18, 18),
    plannedIssues: mkIssues('ACME', 25, 18),
  },
  {
    id: '3', version: 'v1.2.0', status: 'Released', product: 'Web',
    releaseDate: '2026-03-01', featureFreezeDate: '2026-02-10',
    freezeConfirmed: true, freezeTimestamp: '2026-02-10T00:00:00Z',
    snapshot: mkSnapshot(16, 16),
    plannedIssues: mkIssues('ACME', 43, 16),
  },
  {
    id: '4', version: 'v1.3.0', status: 'Released', product: 'Backend',
    releaseDate: '2026-04-01', featureFreezeDate: '2026-03-05',
    freezeConfirmed: true, freezeTimestamp: '2026-03-05T00:00:00Z',
    snapshot: mkSnapshot(20, 20),
    plannedIssues: mkIssues('ACME', 59, 20),
  },
  {
    // 6 issues so the expanded row shows a clean list; 4 Fixed → 67% progress
    id: '5', version: 'v1.4.0', status: 'In progress', product: 'Backend',
    releaseDate: '2026-07-20', featureFreezeDate: '2026-06-15',
    description: 'API rate limiting, bulk import, and webhook retry logic.',
    plannedIssues: IN_PROGRESS_ISSUES,
  },
  {
    id: '6', version: 'v2.0.0', status: 'Planning', product: 'Platform',
    releaseDate: '2026-10-15', featureFreezeDate: '2026-09-01',
    plannedIssues: [],
    description: 'Major architectural redesign for the next-generation platform.',
  },
];

// 4 of 6 in-progress issues are Fixed → 67% green
const ISSUE_STATUSES = Object.fromEntries(
  ['ACME-101', 'ACME-102', 'ACME-103', 'ACME-104'].map(id => [id, 'Fixed'])
);

// ─── Calendar mock data ───────────────────────────────────────────────────────

const CAL_PROJECTS = [
  { id: 'ACME', shortName: 'ACME', name: 'Acme Shop'  },
  { id: 'MOB',  shortName: 'MOB',  name: 'Mobile App' },
  { id: 'PLT',  shortName: 'PLT',  name: 'Platform'   },
];
const CAL_RELEASES = [
  {
    projectId: 'ACME', projectName: 'Acme Shop',
    releases: [
      { id: 'c1', version: 'v1.3.0', featureFreezeDate: null,         releaseDate: '2026-04-01', status: 'Released'    },
      { id: 'c2', version: 'v1.4.0', featureFreezeDate: '2026-06-09', releaseDate: '2026-07-28', status: 'In progress' },
      { id: 'c3', version: 'v2.0.0', featureFreezeDate: '2026-09-01', releaseDate: '2026-10-15', status: 'Planning'    },
    ],
  },
  {
    projectId: 'MOB', projectName: 'Mobile App',
    releases: [
      { id: 'c4', version: 'v3.2.0', featureFreezeDate: '2026-05-20', releaseDate: '2026-06-15', status: 'Released'    },
      { id: 'c5', version: 'v3.3.0', featureFreezeDate: '2026-08-15', releaseDate: '2026-09-10', status: 'Planning'    },
    ],
  },
  {
    projectId: 'PLT', projectName: 'Platform',
    releases: [
      { id: 'c6', version: 'v5.0.0', featureFreezeDate: '2026-06-23', releaseDate: '2026-08-05', status: 'In progress' },
    ],
  },
];
const CAL_CONFIG_RAW = {
  projectIdsJson: JSON.stringify(['ACME', 'MOB', 'PLT']),
  defaultView: 'month',
  showFreezeDates: 'true',
  showProjectName: 'true',
  showProduct: 'false',
};

// ─── YTApp mock factories ─────────────────────────────────────────────────────

function rmPageMock(expandedVersionId = null, config = CONFIG, releasesOverride = null) {
  const releases = releasesOverride !== null ? releasesOverride : RELEASES;
  return /* js */`
window.YTApp = {
  locale: 'en',
  entity: { id: 'ACME', type: 'project' },
  register: async () => ({
    fetchApp: async (path) => {
      if (path === 'backend/releases')         return ${JSON.stringify(releases)};
      if (path === 'backend/app-settings')     return ${JSON.stringify(SETTINGS)};
      if (path === 'backend/permissions')      return ${JSON.stringify(PERMISSIONS)};
      if (path === 'backend/config')           return ${JSON.stringify(config)};
      if (path === 'backend/issue-statuses')   return { issueStatuses: ${JSON.stringify(ISSUE_STATUSES)}, testStatuses: {} };
      if (path === 'backend/expanded-version') return { expandedVersion: ${JSON.stringify(expandedVersionId)} };
      if (path === 'backend-global/issue-field-bulk-batch') return {};
      if (path.startsWith('backend/refresh-calendar')) return {};
      if (path.startsWith('backend-global/'))  return [];
      return {};
    },
    fetchYouTrack: async () => [],
    storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, clear: async () => {}, getKeys: async () => [] },
    alert: () => {},
    getBaseUrl: () => 'https://youtrack.example.com/',
    collapse: () => {},
    enterModalMode: Promise.resolve(() => {}),
    exitModalMode: Promise.resolve(() => {}),
  }),
};`;
}

function calendarMock() {
  return /* js */`
window.YTApp = {
  locale: 'en',
  register: async (appApi) => {
    const calCache    = ${JSON.stringify(JSON.stringify(CAL_RELEASES))};
    const calProjects = ${JSON.stringify(JSON.stringify(CAL_PROJECTS))};
    const calReleases = ${JSON.stringify(CAL_RELEASES)};
    return {
      fetchApp: async (path) => {
        if (path === 'backend-global/my-rm-projects')    return ${JSON.stringify(CAL_PROJECTS)};
        if (path === 'backend-global/calendar-releases') return calReleases;
        return [];
      },
      fetchYouTrack: async () => [],
      storage: {
        getItem: async (key) => {
          if (key === 'rm-calendar-cache')    return calCache;
          if (key === 'rm-calendar-projects') return calProjects;
          return null;
        },
        setItem: async () => {}, removeItem: async () => {}, clear: async () => {}, getKeys: async () => [],
      },
      readConfig:  async () => (${JSON.stringify(CAL_CONFIG_RAW)}),
      storeConfig: async () => {},
      readCache:   async () => null,
      storeCache:  async () => {},
      setTitle: async () => {},
      setLoadingAnimationEnabled: async () => {},
      enterConfigMode: async () => {},
      exitConfigMode:  async () => {},
      setError:  async () => {},
      clearError: async () => {},
      downloadFile: async () => {},
      fetchHub: async () => {},
      loadServices: async () => [],
      alert: async () => {},
      removeWidget: () => {},
      collapse: () => {},
      enterModalMode: Promise.resolve(() => {}),
      exitModalMode:  Promise.resolve(() => {}),
    };
  },
};`;
}

// Read the app icon once for use in all calendar frames
const ICON_SVG_DATA_URL = `data:image/svg+xml;base64,${
  Buffer.from(await readFile(join(REPO, 'public/icon.svg'))).toString('base64')
}`;

// Inject calendar dashboard card wrapper (mimics YouTrack widget frame)
async function injectCalendarFrame(page) {
  await page.evaluate((iconUrl) => {
    // Gray page background
    Object.assign(document.body.style, {
      background: '#eeeef0',
      margin: '0', padding: '0', overflow: 'hidden',
    });

    const root = document.getElementById('root');
    if (!root) { return; }

    // Card frame
    const card = document.createElement('div');
    Object.assign(card.style, {
      position: 'fixed',
      top: '20px', left: '20px', right: '20px', bottom: '20px',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.07), 0 4px 24px rgba(0,0,0,0.10)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    });

    // Widget header (real app icon + title)
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '16px 20px 0', flexShrink: '0',
    });

    const icon = document.createElement('img');
    icon.src = iconUrl;
    Object.assign(icon.style, { width: '22px', height: '22px', display: 'block' });

    const title = document.createElement('span');
    Object.assign(title.style, {
      fontSize: '15px', fontWeight: '600', color: '#1a1a1a', letterSpacing: '-0.01em',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    });
    title.textContent = 'Release Calendar';

    header.appendChild(icon);
    header.appendChild(title);
    card.appendChild(header);

    // Content area — move root inside
    const content = document.createElement('div');
    Object.assign(content.style, { flex: '1', overflow: 'hidden', position: 'relative' });
    content.appendChild(root);
    card.appendChild(content);

    document.body.appendChild(card);
  }, ICON_SVG_DATA_URL);
}

// ─── Screenshot engine ────────────────────────────────────────────────────────

// headless:false = full GPU + native macOS font rendering, identical to real browser
const browser = await chromium.launch({ channel: 'chrome', headless: false });

async function shot(outFile, mockScript, widgetPath, interact, viewport = { width: 1280, height: 800 }, clip = undefined) {
  // deviceScaleFactor:2 produces retina-quality output (2× physical pixels, same CSS viewport)
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  await page.addInitScript({ content: mockScript });
  await page.goto(`${BASE}/widgets/${widgetPath}`, { waitUntil: 'domcontentloaded' });
  // Load Inter and override --ring-font-family so fonts match JetBrains UI conventions
  await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' });
  await page.addStyleTag({ content: `
    :root { --ring-font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }
    html, body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  ` });
  if (interact) await interact(page);
  await page.screenshot({ path: join(OUTPUT, outFile), fullPage: false, clip });
  await page.close();
  await ctx.close();
  console.log(`✓ ${outFile}`);
}

// ── Release Manager Page ──────────────────────────────────────────────────────

// 1. Releases table — with v1.4.0 expanded (2nd row after sort by releaseDate desc)
await shot(
  'release-manager-page-01-releases-table.png',
  rmPageMock('5'),   // start with v1.4.0 (id='5') expanded
  'release-manager-page/index.html',
  async (page) => {
    await page.waitForSelector('.version-list-item', { timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.version-list-item').length >= 6,
      { timeout: 15000 }
    );
    // Allow progress bars and expanded content to settle
    await page.waitForTimeout(1000);
  }
);

// 2. New Release form — form ends at y≈768, fits comfortably in 800px viewport
await shot(
  'release-manager-page-02-release-form.png',
  rmPageMock(null, CONFIG_FULL),
  'release-manager-page/index.html',
  async (page) => {
    await page.waitForSelector('.version-list-item', { timeout: 15000 });
    await page.locator('button:has-text("Add Release Version")').first().click();
    await page.waitForSelector('.form-container', { timeout: 10000 });
    await page.waitForTimeout(400);
  }
);

// 3. Settings — all FFs enabled so all sections are visible
await shot(
  'release-manager-page-03-settings.png',
  rmPageMock(null, CONFIG_FULL),
  'release-manager-page/index.html',
  async (page) => {
    await page.waitForSelector('.version-list-item', { timeout: 15000 });
    await page.locator('button[title="Settings"]').first().click();
    await page.waitForSelector('.app-settings-form', { timeout: 10000 });
    await page.waitForTimeout(600);
  }
);

// 4. Onboarding (empty state — no releases yet, app configured)
await shot(
  'release-manager-page-04-onboarding.png',
  rmPageMock(null, CONFIG_FULL, []),  // empty releases → EmptyState component
  'release-manager-page/index.html',
  async (page) => {
    // EmptyState renders when releases array is empty after loading
    await page.waitForTimeout(3000);
  }
);

// ── Release Calendar (wrapped in dashboard card frame) ────────────────────────

// 4. Month view
await shot(
  'release-calendar-01-month-view.png',
  calendarMock(),
  'release-calendar/index.html',
  async (page) => {
    await page.waitForSelector('.rc-grid-container', { timeout: 15000 });
    await page.waitForTimeout(400);
    await injectCalendarFrame(page);
    await page.waitForTimeout(100);
  }
);

// 5. Quarter view
await shot(
  'release-calendar-02-quarter-view.png',
  calendarMock(),
  'release-calendar/index.html',
  async (page) => {
    await page.waitForSelector('.rc-grid-container', { timeout: 15000 });
    await page.locator('button:has-text("Quarter")').click();
    await page.waitForSelector('.rc-quarter-view', { timeout: 5000 });
    await page.waitForTimeout(300);
    await injectCalendarFrame(page);
    await page.waitForTimeout(100);
  }
);

// 6. Year view
await shot(
  'release-calendar-03-year-view.png',
  calendarMock(),
  'release-calendar/index.html',
  async (page) => {
    await page.waitForSelector('.rc-grid-container', { timeout: 15000 });
    await page.locator('button:has-text("Year")').click();
    await page.waitForSelector('.rc-year-view', { timeout: 5000 });
    await page.waitForTimeout(300);
    await injectCalendarFrame(page);
    await page.waitForTimeout(100);
  }
);

// ── Landing page — both widgets side by side ──────────────────────────────────

// Read the rendered widget screenshots and embed them as base64 in the landing HTML
const tableImg  = (await readFile(join(OUTPUT, 'release-manager-page-01-releases-table.png'))).toString('base64');
const calImg    = (await readFile(join(OUTPUT, 'release-calendar-01-month-view.png'))).toString('base64');
const iconB64   = (await readFile(join(REPO, 'public/icon.svg'))).toString('base64');

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      width: 1280px; height: 800px; overflow: hidden;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      background: #f8f6ff;
      position: relative;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 20px; padding: 24px 36px 20px;
    }

    /* ── Gradient blobs ── */
    .blob {
      position: absolute; border-radius: 50%;
      filter: blur(72px); pointer-events: none; z-index: 0;
    }
    .b1 { width: 520px; height: 520px; background: #d8b4fe; opacity: .45; top: -180px; left: -120px; }
    .b2 { width: 420px; height: 420px; background: #f9a8d4; opacity: .35; bottom: -140px; right: -80px; }
    .b3 { width: 340px; height: 340px; background: #93c5fd; opacity: .30; top: 160px; right: 140px; }
    .b4 { width: 260px; height: 260px; background: #6ee7b7; opacity: .20; bottom: 60px; left: 200px; }

    /* ── Everything above blobs ── */
    .content { position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 20px; }

    /* ── Brand header ── */
    .brand { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .brand-row { display: flex; align-items: center; gap: 10px; }
    .brand-icon { width: 28px; height: 28px; }
    .brand-name { font-size: 20px; font-weight: 700; color: #0f0f0f; letter-spacing: -0.03em; }
    .brand-tagline { font-size: 12.5px; color: #5c5c7a; text-align: center; max-width: 520px; line-height: 1.5; }

    /* ── Cards ── */
    .cards { display: flex; flex-direction: column; gap: 14px; width: 100%; }

    .card {
      background: rgba(255,255,255,0.82);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.9);
      border-radius: 16px;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 4px 24px rgba(80,40,120,0.10);
      overflow: hidden;
      display: flex; flex-direction: row;
      height: 290px; flex-shrink: 0;
    }

    /* Left info panel */
    .card-info {
      width: 270px; flex-shrink: 0;
      padding: 22px 24px;
      display: flex; flex-direction: column; gap: 10px;
      border-right: 1px solid rgba(0,0,0,0.05);
    }
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 100px;
      font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
      align-self: flex-start;
    }
    .badge-project  { background: #dbeafe; color: #1d4ed8; }
    .badge-dashboard{ background: #ede9fe; color: #6d28d9; }
    .badge-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

    .card-title { font-size: 15px; font-weight: 700; color: #0f0f0f; letter-spacing: -0.02em; line-height: 1.3; }
    .card-desc  { font-size: 12px; color: #555; line-height: 1.6; }

    .features { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
    .feature {
      display: flex; align-items: center; gap: 7px;
      font-size: 11.5px; color: #444;
    }
    .feature-dot { width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; }
    .dot-blue   { background: #3b82f6; }
    .dot-purple { background: #8b5cf6; }

    /* Right preview */
    .card-preview {
      flex: 1; overflow: hidden; position: relative; background: #fff;
    }
    /* 2560×1600 PNG at width:100% of container → scales to fit; clipped by overflow:hidden */
    .preview-img {
      width: 100%; height: auto; display: block;
      position: absolute; top: 0; left: 0;
    }
    /* Fade the bottom edge */
    .card-preview::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 56px;
      background: linear-gradient(transparent, rgba(255,255,255,0.95));
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="blob b4"></div>

  <div class="content">
    <div class="brand">
      <div class="brand-row">
        <img class="brand-icon" src="data:image/svg+xml;base64,${iconB64}" alt="">
        <span class="brand-name">Release Manager</span>
      </div>
      <span class="brand-tagline">Two powerful YouTrack widgets for planning, tracking and communicating product releases — right where your team works.</span>
    </div>

    <div class="cards">
      <!-- Release Manager Page -->
      <div class="card">
        <div class="card-info">
          <span class="badge badge-project"><span class="badge-dot"></span>Project Tab</span>
          <div class="card-title">Release Manager Page</div>
          <div class="card-desc">Full release lifecycle management directly inside your YouTrack project.</div>
          <div class="features">
            <div class="feature"><span class="feature-dot dot-blue"></span>Version management with progress bars</div>
            <div class="feature"><span class="feature-dot dot-blue"></span>Planned issues &amp; meta-issue groups</div>
            <div class="feature"><span class="feature-dot dot-blue"></span>Release notes &amp; audit log</div>
          </div>
        </div>
        <div class="card-preview">
          <img class="preview-img" src="data:image/png;base64,${tableImg}" alt="">
        </div>
      </div>

      <!-- Release Calendar -->
      <div class="card">
        <div class="card-info">
          <span class="badge badge-dashboard"><span class="badge-dot"></span>Dashboard Widget</span>
          <div class="card-title">Release Calendar</div>
          <div class="card-desc">Visualize feature-freeze and release dates across all projects in one view.</div>
          <div class="features">
            <div class="feature"><span class="feature-dot dot-purple"></span>Month, Quarter and Year views</div>
            <div class="feature"><span class="feature-dot dot-purple"></span>Multi-project timeline at a glance</div>
            <div class="feature"><span class="feature-dot dot-purple"></span>Feature Freeze date markers</div>
          </div>
        </div>
        <div class="card-preview">
          <img class="preview-img" src="data:image/png;base64,${calImg}" alt="">
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

{
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(LANDING_HTML, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUTPUT, 'landing.png'), fullPage: false });
  await page.close();
  await ctx.close();
  console.log('✓ landing.png');
}

await browser.close();
server.close();
