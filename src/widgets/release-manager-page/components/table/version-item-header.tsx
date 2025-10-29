import React, {useMemo, useCallback} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import DropdownMenu from '@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu';
import {Directions} from "@jetbrains/ring-ui-built/components/popup/popup.consts";
import {Expander} from './expander';
import {formatDate, isExpired, isToday} from '../../utils/date-utils';
import {ProductTag} from '../common/product-tag';
import {StatusTag, ReleaseStatus} from '../common/status-tag';
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
  metaIssuesEnabled,
  handleAddMetaIssue,
  handleGenerateReleaseNotes,
  progressSettings,
  issueStatusMap,
  statusesLoaded = true
}) => {
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

    api.updateReleaseVersion({ ...item, status: newStatus })
      .then(() => {
        // Dispatch targeted update to avoid full table refresh
        window.dispatchEvent(new CustomEvent('release-version-status-updated', {
          detail: { id: item.id, status: newStatus }
        }));
        // Keep legacy event for backward compatibility
        window.dispatchEvent(new Event('release-versions-updated'));
      })
      .catch((error: unknown) => {
        console.error('Failed to update status', error);
      });
  }, [item]);

  // Handler to confirm feature freeze
  const handleConfirmFreeze = useCallback(() => {
    api.updateReleaseVersion({ ...item, freezeConfirmed: true })
      .then(() => {
        window.dispatchEvent(new Event('release-versions-updated'));
      })
      .catch((error: unknown) => {
        console.error('Failed to confirm freeze', error);
      });
  }, [item]);

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
      !item.freezeConfirmed;
  }, [item.featureFreezeDate, item.freezeConfirmed]);

  // Memoize status dropdown menu items
  const statusMenuItems = useMemo(() => {
    return STATUS_DROPDOWN_OPTIONS.map(st => ({
      label: st,
      onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
        event.stopPropagation?.();
        handleStatusUpdate(st);
      }
    })) as readonly ListDataItem<unknown>[];
  }, [handleStatusUpdate]);

  // Memoize actions dropdown menu items
  const actionsMenuItems = useMemo(() => {
    const items: Array<ListDataItem<unknown>> = [];

    if (canEdit) {
      items.push(createMenuItem('Edit', handleEditClick, 'edit-action'));

      if (metaIssuesEnabled) {
        items.push(createMenuItem('Add Meta Issue', handleAddMetaIssueClick, 'add-meta-issue-action'));
      }

      if (showConfirmFreeze) {
        items.push(createMenuItem('Confirm Freeze', handleConfirmFreeze, 'confirm-freeze-action'));
      }
    }

    // Always available: Generate Release Notes action
    items.push(createMenuItem('Generate Release Notes', handleGenerateNotesClick, 'generate-release-notes-action'));

    if (canDelete) {
      items.push(createMenuItem('Delete', handleDeleteClick, 'delete-action'));
    }

    return items;
  }, [
    canEdit,
    canDelete,
    metaIssuesEnabled,
    showConfirmFreeze,
    createMenuItem,
    handleEditClick,
    handleAddMetaIssueClick,
    handleConfirmFreeze,
    handleGenerateNotesClick,
    handleDeleteClick
  ]);

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

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {mainAvailable && progressSettings && (
          <ProgressBar
            total={mainProgress.total}
            green={mainProgress.green}
            yellow={mainProgress.yellow}
            red={mainProgress.red}
            grey={mainProgress.grey}
            greenColor={progressSettings.greenColor}
            yellowColor={progressSettings.yellowColor}
            redColor={progressSettings.redColor}
            greyColor={progressSettings.greyColor}
            className="no-counters"
          />
        )}
      </div>
    );
  }, [item.plannedIssues, mainAvailable, mainProgress, progressSettings]);

  return (
    <div className="version-list-row">
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
          <ProductTag product={item.product || ''} settings={progressSettings}/>
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
          canEdit ? (
            <DropdownMenu<unknown>
              menuProps={menuProps}
              anchor={statusTagElement}
              data={statusMenuItems}
              onSelect={handleMenuSelect}
            />
          ) : statusTagElement
        )}
      </div>
      <div className="version-list-cell date-cell">
        <span className={releaseDateClassName}>
          {formatDate(item.releaseDate)}
        </span>
      </div>
      <div className="version-list-cell date-cell">
        <span className={featureFreezeDateClassName}>
          {formatDate(item.featureFreezeDate)}
        </span>
      </div>
      <div className="version-list-cell actions-cell">
        <div className="actions">
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
        </div>
      </div>
    </div>
  );
};

VersionItemHeader.displayName = 'VersionItemHeader';
