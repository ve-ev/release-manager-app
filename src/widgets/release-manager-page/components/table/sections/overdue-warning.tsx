import React from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import warningIcon from '@jetbrains/icons/warning';
import {formatDate} from '../../../utils/date-utils';

/**
 * Props for the OverdueWarning component
 */
export interface OverdueWarningProps {
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

