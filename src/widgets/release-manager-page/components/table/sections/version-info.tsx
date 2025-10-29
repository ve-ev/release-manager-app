import React, {useMemo} from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import infoIcon from '@jetbrains/icons/info-filled';
import {renderMarkdownToSafeHtml} from '../../../utils/helpers';

/**
 * Props for the VersionInfo component
 */
export interface VersionInfoProps {
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

  // Memoize expensive markdown rendering
  const renderedDescription = useMemo(
    () => hasDescription ? renderMarkdownToSafeHtml(description) : '',
    [description, hasDescription]
  );

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
              dangerouslySetInnerHTML={{__html: renderedDescription}}
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

