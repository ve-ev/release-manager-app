import React, {memo, useCallback, useEffect, useState, useMemo, useRef} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {H1} from '@jetbrains/ring-ui-built/components/heading/heading';
import Alert from '@jetbrains/ring-ui-built/components/alert/alert';
import Confirm from '@jetbrains/ring-ui-built/components/confirm/confirm';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import settingsIcon from '@jetbrains/icons/settings';
import ReleaseVersionForm from './components/form/release-version-form.tsx';
import {ReleaseVersion} from './interfaces';
import SettingsForm from './components/settings/settings-form.tsx';
import {ImportVersions} from './components/settings/import-versions';
import {VersionTable} from './components/table/version-table.tsx';
import ReleaseNotesDialog from './components/release-notes-dialog.tsx';
import AddIssueDialog from './components/add-issue-dialog.tsx';
import AuditEventsDialog from './components/audit-events-dialog.tsx';
import {generateReleaseNotesMarkdown} from './utils/release-notes-utils.ts';
import {EmptyState} from './components/empty-state.tsx';
import {ErrorBoundary} from './components/error-boundary.tsx';
import {API} from './api';
import {logger} from './utils/logger';
import './app.css';
import {
  useReleaseVersions,
  useAppConfig,
  usePermissions,
  useExpandedState,
  useSettingsData,
  useProgressSettings,
  useIssueSearch
} from './hooks';
/* eslint-disable complexity */

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
// eslint-disable-next-line react-refresh/only-export-components
export const host = await YTApp.register();
// eslint-disable-next-line react-refresh/only-export-components
export const api = new API(host);


const AppComponent: React.FunctionComponent = () => {
  // Use custom hooks for data loading
  const config = useAppConfig(api);
  const permissions = usePermissions(api);
  const { expandedReleaseVersions, toggleExpandReleaseVersion } = useExpandedState(api);

  // OPTIMIZATION: Load settings ONCE at app level instead of in every component
  // This prevents creating 100+ hook instances when rendering 100 release versions
  const { settings } = useSettingsData(api);
  const { progressSettings } = useProgressSettings(api);
  const { isLoadingIssues: isSearchingIssues, searchError: issueSearchError, searchIssues } = useIssueSearch(host);
  const searchAndResolveCb = useCallback(
    (q: string, existing: Array<{id: string; idReadable?: string; summary: string}>) => searchIssues(q, existing),
    [searchIssues]
  );

  // Derive visibility flags directly from loaded settings (eliminates redundant API call)
  const hasProducts = useMemo(() =>
    Boolean(settings.products && settings.products.length > 0),
    [settings.products]
  );
  const hasProgress = useMemo(() =>
    Boolean(progressSettings.customFieldNames && progressSettings.customFieldNames.length > 0),
    [progressSettings.customFieldNames]
  );

  // Local UI state
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importFieldName, setImportFieldName] = useState<string | undefined>(undefined);
  const [currentReleaseVersion, setCurrentReleaseVersion] = useState<ReleaseVersion | undefined>(undefined);
  const [initialShowMetaIssueForm, setInitialShowMetaIssueForm] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const workflowUpdatedNoticeShownRef = useRef(false);

  const handleWorkflowMembershipChange = useCallback(() => {
    // Only show the notice when custom fields mapping feature is enabled
    if (!config.customFieldsMapping) {
      return;
    }

    // Avoid spamming the user if multiple polls detect changes in quick succession
    if (workflowUpdatedNoticeShownRef.current) {
      return;
    }

    workflowUpdatedNoticeShownRef.current = true;
    setAlertMessage('Release list was updated via workflow based on planned release field changes.');
  }, [config.customFieldsMapping, setAlertMessage]);

  const { releaseVersions, loading, error, refetch: fetchReleaseVersions } = useReleaseVersions(api, {
    onBackgroundMembershipChange: handleWorkflowMembershipChange
  });

  // Track in-flight custom field updates to prevent duplicates
  const pendingCustomFieldUpdates = useRef<Set<string>>(new Set());

  // Helper function to update custom field with deduplication
  const updateIssueCustomField = useCallback(async (issueId: string, fieldName: string, value: string, action?: 'set' | 'add' | 'remove') => {
    const key = `${issueId}:${fieldName}:${action || 'set'}:${value}`;

    // Skip if already in progress
    if (pendingCustomFieldUpdates.current.has(key)) {
      logger.debug('Skipping duplicate custom field update for', issueId);
      return;
    }

    // Mark as in progress
    pendingCustomFieldUpdates.current.add(key);

    try {
      await api.setIssueCustomField(issueId, fieldName, value, action);
    } catch (err) {
      logger.error('Failed to set custom field for issue', issueId, err);
    } finally {
      // Clean up after completion
      pendingCustomFieldUpdates.current.delete(key);
    }
  }, []);

  // Helper function to compute added and removed issues between two release versions
  const computeIssueChanges = useCallback((
    previousIssues: Array<{id: string; isMeta?: boolean}> | undefined,
    updatedIssues: Array<{id: string; isMeta?: boolean}> | undefined
  ) => {
    const prevIds = new Set((previousIssues || []).map(it => it.id));
    const updatedIds = new Set((updatedIssues || []).filter(it => !it.isMeta).map(it => it.id));

    const newlyAdded = (updatedIssues || []).filter(it => !it.isMeta && !prevIds.has(it.id));
    const removed = (previousIssues || []).filter(it => !it.isMeta && !updatedIds.has(it.id));

    return { newlyAdded, removed };
  }, []);

  // Helper function to handle custom field updates for added/removed issues
  // For multi-value fields: uses 'add' to append and 'remove' to remove individual values
  // For single-value fields: uses 'set' to replace and 'set' with empty to clear
  const handleCustomFieldUpdates = useCallback(async (
    newlyAdded: Array<{id: string}>,
    removed: Array<{id: string}>,
    releaseVersion: string,
    plannedReleaseField: string
  ) => {
    // Use 'add' action for newly added issues (backend handles single vs multi)
    if (newlyAdded.length > 0) {
      await Promise.all(newlyAdded.map(it => updateIssueCustomField(it.id, plannedReleaseField, releaseVersion, 'add')));
    }

    // Use 'remove' action for removed issues (backend handles single vs multi)
    if (removed.length > 0) {
      await Promise.all(removed.map(it => updateIssueCustomField(it.id, plannedReleaseField, releaseVersion, 'remove')));
    }
  }, [updateIssueCustomField]);

  // Release notes dialog state
  const [showReleaseNotesDialog, setShowReleaseNotesDialog] = useState<boolean>(false);
  const [releaseNotesText, setReleaseNotesText] = useState<string>('');
  const [showAddIssueDialog, setShowAddIssueDialog] = useState<boolean>(false);
  const [activeItemForAddIssue, setActiveItemForAddIssue] = useState<ReleaseVersion | null>(null);

  // Audit events dialog state
  const [showAuditEventsDialog, setShowAuditEventsDialog] = useState<boolean>(false);
  const [auditEventsVersion, setAuditEventsVersion] = useState<string>('');
  const [auditEventsList, setAuditEventsList] = useState<ReleaseVersion['auditEvents']>([]);

  // Release/unrelease confirmation dialog state
  const [pendingReleaseStatusChange, setPendingReleaseStatusChange] = useState<{
    item: ReleaseVersion;
    newStatus: ReleaseVersion['status'];
  } | null>(null);

  useEffect(() => {
    const handler = ((e: Event) => {
      const ce = e as CustomEvent<{ version?: string; events?: ReleaseVersion['auditEvents'] }>;
      const detail = ce?.detail || {};
      // Audit logs are available only for release managers
      if (!permissions.isReleaseManager) {
        return;
      }
      setAuditEventsVersion(detail.version || '');
      setAuditEventsList(detail.events || []);
      setShowAuditEventsDialog(true);
    }) as EventListener;
    window.addEventListener('open-audit-events-dialog', handler);
    return () => window.removeEventListener('open-audit-events-dialog', handler);
  }, [permissions.isReleaseManager]);

  useEffect(() => {
    const handler = ((e: Event) => {
      const ce = e as CustomEvent<{ item: ReleaseVersion; newStatus: ReleaseVersion['status'] }>;
      const detail = ce?.detail;
      if (!detail) { return; }
      // Only release managers can release/unrelease
      if (!permissions.isReleaseManager) {
        return;
      }
      setPendingReleaseStatusChange({ item: detail.item, newStatus: detail.newStatus });
    }) as EventListener;
    window.addEventListener('request-release-status-change', handler);
    return () => window.removeEventListener('request-release-status-change', handler);
  }, [permissions.isReleaseManager]);

  const handleConfirmedReleaseStatusChange = useCallback(async () => {
    if (!pendingReleaseStatusChange) {
      return;
    }
    const { item, newStatus } = pendingReleaseStatusChange;
    try {
      const updated = await api.updateReleaseVersion({ ...item, status: newStatus });
      window.dispatchEvent(new CustomEvent('release-version-status-updated', {
        detail: {
          id: updated.id,
          status: updated.status,
          freezeConfirmed: updated.freezeConfirmed,
          freezeTimestamp: updated.freezeTimestamp || null,
          snapshot: updated.snapshot || null,
          auditEvents: updated.auditEvents || null
        }
      }));
    } catch (e) {
      logger.error('Failed to change release status', e);
    } finally {
      setPendingReleaseStatusChange(null);
    }
  }, [pendingReleaseStatusChange]);

  // Handle creating or updating a release version
  const handleSaveReleaseVersion = useCallback(async (releaseVersion: ReleaseVersion) => {
    try {
      if (releaseVersion.id) {
        // Update existing release version
        await api.updateReleaseVersion(releaseVersion);
        setAlertMessage('Release version updated successfully');

        // After updating, handle custom field changes for added/removed issues
        const plannedReleaseField = settings.customFieldMapping?.plannedReleaseField;
        if (config.customFieldsMapping && plannedReleaseField && currentReleaseVersion) {
          const { newlyAdded, removed } = computeIssueChanges(
            currentReleaseVersion.plannedIssues,
            releaseVersion.plannedIssues
          );
          await handleCustomFieldUpdates(newlyAdded, removed, releaseVersion.version || '', plannedReleaseField);
        }
      } else {
        // Create new release version
        await api.createReleaseVersion(releaseVersion);
        setAlertMessage('Release version created successfully');

        // After creating a new release, set custom field on all added issues
        const plannedReleaseField = settings.customFieldMapping?.plannedReleaseField;
        if (config.customFieldsMapping && plannedReleaseField) {
          const issuesToUpdate = (releaseVersion.plannedIssues || []).filter(it => !it.isMeta);
          await handleCustomFieldUpdates(issuesToUpdate, [], releaseVersion.version || '', plannedReleaseField);
        }
      }

      // Refresh release versions and close form
      await fetchReleaseVersions();
      setShowForm(false);
      setCurrentReleaseVersion(undefined);
      // Important: reset meta-issue auto-open flag after save to avoid leaking into next form opening
      setInitialShowMetaIssueForm(false);
    // eslint-disable-next-line no-catch-shadow,no-shadow
    } catch (error) {
      logger.error('Failed to save release version:', error);
      setAlertMessage('Failed to save release version. Please try again.');
      // Don't rethrow - handle gracefully with user feedback
    }
  }, [fetchReleaseVersions, settings.customFieldMapping?.plannedReleaseField, config.customFieldsMapping, currentReleaseVersion, computeIssueChanges, handleCustomFieldUpdates]);

  // Handle confirming delete
  const handleConfirmDelete = useCallback((releaseVersion: ReleaseVersion) => {
    logger.debug('handleConfirmDelete called with id:', releaseVersion.id);
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
    // eslint-disable-next-line no-catch-shadow,no-shadow
    } catch (error) {
      // Show error as alert message instead of setting error state
      setAlertMessage('Failed to delete release version');
      logger.error('Failed to delete release version:', error);
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
    // eslint-disable-next-line no-catch-shadow,no-shadow
    } catch (error) {
      logger.error('Failed to generate release notes:', error);
      setAlertMessage('Failed to generate release notes');
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

  // Handle generic "Add Issue" action from Actions menu.
  // Open the Edit form with the new Add Issue selector visible (do NOT auto-open Meta form).
  const handleAddMetaIssue = useCallback((releaseVersion: ReleaseVersion) => {
    // Open dedicated Add Issue dialog instead of full edit form
    setActiveItemForAddIssue(releaseVersion);
    setShowAddIssueDialog(true);
  }, []);

  const handleAddIssueDialogClose = useCallback(() => {
    setShowAddIssueDialog(false);
    setActiveItemForAddIssue(null);
  }, []);

  const handleAddIssueDialogSave = useCallback(async (updated: ReleaseVersion) => {
    // Update the release, but keep the dialog open to allow multiple operations
    try {
      await api.updateReleaseVersion(updated);
      await fetchReleaseVersions();

      // After adding/removing issues, optionally set/reset custom field
      const plannedReleaseField = settings.customFieldMapping?.plannedReleaseField;
      // Respect feature flag: only perform when Custom Fields Mapping feature is enabled
      if (config.customFieldsMapping && plannedReleaseField) {
        const { newlyAdded, removed } = computeIssueChanges(
          activeItemForAddIssue?.plannedIssues,
          updated.plannedIssues
        );
        await handleCustomFieldUpdates(newlyAdded, removed, updated.version || '', plannedReleaseField);

        // IMPORTANT: keep the baseline ("previous") plannedIssues in sync while
        // the Add Issue dialog stays open. Otherwise, a second add/remove
        // operation in the same dialog would compare against the original
        // release state and could skip or duplicate custom field updates.
        setActiveItemForAddIssue(prev => (prev ? { ...prev, plannedIssues: updated.plannedIssues } : prev));
      }
    } catch (e) {
      logger.error('Failed to update release version while adding/removing issue', e);
      setAlertMessage('Failed to update planned issues');
    }
  }, [fetchReleaseVersions, settings.customFieldMapping?.plannedReleaseField, config.customFieldsMapping, activeItemForAddIssue?.plannedIssues, computeIssueChanges, handleCustomFieldUpdates]);

  // Handle canceling the form
  const handleCancelForm = useCallback(() => {
    setShowForm(false);
    setCurrentReleaseVersion(undefined);
    setInitialShowMetaIssueForm(false);
  }, []);

  // Memoize empty state check
  const isEmptyHeader = useMemo(
    () => !releaseVersions || releaseVersions.length === 0,
    [releaseVersions]
  );

  // Render content based on loading and error state
  const renderContent = useMemo(() => {
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
      <div>
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
          isReleaseManager={permissions.isReleaseManager}
          manualIssueManagement={config.manualIssueManagement}
          metaIssuesEnabled={config.metaIssuesEnabled}
          handleAddMetaIssue={handleAddMetaIssue}
          handleGenerateReleaseNotes={handleGenerateReleaseNotes}
          settings={settings}
          progressSettings={progressSettings}
        />
      </div>
    );
  }, [
    releaseVersions,
    loading,
    error,
    permissions.canCreate,
    permissions.canAccessSettings,
    permissions.canEdit,
    permissions.canDelete,
    permissions.isReleaseManager,
    expandedReleaseVersions,
    toggleExpandReleaseVersion,
    handleEditReleaseVersion,
    handleConfirmDelete,
    hasProducts,
    hasProgress,
    config.manualIssueManagement,
    config.metaIssuesEnabled,
    handleAddMetaIssue,
    handleGenerateReleaseNotes,
    handleAddReleaseVersion,
    settings,
    progressSettings
  ]);

  const showEmpty = !loading && !error && isEmptyHeader;

  return (
    <div className="widget">
      <div className="header">
        {!showEmpty && <H1>Release Management</H1>}
        <div className="header-actions">
          {!showForm && !showSettings && !showImportForm && (
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

      {/* Keep content mounted but hide it when form(s) are open to avoid unmount/remount cycle */}
      <div style={{ display: (showForm || showSettings || showImportForm) ? 'none' : 'block' }}>
        {renderContent}
      </div>

      {showForm && (
        <div className="form-container">
          <ReleaseVersionForm
            releaseVersion={currentReleaseVersion}
            onSave={handleSaveReleaseVersion}
            onCancel={handleCancelForm}
            metaIssuesEnabled={config.metaIssuesEnabled}
            initialShowMetaIssueForm={initialShowMetaIssueForm}
            existingReleaseVersions={releaseVersions}
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

      {pendingReleaseStatusChange ? (
        <Confirm
          show
          onConfirm={handleConfirmedReleaseStatusChange}
          onReject={() => setPendingReleaseStatusChange(null)}
          confirmLabel={pendingReleaseStatusChange.newStatus === 'Released' ? 'Release' : 'Change Status'}
          rejectLabel="Cancel"
          text={pendingReleaseStatusChange.newStatus === 'Released'
            ? 'Are you sure you want to mark this release version as Released? This will freeze progress and lock edits until status is changed.'
            : 'Are you sure you want to change status from Released? This will unlock the release version.'}
          data-test="confirm-release-status-dialog"
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
        <div className="form-container">
          <SettingsForm
            onClose={() => setShowSettings(false)}
            onOpenImport={(fieldName) => {
              setShowSettings(false);
              setImportFieldName(fieldName);
              setShowImportForm(true);
            }}
          />
        </div>
      )}

      {showImportForm && permissions.canAccessSettings && (
        <div className="form-container">
          <ImportVersions
            fieldName={importFieldName ?? settings.customFieldMapping?.plannedReleaseField}
            onClose={() => {
              setShowImportForm(false);
              fetchReleaseVersions();
            }}
            onBackToSettings={() => {
              setShowImportForm(false);
              setShowSettings(true);
            }}
          />
        </div>
      )}

      <ReleaseNotesDialog
        open={showReleaseNotesDialog}
        notes={releaseNotesText}
        onClose={() => setShowReleaseNotesDialog(false)}
      />

      <AuditEventsDialog
        open={showAuditEventsDialog}
        version={auditEventsVersion}
        events={(auditEventsList || []) as NonNullable<ReleaseVersion['auditEvents']>}
        onClose={() => setShowAuditEventsDialog(false)}
      />

      <AddIssueDialog
        open={showAddIssueDialog}
        item={activeItemForAddIssue || ({} as ReleaseVersion)}
        onClose={handleAddIssueDialogClose}
        onSave={handleAddIssueDialogSave}
        isLoadingIssues={isSearchingIssues}
        searchError={issueSearchError}
        searchAndResolve={searchAndResolveCb}
        metaIssuesEnabled={config.metaIssuesEnabled}
      />

    </div>
  );
};

// Wrap with ErrorBoundary for graceful error handling
const AppWithErrorBoundary = memo(() => (
  <ErrorBoundary>
    <AppComponent/>
  </ErrorBoundary>
));

AppWithErrorBoundary.displayName = 'App';

export const App = AppWithErrorBoundary;
