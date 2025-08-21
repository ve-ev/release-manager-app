import React from 'react';
import '../../../styles/progress-bar.css';

// Percentage constant to avoid magic number warnings
const PERCENT_100 = 100;

/**
 * Progress zone types
 */
// eslint-disable-next-line react-refresh/only-export-components
export enum ProgressZone {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
  GREY = 'grey'
}

/**
 * Props for the ProgressDot component
 */
interface ProgressDotProps {
  /** Zone color for the dot */
  zone: ProgressZone;
  /** Custom color for the zone */
  customColor?: string;
}

/**
 * Single dot indicator for issues without sub-tasks
 */
export const ProgressDot: React.FC<ProgressDotProps> = ({ zone, customColor }) => {
  const className = `progress-dot progress-dot-${zone}`;
  const style = customColor ? { backgroundColor: customColor } : {};
  
  return <div className={className} style={style}/>;
};

ProgressDot.displayName = 'ProgressDot';

/**
 * Props for the ProgressBar component
 */
export interface ProgressBarProps {
  /** Total number of items */
  total: number;
  /** Number of items in green zone */
  green: number;
  /** Number of items in yellow zone */
  yellow: number;
  /** Number of items in red zone */
  red: number;
  /** Number of items in grey zone */
  grey: number;
  /** Custom color for green zone */
  greenColor?: string;
  /** Custom color for yellow zone */
  yellowColor?: string;
  /** Custom color for red zone */
  redColor?: string;
  /** Custom color for grey zone */
  greyColor?: string;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Calculate percentage safely
 */
function calculatePercentage(value: number, total: number): number {
  return total > 0 ? (value / total) * PERCENT_100 : 0;
}

/**
 * Render a segment of the progress bar
 */
function renderSegment(
  count: number, 
  percent: number, 
  color: string, 
  type: string
): React.ReactNode {
  if (count <= 0) {
    return null;
  }
  
  return (
    <div 
      className={`progress-segment progress-segment-${type}`} 
      style={{ 
        width: `${percent}%`,
        backgroundColor: color
      }}
    />
  );
}

/**
 * Progress bar component for visualizing task completion status
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  total,
  green,
  yellow,
  red,
  grey,
  greenColor = '#4CAF50',
  yellowColor = '#FFC107',
  redColor = '#F44336',
  greyColor = '#9E9E9E',
  className = ''
}) => {
  // Calculate percentages
  const greenPercent = calculatePercentage(green, total);
  const yellowPercent = calculatePercentage(yellow, total);
  const redPercent = calculatePercentage(red, total);
  const greyPercent = calculatePercentage(grey, total);
  
  return (
    <div className={`progress-bar-container ${className}`}>
      <div className="progress-bar">
        {renderSegment(green, greenPercent, greenColor, 'green')}
        {renderSegment(yellow, yellowPercent, yellowColor, 'yellow')}
        {renderSegment(red, redPercent, redColor, 'red')}
        {renderSegment(grey, greyPercent, greyColor, 'grey')}
      </div>
      <div className="progress-text">
        {total > 0 ? `${green} of sub-task(s) ${total}` : 'No items'}
      </div>
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';
