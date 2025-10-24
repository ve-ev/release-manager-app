/**
 * Type definitions for the Release Manager application
 */
import {ReleaseStatus} from '../utils/helpers';

/**
 * ========================================
 * Application Settings
 * ========================================
 */

export interface AppSettings {
  customFieldNames: string[];
  greenZoneValues: string[];
  yellowZoneValues: string[];
  redZoneValues: string[];
  greenColor?: string;
  yellowColor?: string;
  redColor?: string;
  greyColor?: string;
  products?: Array<{ id: string; name: string; color?: string }>
}

/**
 * ========================================
 * Permissions
 * ========================================
 */

export interface Permissions {
  isManager: boolean;
  isLightManager: boolean;
}

/**
 * ========================================
 * Release Version & Issues
 * ========================================
 */

export interface PlannedOrMetaIssue {
  id: string;
  idReadable?: string;
  summary: string;
  // Meta issue support: when present, this item represents a meta issue aggregating related issue IDs
  isMeta?: boolean;
  metaRelatedIssueIds?: string[];
}

export interface MetaIssue {
  summary: string;
  relatedIssueIds: string[];
}

export interface ReleaseVersion {
  id: string;
  version: string;
  description?: string;
  featureFreezeDate?: string;
  releaseDate: string;
  product?: string;
  status?: ReleaseStatus;
  freezeConfirmed?: boolean;
  plannedIssues?: PlannedOrMetaIssue[];
  linkedIssues?: PlannedOrMetaIssue[];
  // Dedicated meta issues collection (used by form); renderer may merge it into planned issues
  metaIssues?: MetaIssue[];
  additionalInfo?: string;
}

/**
 * ========================================
 * UI State Interfaces
 * ========================================
 */

export interface StatusInfo {
  displayStatus: ReleaseStatus;
  showFreezeIndicator: boolean;
  showFreezeNotice: boolean;
  showOverdueStatus: boolean;
  showReleaseTodayIndicator: boolean;
}

export interface ContentVisibility {
  hasPlannedIssues: boolean;
  hasDescription: boolean;
  hasAdditionalInfo: boolean;
  hasInfoToShow: boolean;
}

export interface DateHighlighting {
  releaseDateClassName: string;
  featureFreezeDateClassName: string;
}

