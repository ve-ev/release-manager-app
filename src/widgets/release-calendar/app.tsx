import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import type { EmbeddableWidgetAPI } from '../../../@types/globals';
import type { CalendarConfig, CalendarEvent, ProjectReleases, YouTrackProject } from './interfaces';
import { CalendarGrid } from './components/calendar-grid';
import { CalendarAPI } from './api';
import { buildCalendarEvents, getQuarterFromMonth, navigateMonth } from './utils/calendar-utils';
import './app.css';

// Module-level callback so YTApp.register (called before React mounts) can trigger config mode
let triggerConfigMode: (() => void) | null = null;

// eslint-disable-next-line react-refresh/only-export-components
export const host = await YTApp.register({
  onConfigure: () => {
    if (triggerConfigMode) triggerConfigMode();
  }
}) as EmbeddableWidgetAPI;
const calendarApi = new CalendarAPI(host);

type WidgetMode = 'loading' | 'config' | 'render' | 'error';

export const App: React.FunctionComponent = () => {
  const today = new Date();
  const [mode, setMode] = useState<WidgetMode>('loading');
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [availableProjects, setAvailableProjects] = useState<YouTrackProject[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');

  // Render state
  const [releases, setReleases] = useState<ProjectReleases[]>([]);
  const [configuredProjects, setConfiguredProjects] = useState<YouTrackProject[]>([]);
  const [view, setView] = useState<CalendarConfig['defaultView']>('month');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [visibleProjectIds, setVisibleProjectIds] = useState<Set<string>>(new Set());
  const [showFreezeDates, setShowFreezeDates] = useState(true);
  const [showProjectName, setShowProjectName] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Local display options for the config panel — only committed to render state on Save
  const [configShowFF, setConfigShowFF] = useState(true);
  const [configShowPN, setConfigShowPN] = useState(false);
  const [configShowProd, setConfigShowProd] = useState(false);

  // ---- Wire up onConfigure callback for native YT "Edit" action ----
  useEffect(() => {
    triggerConfigMode = () => {
      // Initialise local config state from current render state
      setConfigShowFF(showFreezeDates);
      setConfigShowPN(showProjectName);
      setConfigShowProd(showProduct);
      setSelectedProjectIds(configuredProjects.map(p => p.id));
      setProjectsLoaded(false);
      setMode('config');
    };
    return () => { triggerConfigMode = null; };
  }, [configuredProjects, showFreezeDates, showProjectName, showProduct]);

  // ---- Initial load ----
  useEffect(() => {
    (async () => {
      try {
        const rawConfig = await host.readConfig<{ projectIdsJson?: string; defaultView?: string; showFreezeDates?: string; showProjectName?: string; showProduct?: string }>();
        const config = rawConfig?.projectIdsJson
          ? { projectIds: JSON.parse(rawConfig.projectIdsJson) as string[], defaultView: (rawConfig.defaultView || 'month') as CalendarConfig['defaultView'] }
          : null;
        if (!config || !config.projectIds || config.projectIds.length === 0) {
          setProjectsLoaded(false);
          setMode('config');
          return;
        }

        const showFF = rawConfig?.showFreezeDates !== 'false'; // default true
        setShowFreezeDates(showFF);
        setConfigShowFF(showFF);
        const showPN = rawConfig?.showProjectName === 'true';
        setShowProjectName(showPN);
        setConfigShowPN(showPN);
        const showPr = rawConfig?.showProduct === 'true';
        setShowProduct(showPr);
        setConfigShowProd(showPr);

        const projectIds = config.projectIds;
        setView(config.defaultView || 'month');
        setVisibleProjectIds(new Set(projectIds));

        // Render stale cache immediately
        const cached = await calendarApi.getCachedReleases();
        if (cached) {
          setReleases(cached);
          setConfiguredProjects(projectIds.map(id => ({ id, shortName: id, name: id })));
          setMode('render');
        }

        // Resolve full project objects from cache
        const savedProjects = await calendarApi.readProjectsCache();
        // Preserve projectIds config order
        const projectRefs: YouTrackProject[] = projectIds.map(id =>
          savedProjects.find(p => p.id === id) ?? { id, shortName: id, name: id }
        );

        // Load fresh data from storage (background if stale cache exists, foreground otherwise)
        await refreshReleases(projectRefs, config.defaultView || 'month', !cached);
      } catch (e) {
        setError(String(e));
        setMode('error');
      }
    })();
  }, []);

  const loadAvailableProjects = useCallback(async () => {
    try {
      // Server-side: reads User.extensionProperties.rmProjects written by RM widget on visit
      const projects = await calendarApi.fetchMyRmProjects();
      setAvailableProjects(projects);
    } catch (e) {
      setError(`Failed to load projects: ${String(e)}`);
    } finally {
      setProjectsLoaded(true);
    }
  }, []);

  const refreshReleases = useCallback(async (
    projects: YouTrackProject[],
    currentView: CalendarConfig['defaultView'],
    showLoadingState: boolean
  ) => {
    if (showLoadingState) setMode('loading');
    try {
      const data = await calendarApi.fetchCalendarReleases(projects);
      // Preserve the user-defined order from `projects`, not the backend response order
      const orderedData = projects
        .map(proj => data.find(d => d.projectId === proj.id))
        .filter((d): d is NonNullable<typeof d> => d !== undefined);
      setReleases(orderedData);
      setConfiguredProjects(projects
        .filter(proj => data.some(d => d.projectId === proj.id))
        .map(proj => {
          const d = data.find(r => r.projectId === proj.id);
          return { id: proj.id, shortName: proj.shortName, name: d?.projectName || proj.name };
        }));
      setVisibleProjectIds(new Set(projects.map(p => p.id)));
      setView(currentView);
      await calendarApi.cacheReleases(data);
      setMode('render');
    } catch (e) {
      if (showLoadingState) {
        setError(`Failed to load releases: ${String(e)}`);
        setMode('error');
      }
    }
  }, []);

  // ---- Config mode ----
  useEffect(() => {
    if (mode === 'config' && !projectsLoaded) {
      loadAvailableProjects();
    }
  }, [mode, projectsLoaded, loadAvailableProjects]);

  const toggleProjectSelection = useCallback((id: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }, []);

  const handleCancelConfig = useCallback(async () => {
    try { await host.exitConfigMode(); } catch { /* ignore */ }
    if (releases.length > 0) {
      setMode('render');
    }
    setProjectsLoaded(false);
  }, [releases]);

  const moveProjectUp = useCallback((id: string) => {
    setSelectedProjectIds(prev => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveProjectDown = useCallback((id: string) => {
    setSelectedProjectIds(prev => {
      const idx = prev.indexOf(id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next;
    });
  }, []);

  const handleSaveConfig = useCallback(async () => {
    if (selectedProjectIds.length === 0) return;
    setIsSavingConfig(true);
    try {
      const config: CalendarConfig = { projectIds: selectedProjectIds, defaultView: view };
      // Map in selectedProjectIds order, not availableProjects order
      const selectedProjects = selectedProjectIds
        .map(id => availableProjects.find(p => p.id === id))
        .filter((p): p is YouTrackProject => p !== undefined);
      await calendarApi.storeProjectsCache(selectedProjects);
      // storeConfig also auto-exits config mode
      // Commit local config state to render state
      setShowFreezeDates(configShowFF);
      setShowProjectName(configShowPN);
      setShowProduct(configShowProd);
      await host.storeConfig({
        projectIdsJson: JSON.stringify(config.projectIds),
        defaultView: config.defaultView,
        showFreezeDates: configShowFF ? 'true' : 'false',
        showProjectName: configShowPN ? 'true' : 'false',
        showProduct: configShowProd ? 'true' : 'false'
      });
      await refreshReleases(selectedProjects, view, true);
    } catch (e) {
      setError(`Failed to save config: ${String(e)}`);
    } finally {
      setIsSavingConfig(false);
    }
  }, [selectedProjectIds, view, availableProjects, refreshReleases, configShowFF, configShowPN, configShowProd]);

  // ---- Navigation ----
  const handleNavigate = useCallback((delta: number) => {
    if (view === 'month') {
      const next = navigateMonth(year, month, delta);
      setYear(next.year);
      setMonth(next.month);
    } else if (view === 'quarter') {
      const next = navigateMonth(year, month, delta * 3);
      setYear(next.year);
      setMonth(next.month);
    } else {
      setYear(y => y + delta);
    }
  }, [view, year, month]);

  const handleToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }, []);

  const handleViewChange = useCallback((newView: CalendarConfig['defaultView']) => {
    setView(newView);
    if (newView === 'quarter') {
      setMonth(getQuarterFromMonth(month) * 3);
    }
  }, [month]);

  const handleProjectToggle = useCallback((projectId: string) => {
    setVisibleProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) { next.delete(projectId); } else { next.add(projectId); }
      return next;
    });
  }, []);

  const handleJumpToMonth = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
    setView('month');
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const savedProjects = await calendarApi.readProjectsCache();
      // Preserve configuredProjects order
      const projectRefs: YouTrackProject[] = configuredProjects.map(p =>
        savedProjects.find(s => s.id === p.id) ?? p
      );
      await refreshReleases(projectRefs, view, false);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, configuredProjects, view, refreshReleases]);

  const events: CalendarEvent[] = useMemo(() => buildCalendarEvents(releases), [releases]);

  // ---- Render ----
  if (mode === 'loading') {
    return (
      <div className="rc-widget rc-empty-state">
        <LoaderInline />
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="rc-widget rc-empty-state">
        <div className="rc-error">{error}</div>
        <Button onClick={() => { setProjectsLoaded(false); setMode('config'); }}>
          Configure
        </Button>
      </div>
    );
  }

  if (mode === 'config') {
    return (
      <div className="rc-widget">
        <div className="rc-config-panel">
          <h2 className="rc-config-title">Configure Calendar</h2>

          {/* Selected projects with reorder */}
          {selectedProjectIds.length > 0 && (
            <div className="rc-config-section">
              <div className="rc-config-section-label">Selected projects</div>
              <div className="rc-selected-list">
                {selectedProjectIds.map((id, idx) => {
                  const project = availableProjects.find(p => p.id === id);
                  const name = project?.name || id;
                  return (
                    <div key={id} className="rc-project-item">
                      <div className="rc-project-item-reorder">
                        <button
                          className="rc-reorder-btn"
                          onClick={() => moveProjectUp(id)}
                          disabled={idx === 0}
                          title="Move up"
                          aria-label="Move up"
                        >↑</button>
                        <button
                          className="rc-reorder-btn"
                          onClick={() => moveProjectDown(id)}
                          disabled={idx === selectedProjectIds.length - 1}
                          title="Move down"
                          aria-label="Move down"
                        >↓</button>
                      </div>
                      <span className="rc-project-item-name">{name}</span>
                      <button
                        className="rc-remove-btn"
                        onClick={() => setSelectedProjectIds(prev => prev.filter(pid => pid !== id))}
                        title="Remove"
                        aria-label="Remove project"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available projects with filter */}
          <div className="rc-config-section">
            <div className="rc-config-section-label">
              {selectedProjectIds.length > 0 ? 'Add more projects' : 'Select projects to display'}
            </div>
            {!projectsLoaded ? (
              <div className="rc-empty-state"><LoaderInline /></div>
            ) : (
              <>
                {availableProjects.length > 3 && (
                  <input
                    className="rc-project-filter"
                    type="text"
                    placeholder="Filter projects…"
                    value={projectFilter}
                    onChange={e => setProjectFilter(e.target.value)}
                    autoFocus
                  />
                )}
                <div className="rc-available-list">
                  {availableProjects
                    .filter(p =>
                      !selectedProjectIds.includes(p.id) &&
                      p.name.toLowerCase().includes(projectFilter.toLowerCase())
                    )
                    .map(p => (
                      <button
                        key={p.id}
                        className="rc-available-item"
                        onClick={() => setSelectedProjectIds(prev => [...prev, p.id])}
                      >
                        <span className="rc-available-item-icon">+</span>
                        <span className="rc-available-item-name">{p.name}</span>
                      </button>
                    ))
                  }
                  {availableProjects.filter(p =>
                    !selectedProjectIds.includes(p.id) &&
                    p.name.toLowerCase().includes(projectFilter.toLowerCase())
                  ).length === 0 && availableProjects.length > 0 && (
                    <div className="rc-empty-available">
                      {projectFilter ? 'No projects match the filter' : 'All projects selected'}
                    </div>
                  )}
                  {availableProjects.length === 0 && (
                    <div className="rc-empty-available">
                      Open the Release Manager tab in a project where you are a Release Manager, then return here.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Display options */}
          <div className="rc-config-section">
            <div className="rc-config-section-label">Display options</div>
            <div className="rc-options-list">
              <Checkbox label="Show Feature Freeze dates" checked={configShowFF} onChange={() => setConfigShowFF(v => !v)} />
              <Checkbox label="Show project name in tags" checked={configShowPN} onChange={() => setConfigShowPN(v => !v)} />
              <Checkbox label="Show product tag" checked={configShowProd} onChange={() => setConfigShowProd(v => !v)} />
            </div>
          </div>

          {/* Actions */}
          <div className="rc-config-actions">
            <Button onClick={handleCancelConfig}>Cancel</Button>
            <Button
              primary
              disabled={selectedProjectIds.length === 0 || isSavingConfig}
              onClick={handleSaveConfig}
            >
              {isSavingConfig ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // render mode
  return (
    <div className="rc-widget">
      <CalendarGrid
        events={events}
        view={view}
        year={year}
        month={month}
        visibleProjectIds={visibleProjectIds}
        allProjects={configuredProjects}
        showFreezeDates={showFreezeDates}
        showProjectName={showProjectName}
        showProduct={showProduct}
        onNavigate={handleNavigate}
        onViewChange={handleViewChange}
        onToday={handleToday}
        onProjectToggle={handleProjectToggle}
        onConfigure={() => {
          // Reset local config state from current render state before showing panel
          setConfigShowFF(showFreezeDates);
          setConfigShowPN(showProjectName);
          setConfigShowProd(showProduct);
          setSelectedProjectIds(configuredProjects.map(p => p.id));
          setProjectsLoaded(false);
          setMode('config');
          host.enterConfigMode().catch(() => {});
        }}
        onJumpToMonth={handleJumpToMonth}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    </div>
  );
};
