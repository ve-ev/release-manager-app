import React from 'react';
import { renderOverdueWarning, renderFreezeNotice, renderVersionInfo, renderPlannedIssues } from '../../helper/release-version-section-helpers.tsx'
import { isExpired } from '../../utils/date-utils.tsx'


/**
 * Props for the ExpandableContent component
 */
interface ExpandableContentProps {
  /** Whether any content section is showing */
  isAnyContentSectionShowing: boolean;
  /** Whether to show overdue status */
  showOverdueStatus: boolean;
  /** Whether to show freeze notice */
  showFreezeNotice: boolean;
  /** Whether there is info to show */
  hasInfoToShow: boolean;
  /** Whether there are planned issues */
  hasPlannedIssues: boolean;
  /** Version data */
  item: {
    id: string | number;
    version: string;
    releaseDate: string;
    featureFreezeDate?: string;
    description?: string;
    additionalInfo?: string;
    plannedIssues?: Array<{
      id: string;
      idReadable?: string;
      summary: string;
    }>;
  };
  /** Whether release date is expired */
  isReleaseDateExpired: boolean;
  /** Base URL for issue links */
  baseUrl: string;
}


/**
 * Component for the expandable content section
 */
export const ExpandableContent: React.FC<ExpandableContentProps & { manualIssueManagement?: boolean; canManage?: boolean }> = ({
  isAnyContentSectionShowing,
  showOverdueStatus,
  showFreezeNotice,
  hasInfoToShow,
  hasPlannedIssues,
  item,
  isReleaseDateExpired,
  baseUrl,
  manualIssueManagement,
  canManage
}) => {
  if (!isAnyContentSectionShowing) {
    return null;
  }

  const hasAnyContent = showOverdueStatus || showFreezeNotice || hasInfoToShow || hasPlannedIssues;

  const isFreezeExpired = isExpired(item.featureFreezeDate);

  return (
    <div className="expandable-content-section">
      {renderOverdueWarning(showOverdueStatus, item.version, item.releaseDate, isReleaseDateExpired)}
      {renderFreezeNotice(showFreezeNotice, item.version, isFreezeExpired, item.featureFreezeDate)}
      {renderVersionInfo(hasInfoToShow, item.description, item.additionalInfo)}
      {renderPlannedIssues(hasPlannedIssues, item.plannedIssues, baseUrl, manualIssueManagement, canManage)}

      {/* Empty placeholder when no content */}
      {!hasAnyContent && <div style={{ minHeight: 'var(--ring-unit)' }}/>}    
    </div>
  );
};

ExpandableContent.displayName = 'ExpandableContent';