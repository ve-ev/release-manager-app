import React, {useMemo, useCallback} from 'react';
import {ReleaseVersion, AppSettings} from '../../interfaces';
import {HostAPI} from '../../../../../@types/globals';
import {api} from '../../app';
import {isExpired} from '../../utils/date-utils';
import '../../styles/version-table.css';
import {useIssueStatuses} from '../../hooks';
import {STATUS_POLL_INTERVAL_MS} from '../../utils/constants';
/* eslint-disable complexity */

// Import helper functions
import {
  getStatusInfo,
  getContentVisibility,
  getDateHighlighting
} from '../../utils/release-version-helpers';

// Import UI components
import {VersionItemHeader} from './version-item-header';
import {ExpandableContent} from './release-version-sections';

// Props interface for ReleaseVersionItem
export interface ReleaseVersionItemProps {
  item: ReleaseVersion;
  isExpanded: boolean;
  isInfoExpanded: boolean;
  toggleExpandReleaseVersion: (id: string | number) => void;
  toggleInfoSection: (id: string | number, forceState?: boolean) => void;
  handleEditReleaseVersion: (releaseVersion: ReleaseVersion) => void;
  handleConfirmDelete: (releaseVersion: ReleaseVersion) => void;
  showProductColumn?: boolean;
  showProgressColumn?: boolean;
  host?: HostAPI;
  canEdit?: boolean;
  canDelete?: boolean;
  manualIssueManagement?: boolean;
  metaIssuesEnabled?: boolean;
  handleAddMetaIssue?: (releaseVersion: ReleaseVersion) => void;
  handleGenerateReleaseNotes?: (releaseVersion: ReleaseVersion) => void;
  /** App settings (passed from top to avoid hook proliferation) */
  settings?: AppSettings;
  /** Progress settings (passed from top to avoid hook proliferation) */
  progressSettings?: AppSettings;
}

/**
 * Render a single release version item
 * This component has been refactored to reduce complexity by:
 * 1. Extracting helper functions for complex calculations
 * 2. Creating sub-components for UI sections
 * 3. Simplifying the main component logic
 */
const ReleaseVersionItemComponent: React.FC<ReleaseVersionItemProps> = ({
  item,
  isExpanded,
  isInfoExpanded,
  toggleExpandReleaseVersion,
  toggleInfoSection,
  handleEditReleaseVersion,
  handleConfirmDelete,
  showProductColumn = true,
  showProgressColumn = true,
  canEdit,
  canDelete,
  manualIssueManagement,
  metaIssuesEnabled,
  handleAddMetaIssue,
  handleGenerateReleaseNotes,
  settings,
  progressSettings
}) => {
  // CENTRALIZED hook instance - called ONCE per ReleaseVersionItem
  // This prevents state fragmentation between VersionItemHeader and PlannedIssuesList
  const {
    issueStatusMap,
    issueTestStatusMap,
    statusesLoaded,
    setIssueStatus,
    setTestStatus
  } = useIssueStatuses(
    api,
    item.plannedIssues || [],
    manualIssueManagement,
    STATUS_POLL_INTERVAL_MS
  );

  // Memoize expensive computations
  const normalizedBaseUrl = useMemo(() => api.getBaseUrl(), []); // Base URL doesn't change
  
  // Memoize status info calculation (involves multiple Date object creations)
  const statusInfo = useMemo(() => getStatusInfo(item), [item]);
  
  // Memoize content visibility calculation
  const contentVisibility = useMemo(() => getContentVisibility(item), [item]);
  
  // Memoize date highlighting calculation (involves Date object creations)
  const dateHighlighting = useMemo(() => getDateHighlighting(item), [item]);
  
  // Memoize expensive date check
  const isReleaseDateExpired = useMemo(() => isExpired(item.releaseDate), [item.releaseDate]);
  
  // Check if any expandable content section is showing
  const isAnyContentSectionShowing = isExpanded || isInfoExpanded;
  const isClosed = !isAnyContentSectionShowing;

  // Check if section should be collapsible
  const isCollapsible = contentVisibility.hasPlannedIssues || 
                        statusInfo.showOverdueStatus || 
                        statusInfo.showFreezeNotice || 
                        !contentVisibility.hasInfoToShow;
  
  // Memoize event handlers
  const handleExpandClick = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    // Determine if we're expanding or collapsing
    const shouldExpand = !isAnyContentSectionShowing;
    
    // Always handle the info section first
    toggleInfoSection(item.id, shouldExpand);
    
    // Handle planned issues if needed
    if (isCollapsible && (shouldExpand || isExpanded)) {
      // When expanding or collapsing, toggle the section
      toggleExpandReleaseVersion(item.id);
    }
  }, [isAnyContentSectionShowing, toggleInfoSection, item.id, isCollapsible, isExpanded, toggleExpandReleaseVersion]);
  
  // Handle double-click - same as single click for simplicity
  const handleDoubleClick = useCallback(() => {
    handleExpandClick();
  }, [handleExpandClick]);
    
  return (
    <div id={item.id} className="version-list-item">
      {/* Header row with basic information */}
      <VersionItemHeader
        item={item}
        isClosed={isClosed}
        displayStatus={statusInfo.displayStatus}
        showFreezeIndicator={statusInfo.showFreezeIndicator}
        showReleaseTodayIndicator={statusInfo.showReleaseTodayIndicator}
        releaseDateClassName={dateHighlighting.releaseDateClassName}
        featureFreezeDateClassName={dateHighlighting.featureFreezeDateClassName}
        handleExpandClick={handleExpandClick}
        handleDoubleClick={handleDoubleClick}
        handleEditReleaseVersion={handleEditReleaseVersion}
        handleConfirmDelete={handleConfirmDelete}
        showProductColumn={showProductColumn}
        showProgressColumn={showProgressColumn}
        canEdit={canEdit}
        canDelete={canDelete}
        manualIssueManagement={manualIssueManagement}
        metaIssuesEnabled={metaIssuesEnabled}
        handleAddMetaIssue={handleAddMetaIssue}
        handleGenerateReleaseNotes={handleGenerateReleaseNotes}
        progressSettings={progressSettings}
        issueStatusMap={issueStatusMap}
      />

      {/* Expandable content section */}
      <ExpandableContent
        isAnyContentSectionShowing={isAnyContentSectionShowing}
        showOverdueStatus={statusInfo.showOverdueStatus || statusInfo.showReleaseTodayIndicator}
        showFreezeNotice={statusInfo.showFreezeNotice}
        hasInfoToShow={contentVisibility.hasInfoToShow}
        hasPlannedIssues={contentVisibility.hasPlannedIssues}
        item={item}
        isReleaseDateExpired={isReleaseDateExpired}
        baseUrl={normalizedBaseUrl}
        manualIssueManagement={manualIssueManagement}
        canManage={!!canEdit}
        progressSettings={progressSettings}
        issueStatusMap={issueStatusMap}
        issueTestStatusMap={issueTestStatusMap}
        statusesLoaded={statusesLoaded}
        setIssueStatus={setIssueStatus}
        setTestStatus={setTestStatus}
      />
    </div>
  );
};

export const ReleaseVersionItem = React.memo(ReleaseVersionItemComponent, (prev, next) => (
  prev.item === next.item &&
  prev.isExpanded === next.isExpanded &&
  prev.isInfoExpanded === next.isInfoExpanded &&
  prev.showProductColumn === next.showProductColumn &&
  prev.showProgressColumn === next.showProgressColumn &&
  prev.canEdit === next.canEdit &&
  prev.canDelete === next.canDelete &&
  prev.manualIssueManagement === next.manualIssueManagement &&
  prev.metaIssuesEnabled === next.metaIssuesEnabled &&
  // Compare object references for settings (already memoized at app level)
  prev.settings === next.settings &&
  prev.progressSettings === next.progressSettings &&
  // Function props - these are stable from parent (useCallback)
  prev.toggleExpandReleaseVersion === next.toggleExpandReleaseVersion &&
  prev.toggleInfoSection === next.toggleInfoSection &&
  prev.handleEditReleaseVersion === next.handleEditReleaseVersion &&
  prev.handleConfirmDelete === next.handleConfirmDelete &&
  prev.handleAddMetaIssue === next.handleAddMetaIssue &&
  prev.handleGenerateReleaseNotes === next.handleGenerateReleaseNotes
));

ReleaseVersionItem.displayName = 'ReleaseVersionItem';