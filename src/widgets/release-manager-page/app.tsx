import React, {memo, useCallback, useState, useMemo} from 'react';
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
import AddIssueDialog from './components/add-issue-dialog.tsx';
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
  const { releaseVersions, loading, error, refetch: fetchReleaseVersions } = useReleaseVersions(api);
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
  const [currentReleaseVersion, setCurrentReleaseVersion] = useState<ReleaseVersion | undefined>(undefined);
  const [initialShowMetaIssueForm, setInitialShowMetaIssueForm] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Release notes dialog state
  const [showReleaseNotesDialog, setShowReleaseNotesDialog] = useState<boolean>(false);
  const [releaseNotesText, setReleaseNotesText] = useState<string>('');
  const [showAddIssueDialog, setShowAddIssueDialog] = useState<boolean>(false);
  const [activeItemForAddIssue, setActiveItemForAddIssue] = useState<ReleaseVersion | null>(null);

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
    // eslint-disable-next-line no-catch-shadow,no-shadow
    } catch (error) {
      logger.error('Failed to save release version:', error);
      setAlertMessage('Failed to save release version. Please try again.');
      // Don't rethrow - handle gracefully with user feedback
    }
  }, [fetchReleaseVersions]);

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

      // After adding issues, optionally set a custom field on those newly added issues
      const plannedReleaseField = settings.customFieldMapping?.plannedReleaseField;
      if (plannedReleaseField) {
        const prevIds = new Set((activeItemForAddIssue?.plannedIssues || []).map(it => it.id));
        const newlyAdded = (updated.plannedIssues || []).filter(it => !it.isMeta && !prevIds.has(it.id));

        if (newlyAdded.length > 0) {
          const valueTemplate = settings.customFieldMapping?.valueTemplate || '${version}';
          const fieldValue = valueTemplate.replace('${version}', updated.version || '');
          // Fire and forget; errors are logged but do not interrupt UX
          await Promise.all(newlyAdded.map(it => api.setIssueCustomField(it.id, plannedReleaseField, fieldValue).catch(err => logger.error('Failed to set custom field for issue', it.id, err))));
        }
      }
    } catch (e) {
      logger.error('Failed to update release version while adding/removing issue', e);
      setAlertMessage('Failed to update planned issues');
    }
  }, [fetchReleaseVersions, settings.customFieldMapping?.plannedReleaseField, settings.customFieldMapping?.valueTemplate, activeItemForAddIssue]);

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
          {!showForm && !showSettings && (
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
      <div style={{ display: (showForm || showSettings) ? 'none' : 'block' }}>
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
        <div className="form-container">
          <SettingsForm
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}

      <ReleaseNotesDialog
        open={showReleaseNotesDialog}
        notes={releaseNotesText}
        onClose={() => setShowReleaseNotesDialog(false)}
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
