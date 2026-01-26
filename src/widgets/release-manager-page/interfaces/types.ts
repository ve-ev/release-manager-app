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
  // Custom Field Mapping feature config
  customFieldMapping?: {
    plannedReleaseField?: string; // name or ID
  }
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

export type FrozenZone = 'green' | 'yellow' | 'red' | 'grey';

export interface FrozenIssueSnapshot {
  id: string;
  idReadable?: string;
  summary: string;
  isMeta?: boolean;
  metaRelatedIssueIds?: string[];
  // Manual override snapshot (if any)
  manualStatus?: 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped';
  // Manual test status snapshot (if any)
  manualTestStatus?: 'Tested' | 'Not tested' | 'Test NA';
  // Resolved progress zone at freeze time (after considering manual override)
  zone: FrozenZone;
  // Raw field value used for zone computation (if any)
  fieldName?: string;
  fieldValue?: string | null;

  /**
   * For freezing expandable per-issue progress indicators.
   * Matches what `LinkedIssueItem` uses: parent field value + a set of subtask field values.
   */
  parentFieldValue?: string | null;
  subtaskFieldValues?: Array<{ id: string; idReadable?: string; fieldValue: string | null }>;
}

export interface FrozenProgressSnapshot {
  capturedAt: string;
  freezeTimestamp: string;
  issues: FrozenIssueSnapshot[];
  // Issues excluded from progress (e.g., Discoped)
  excludedIssueIds: string[];
  progress: {
    green: number;
    yellow: number;
    red: number;
    grey: number;
    total: number;
  };
}

export interface ReleaseAuditEvent {
  type:
    | 'FREEZE_CONFIRMED'
    | 'UNFROZEN'
    | 'STATUS_CHANGED'
    | 'RELEASE_COMPLETED'
    | 'SNAPSHOT_REGENERATED'
    | 'PLANNED_ISSUES_CHANGED'
    | 'DESCRIPTION_CHANGED';
  at: string;
  by?: string;
  /** Release identifier for cross-referencing audit entries (optional for backward compatibility). */
  releaseId?: string;
  /** Human-readable release version (optional for backward compatibility). */
  releaseVersion?: string;
  fromStatus?: ReleaseStatus;
  toStatus?: ReleaseStatus;

  /** Issue snapshot at the moment of the event (when applicable). */
  plannedIssuesSnapshot?: Array<{ id: string; summary?: string }>;

  /** For `PLANNED_ISSUES_CHANGED`. */
  fromPlannedCount?: number;
  toPlannedCount?: number;
  addedPlannedIssueIds?: string[];
  removedPlannedIssueIds?: string[];
  addedPlannedIssues?: Array<{ id: string; summary?: string }>;
  removedPlannedIssues?: Array<{ id: string; summary?: string }>;
  plannedReordered?: boolean;

  /** For `DESCRIPTION_CHANGED`. */
  fromDescription?: string;
  toDescription?: string;
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
  /** Immutable timestamp set when freeze is confirmed (ISO string). */
  freezeTimestamp?: string;
  /** Stored issue/progress snapshot captured at `freezeTimestamp`. */
  snapshot?: FrozenProgressSnapshot;
  /** Audit trail (append-only). */
  auditEvents?: ReleaseAuditEvent[];
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

