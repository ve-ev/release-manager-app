import React, {memo, useCallback, useState, useEffect} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {H1} from '@jetbrains/ring-ui-built/components/heading/heading';
import Alert from '@jetbrains/ring-ui-built/components/alert/alert';
import Confirm from '@jetbrains/ring-ui-built/components/confirm/confirm';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import settingsIcon from '@jetbrains/icons/settings';
import ReleaseVersionForm from './components/form/release-version-form.tsx';
import {ReleaseVersion} from './interfaces';
import SettingsForm from './components/settings/settings-form.tsx';
import {VersionTable} from './components/table/version-table.tsx';
import ReleaseNotesDialog from './components/release-notes-dialog.tsx';
import {generateReleaseNotesMarkdown} from './utils/release-notes-utils.ts';
import {EmptyState} from './components/empty-state.tsx';
import {API} from './api';
import './app.css';
import {ReleaseStatus} from './utils/status-utils.tsx';
/* eslint-disable complexity, no-console */

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
// eslint-disable-next-line react-refresh/only-export-components
export const host = await YTApp.register();
// eslint-disable-next-line react-refresh/only-export-components
export const api = new API(host);


const AppComponent: React.FunctionComponent = () => {
  const [releaseVersions, setReleaseVersions] = useState<ReleaseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentReleaseVersion, setCurrentReleaseVersion] = useState<ReleaseVersion | undefined>(undefined);
  const [initialShowMetaIssueForm, setInitialShowMetaIssueForm] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedReleaseVersions, setExpandedReleaseVersions] = useState<Set<string | number>>(new Set());
  const [hasProducts, setHasProducts] = useState<boolean>(false);
  const [hasProgress, setHasProgress] = useState<boolean>(true);
  const [config, setConfig] = useState({
    manualIssueManagement: false,
    metaIssuesEnabled: false
  });
  const [permissions, setPermissions] = useState({
    canAccessSettings: false,
    canCreate: false,
    canEdit: false,
    canDelete: false
  });
  // Release notes dialog state
  const [showReleaseNotesDialog, setShowReleaseNotesDialog] = useState<boolean>(false);
  const [releaseNotesText, setReleaseNotesText] = useState<string>('');

  // Fetch release versions from backend
  const fetchReleaseVersions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getReleaseVersions();
      setReleaseVersions(result);
      setError(null);
    } catch (err) {
      setError('Failed to load release versions');
      // Log error but avoid console statements for production
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load release versions on component mount
  useEffect(() => {
    fetchReleaseVersions();
  }, [fetchReleaseVersions]);

  // Load previously expanded version for the current user
  useEffect(() => {
    const loadExpanded = async () => {
      try {
        const res = await api.getExpandedVersion();
        const v = res && res.expandedVersion;
        if (v !== undefined && v !== null) {
          setExpandedReleaseVersions(new Set<string | number>([v]));
        }
      } catch (e) {
        // ignore, non-critical
        console.error(e);
      }
    };
    loadExpanded();
  }, []);

  // Refresh list when a status update is made from item header
  useEffect(() => {
    // Legacy full refresh handler (kept for compatibility)
    const legacyHandler = () => { fetchReleaseVersions(); };
    window.addEventListener('release-versions-updated', legacyHandler as EventListener);

    // Targeted status update to avoid full table re-render
    const targetedHandler = ((e: Event) => {
      const ce = e as CustomEvent<{ id: string | number; status: ReleaseStatus }>;
      const detail = ce?.detail;
      if (!detail) { return; }
      setReleaseVersions(prev => prev.map(rv => (rv.id === detail.id ? { ...rv, status: detail.status } : rv)));
    }) as EventListener;
    window.addEventListener('release-version-status-updated', targetedHandler);

    return () => {
      window.removeEventListener('release-versions-updated', legacyHandler as EventListener);
      window.removeEventListener('release-version-status-updated', targetedHandler);
    };
  }, [fetchReleaseVersions]);

  // Also poll periodically to synchronize updates across different users (similar to issue-controls)
  const POLL_INTERVAL_MS = 5000;

  // Reconcile arrays to preserve object identity for unchanged items
  const reconcileReleaseVersions = (prev: ReleaseVersion[], next: ReleaseVersion[]): ReleaseVersion[] => {
    const prevById = new Map(prev.map(it => [it.id, it] as const));
    return next.map(n => {
      const p = prevById.get(n.id);
      if (!p) { return n; }
      // If shallow-equal for fields we render in a row, keep previous reference
      const same = (
        p.product === n.product &&
        p.version === n.version &&
        p.status === n.status &&
        p.releaseDate === n.releaseDate &&
        p.featureFreezeDate === n.featureFreezeDate &&
        (Array.isArray(p.plannedIssues) ? p.plannedIssues.length : 0) === (Array.isArray(n.plannedIssues) ? n.plannedIssues.length : 0)
      );
      return same ? p : n;
    });
  };

  const fetchReleaseVersionsSilently = useCallback(async () => {
    try {
      const result = await api.getReleaseVersions();
      setReleaseVersions(prev => reconcileReleaseVersions(prev, result));
    } catch (err) {
      // Silent failure during background polling
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchReleaseVersionsSilently();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchReleaseVersionsSilently]);

  // Fetch settings and listen for updates to determine product presence and progress settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await api.getAppSettings();
        const list = settings.products || [];
        setHasProducts(Array.isArray(list) && list.length > 0);
        const cfList = Array.isArray(settings.customFieldNames) ? settings.customFieldNames : [];
        setHasProgress(cfList.length > 0);
      } catch {
        setHasProducts(false);
        setHasProgress(false);
      }
    };
    loadSettings();

    const onSettingsUpdated = () => loadSettings();
    window.addEventListener('settings-updated', onSettingsUpdated as EventListener);
    return () => window.removeEventListener('settings-updated', onSettingsUpdated as EventListener);
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const appConfig = await api.getConfig();
        const manualIssueManagement = appConfig.manualIssueManagement as boolean;
        const metaIssuesEnabled = (appConfig as unknown as { metaIssuesEnabled?: boolean }).metaIssuesEnabled as boolean;
        setConfig({
          manualIssueManagement: manualIssueManagement,
          metaIssuesEnabled: metaIssuesEnabled
        });
        } catch (e) {
        console.error(e);
      }
    };
    loadConfig();
  }, []);

  // Fetch app role settings and current user groups to compute permissions
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await api.getPermissions();
        const isReleaseManager = response.isManager;
        const isLightManager = response.isLightManager;
        setPermissions({
          canAccessSettings: isReleaseManager,
          canCreate: isReleaseManager,
          canEdit: isLightManager || isReleaseManager,
          canDelete: isReleaseManager
        });
      } catch {
        setPermissions({
          canAccessSettings: false,
          canCreate: false,
          canEdit: false,
          canDelete: false
        });
      }
    };
    loadPermissions();
  }, []);

  // Handle creating or updating a release version
  const handleSaveReleaseVersion = useCallback(async (releaseVersion: ReleaseVersion) => {
    try {
      if (releaseVersion.id) {
        // Update existing release version
        await api.updateReleaseVersion(releaseVersion);
        setAlertMessage('Release version updated successfully');
      } else {
        // Create new release version
        await api.createReleaseVersion(releaseVersion);
        setAlertMessage('Release version created successfully');
      }
      
      // Refresh release versions and close form
      await fetchReleaseVersions();
      setShowForm(false);
      setCurrentReleaseVersion(undefined);
      // Important: reset meta-issue auto-open flag after save to avoid leaking into next form opening
      setInitialShowMetaIssueForm(false);
    } catch {
      throw new Error('Failed to save release version');
    }
  }, [fetchReleaseVersions]);

  // Handle confirming delete
  const handleConfirmDelete = useCallback((releaseVersion: ReleaseVersion) => {
    console.log('handleConfirmDelete called with id:', releaseVersion.id);
    setConfirmDeleteId(String(releaseVersion.id));
  }, []);

  // Handle actual deletion after confirmation
  const handleDeleteConfirmed = useCallback(async () => {
    if (!confirmDeleteId) {
      return;
    }
    
    try {
      await api.deleteReleaseVersion(confirmDeleteId);
      setAlertMessage('Release version deleted successfully');
      await fetchReleaseVersions();
    } catch (err) {
      setError('Failed to delete release version');
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, fetchReleaseVersions]);

  // Handle generating release notes
  const handleGenerateReleaseNotes = useCallback(async (releaseVersion: ReleaseVersion) => {
    try {
      if (config.manualIssueManagement) {
        const { issueStatuses } = await api.getIssueStatuses();
        const md = generateReleaseNotesMarkdown(releaseVersion, {
          manualIssueManagement: true,
          issueStatuses: issueStatuses as Record<string, string>
        });
        setReleaseNotesText(md);
      } else {
        const md = generateReleaseNotesMarkdown(releaseVersion);
        setReleaseNotesText(md);
      }
      setShowReleaseNotesDialog(true);
    } catch (e) {
      console.error(e);
    }
  }, [config.manualIssueManagement]);

  const handleEditReleaseVersion = useCallback((releaseVersion: ReleaseVersion) => {
    setCurrentReleaseVersion(releaseVersion);
    // Ensure meta-issue form is not auto-opened when editing from Actions
    setInitialShowMetaIssueForm(false);
    setShowForm(true);
  }, []);

  // Handle adding a new release version
  const handleAddReleaseVersion = useCallback(() => {
    setCurrentReleaseVersion(undefined);
    setInitialShowMetaIssueForm(false);
    setShowForm(true);
  }, []);

  // Handle open meta issue form
  const handleAddMetaIssue = useCallback((releaseVersion: ReleaseVersion) => {
    setCurrentReleaseVersion(releaseVersion);
    setInitialShowMetaIssueForm(true);
    setShowForm(true);
  }, []);
  
  // Toggle expanded state for a release version - only one item can be expanded at a time
  const toggleExpandReleaseVersion = useCallback((id: string | number) => {
    setExpandedReleaseVersions(prevExpanded => {
      const expanding = !prevExpanded.has(id);
      const newExpanded = new Set<string | number>();
      if (expanding) {
        newExpanded.add(id);
        // Persist expanded id
        api.setExpandedVersion(id).catch(() => {/* ignore */});
      } else {
        // Collapsing all
        api.setExpandedVersion(null).catch(() => {/* ignore */});
      }
      return newExpanded;
    });
  }, []);

  // Handle canceling the form
  const handleCancelForm = useCallback(() => {
    setShowForm(false);
    setCurrentReleaseVersion(undefined);
    setInitialShowMetaIssueForm(false);
  }, []);
  
  // Render content based on loading and error state
  const renderContent = () => {
    const isEmpty = !releaseVersions || releaseVersions.length === 0;
    if (!loading && !error && isEmpty) {
      return (
        <EmptyState
          canCreate={permissions.canCreate}
          canAccessSettings={permissions.canAccessSettings}
          onAddRelease={handleAddReleaseVersion}
          onOpenSettings={() => setShowSettings(true)}
        />
      );
    }

    return (
      <VersionTable
        releaseVersions={releaseVersions}
        loading={loading}
        error={error}
        expandedReleaseVersions={expandedReleaseVersions}
        toggleExpandReleaseVersion={toggleExpandReleaseVersion}
        handleEditReleaseVersion={handleEditReleaseVersion}
        handleConfirmDelete={handleConfirmDelete}
        showProductColumn={hasProducts}
        showProgressColumn={hasProgress}
        host={host}
        canEdit={permissions.canEdit}
        canDelete={permissions.canDelete}
        manualIssueManagement={config.manualIssueManagement}
        metaIssuesEnabled={config.metaIssuesEnabled}
        handleAddMetaIssue={handleAddMetaIssue}
        handleGenerateReleaseNotes={handleGenerateReleaseNotes}
      />
    );
  };

  const isEmptyHeader = !releaseVersions || releaseVersions.length === 0;
  const showEmpty = !loading && !error && isEmptyHeader;

  return (
    <div className="widget">
      <div className="header">
        {!showEmpty && <H1>Release Management</H1>}
        <div className="header-actions">
          {!showForm && (
            <>
              {permissions.canCreate && !showEmpty && (
                <Button primary onClick={handleAddReleaseVersion}>Add Release Version</Button>
              )}
              {permissions.canAccessSettings && (
                <Button 
                  className="progress-settings-button"
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >
                  <Icon glyph={settingsIcon} style={{marginRight: '1px'}}/>
                  Settings
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!showForm && renderContent()}
      
      {showForm && (
        <div className="form-container">
          <ReleaseVersionForm
            releaseVersion={currentReleaseVersion}
            onSave={handleSaveReleaseVersion}
            onCancel={handleCancelForm}
            metaIssuesEnabled={config.metaIssuesEnabled}
            initialShowMetaIssueForm={initialShowMetaIssueForm}
          />
        </div>
      )}

      {confirmDeleteId ? (
        <Confirm
          show
          onConfirm={handleDeleteConfirmed}
          onReject={() => setConfirmDeleteId(null)}
          confirmLabel="Delete"
          rejectLabel="Cancel"
          text="Are you sure you want to delete this release version?"
          data-test="confirm-delete-dialog"
        />
      ) : null}

      {alertMessage && (
        <Alert
          type={Alert.Type.SUCCESS}
          onCloseRequest={() => setAlertMessage(null)}
          timeout={3000}
        >
          {alertMessage}
        </Alert>
      )}

      {showSettings && permissions.canAccessSettings && (
        <SettingsForm
          onClose={() => setShowSettings(false)}
        />
      )}

      <ReleaseNotesDialog
        open={showReleaseNotesDialog}
        notes={releaseNotesText}
        onClose={() => setShowReleaseNotesDialog(false)}
      />

    </div>
  );
};

export const App = memo(AppComponent);
