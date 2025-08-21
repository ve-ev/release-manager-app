import React from 'react';
import {ReleaseVersion} from '../../interfaces';
import {HostAPI} from '../../../../../@types/globals';
import {api} from '../../app';
import {isExpired} from '../../utils/date-utils.tsx';
import '../../styles/version-table.css';
/* eslint-disable complexity */

// Import helper functions
import {
  getStatusInfo,
  getContentVisibility,
  getDateHighlighting
} from '../../helper/release-version-helpers.tsx';

// Import UI components
import {VersionItemHeader} from './version-item-header.tsx';
import {ExpandableContent} from './release-version-sections.tsx';

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
  handleGenerateReleaseNotes
}) => {
  // Get normalized base URL from API
  const normalizedBaseUrl = api.getBaseUrl();
  
  // Check if any expandable content section is showing
  const isAnyContentSectionShowing = isExpanded || isInfoExpanded;
  const isClosed = !isAnyContentSectionShowing;

  // Get status information
  const statusInfo = getStatusInfo(item);
  
  // Get content visibility flags
  const contentVisibility = getContentVisibility(item);
  
  // Get date highlighting class names
  const dateHighlighting = getDateHighlighting(item);
  
  // Check if release date is expired (for overdue warning)
  const isReleaseDateExpired = isExpired(item.releaseDate);

  // Check if section should be collapsible
  const isCollapsible = contentVisibility.hasPlannedIssues || 
                        statusInfo.showOverdueStatus || 
                        statusInfo.showFreezeNotice || 
                        !contentVisibility.hasInfoToShow;
  
  // Handle expand/collapse click for the expandable content section
  const handleExpandClick = (e?: React.MouseEvent) => {
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
  };
  
  // Handle double-click - same as single click for simplicity
  const handleDoubleClick = () => {
    handleExpandClick();
  };
    
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
  prev.manualIssueManagement === next.manualIssueManagement
));

ReleaseVersionItem.displayName = 'ReleaseVersionItem';