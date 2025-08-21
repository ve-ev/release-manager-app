import {HostAPI} from "../../../@types/globals";
import {ReleaseVersion} from "./interfaces";
import {AppSettings, Permissions} from "./interfaces";
/* eslint-disable complexity */

let cachedSettings: unknown | undefined;
let cachedSettingsPromise: Promise<unknown> | null = null;

export class API {
  constructor(private host: HostAPI) {}

  // ----- Issue field getters -----
  /**
   * Check whether a field (or one of the candidate names) exists on the given issue.
   * If multiple names are provided (comma-separated), backend returns the first resolved name.
   */
  async issueFieldExists(issueId: string, fieldNames: string[]): Promise<{ exists: boolean; resolvedName: string | null }> {
    const list = (fieldNames || []).filter(Boolean).join(',');
    return this.fetchJson<{ exists: boolean; resolvedName: string | null }>(
      `backend-global/issue-field-exists?issueId=${encodeURIComponent(issueId)}&fieldName=${encodeURIComponent(list)}`
    );
  }

  /**
   * Fetch bulk field values for parent issue and its subtasks for a specific field name.
   */
  async getIssueFieldBulk(issueId: string, fieldName: string): Promise<{ issueId: string; fieldName: string; items: Array<{ id: string; value: string | null }> }> {
    return this.fetchJson<{ issueId: string; fieldName: string; items: Array<{ id: string; value: string | null }> }>(
      `backend-global/issue-field-bulk?issueId=${encodeURIComponent(issueId)}&fieldName=${encodeURIComponent(fieldName)}`
    );
  }

  /**
   * Try fetching bulk field values for the first available field among the provided candidates.
   * Returns items array and the actual resolved field name if found.
   */
  async getIssueFieldBulkForFirstAvailable(issueId: string, fieldNames: string[]): Promise<{ items: Array<{ id: string; value: string | null }>; usedField?: string }> {
    try {
      const exists = await this.issueFieldExists(issueId, fieldNames);
      if (exists && exists.exists && exists.resolvedName) {
        const bulk = await this.getIssueFieldBulk(issueId, exists.resolvedName);
        const items = Array.isArray(bulk?.items) ? bulk.items : [];
        return { items, usedField: exists.resolvedName || undefined };
      }
    } catch {
      // ignore and fall through to empty
    }
    return { items: [] };
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
  async updateReleaseVersion(releaseVersion: ReleaseVersion): Promise<void> {
    if (!releaseVersion.id) {
      throw new Error('Release version ID is required for update');
    }
    
    return this.host.fetchApp(`backend/release?id=${releaseVersion.id}`, {
      method: 'PUT',
      body: releaseVersion,
      scope: true,
    });
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
}