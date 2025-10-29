import React from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import infoIcon from '@jetbrains/icons/info-filled';
import {formatDate} from '../../../utils/date-utils';

/**
 * Props for the FreezeNotice component
 */
export interface FreezeNoticeProps {
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

