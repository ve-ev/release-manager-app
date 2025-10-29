/**
 * Shared constants for the release manager application
 */
import {type ReleaseStatus} from './helpers';

/**
 * Default product colors for new products
 */
export const DEFAULT_PRODUCT_COLORS = [
  '#5cb85c', // green
  '#337ab7', // blue
  '#f0ad4e', // orange
  '#5bc0de', // light blue
  '#d9534f', // red
  '#9370db', // medium purple
  '#20b2aa', // light sea green
  '#ff7f50'  // coral
];

/**
 * Available status options for release versions
 */
export const RELEASE_STATUS_OPTIONS = [
  { key: 'Planning' as ReleaseStatus, label: 'Planning' },
  { key: 'In progress' as ReleaseStatus, label: 'In progress' },
  { key: 'Released' as ReleaseStatus, label: 'Released' },
  { key: 'Overdue' as ReleaseStatus, label: 'Overdue' },
  { key: 'Canceled' as ReleaseStatus, label: 'Canceled' }
] as const;

// Re-export ReleaseStatus for convenience
export type {ReleaseStatus};

/**
 * Polling interval for syncing statuses across users (milliseconds)
 */
export const STATUS_POLL_INTERVAL_MS = 5000;

/**
 * Timeout for "copied" notification in release notes dialog (milliseconds)
 */
export const COPY_RESET_MS = 1500;

/**
 * Available status options for status dropdown
 */
export const STATUS_DROPDOWN_OPTIONS: ReleaseStatus[] = ['Planning', 'In progress', 'Released', 'Canceled'];

/**
 * Default progress zone colors
 */
export const DEFAULT_PROGRESS_COLORS = {
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
  grey: '#9E9E9E'
} as const;

