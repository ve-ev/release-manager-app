import {HostAPI} from "../../../@types/globals";
import {ReleaseVersion} from "./interfaces";
import {AppSettings, Permissions} from "./interfaces";
import {logger} from './utils/logger';
/* eslint-disable complexity */

let cachedSettings: unknown | undefined;
let cachedSettingsPromise: Promise<unknown> | null = null;

export class API {
  constructor(private host: HostAPI) {}

  // ----- Issue field getters -----
  /**
   * Batch fetch bulk field values for multiple issues at once.
   *
   * @param issueIds - Array of issue IDs to fetch
   * @param fieldNames - Array of field names to try (in order)
   * @returns Map of issueId -> { items, usedField }
   */
  async getIssueFieldBulkBatch(
    issueIds: string[],
    fieldNames: string[]
  ): Promise<Record<string, { items: Array<{ id: string; value: string | null }>; usedField?: string }>> {
    // Validate both arrays before making API call
    if (!issueIds || issueIds.length === 0) {
      return {};
    }
    if (!fieldNames || fieldNames.length === 0) {
      return {};
    }

    try {
      return await this.fetchJson<Record<string, { items: Array<{ id: string; value: string | null }>; usedField?: string }>>(
        'backend-global/issue-field-bulk-batch',
        {
          method: 'POST',
          body: {
            issueIds,
            fieldNames
          }
        }
      );
    } catch (error) {
      logger.error('Batch field fetch failed:', error);
      // Return empty results for all issues
      return Object.fromEntries(issueIds.map(id => [id, { items: [] }]));
    }
  }

  /**
   * Invalidate cached progress settings so next fetch gets fresh data
   */
  invalidateProgressSettingsCache(): void {
    cachedSettings = undefined;
    cachedSettingsPromise = null;
  }

  /**
   * Fetch JSON data from backend
   */
  async fetchJson<T = Record<string, unknown>>(path: string, options?: Record<string, unknown>): Promise<T> {
    // Simple caching for progress settings to avoid duplicate requests
    if (path === 'backend/app-settings') {
      const method = (options as { method?: unknown } | undefined)?.method?.toString().toUpperCase?.() || 'GET';
      if (method === 'GET') {
        if (cachedSettings) {
          return cachedSettings as T;
        }
        if (cachedSettingsPromise) {
          return (await cachedSettingsPromise) as T;
        }
        cachedSettingsPromise = (async () => {
          const res = await this._fetchJsonInternal<T>(path, options);
          cachedSettings = res;
          cachedSettingsPromise = null;
          return res as unknown;
        })();
        return (await cachedSettingsPromise) as T;
      }
      // For non-GET requests, bypass cache and perform request
      return this._fetchJsonInternal<T>(path, options);
    }

    return this._fetchJsonInternal<T>(path, options);
  }

  private async _fetchJsonInternal<T = Record<string, unknown>>(path: string, options?: Record<string, unknown>): Promise<T> {
    // For backend-global endpoints, we need to use scope=false
    // For backend endpoints, we need to use scope=true
    const isBackendGlobal = path.includes('backend-global');

    return await this.host.fetchApp(`${path}`, {
      ...options,
      scope: !isBackendGlobal
    }) as Promise<T>;
  }

  /**
   * Fetch all release versions
   */
  async getReleaseVersions(): Promise<ReleaseVersion[]> {
    return this.host.fetchApp('backend/releases', { scope: true }) as Promise<ReleaseVersion[]>;
  }

  /**
   * Get app settings (cached)
   */
  async getAppSettings(): Promise<AppSettings> {
    return this.fetchJson<AppSettings>('backend/app-settings');
  }

  /**
   * Create a new release version
   */
  async createReleaseVersion(releaseVersion: ReleaseVersion): Promise<void> {
    return this.host.fetchApp('backend/releases', {
      method: 'POST',
      body: releaseVersion,
      scope: true,
    });
  }

  /**
   * Update an existing release version
   */
  async updateReleaseVersion(releaseVersion: ReleaseVersion): Promise<ReleaseVersion> {
    if (!releaseVersion.id) {
      throw new Error('Release version ID is required for update');
    }

    return this.host.fetchApp(`backend/release?id=${releaseVersion.id}`, {
      method: 'PUT',
      body: releaseVersion,
      scope: true,
    }) as Promise<ReleaseVersion>;
  }

  /**
   * Delete a release version
   */
  async deleteReleaseVersion(releaseVersionId: string): Promise<void> {
    return this.host.fetchApp(`backend/release?id=${releaseVersionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      scope: true,
      body: {}, // Add empty body to ensure request is properly processed
    });
  }

  /**
   * Get base URL from host
   */
  getBaseUrl(): string {
    const baseUrl = this.host.getBaseUrl?.() || '';
    // Normalize the URL to ensure it ends with a slash
    return baseUrl.charAt(baseUrl.length - 1) === '/' ? baseUrl : `${baseUrl}/`;
  }

  async getPermissions(): Promise<Permissions> {
    return this.host.fetchApp('backend/permissions', { scope: true }) as Promise<Permissions>;
  }

  async getConfig() {
    return this.host.fetchApp('backend/config', { scope: true }) as Promise<Record<string, unknown>>;
  }

  // ----- Issue/Test statuses storage -----
  async getIssueStatuses(): Promise<{ issueStatuses: Record<string, string>; testStatuses: Record<string, string> }> {
    return this.host.fetchApp('backend/issue-statuses', { scope: true }) as Promise<{ issueStatuses: Record<string, string>; testStatuses: Record<string, string> }>;
  }

  async setIssueStatus(issueId: string, status: 'Unresolved'|'Fixed'|'Merged'|'Discoped'): Promise<void> {
    await this.host.fetchApp('backend/issue-status', {
      method: 'PUT',
      body: { issueId, status },
      scope: true
    });
  }

  async setIssueTestStatus(issueId: string, testStatus: 'Tested'|'Not tested'|'Test NA'): Promise<void> {
    await this.host.fetchApp('backend/issue-test-status', {
      method: 'PUT',
      body: { issueId, testStatus },
      scope: true
    });
  }

  // ----- Expanded version per user -----
  async getExpandedVersion(): Promise<{ expandedVersion: string | number | null }> {
    return this.host.fetchApp('backend/expanded-version', { scope: true }) as Promise<{ expandedVersion: string | number | null }>;
  }

  async setExpandedVersion(expandedVersion: string | number | null): Promise<void> {
    await this.host.fetchApp('backend/expanded-version', {
      method: 'PUT',
      body: { expandedVersion },
      scope: true
    });
  }

  async setIssueCustomField(issueId: string, fieldName: string, value: string, action?: 'set' | 'add' | 'remove'): Promise<{ success: boolean; resolvedName?: string }>{
    return this.fetchJson<{ success: boolean; resolvedName?: string }>('backend/custom-field-set', {
      method: 'POST',
      body: { issueId, fieldName, value, action: action || 'set' }
    });
  }

  /**
   * Updates releaseDate / startDate / released on a YouTrack VersionBundleElement.
   * Uses host.fetchYouTrack() — it handles the server URL and auth automatically.
   * The project ID comes from YTApp.entity.id (the permanent REST-compatible ID).
   */
  async syncVersionBundleElement(
    fieldName: string,
    versionName: string,
    releaseDate: string | null,
    startDate: string | null,
    isReleased: boolean | null
  ): Promise<void> {
    if (!fieldName || !versionName) { return; }

    const projectId = YTApp.entity?.type === 'project' ? (YTApp.entity.id || '') : '';
    if (!projectId) { return; }

    // Step 0: resolve the canonical field name via the App SDK backend. The App SDK's
    // findFieldByName() handles localised display names (e.g. German "Beheben in" →
    // canonical REST API name "Fix versions"), closing the gap between what the user
    // types in settings and what the YouTrack REST API exposes as field.name.
    let resolvedFieldId: string | null = null;
    let resolvedBundleId: string | null = null;
    const lowerFieldNames = new Set([fieldName.toLowerCase()]);
    try {
      const info = await this.fetchJson<{
        found: boolean;
        canonicalName?: string;
        fieldId?: string | null;
        bundleId?: string | null;
      }>(`backend/field-bundle-info?fieldName=${encodeURIComponent(fieldName)}`);
      if (info?.found) {
        if (info.canonicalName) { lowerFieldNames.add(info.canonicalName.toLowerCase()); }
        if (info.fieldId) { resolvedFieldId = info.fieldId; }
        if (info.bundleId) { resolvedBundleId = info.bundleId; }
      }
      logger.debug('syncVersionBundleElement: field-bundle-info', { found: info?.found, canonicalName: info?.canonicalName, fieldId: info?.fieldId, bundleId: info?.bundleId });
    } catch (e) {
      logger.debug('syncVersionBundleElement: field-bundle-info lookup failed, proceeding with REST API name match only');
    }

    // Step 1: fetch bundle ID only (no nested values — avoids YouTrack REST default ~42-element
    // cap; $top=1000 matches step 2 for consistency). Request bundle via both projections:
    //   bundle(id)             — project-specific bundle (correct for independent copies)
    //   field(id,name,localizedName,bundle(id)) — also request the localised display name (e.g.
    //     "Beheben in" for "Fix versions" on German instances; supported in YouTrack 2022.1+)
    const customFields = await this.host.fetchYouTrack<Array<{
      id: string;
      field: { id: string; name: string; localizedName?: string | null; bundle?: { id: string } | null } | null;
      bundle: { id: string } | null;
    }>>(`admin/projects/${encodeURIComponent(projectId)}/customFields?fields=id,field(id,name,localizedName,bundle(id)),bundle(id)&$top=1000`);

    // Match by canonical name, localised name (e.g. "Beheben in" == "Fix versions" in German),
    // or by field ID from the App SDK backend — whichever resolves first.
    const matched = (customFields || []).find(f => {
      const n = f.field?.name?.toLowerCase() ?? '';
      const ln = f.field?.localizedName?.toLowerCase() ?? '';
      return lowerFieldNames.has(n) || (ln && lowerFieldNames.has(ln)) ||
        (resolvedFieldId != null && (f.id === resolvedFieldId || f.field?.id === resolvedFieldId));
    });
    // Prefer project-specific bundle (independent copy); fall back to global field bundle.
    // Also use bundleId returned directly by the App SDK if the REST API match failed.
    const bundleId = matched?.bundle?.id || matched?.field?.bundle?.id || resolvedBundleId;
    if (!bundleId) { return; }

    // Step 2: fetch all elements with explicit $top=1000 (YouTrack's implicit cap is ~42).
    const allValues = await this.host.fetchYouTrack<Array<{ id: string; name: string }>>(
      `admin/customFieldSettings/bundles/version/${encodeURIComponent(bundleId)}/values?fields=id,name&$top=1000`
    );
    // Exact match intentional — version names are created by this app so casing is canonical.
    const elementId = (allValues || []).find(v => v.name === versionName)?.id;
    if (!elementId) { return; }

    // Step 3: write the update. Guard against NaN timestamps from unexpected date string formats.
    const body: Record<string, unknown> = {};
    if (releaseDate !== null && releaseDate !== undefined) { const t = new Date(releaseDate).getTime(); if (!isNaN(t)) { body.releaseDate = t; } }
    if (startDate !== null && startDate !== undefined) { const t = new Date(startDate).getTime(); if (!isNaN(t)) { body.startDate = t; } }
    if (isReleased !== null && isReleased !== undefined) { body.released = isReleased; }
    if (Object.keys(body).length === 0) { return; }

    await this.host.fetchYouTrack(
      `admin/customFieldSettings/bundles/version/${encodeURIComponent(bundleId)}/values/${encodeURIComponent(elementId)}?fields=id,name,releaseDate,startDate,released`,
      { method: 'POST', body }
    );
  }

  /** Returns version-bundle custom fields for the current project with canonical and localised names. */
  async listProjectVersionFields(): Promise<Array<{ name: string; localizedName: string | null }>> {
    const projectId = YTApp.entity?.type === 'project' ? (YTApp.entity.id || '') : '';
    if (!projectId) { return []; }
    try {
      const fields = await this.host.fetchYouTrack<Array<{
        field: { name: string; localizedName?: string | null; fieldType?: { id?: string } | null; bundle?: { id: string } | null } | null;
        bundle: { id: string } | null;
      }>>(`admin/projects/${encodeURIComponent(projectId)}/customFields?fields=id,field(id,name,localizedName,fieldType(id),bundle(id)),bundle(id)&$top=1000`);
      return (fields || [])
        .filter(f => f.bundle?.id || f.field?.bundle?.id) // only bundle-type fields
        .map(f => ({ name: f.field?.name ?? '', localizedName: f.field?.localizedName ?? null }))
        .filter(f => f.name);
    } catch {
      return [];
    }
  }

  async getVersionFieldValues(fieldName: string): Promise<{ fieldName: string; values: Array<{ name: string; releaseDate: string | null; startDate: string | null; isReleased: boolean; isArchived: boolean }> }> {
    return this.fetchJson<{ fieldName: string; values: Array<{ name: string; releaseDate: string | null; startDate: string | null; isReleased: boolean; isArchived: boolean }> }>(
      `backend/version-field-values?fieldName=${encodeURIComponent(fieldName)}`
    );
  }

  async importVersions(fieldName: string, versions: Array<{ name: string; releaseDate: string | null; startDate: string | null; isReleased: boolean }>): Promise<{ imported: string[]; skipped: string[]; totalImported: number; totalSkipped: number }> {
    return this.fetchJson<{ imported: string[]; skipped: string[]; totalImported: number; totalSkipped: number }>('backend/import-versions', {
      method: 'POST',
      body: { fieldName, versions }
    });
  }

  async refreshCalendarData(): Promise<void> {
    try {
      await this.host.fetchApp('backend/refresh-calendar-data', {
        method: 'POST',
        body: {},
        scope: true
      });
    } catch {
      // Non-critical — silently ignore if user is not RM or request fails
    }
  }
}
