import React from 'react';
import {OverdueWarning} from './sections/overdue-warning';
import {FreezeNotice} from './sections/freeze-notice';
import {ReleasePerformedNotice} from './sections/release-performed-notice';
import {VersionInfo} from './sections/version-info';
import {PlannedIssuesList} from './linked-issues/linked-issues-list';
import {isExpired} from '../../utils/date-utils';
import type {AppSettings, ReleaseVersion} from '../../interfaces';


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
  item: Pick<
    ReleaseVersion,
    | 'id'
    | 'version'
    | 'releaseDate'
    | 'featureFreezeDate'
    | 'freezeTimestamp'
    | 'status'
    | 'freezeConfirmed'
    | 'snapshot'
    | 'description'
    | 'additionalInfo'
    | 'plannedIssues'
  >;
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
  // eslint-disable-next-line complexity
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

      {item.status === 'Released' ? (
        <ReleasePerformedNotice
          version={item.version}
          freezeTimestamp={item.freezeTimestamp}
        />
      ) : null}

      {showFreezeNotice && (
        <FreezeNotice
          version={item.version}
          isExpired={isFreezeExpired}
          freezeDate={item.featureFreezeDate}
          freezeConfirmed={!!item.freezeConfirmed}
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
          freezeTimestamp={item.freezeTimestamp}
          snapshot={item.snapshot}
        />
      )}

      {/* Empty placeholder when no content */}
      {!hasAnyContent && <div style={{ minHeight: 'var(--ring-unit)' }}/>}
    </div>
  );
};

ExpandableContent.displayName = 'ExpandableContent';
