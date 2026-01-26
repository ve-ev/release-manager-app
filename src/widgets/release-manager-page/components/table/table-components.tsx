import React, {memo} from 'react';
import Loader from '@jetbrains/ring-ui-built/components/loader/loader';
import '../../styles/version-table.css';
/* eslint-disable complexity */
/* eslint-disable react/prop-types */

/** Sort types for table headers (product key used for tag column for backward compatibility) */
export type SortKey = 'product' | 'version' | 'progress' | 'status' | 'releaseDate' | 'featureFreezeDate';
export type SortDirection = 'asc' | 'desc';

/**
 * Table header component displaying column titles with sorting
 */
export interface TableHeaderProps {
  showProductColumn?: boolean;
  showProgressColumn?: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

export const TableHeader: React.FC<TableHeaderProps> = memo(({
  showProductColumn = true,
  showProgressColumn = true,
  sortKey,
  sortDirection,
  onSort
}) => {
  const renderCol = (label: string, key?: SortKey, className = '') => {
    const isActive = Boolean(key && sortKey === key);
    let indicator = '';
    if (isActive) {
      indicator = sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!key) { return; }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort(key);
      }
    };
    const handleClick = () => {
      if (key) {
        onSort(key);
      }
    };
    const cellClass = `version-list-header-cell ${className} ${key ? 'sortable' : ''}`.trim();
    return (
      <div
        className={cellClass}
        onClick={key ? handleClick : undefined}
        onKeyDown={key ? handleKeyDown : undefined}
        role={key ? 'button' as const : undefined}
        tabIndex={key ? 0 : undefined}
        title={key ? `Sort by ${label}` : undefined}
      >
        {label}{indicator}
      </div>
    );
  };

  return (
    <div className="version-list-header">
      <div className="version-list-header-cell expand-cell"/>
      {showProductColumn ? renderCol('Tag', 'product', 'product-cell') : null}
      {renderCol('Version', 'version', 'version-cell')}
      {showProgressColumn ? renderCol('Progress', 'progress', 'progress-cell') : null}
      {renderCol('Status', 'status', 'status-cell')}
      {renderCol('Release Date', 'releaseDate', 'date-cell')}
      {renderCol('Feature Freeze Date', 'featureFreezeDate', 'date-cell')}
      <div className="version-list-header-cell actions-cell"/>
    </div>
  );
});

TableHeader.displayName = 'TableHeader';

/**
 * Component displayed during data loading
 */
export const LoadingState: React.FC = memo(() => (
  <div className="loader-container">
    <Loader/>
  </div>
));

LoadingState.displayName = 'LoadingState';

/**
 * Props for the ErrorState component
 */
export interface ErrorStateProps {
  /** Error message to display */
  message: string;
}

/**
 * Component displayed when an error occurs
 */
export const ErrorState: React.FC<ErrorStateProps> = memo(({message}) => (
  <div className="error-message">{message}</div>
));

ErrorState.displayName = 'ErrorState';
