/* eslint-disable no-console */
import React, {useEffect, useState} from 'react';
import {api} from '../../../app.tsx';
import {AppSettings} from '../../../interfaces';
import {LinkedIssueItem, type SubtaskData} from './linked-issue-item.tsx';
import type {IssueStatus, TestStatus} from '../../../hooks/useIssueStatuses';

interface PlannedIssuesListProps {
  issues: Array<{
    id: string;
    idReadable?: string;
    summary: string;
    isMeta?: boolean;
    metaRelatedIssueIds?: string[];
  }>;
  baseUrl: string;
  manualIssueManagement?: boolean;
  canManage?: boolean;
  progressSettings?: AppSettings;
  issueStatusMap: Record<string, IssueStatus>;
  issueTestStatusMap: Record<string, TestStatus>;
  statusesLoaded: boolean;
  setIssueStatus: (id: string, status: IssueStatus) => void;
  setTestStatus: (id: string, status: TestStatus) => void;
}

const PlannedIssuesListComponent: React.FC<PlannedIssuesListProps> = ({
  issues,
  baseUrl,
  manualIssueManagement,
  canManage,
  progressSettings,
  issueStatusMap,
  issueTestStatusMap,
  statusesLoaded,
  setIssueStatus,
  setTestStatus
}) => {
  const [issueSubtasks, setIssueSubtasks] = useState<Record<string, SubtaskData>>({});
  
  // Memoize empty progressSettings to prevent unnecessary re-renders
  const effectiveProgressSettings = React.useMemo(() => progressSettings || {
    customFieldNames: [],
    greenZoneValues: [],
    yellowZoneValues: [],
    redZoneValues: []
  }, [progressSettings]);

  useEffect(() => {
    if (!issues || issues.length === 0) {
      return;
    }
    if (!progressSettings || !progressSettings.customFieldNames || progressSettings.customFieldNames.length === 0) {
      return;
    }

    type FieldValue = {
      id: string;
      idReadable: string;
      fieldValue: string | null;
    };

    const fetchAll = async () => {
      try {
        // Step 1: Collect ALL issue IDs that need field data (including meta-related)
        const allIssueIdsToFetch = new Set<string>();
        const metaIssueMap = new Map<string, string[]>(); // meta issue id -> related issue ids

        issues.forEach(issue => {
          if (issue.isMeta && Array.isArray(issue.metaRelatedIssueIds) && issue.metaRelatedIssueIds.length > 0) {
            // For meta issues, collect related issue IDs
            metaIssueMap.set(issue.id, issue.metaRelatedIssueIds);
            issue.metaRelatedIssueIds.forEach(relId => {
              allIssueIdsToFetch.add(relId);
            });
          } else {
            // Regular issue
            allIssueIdsToFetch.add(issue.id);
          }
        });

        // If no issues to fetch, return early
        if (allIssueIdsToFetch.size === 0) {
          return;
        }

        // Step 2: Fetch ALL field data in ONE batch request
        const batchResults = await api.getIssueFieldBulkBatch(
          Array.from(allIssueIdsToFetch),
          progressSettings.customFieldNames
        );

        // Step 3: Process results for each issue
        const results = issues.map(issue => {
          try {
            // Meta issue: aggregate related issues as pseudo-subtasks
            if (issue.isMeta && metaIssueMap.has(issue.id)) {
              const relatedIds = metaIssueMap.get(issue.id)!;
              const fieldValuesArr: Array<FieldValue> = [];
              const derivedSubtasks: Array<{ id: string; idReadable: string; summary: string; resolved: boolean; fields: [] }> = [];

              relatedIds.forEach(relId => {
                const result = batchResults[relId];
                const parentVal = result?.items?.find(it => it.id === relId)?.value ?? null;
                fieldValuesArr.push({ id: relId, idReadable: relId, fieldValue: parentVal });
                derivedSubtasks.push({ id: relId, idReadable: relId, summary: '', resolved: false, fields: [] });
              });

              const hasAnyFieldValue = fieldValuesArr.some(fv => fv.fieldValue !== null);
              return [
                issue.id,
                { issueId: issue.id, subtasks: derivedSubtasks, fieldValues: fieldValuesArr, parentFieldValue: null, hasAnyFieldValue }
              ] as [string, SubtaskData];
            }

            // Regular issue flow
            const result = batchResults[issue.id];
            const items = result?.items || [];

            const onlyParentItem = items.length === 1 && items[0].id === issue.id;
            const derivedSubtasks = onlyParentItem
              ? []
              : items
                  .filter(it => it.id !== issue.id)
                  .map(it => ({ id: it.id, idReadable: it.id, summary: '', resolved: false, fields: [] }));

            const map: Record<string, string | null> = {};
            items.forEach(item => {
              map[item.id] = item.value ?? null;
            });

            const fieldValuesArr: Array<FieldValue> =
              derivedSubtasks.length > 0
                ? derivedSubtasks.map(st => ({
                    id: st.id,
                    idReadable: st.idReadable,
                    fieldValue: Object.prototype.hasOwnProperty.call(map, st.id) ? map[st.id] : null
                  }))
                : [{ id: issue.id, idReadable: issue.id, fieldValue: Object.prototype.hasOwnProperty.call(map, issue.id) ? map[issue.id] : null }];

            const hasAnyFieldValue = fieldValuesArr.some(fv => fv.fieldValue !== null);

            return [
              issue.id,
              { issueId: issue.id, subtasks: derivedSubtasks, fieldValues: fieldValuesArr, parentFieldValue: (Object.prototype.hasOwnProperty.call(map, issue.id) ? map[issue.id] : null), hasAnyFieldValue }
            ] as [string, SubtaskData];
          } catch (error) {
            console.error(`Failed to process field values for ${issue.id}:`, error);
            return [
              issue.id,
              { issueId: issue.id, subtasks: [], fieldValues: [{ id: issue.id, idReadable: issue.id, fieldValue: null }], parentFieldValue: null }
            ] as [string, SubtaskData];
          }
        });

        setIssueSubtasks(prev => ({
          ...prev,
          ...Object.fromEntries(results)
        }));
      } catch (error) {
        console.error('Failed to fetch issue field values in batch:', error);
      }
    };

    fetchAll();
  }, [issues, progressSettings]);

  if (!issues || issues.length === 0) {
    return null;
  }

  const loadingStatuses = !!manualIssueManagement && !statusesLoaded;

  return (
    <div className="linked-issues-list">
      {issues.map(issue => {
        const status = issueStatusMap[issue.id] || 'Unresolved';
        const testStatus = issueTestStatusMap[issue.id] || 'Not tested';
        const issueData = issueSubtasks[issue.id];
        return (
                  <LinkedIssueItem
                    key={issue.id}
                    issue={issue}
                    baseUrl={baseUrl}
                    status={status}
                    testStatus={testStatus}
                    issueData={issueData}
                    progressSettings={effectiveProgressSettings}
                    manualIssueManagement={manualIssueManagement}
                    canManage={!!canManage}
                    onSetStatus={setIssueStatus}
                    onSetTestStatus={setTestStatus}
                    loadingStatuses={loadingStatuses}
                  />
        );
      })}
    </div>
  );
};

export const PlannedIssuesList = React.memo(PlannedIssuesListComponent);

PlannedIssuesList.displayName = 'PlannedIssuesList';
