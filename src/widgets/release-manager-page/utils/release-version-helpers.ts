import {ReleaseVersion, StatusInfo, ContentVisibility, DateHighlighting} from '../interfaces';
import {isToday, isExpired} from './date-utils';
import {ReleaseStatus} from './helpers';

/**
 * Check if freeze indicator should be shown
 * 
 * @param status - The release status
 * @param isFeatureFreezeDateToday - Whether feature freeze date is today
 * @returns Whether to show freeze indicator
 */
function shouldShowFreezeIndicator(status: string | undefined, isFeatureFreezeDateToday: boolean): boolean {
  return isFeatureFreezeDateToday && (status === 'Planning' || status === 'In progress');
}

/**
 * Check if status should be shown as overdue
 * 
 * @param status - The release status
 * @param isReleaseDateToday - Whether release date is today
 * @param isReleaseDateExpired - Whether release date is expired
 * @returns Whether to show overdue status
 */
function shouldShowOverdueStatus(
  status: string | undefined, 
  _isReleaseDateToday: boolean, 
  isReleaseDateExpired: boolean
): boolean {
  // Only mark as overdue when the release date is actually expired (past),
  // not when it's today.
  return isReleaseDateExpired && 
    status !== 'Canceled' && 
    status !== 'Released' && 
    status !== 'Overdue';
}

/**
 * Calculate status information based on release version data
 * 
 * @param item - The release version item
 * @returns Status information including display status and indicators
 */
export function getStatusInfo(item: ReleaseVersion): StatusInfo {
  // Check date conditions
  const isFeatureFreezeDateToday = isToday(item.featureFreezeDate);
  const isFeatureFreezeDateExpired = isExpired(item.featureFreezeDate);
  const isReleaseDateToday = isToday(item.releaseDate);
  const isReleaseDateExpired = isExpired(item.releaseDate);
  
  // Determine indicators
  const showFreezeIndicator = shouldShowFreezeIndicator(item.status, isFeatureFreezeDateToday);
  const showFreezeNotice = (isFeatureFreezeDateToday || isFeatureFreezeDateExpired) &&
    !item.freezeConfirmed &&
    (item.status === 'Planning' || item.status === 'In progress');
  const showOverdueStatus = shouldShowOverdueStatus(item.status, isReleaseDateToday, isReleaseDateExpired);
  const showReleaseTodayIndicator = isReleaseDateToday &&
    item.status !== 'Canceled' &&
    item.status !== 'Released' &&
    item.status !== 'Overdue';
  
  // Get the effective status to display
  // Default to 'Planning' if status is undefined, or use 'Overdue' if conditions are met
  const displayStatus = showOverdueStatus ? 'Overdue' as ReleaseStatus : (item.status || 'Planning') as ReleaseStatus;

  return {
    displayStatus,
    showFreezeIndicator,
    showFreezeNotice,
    showOverdueStatus,
    showReleaseTodayIndicator
  };
}


/**
 * Calculate content visibility flags based on release version data
 * 
 * @param item - The release version item
 * @returns Content visibility flags
 */
export function getContentVisibility(item: ReleaseVersion): ContentVisibility {
  const plannedIssues = item.plannedIssues || [];
  const hasPlannedIssues = plannedIssues.length > 0;
  
  // Check if description or additionalInfo exists and is not empty
  const hasDescription = Boolean(item.description && item.description.trim() !== '');
  const hasAdditionalInfo = Boolean(item.additionalInfo && item.additionalInfo.trim() !== '');
  const hasInfoToShow = hasDescription || hasAdditionalInfo;
  
  return {
    hasPlannedIssues,
    hasDescription,
    hasAdditionalInfo,
    hasInfoToShow
  };
}


/**
 * Get class name for release date
 * 
 * @param status - The release status
 * @param isReleaseDateToday - Whether release date is today
 * @param isReleaseDateExpired - Whether release date is expired
 * @returns Class name for release date
 */
function getReleaseDateClassName(
  status: string | undefined,
  isReleaseDateToday: boolean,
  isReleaseDateExpired: boolean
): string {
  return (isReleaseDateToday || isReleaseDateExpired) && 
    status !== 'Canceled' && 
    status !== 'Released' 
    ? "highlighted-date" 
    : "";
}

/**
 * Get class name for feature freeze date
 * 
 * @param status - The release status
 * @param isFeatureFreezeDateToday - Whether feature freeze date is today
 * @returns Class name for feature freeze date
 */
function getFeatureFreezeDateClassName(
  status: string | undefined,
  isFeatureFreezeDateToday: boolean
): string {
  return isFeatureFreezeDateToday && 
    (status === 'Planning' || status === 'In progress') 
    ? "highlighted-date" 
    : "";
}

/**
 * Calculate date highlighting class names based on release version data
 * 
 * @param item - The release version item
 * @returns Date highlighting class names
 */
export function getDateHighlighting(item: ReleaseVersion): DateHighlighting {
  const isReleaseDateToday = isToday(item.releaseDate);
  const isReleaseDateExpired = isExpired(item.releaseDate);
  const isFeatureFreezeDateToday = isToday(item.featureFreezeDate);
  
  return {
    releaseDateClassName: getReleaseDateClassName(
      item.status, 
      isReleaseDateToday, 
      isReleaseDateExpired
    ),
    featureFreezeDateClassName: getFeatureFreezeDateClassName(
      item.status, 
      isFeatureFreezeDateToday
    )
  };
}

