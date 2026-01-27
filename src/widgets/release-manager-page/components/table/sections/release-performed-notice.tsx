import React from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import infoIcon from '@jetbrains/icons/info-filled';
import {formatDate} from '../../../utils/date-utils';

export interface ReleasePerformedNoticeProps {
  version: string;
  freezeTimestamp?: string;
}

export const ReleasePerformedNotice: React.FC<ReleasePerformedNoticeProps> = ({version, freezeTimestamp}) => (
  <div className="freeze-info-section">
    <Icon glyph={infoIcon} className="info-icon"/>
    <div className="info-content">
      <div className="version-freeze">
        <h4>Release Performed</h4>
        <div className="version-freeze-content">
          Release {version} has been performed.
          {freezeTimestamp ? (
            <> Progress was frozen at {formatDate(freezeTimestamp)}.</>
          ) : null}
        </div>
      </div>
    </div>
  </div>
);

ReleasePerformedNotice.displayName = 'ReleasePerformedNotice';
