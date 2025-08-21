/* eslint-disable complexity */
import React from 'react';
import DropdownMenu from '@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu';
import type {ListDataItem} from '@jetbrains/ring-ui-built/components/list/list';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import {ProgressBar, ProgressDot, ProgressZone} from '../progress/progress-bar.tsx';
import type {AppSettings} from '../../../interfaces';

export type IssueStatus = 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped';
export type TestStatus = 'Tested' | 'Not tested' | 'Test NA';

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

  const getZoneFromFieldValueLocal = (fieldValue: string | null): { zone: ProgressZone; customColor: string } => {
    if (!fieldValue) {
      return { zone: ProgressZone.GREY, customColor: progressSettingsProp.greyColor || '#9E9E9E' };
    }
    const v = fieldValue.toString().toLowerCase();
    const green = (progressSettingsProp.greenZoneValues || []).map(s => s.toLowerCase());
    const yellow = (progressSettingsProp.yellowZoneValues || []).map(s => s.toLowerCase());
    const red = (progressSettingsProp.redZoneValues || []).map(s => s.toLowerCase());
    if (green.includes(v)) { return { zone: ProgressZone.GREEN, customColor: progressSettingsProp.greenColor || '#4CAF50' }; }
    if (yellow.includes(v)) { return { zone: ProgressZone.YELLOW, customColor: progressSettingsProp.yellowColor || '#FFC107' }; }
    if (red.includes(v)) { return { zone: ProgressZone.RED, customColor: progressSettingsProp.redColor || '#F44336' }; }
    return { zone: ProgressZone.GREY, customColor: progressSettingsProp.greyColor || '#9E9E9E' };
  };

  const renderSingleDotLocal = (data: SubtaskData) => {
    // If parent field value is not available, derive status from subtasks according to rules
    const deriveFromSubtasks = (): { zone: ProgressZone; customColor: string } => {
      const values = (data.fieldValues || []).map(item => item.fieldValue);
      if (!values.length) {
        return { zone: ProgressZone.GREY, customColor: progressSettingsProp.greyColor || '#9E9E9E' };
      }
      let hasRed = false; let hasYellow = false; let allGreen = true; let hasGreen = false;
      for (const v of values) {
        const z = getZoneFromFieldValueLocal(v).zone;
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

    const parentValue: string | null = (typeof data.parentFieldValue !== 'undefined') ? data.parentFieldValue : null;
    const parentAvailable = parentValue !== null && parentValue !== undefined;
    const { zone, customColor } = parentAvailable ? getZoneFromFieldValueLocal(parentValue) : deriveFromSubtasks();

    // For meta issues, present dot as blueprint (transparent background, colored border)
    if (issue.isMeta) {
      return <div className="progress-dot" style={{ backgroundColor: 'transparent', border: `2px solid ${customColor}` }}/>;
    }

    return (
      <ProgressDot zone={zone} customColor={customColor}/>
    );
  };

  const renderProgress = () => {
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
    const dot = renderSingleDotLocal(issueData);

    // Render progress bar for subtasks when present, otherwise placeholder
    let bar: React.ReactNode;
    if (hasSubtasks && issueData.fieldValues) {
      const fieldValues = issueData.fieldValues.map(item => item.fieldValue);
      const counts = { green: 0, yellow: 0, red: 0, grey: 0 } as { [k: string]: number };
      fieldValues.forEach((val) => {
        const { zone } = getZoneFromFieldValueLocal(val);
        switch (zone) {
          case ProgressZone.GREEN: counts.green++; break;
          case ProgressZone.YELLOW: counts.yellow++; break;
          case ProgressZone.RED: counts.red++; break;
          case ProgressZone.GREY:
          default: counts.grey++; break;
        }
      });
      // Parent green overrides sub-task readiness: treat feature as ready
      const parentZone = getZoneFromFieldValueLocal(issueData.parentFieldValue ?? null).zone;
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
  };

  const statusColor = (s: 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped'): { bg: string; text: string } => {
    switch (s) {
      case 'Unresolved': return { bg: '#ffe0e0', text: '#a02020' };
      case 'Fixed': return { bg: '#e0ffe0', text: '#206020' };
      case 'Merged': return { bg: '#d0f0ff', text: '#0060a0' };
      case 'Discoped': return { bg: '#f0f0f0', text: '#606060' };
      default: return { bg: '#e0e0e0', text: '#404040' };
    }
  };

  const renderStatusControlsLocal = () => {
    if (!manualIssueManagementProp) { return null; }

    if (loadingStatusesProp) {
      return (
        <div className="issue-controls-placeholder">
          <div className="tag-placeholder"/>
          <div className="tag-placeholder small"/>
        </div>
      );
    }

    const statusTag = (
      <Tag readOnly className="status-tag" backgroundColor={statusColor(status).bg} textColor={statusColor(status).text}>
        {status}
      </Tag>
    );

    const renderTestTag = () => {
      const getTestColors = (s: 'Tested' | 'Not tested' | 'Test NA'): { bg: string; text: string } => {
        switch (s) {
          case 'Tested': return { bg: '#e0ffe0', text: '#206020' };
          case 'Test NA': return { bg: '#ffe0e0', text: '#a02020' };
          case 'Not tested':
          default: return { bg: '#e0e0e0', text: '#404040' };
        }
      };
      const c = getTestColors(testStatus);
      return (
        <Tag readOnly className="status-tag test-status-tag" backgroundColor={c.bg} textColor={c.text}>
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
  };

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
        {renderProgress()}
        {hasControls && (
          <div className="issue-controls">
            {renderStatusControlsLocal()}
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
