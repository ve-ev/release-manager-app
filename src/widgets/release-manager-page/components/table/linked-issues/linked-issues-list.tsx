/* eslint-disable no-console */
import React, {useCallback, useEffect, useState} from 'react';
import {api} from '../../../app.tsx';
import type {AppSettings} from '../../../interfaces';
import {LinkedIssueItem, type IssueStatus, type TestStatus, type SubtaskData} from './linked-issue-item.tsx';

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
}

const POLL_INTERVAL_MS = 5000;

const PlannedIssuesListComponent: React.FC<PlannedIssuesListProps> = ({
  issues,
  baseUrl,
  manualIssueManagement,
  canManage
}) => {
  const [issueSubtasks, setIssueSubtasks] = useState<Record<string, SubtaskData>>({});
  const [progressSettings, setProgressSettings] = useState<AppSettings>({
    customFieldNames: [],
    greenZoneValues: [],
    yellowZoneValues: [],
    redZoneValues: [],
    greenColor: '#4CAF50',
    yellowColor: '#FFC107',
    redColor: '#F44336',
    greyColor: '#9E9E9E'
  });

  useEffect(() => {
    const load = () => {
      api.getAppSettings()
        .then((settings: AppSettings) => {
          setProgressSettings(settings);
        })
        .catch((error: Error) => {
          console.error('Failed to fetch progress settings:', error);
        });
    };

    load();

    const handler = () => {
      api.getAppSettings()
        .then((settings: AppSettings) => {
          setProgressSettings(settings);
        })
        .catch((error: Error) => {
          console.error('Failed to refresh progress settings:', error);
        });
    };

    window.addEventListener('settings-updated', handler as EventListener);
    return () => {
      window.removeEventListener('settings-updated', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!issues || issues.length === 0) {
      return;
    }
    if (!progressSettings.customFieldNames || progressSettings.customFieldNames.length === 0) {
      return;
    }

    type FieldValue = {
      id: string;
      idReadable: string;
      fieldValue: string | null;
    };

    const fetchBulkForFirstAvailableField = async (
      issueId: string,
      fieldNames: string[]
    ): Promise<Array<{ id: string; value: string | null }>> => {
      const { items } = await api.getIssueFieldBulkForFirstAvailable(issueId, fieldNames);
      return items;
    };

    const fetchAll = async () => {
      const results = await Promise.all(issues.map(async (issue) => {
        try {
          // Meta issue: aggregate related issues as pseudo-subtasks and compute bar from their parent values
          if (issue.isMeta && Array.isArray(issue.metaRelatedIssueIds) && issue.metaRelatedIssueIds.length > 0) {
            const relatedIds = issue.metaRelatedIssueIds;
            const fieldValuesArr: Array<FieldValue> = [];
            const derivedSubtasks: Array<{ id: string; idReadable: string; summary: string; resolved: boolean; fields: [] }> = [];

            for (const relId of relatedIds) {
              const items = await fetchBulkForFirstAvailableField(relId, progressSettings.customFieldNames);
              const parentVal = (items.find(it => it.id === relId)?.value) ?? null;
              fieldValuesArr.push({ id: relId, idReadable: relId, fieldValue: parentVal });
              derivedSubtasks.push({ id: relId, idReadable: relId, summary: '', resolved: false, fields: [] });
            }

            const hasAnyFieldValue = fieldValuesArr.some(fv => fv.fieldValue !== null);
            return [
              issue.id,
              { issueId: issue.id, subtasks: derivedSubtasks, fieldValues: fieldValuesArr, parentFieldValue: null, hasAnyFieldValue }
            ] as [string, SubtaskData];
          }

          // Regular issue flow
          const items = await fetchBulkForFirstAvailableField(issue.id, progressSettings.customFieldNames);

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
          console.error(`Failed to fetch field values for ${issue.id}:`, error);
          return [
            issue.id,
            { issueId: issue.id, subtasks: [], fieldValues: [{ id: issue.id, idReadable: issue.id, fieldValue: null }], parentFieldValue: null }
          ] as [string, SubtaskData];
        }
      }));

      setIssueSubtasks(prev => ({
        ...prev,
        ...Object.fromEntries(results)
      }));
    };

    fetchAll();
  }, [issues, progressSettings.customFieldNames]);

  const [issueStatusMap, setIssueStatusMap] = useState<Record<string, IssueStatus>>(() => (
    Object.fromEntries(issues.map(it => [it.id, 'Unresolved'])) as Record<string, IssueStatus>
  ));
  const [issueTestStatusMap, setIssueTestStatusMap] = useState<Record<string, TestStatus>>(() => (
    Object.fromEntries(issues.map(it => [it.id, 'Not tested'])) as Record<string, TestStatus>
  ));

  // Track initial load of statuses to ensure UI starts with correct state
  const [statusesLoaded, setStatusesLoaded] = useState<boolean>(() => !manualIssueManagement);

  // Load persisted statuses on mount (only if manualIssueManagement is enabled) and keep them in sync across users
  useEffect(() => {
    let isMounted = true;

    const fetchAndApply = async () => {
      try {
        const { issueStatuses, testStatuses } = await api.getIssueStatuses();
        if (!isMounted) { return; }
        const castIssue = issueStatuses as Record<string, IssueStatus>;
        const castTest = testStatuses as Record<string, TestStatus>;
        setIssueStatusMap(prev => ({ ...prev, ...castIssue }));
        setIssueTestStatusMap(prev => ({ ...prev, ...castTest }));
        setStatusesLoaded(true);
      } catch (e) {
        console.error('Failed to load issue statuses', e as Error);
        // Even if failed, avoid indefinite hidden state
        setStatusesLoaded(true);
      }
    };

    if (manualIssueManagement) {
      // When controls get enabled, show placeholders until the first load completes
      setStatusesLoaded(false);

      // Initial load
      fetchAndApply();

      // Immediate refresh when someone updates in this or another tab (best-effort)
      const localHandler = () => { fetchAndApply(); };
      window.addEventListener('issue-statuses-updated', localHandler as EventListener);

      // Polling to synchronize across users (since server push is unavailable here)
      const interval = window.setInterval(fetchAndApply, POLL_INTERVAL_MS);

      return () => {
        isMounted = false;
        window.removeEventListener('issue-statuses-updated', localHandler as EventListener);
        window.clearInterval(interval);
      };
    } else {
      setStatusesLoaded(true);
    }

    return () => { isMounted = false; };
  }, [manualIssueManagement]);

  const setIssueStatus = useCallback((id: string, status: IssueStatus) => {
    setIssueStatusMap(prev => ({ ...prev, [id]: status }));
    // Reset test status when switching away from Fixed/Merged
    if (!(status === 'Fixed' || status === 'Merged')) {
      setIssueTestStatusMap(prev => ({ ...prev, [id]: 'Not tested' }));
    }
    // Persist and notify listeners so header can recalc progress
    api.setIssueStatus(id, status)
      .then(() => {
        window.dispatchEvent(new Event('issue-statuses-updated'));
      })
      .catch((e: Error) => {
        console.error('Failed to save issue status', e);
      });
  }, []);

  const setTestStatus = useCallback((id: string, status: TestStatus) => {
    setIssueTestStatusMap(prev => ({ ...prev, [id]: status }));
    api.setIssueTestStatus(id, status)
      .then(() => {
        // Notify local listeners to refresh dependent UI (e.g., headers)
        window.dispatchEvent(new Event('issue-statuses-updated'));
      })
      .catch((e: Error) => {
        console.error('Failed to save issue test status', e);
      });
  }, []);

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
            progressSettings={progressSettings}
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
