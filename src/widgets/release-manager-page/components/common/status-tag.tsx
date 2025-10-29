import React from 'react';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import '../../styles/version-table.css';
import {getStatusColor, ReleaseStatus} from '../../utils/helpers';

// Re-export ReleaseStatus for convenience
export type {ReleaseStatus};

/**
 * Props for StatusTag component
 */
export interface StatusTagProps {
  status: ReleaseStatus;
  showFreezeIndicator?: boolean;
  showTodayIndicator?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Component to render release status as a tag with color
 */
export const StatusTag: React.FC<StatusTagProps> = ({ status, showFreezeIndicator = false, showTodayIndicator = false, onClick }) => {
  if (!status) {
    return null;
  }
  
  const { bg, text } = getStatusColor(status);
  
  // Determine if we need to add the freeze indicator class
  const className = [
    "status-tag",
    showFreezeIndicator ? "status-tag-with-indicator" : undefined,
    showTodayIndicator ? "status-tag-with-today-indicator" : undefined
  ].filter(Boolean).join(' ');
  
  return (
    <Tag 
      readOnly 
      className={className}
      backgroundColor={bg}
      textColor={text}
      onClick={onClick}
    >
      {status}
    </Tag>
  );
};

