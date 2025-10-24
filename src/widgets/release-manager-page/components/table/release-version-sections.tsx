import React from 'react';
import {OverdueWarning} from './sections/overdue-warning';
import {FreezeNotice} from './sections/freeze-notice';
import {VersionInfo} from './sections/version-info';
import {PlannedIssuesList} from './linked-issues/linked-issues-list';
import {isExpired} from '../../utils/date-utils';
import {AppSettings} from '../../interfaces';


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
export const ExpandableContent: React.FC<ExpandableContentProps & { 
  manualIssueManagement?: boolean; 
  canManage?: boolean; 
  progressSettings?: AppSettings;
  issueStatusMap: Record<string, import('../../hooks/useIssueStatuses').IssueStatus>;
  issueTestStatusMap: Record<string, import('../../hooks/useIssueStatuses').TestStatus>;
  statusesLoaded: boolean;
  setIssueStatus: (id: string, status: import('../../hooks/useIssueStatuses').IssueStatus) => void;
  setTestStatus: (id: string, status: import('../../hooks/useIssueStatuses').TestStatus) => void;
}> = ({
  isAnyContentSectionShowing,
  showOverdueStatus,
  showFreezeNotice,
  hasInfoToShow,
  hasPlannedIssues,
  item,
  isReleaseDateExpired,
  baseUrl,
  manualIssueManagement,
  canManage,
  progressSettings,
  issueStatusMap,
  issueTestStatusMap,
  statusesLoaded,
  setIssueStatus,
  setTestStatus
}) => {
  if (!isAnyContentSectionShowing) {
    return null;
  }

  const hasAnyContent = showOverdueStatus || showFreezeNotice || hasInfoToShow || hasPlannedIssues;

  const isFreezeExpired = isExpired(item.featureFreezeDate);

  return (
    <div className="expandable-content-section">
      {showOverdueStatus && (
        <OverdueWarning
          version={item.version}
          releaseDate={item.releaseDate}
          isReleaseDateExpired={isReleaseDateExpired}
        />
      )}
      {showFreezeNotice && (
        <FreezeNotice
          version={item.version}
          isExpired={isFreezeExpired}
          freezeDate={item.featureFreezeDate}
        />
      )}
      {hasInfoToShow && (
        <VersionInfo
          description={item.description}
          additionalInfo={item.additionalInfo}
        />
      )}
      {hasPlannedIssues && item.plannedIssues && (
        <PlannedIssuesList
            issues={item.plannedIssues}
            baseUrl={baseUrl}
            manualIssueManagement={!!manualIssueManagement}
            canManage={!!canManage}
            progressSettings={progressSettings}
            issueStatusMap={issueStatusMap}
            issueTestStatusMap={issueTestStatusMap}
            statusesLoaded={statusesLoaded}
            setIssueStatus={setIssueStatus}
            setTestStatus={setTestStatus}
          />
      )}

      {/* Empty placeholder when no content */}
      {!hasAnyContent && <div style={{ minHeight: 'var(--ring-unit)' }}/>}    
    </div>
  );
};

ExpandableContent.displayName = 'ExpandableContent';