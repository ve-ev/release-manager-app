import React, {useMemo, useCallback} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import DropdownMenu from '@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu';
import {Directions} from "@jetbrains/ring-ui-built/components/popup/popup.consts";
import {Expander} from './expander';
import {formatDate, isExpired, isToday} from '../../utils/date-utils';
import {TagBadge} from '../common';
import {StatusTag, ReleaseStatus} from '../common';
import {ReleaseVersion, AppSettings} from '../../interfaces';
import {ProgressBar} from './progress/progress-bar';
import {api} from '../../app';
import type {ListDataItem} from '@jetbrains/ring-ui-built/components/list/list';
import {useVersionProgress} from '../../hooks';
import {STATUS_DROPDOWN_OPTIONS} from '../../utils/constants';
import type {IssueStatus} from '../../hooks/useIssueStatuses';

/* eslint-disable complexity, no-console */


/**
 * Props for the VersionItemHeader component
 */
export interface VersionItemHeaderProps {
  /** Release version item data */
  item: ReleaseVersion;
  /** Whether the item is closed (not expanded) */
  isClosed: boolean;
  /** The status to display */
  displayStatus: ReleaseStatus;
  /** Whether to show the freeze indicator */
  showFreezeIndicator: boolean;
  /** Whether to show the release-today indicator */
  showReleaseTodayIndicator: boolean;
  /** Class name for release date */
  releaseDateClassName: string;
  /** Class name for feature freeze date */
  featureFreezeDateClassName: string;
  /** Handler for expand/collapse click */
  handleExpandClick: (e?: React.MouseEvent) => void;
  /** Handler for double-click */
  handleDoubleClick: () => void;
  /** Handler for edit action */
  handleEditReleaseVersion: (releaseVersion: ReleaseVersion) => void;
  /** Handler for delete action */
  handleConfirmDelete: (releaseVersion: ReleaseVersion) => void;
  /** Show product column */
  showProductColumn?: boolean;
  /** Show progress column */
  showProgressColumn?: boolean;
  /** Permissions */
  canEdit?: boolean;
  canDelete?: boolean;
  isReleaseManager?: boolean;
  /** Manual issue management flag */
  manualIssueManagement?: boolean;
  /** Feature flag for meta issues */
  metaIssuesEnabled?: boolean;
  /** Handler to open meta-issue form */
  handleAddMetaIssue?: (releaseVersion: ReleaseVersion) => void;
  /** Handler to generate release notes */
  handleGenerateReleaseNotes?: (releaseVersion: ReleaseVersion) => void;
  /** Progress settings (passed from top to avoid hook proliferation) */
  progressSettings?: AppSettings;
  /** Issue status map (passed from parent to avoid duplicate hook instances) */
  issueStatusMap: Record<string, IssueStatus>;
  /** Whether issue statuses are loaded */
  statusesLoaded?: boolean;
}

/**
 * Component for the header row of a release version item
 */
export const VersionItemHeader: React.FC<VersionItemHeaderProps> = ({
  item,
  isClosed,
  displayStatus,
  showFreezeIndicator,
  showReleaseTodayIndicator,
  releaseDateClassName,
  featureFreezeDateClassName,
  handleExpandClick,
  handleDoubleClick,
  handleEditReleaseVersion,
  handleConfirmDelete,
  showProductColumn = true,
  showProgressColumn = true,
  canEdit,
  canDelete,
  isReleaseManager,
  handleAddMetaIssue,
  handleGenerateReleaseNotes,
  progressSettings,
  issueStatusMap,
  statusesLoaded = true
}) => {
  const isReleased = item.status === 'Released';
  const isFreezeConfirmed = !!item.freezeConfirmed;

  // Only release managers and light managers should see the Actions dropdown at all.
  // `canEdit` is granted to both full and light managers by `usePermissions`.
  const canSeeActions = !!canEdit || !!isReleaseManager;

  // Lifecycle rules:
  // - No freeze: all editable
  // - Freeze confirmed: cannot add/remove issues, but progress is live and manual mgmt is available
  // - Released: fully frozen UI until status changes away from Released
  const canEditRelease = !!canEdit && !isReleased;
  const canAddIssues = canEditRelease && !isFreezeConfirmed;
  const canChangeStatus = !!canEdit && (!isReleased || !!isReleaseManager);

  // Memoize empty progressSettings to prevent unnecessary re-renders
  const effectiveProgressSettings = useMemo(() => progressSettings || {
    customFieldNames: [],
    greenZoneValues: [],
    yellowZoneValues: [],
    redZoneValues: []
  }, [progressSettings]);

  // Use progress calculation hook (issueStatusMap passed from parent)
  const { mainProgress, mainAvailable } = useVersionProgress(item, effectiveProgressSettings, issueStatusMap, api, statusesLoaded);

  // Configure dropdown menu props (untyped to avoid generic mismatch)
  const menuProps = useMemo(() => ({
    directions: [Directions.RIGHT_BOTTOM, Directions.LEFT_BOTTOM] as const,
    ['data-test']: 'actions-menu',
    hidden: false,
    activateFirstItem: false
  }), []);

  // Handler to update release version status
  const handleStatusUpdate = useCallback((newStatus: ReleaseStatus) => {
    if (item.status === newStatus) {
      return;
    }

    // Transitions to/from Released require confirmation and are manager-only
    const toReleased = newStatus === 'Released';
    const fromReleased = item.status === 'Released' && newStatus !== 'Released';
    if (toReleased || fromReleased) {
      window.dispatchEvent(new CustomEvent('request-release-status-change', {
        detail: { item, newStatus }
      }));
      return;
    }

    api.updateReleaseVersion({ ...item, status: newStatus })
      .then((updated) => {
        // Dispatch targeted update to avoid full table refresh
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
      })
      .catch((error: unknown) => {
        console.error('Failed to update status', error);
      });
  }, [item]);

  // Handler to confirm feature freeze
  const handleConfirmFreeze = useCallback(() => {
    api.updateReleaseVersion({ ...item, freezeConfirmed: true })
      .then((updated) => {
        // Dispatch targeted update to avoid full table refresh
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
      })
      .catch((error: unknown) => {
        console.error('Failed to confirm freeze', error);
      });
  }, [item]);

  const handleUnfreeze = useCallback(() => {
    api.updateReleaseVersion({ ...item, freezeConfirmed: false })
      .then((updated) => {
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
      })
      .catch((error: unknown) => {
        console.error('Failed to unfreeze release', error);
      });
  }, [item]);

  const handleViewAuditEvents = useCallback(() => {
    if (!isReleaseManager) {
      return;
    }
    window.dispatchEvent(new CustomEvent('open-audit-events-dialog', {
      detail: {
        version: item.version,
        events: item.auditEvents || []
      }
    }));
  }, [item.version, item.auditEvents, isReleaseManager]);

  // Individual action handlers
  const handleEditClick = useCallback(() => {
    handleEditReleaseVersion(item);
  }, [handleEditReleaseVersion, item]);

  const handleAddMetaIssueClick = useCallback(() => {
    if (handleAddMetaIssue) {
      handleAddMetaIssue(item);
    } else {
      handleEditReleaseVersion(item);
    }
  }, [handleAddMetaIssue, handleEditReleaseVersion, item]);

  const handleGenerateNotesClick = useCallback(() => {
    if (handleGenerateReleaseNotes) {
      handleGenerateReleaseNotes(item);
    }
  }, [handleGenerateReleaseNotes, item]);

  const handleDeleteClick = useCallback(() => {
    handleConfirmDelete(item);
  }, [handleConfirmDelete, item]);

  // Handler to stop event propagation for dropdown menu
  const handleMenuSelect = useCallback((_item: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
    event.stopPropagation?.();
  }, []);

  // Helper to create menu item with event handling
  const createMenuItem = useCallback((
    label: string,
    onClick: () => void,
    dataTest?: string
  ): ListDataItem<unknown> => ({
    label,
    'data-test': dataTest,
    onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      onClick();
    }
  }), []);

  // Calculate if freeze confirmation should be shown
  const showConfirmFreeze = useMemo(() => {
    return (item.featureFreezeDate &&
      (isToday(item.featureFreezeDate) || isExpired(item.featureFreezeDate))) &&
      !item.freezeConfirmed &&
      !isReleased;
  }, [item.featureFreezeDate, item.freezeConfirmed, isReleased]);

  // Memoize status dropdown menu items
  const statusMenuItems = useMemo(() => {
    const allowed = STATUS_DROPDOWN_OPTIONS.filter(st => {
      if (st === 'Released' && !isReleaseManager) {
        return false;
      }
      return true;
    });
    return allowed.map(st => ({
      label: st,
      onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
        event.stopPropagation?.();
        handleStatusUpdate(st);
      }
    })) as readonly ListDataItem<unknown>[];
  }, [handleStatusUpdate, isReleaseManager]);

  // Memoize actions dropdown menu items
  const actionsMenuItems = useMemo(() => {
    if (!canSeeActions) {
      return [] as readonly ListDataItem<unknown>[];
    }

    const items: Array<ListDataItem<unknown>> = [];

    if (canEditRelease) {
      items.push(createMenuItem('Edit', handleEditClick, 'edit-action'));

      // Always allow adding issues regardless of meta-issue feature flag.
      // When metaIssuesEnabled is false, the AddIssueDialog will hide the Meta tab
      // and allow adding only existing issues.
      if (canAddIssues) {
        items.push(createMenuItem('Add Issue', handleAddMetaIssueClick, 'add-issue-action'));
      }

      if (showConfirmFreeze && isReleaseManager) {
        items.push(createMenuItem('Confirm Freeze', handleConfirmFreeze, 'confirm-freeze-action'));
      }
    }

    // Always available: Generate Release Notes action
    items.push(createMenuItem('Generate Release Notes', handleGenerateNotesClick, 'generate-release-notes-action'));

    // Audit events viewer (release managers only)
    if (isReleaseManager) {
      items.push(createMenuItem('View Audit Events', handleViewAuditEvents, 'view-audit-events-action'));
    }

    // Unfreeze (only if frozen and not released)
    if (isReleaseManager && item.freezeConfirmed && item.status !== 'Released') {
      items.push(createMenuItem('Unfreeze', handleUnfreeze, 'unfreeze-action'));
    }

    if (canDelete) {
      items.push(createMenuItem('Delete', handleDeleteClick, 'delete-action'));
    }

    return items;
  }, [canSeeActions, canEditRelease, canAddIssues, canDelete, showConfirmFreeze, createMenuItem, handleEditClick, handleAddMetaIssueClick, handleConfirmFreeze, handleGenerateNotesClick, handleDeleteClick, handleViewAuditEvents, item.freezeConfirmed, item.status, isReleaseManager, handleUnfreeze]);

  // Memoize status tag element
  const statusTagElement = useMemo(() => (
    <StatusTag
      status={displayStatus}
      showFreezeIndicator={showFreezeIndicator}
      showTodayIndicator={showReleaseTodayIndicator}
    />
  ), [displayStatus, showFreezeIndicator, showReleaseTodayIndicator]);

  // Render progress bar if we have planned issues and relevant custom fields available
  const renderProgressBar = useMemo(() => {
    if (!item.plannedIssues || item.plannedIssues.length === 0) {
      return <div className="no-progress">No linked issues</div>;
    }
    if (!mainAvailable) {
      // Reserve space to prevent layout jumping while we compute availability
      return (
        <div className="progress-placeholder">
          <div className="progress-placeholder-bar"/>
        </div>
      );
    }

    // Frozen snapshot can legitimately have total=0 (e.g. all issues Discoped at freeze).
    // Show a stable frozen-state message instead of rendering a 0-total progress bar.
    if (item.freezeTimestamp && item.snapshot && item.snapshot.progress.total === 0) {
      return <div className="no-progress">Frozen snapshot contains no counted issues</div>;
    }

    return (
      <div>
        {mainAvailable && (
          <ProgressBar
            total={mainProgress.total}
            green={mainProgress.green}
            yellow={mainProgress.yellow}
            red={mainProgress.red}
            grey={mainProgress.grey}
            greenColor={effectiveProgressSettings.greenColor}
            yellowColor={effectiveProgressSettings.yellowColor}
            redColor={effectiveProgressSettings.redColor}
            greyColor={effectiveProgressSettings.greyColor}
            className="no-counters"
          />
        )}
      </div>
    );
  }, [item.plannedIssues, item.freezeTimestamp, item.snapshot, mainAvailable, mainProgress, effectiveProgressSettings]);

  return (
    <div
      className={[
        'version-list-row',
        'version-list-grid',
        showProductColumn ? null : 'no-product',
        showProgressColumn ? null : 'no-progress',
        canSeeActions ? null : 'no-actions'
      ].filter(Boolean).join(' ')}
    >
      <div className="version-list-cell expand-cell">
        <Expander
          closed={isClosed}
          treeState="node"
          onClick={handleExpandClick}
          onDoubleClick={handleDoubleClick}
        />
      </div>
      {showProductColumn ? (
        <div className="version-list-cell product-cell">
          <TagBadge product={item.product || ''} settings={progressSettings}/>
        </div>
      ) : null}
      <div className="version-list-cell version-cell">
        <div className="version-text">{item.version}</div>
      </div>
      {showProgressColumn ? (
        <div className="version-list-cell progress-cell">
          {renderProgressBar}
        </div>
      ) : null}
      <div className="version-list-cell status-cell">
        {displayStatus && (
          canChangeStatus ? (
            <DropdownMenu<unknown>
              menuProps={menuProps}
              anchor={statusTagElement}
              data={statusMenuItems}
              onSelect={handleMenuSelect}
            />
          ) : statusTagElement
        )}
      </div>
      <div className="version-list-cell date-cell feature-freeze-cell">
        <span className={featureFreezeDateClassName}>
          {formatDate(item.featureFreezeDate)}
        </span>
      </div>
      <div className="version-list-cell date-cell release-date-cell">
        <span className={releaseDateClassName}>
          {formatDate(item.releaseDate)}
        </span>
      </div>
      {canSeeActions ? (
        <div className="version-list-cell actions-cell">
          <div className="actions">
            {actionsMenuItems.length > 0 ? (
              <DropdownMenu<unknown>
                menuProps={menuProps}
                anchor={(
                  <Button
                    title="Actions"
                    data-test="actions-button"
                  >
                    Actions
                  </Button>
                )}
                data={actionsMenuItems}
                onSelect={handleMenuSelect}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

VersionItemHeader.displayName = 'VersionItemHeader';
