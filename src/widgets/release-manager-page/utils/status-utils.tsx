import React from 'react';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import '../styles/version-table.css';

// Status type definition
export type ReleaseStatus = 'Planning' | 'In progress' | 'Released' | 'Overdue' | 'Canceled';

// Component to render status as a tag
export interface StatusTagProps {
  status: ReleaseStatus;
  showFreezeIndicator?: boolean;
  showTodayIndicator?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export const StatusTag: React.FC<StatusTagProps> = ({ status, showFreezeIndicator = false, showTodayIndicator = false, onClick }) => {
  if (!status) {
    return null;
  }
  
  // Define colors for each status
  const getStatusColor = (statusValue: ReleaseStatus): { bg: string; text: string } => {
    switch (statusValue) {
      case 'Planning':
        return { bg: '#e0e0ff', text: '#4040a0' }; // Light blue
      case 'Released':
        return { bg: '#e0ffe0', text: '#206020' }; // Light green
      case 'In progress':
        return { bg: '#d0f0ff', text: '#0060a0' }; // Blue
      case 'Overdue':
        return { bg: '#ffe0e0', text: '#a02020' }; // Light red
      case 'Canceled':
        return { bg: '#f0f0f0', text: '#606060' }; // Gray
      default:
        return { bg: '#e0e0e0', text: '#404040' }; // Default gray
    }
  };
  
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