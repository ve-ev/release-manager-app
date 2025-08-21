import React from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import infoIcon from '@jetbrains/icons/info-filled';
import warningIcon from '@jetbrains/icons/warning';
import {formatDate} from '../utils/date-utils.tsx';
import {renderMarkdownToSafeHtml} from '../utils/markdown-utils.tsx';
import {PlannedIssuesList} from '../components/table/linked-issues/linked-issues-list.tsx';

/**
 * Props for the OverdueWarning component
 */
interface OverdueWarningProps {
  version: string;
  releaseDate: string;
  isReleaseDateExpired: boolean;
}

/**
 * Component for displaying overdue warning
 */
export const OverdueWarning: React.FC<OverdueWarningProps> = ({
  version,
  releaseDate,
  isReleaseDateExpired
}) => (
  <div className="warning-info-section">
    <Icon glyph={warningIcon} className="info-icon"/>
    <div className="info-content">
      <div className="version-warning">
        <h4>Release Date Overdue</h4>
        <div className="version-warning-content">
          {isReleaseDateExpired
            ? `The release date for version ${version} has expired (${formatDate(releaseDate)}). The status has been changed to Overdue. Please update the release date or mark the release as completed.`
            : `The release date for version ${version} is today. Please update the status when the release is completed.`
          }
        </div>
      </div>
    </div>
  </div>
);

OverdueWarning.displayName = 'OverdueWarning';

/**
 * Props for the FreezeNotice component
 */
interface FreezeNoticeProps {
  version: string;
  isExpired: boolean;
  freezeDate?: string;
}

/**
 * Component for displaying feature freeze notice
 */
export const FreezeNotice: React.FC<FreezeNoticeProps> = ({version, isExpired, freezeDate}) => (
  <div className="freeze-info-section">
    <Icon glyph={infoIcon} className="info-icon"/>
    <div className="info-content">
      <div className="version-freeze">
        <h4>Feature Freeze Notice</h4>
        <div className="version-freeze-content">
          {isExpired
            ? (
              <>The feature freeze date has passed{freezeDate ? ` (${formatDate(freezeDate)})` : ''}. Please confirm the freeze or update the feature freeze date. The feature branch should be allocated with the name {version}.</>
            ) : (
              <>The feature freeze is today. The feature branch should be allocated with the name {version}.</>
            )}
        </div>
      </div>
    </div>
  </div>
);

FreezeNotice.displayName = 'FreezeNotice';

/**
 * Props for the VersionInfo component
 */
interface VersionInfoProps {
  description?: string;
  additionalInfo?: string;
}

/**
 * Component for displaying version description and additional info
 */
export const VersionInfo: React.FC<VersionInfoProps> = ({
  description,
  additionalInfo
}) => {
  const hasDescription = description && description.trim() !== '';
  const hasAdditionalInfo = additionalInfo && additionalInfo.trim() !== '';

  if (!hasDescription && !hasAdditionalInfo) {
    return null;
  }

  return (
    <div className="version-info-section">
      <Icon glyph={infoIcon} className="info-icon"/>
      <div className="info-content">
        {hasDescription && (
          <div className="version-description">
            <h4>Description</h4>
            <div
              className="version-description-content"
              dangerouslySetInnerHTML={{__html: renderMarkdownToSafeHtml(description)}}
            />
          </div>
        )}
        {hasAdditionalInfo && (
          <div className="version-additional-info">
            <h4>Additional Info</h4>
            <div className="version-additional-info-content">
              {additionalInfo}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

VersionInfo.displayName = 'VersionInfo';


/**
 * Helper render functions
 */
// eslint-disable-next-line react-refresh/only-export-components
export const renderOverdueWarning = (
  showOverdueStatus: boolean,
  version: string,
  releaseDate: string,
  isReleaseDateExpired: boolean
) => {
  if (!showOverdueStatus) {
    return null;
  }

  return (
    <OverdueWarning
      version={version}
      releaseDate={releaseDate}
      isReleaseDateExpired={isReleaseDateExpired}
    />
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const renderFreezeNotice = (
  showFreezeNotice: boolean,
  version: string,
  isExpiredFreezeDate: boolean,
  freezeDate?: string
) => {
  if (!showFreezeNotice) {
    return null;
  }

  return <FreezeNotice version={version} isExpired={isExpiredFreezeDate} freezeDate={freezeDate}/>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const renderVersionInfo = (
  hasInfoToShow: boolean,
  description?: string,
  additionalInfo?: string
) => {
  if (!hasInfoToShow) {
    return null;
  }

  return (
    <VersionInfo
      description={description}
      additionalInfo={additionalInfo}
    />
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const renderPlannedIssues = (
  hasPlannedIssues: boolean,
  issues?: Array<{id: string; idReadable?: string; summary: string}>,
  baseUrl?: string,
  manualIssueManagement?: boolean,
  canManage?: boolean
) => {
  if (!hasPlannedIssues || !issues || !baseUrl) {
    return null;
  }

  return (
    <PlannedIssuesList
      issues={issues}
      baseUrl={baseUrl}
      manualIssueManagement={!!manualIssueManagement}
      canManage={!!canManage}
    />
  );
};
