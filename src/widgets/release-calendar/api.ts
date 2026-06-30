import type { EmbeddableWidgetAPI } from '../../../@types/globals';
import type { CalendarConfig, CalendarReleaseItem, ProjectReleases, YouTrackProject } from './interfaces';

const STORAGE_KEY_CACHE = 'rm-calendar-cache';
const STORAGE_KEY_CONFIG = 'rm-calendar-config';
const STORAGE_KEY_PROJECTS = 'rm-calendar-projects';

export class CalendarAPI {
  constructor(private host: EmbeddableWidgetAPI) {}

  // ---- Config storage (widget's own config) ----

  async readWidgetConfig(): Promise<CalendarConfig | null> {
    try {
      const raw = await this.host.storage.getItem(STORAGE_KEY_CONFIG);
      return raw ? (JSON.parse(raw) as CalendarConfig) : null;
    } catch {
      return null;
    }
  }

  async storeWidgetConfig(config: CalendarConfig): Promise<void> {
    await this.host.storage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }

  async storeProjectsCache(projects: YouTrackProject[]): Promise<void> {
    try {
      await this.host.storage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
    } catch { /* ignore */ }
  }

  async readProjectsCache(): Promise<YouTrackProject[]> {
    try {
      const raw = await this.host.storage.getItem(STORAGE_KEY_PROJECTS);
      return raw ? (JSON.parse(raw) as YouTrackProject[]) : [];
    } catch { return []; }
  }

  // ---- Releases cache ----

  async getCachedReleases(): Promise<ProjectReleases[] | null> {
    try {
      const raw = await this.host.storage.getItem(STORAGE_KEY_CACHE);
      return raw ? (JSON.parse(raw) as ProjectReleases[]) : null;
    } catch {
      return null;
    }
  }

  async cacheReleases(data: ProjectReleases[]): Promise<void> {
    try {
      await this.host.storage.setItem(STORAGE_KEY_CACHE, JSON.stringify(data));
    } catch {
      // QuotaExceededError or other — skip cache write
    }
  }

  // ---- Cross-widget data written by PROJECT_TAB widget ----

  /** Returns projects where the current user is a Release Manager (server-side, any browser). */
  async fetchMyRmProjects(): Promise<Array<{ id: string; shortName: string; name: string }>> {
    try {
      const result = await this.host.fetchApp('backend-global/my-rm-projects', { scope: false });
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  // ---- Backend-based fetching ----

  async fetchCalendarReleases(projects: YouTrackProject[]): Promise<ProjectReleases[]> {
    return this.host.fetchApp('backend-global/calendar-releases', {
      method: 'POST',
      body: { projects: projects.map(p => ({ id: p.id, shortName: p.shortName })) },
      scope: false
    }) as Promise<ProjectReleases[]>;
  }
}
