/* eslint-disable complexity */
import React, {useMemo} from 'react';
import DropdownMenu from '@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu';
import type {ListDataItem} from '@jetbrains/ring-ui-built/components/list/list';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import {ProgressBar, ProgressDot, ProgressZone} from '../progress/progress-bar.tsx';
import type {AppSettings} from '../../../interfaces';
import {getZoneWithColor, getStatusColor, getTestStatusColor} from '../../../utils/progress-helpers';
import type {IssueStatus, TestStatus} from '../../../hooks/useIssueStatuses';

// Re-export types for backwards compatibility
export type { IssueStatus, TestStatus };

export interface SubtaskData {
  issueId: string;
  subtasks: Array<{
    id: string;
    idReadable: string;
    summary: string;
    resolved: boolean;
    fields: Array<{
      id: string;
      name: string;
      value: string | null;
    }>;
  }>;
  fieldValues?: Array<{
    id: string;
    idReadable: string;
    fieldValue: string | null;
  }>;
  parentFieldValue?: string | null;
  hasAnyFieldValue?: boolean;
}

export interface LinkedIssueItemProps {
  issue: { id: string; idReadable?: string; summary: string; isMeta?: boolean; metaRelatedIssueIds?: string[] };
  baseUrl: string;
  status: IssueStatus;
  testStatus: TestStatus;
  issueData?: SubtaskData;
  progressSettings: AppSettings;
  manualIssueManagement?: boolean;
  canManage?: boolean;
  loadingStatuses?: boolean;
  onSetStatus: (id: string, status: IssueStatus) => void;
  onSetTestStatus: (id: string, status: TestStatus) => void;
}

const LinkedIssueItemComponent: React.FC<LinkedIssueItemProps> = ({
  issue,
  baseUrl: baseUrlProp,
  status,
  testStatus,
  issueData,
  progressSettings: progressSettingsProp,
  manualIssueManagement: manualIssueManagementProp,
  canManage: canManageProp,
  loadingStatuses: loadingStatusesProp,
  onSetStatus,
  onSetTestStatus
}) => {
  const isDiscoped = status === 'Discoped';

  const renderSingleDotLocal = useMemo(() => {
    if (!issueData) {
      return null;
    }
    
    // If parent field value is not available, derive status from subtasks according to rules
    const deriveFromSubtasks = (): { zone: ProgressZone; customColor: string } => {
      const values = (issueData.fieldValues || []).map(item => item.fieldValue);
      if (!values.length) {
        return { zone: ProgressZone.GREY, customColor: progressSettingsProp.greyColor || '#9E9E9E' };
      }
      let hasRed = false; let hasYellow = false; let allGreen = true; let hasGreen = false;
      for (const v of values) {
        const z = getZoneWithColor(v, progressSettingsProp).zone;
        if (z === ProgressZone.RED) { hasRed = true; }
        if (z === ProgressZone.YELLOW) { hasYellow = true; }
        if (z === ProgressZone.GREEN) { hasGreen = true; } else { allGreen = false; }
      }
      if (hasRed) { return { zone: ProgressZone.RED, customColor: progressSettingsProp.redColor || '#F44336' }; }
      if (hasYellow) { return { zone: ProgressZone.YELLOW, customColor: progressSettingsProp.yellowColor || '#FFC107' }; }
      if (allGreen && hasGreen) { return { zone: ProgressZone.GREEN, customColor: progressSettingsProp.greenColor || '#4CAF50' }; }
      return { zone: ProgressZone.GREY, customColor: progressSettingsProp.greyColor || '#9E9E9E' };
    };

    // Manual override: Fixed/Merged -> green
    if (status === 'Fixed' || status === 'Merged') {
      const customColor = progressSettingsProp.greenColor || '#4CAF50';
      // For meta issues, render as blueprint (transparent) dot
      if (issue.isMeta) {
        return <div className="progress-dot" style={{ backgroundColor: 'transparent', border: `2px solid ${customColor}` }}/>;
      }
      return <ProgressDot zone={ProgressZone.GREEN} customColor={customColor}/>;
    }

    const parentValue: string | null = (typeof issueData.parentFieldValue !== 'undefined') ? issueData.parentFieldValue : null;
    const parentAvailable = parentValue !== null && parentValue !== undefined;
    const { zone, customColor } = parentAvailable ? getZoneWithColor(parentValue, progressSettingsProp) : deriveFromSubtasks();

    // For meta issues, present dot as blueprint (transparent background, colored border)
    if (issue.isMeta) {
      return <div className="progress-dot" style={{ backgroundColor: 'transparent', border: `2px solid ${customColor}` }}/>;
    }

    return (
      <ProgressDot zone={zone} customColor={customColor}/>
    );
  }, [issueData, status, issue.isMeta, progressSettingsProp]);

  const renderProgress = useMemo(() => {
    if (isDiscoped) { return null; }

    if (!issueData) {
      // Placeholder to reserve space while loading
      return (
        <div className="progress-indicator">
          <div className="progress-placeholder">
            <div className="progress-placeholder-bar"/>
          </div>
          <div className="progress-placeholder-dot"/>
        </div>
      );
    }

    const hasSubtasks = (issueData.subtasks && issueData.subtasks.length > 0);

    // Always render dot to show overall issue progress (from parent field value)
    const dot = renderSingleDotLocal;

    // Render progress bar for subtasks when present, otherwise placeholder
    let bar: React.ReactNode;
    if (hasSubtasks && issueData.fieldValues) {
      const fieldValues = issueData.fieldValues.map(item => item.fieldValue);
      const counts = { green: 0, yellow: 0, red: 0, grey: 0 } as { [k: string]: number };
      fieldValues.forEach((val) => {
        const { zone } = getZoneWithColor(val, progressSettingsProp);
        switch (zone) {
          case ProgressZone.GREEN: counts.green++; break;
          case ProgressZone.YELLOW: counts.yellow++; break;
          case ProgressZone.RED: counts.red++; break;
          case ProgressZone.GREY:
          default: counts.grey++; break;
        }
      });
      // Parent green overrides sub-task readiness: treat feature as ready
      const parentZone = getZoneWithColor(issueData.parentFieldValue ?? null, progressSettingsProp).zone;
      if (parentZone === ProgressZone.GREEN) {
        counts.green = fieldValues.length;
        counts.yellow = 0;
        counts.red = 0;
        counts.grey = 0;
      }
      bar = (
        <ProgressBar
          total={fieldValues.length}
          green={counts.green}
          yellow={counts.yellow}
          red={counts.red}
          grey={counts.grey}
          greenColor={progressSettingsProp.greenColor}
          yellowColor={progressSettingsProp.yellowColor}
          redColor={progressSettingsProp.redColor}
          greyColor={progressSettingsProp.greyColor}
        />
      );
    } else {
      bar = <div className="no-progress">No sub-tasks</div>;
    }

    return (
      <div className="progress-indicator">
        {bar}
        {dot}
      </div>
    );
  }, [isDiscoped, issueData, renderSingleDotLocal, progressSettingsProp]);

  const renderStatusControlsLocal = useMemo(() => {
    if (!manualIssueManagementProp) { return null; }

    if (loadingStatusesProp) {
      return (
        <div className="issue-controls-placeholder">
          <div className="tag-placeholder"/>
          <div className="tag-placeholder small"/>
        </div>
      );
    }

    const statusColors = getStatusColor(status);
    const statusTag = (
      <Tag readOnly className="status-tag" backgroundColor={statusColors.bg} textColor={statusColors.text}>
        {status}
      </Tag>
    );

    const renderTestTag = () => {
      const testColors = getTestStatusColor(testStatus);
      return (
        <Tag readOnly className="status-tag test-status-tag" backgroundColor={testColors.bg} textColor={testColors.text}>
          {testStatus}
        </Tag>
      );
    };

    if (!canManageProp) {
      return (
        <>
          {statusTag}
          {(status === 'Fixed' || status === 'Merged') && renderTestTag()}
        </>
      );
    }

    return (
      <>
        <DropdownMenu<unknown>
          anchor={statusTag}
          data={(['Unresolved','Fixed','Merged','Discoped'] as const).map(st => ({
            label: st,
            onClick: () => onSetStatus(issue.id, st)
          })) as readonly ListDataItem<unknown>[]}
        />
        {(status === 'Fixed' || status === 'Merged') && (
          <DropdownMenu<unknown>
            anchor={renderTestTag()}
            data={(['Tested','Not tested','Test NA'] as const).map(st => ({
              label: st,
              onClick: () => onSetTestStatus(issue.id, st)
            })) as readonly ListDataItem<unknown>[]}
          />
        )}
      </>
    );
  }, [manualIssueManagementProp, loadingStatusesProp, status, testStatus, canManageProp, issue.id, onSetStatus, onSetTestStatus]);

  const hasControls = !!manualIssueManagementProp;
  return (
    <div className={`linked-issue-item ${isDiscoped ? 'discoped' : ''}`}>
      <div className={`tree-view-controller ${hasControls ? 'has-controls' : 'no-controls'}`}>
        <div className="folder-opener-placeholder"/>
        <a
          href={issue.isMeta && Array.isArray(issue.metaRelatedIssueIds) && issue.metaRelatedIssueIds.length > 0
            ? `${baseUrlProp}issues?q=${encodeURIComponent(issue.metaRelatedIssueIds.join(' or '))}`
            : `${baseUrlProp}issue/${issue.id}`}
          className="linked-issue-id"
          onClick={(e) => { e.stopPropagation(); }}
        >
          {issue.idReadable || issue.id}
        </a>
        <span className="linked-issue-summary">{issue.summary}</span>
        {renderProgress}
        {hasControls && (
          <div className="issue-controls">
            {renderStatusControlsLocal}
          </div>
        )}
      </div>
    </div>
  );
};

export const LinkedIssueItem = React.memo(LinkedIssueItemComponent, (prev, next) => (
  prev.baseUrl === next.baseUrl &&
  prev.manualIssueManagement === next.manualIssueManagement &&
  prev.canManage === next.canManage &&
  prev.loadingStatuses === next.loadingStatuses &&
  prev.status === next.status &&
  prev.testStatus === next.testStatus &&
  prev.issue.id === next.issue.id &&
  prev.issue.idReadable === next.issue.idReadable &&
  prev.issue.summary === next.issue.summary &&
  prev.issueData === next.issueData &&
  prev.progressSettings === next.progressSettings
));

LinkedIssueItem.displayName = 'LinkedIssueItem';
