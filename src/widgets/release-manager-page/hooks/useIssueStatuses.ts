import {useState, useEffect, useCallback} from 'react';
import {API} from '../api';

export type IssueStatus = 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped';
export type TestStatus = 'Tested' | 'Not tested' | 'Test NA';

interface UseIssueStatusesReturn {
  issueStatusMap: Record<string, IssueStatus>;
  issueTestStatusMap: Record<string, TestStatus>;
  statusesLoaded: boolean;
  setIssueStatus: (id: string, status: IssueStatus) => void;
  setTestStatus: (id: string, status: TestStatus) => void;
}

/**
 * Custom hook to manage issue statuses for manual issue management
 * Handles loading, updating, and syncing statuses across users via polling
 */
export function useIssueStatuses(
  api: API,
  issues: Array<{ id: string }>,
  manualIssueManagement?: boolean,
  pollInterval = 5000
): UseIssueStatusesReturn {
  const [issueStatusMap, setIssueStatusMap] = useState<Record<string, IssueStatus>>(() => (
    Object.fromEntries(issues.map(it => [it.id, 'Unresolved' as IssueStatus]))
  ));

  const [issueTestStatusMap, setIssueTestStatusMap] = useState<Record<string, TestStatus>>(() => (
    Object.fromEntries(issues.map(it => [it.id, 'Not tested' as TestStatus]))
  ));

  const [statusesLoaded, setStatusesLoaded] = useState<boolean>(() => !manualIssueManagement);

  // Load persisted statuses and keep them in sync across users
  useEffect(() => {
    let isMounted = true;

    const fetchAndApply = async () => {
      try {
        const { issueStatuses, testStatuses } = await api.getIssueStatuses();
        if (!isMounted) {
          return;
        }
        const castIssue = issueStatuses as Record<string, IssueStatus>;
        const castTest = testStatuses as Record<string, TestStatus>;
        
        // Only update if data has actually changed (prevents unnecessary re-renders)
        setIssueStatusMap(prev => {
          const hasChanges = Object.keys(castIssue).some(key => prev[key] !== castIssue[key]);
          return hasChanges ? { ...prev, ...castIssue } : prev;
        });
        setIssueTestStatusMap(prev => {
          const hasChanges = Object.keys(castTest).some(key => prev[key] !== castTest[key]);
          return hasChanges ? { ...prev, ...castTest } : prev;
        });
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

      // Immediate refresh when someone updates in this or another tab
      const localHandler = () => {
        fetchAndApply();
      };
      window.addEventListener('issue-statuses-updated', localHandler as EventListener);

      // Polling to synchronize across users
      const interval = window.setInterval(fetchAndApply, pollInterval);

      return () => {
        isMounted = false;
        window.removeEventListener('issue-statuses-updated', localHandler as EventListener);
        window.clearInterval(interval);
      };
    } else {
      setStatusesLoaded(true);
    }

    return () => {
      isMounted = false;
    };
  }, [manualIssueManagement, pollInterval, api]);

  const setIssueStatus = useCallback((id: string, status: IssueStatus) => {
    setIssueStatusMap(prev => ({ ...prev, [id]: status }));
    // Reset test status when switching away from Fixed/Merged
    if (!(status === 'Fixed' || status === 'Merged')) {
      setIssueTestStatusMap(prev => ({ ...prev, [id]: 'Not tested' }));
    }
    // Persist without immediately notifying - let polling sync naturally
    // This prevents race conditions where the event fires before the API completes
    api.setIssueStatus(id, status)
      .catch((e: Error) => {
        console.error('Failed to save issue status', e);
        // On error, revert local state by triggering a refresh
        window.dispatchEvent(new Event('issue-statuses-updated'));
      });
  }, [api]);

  const setTestStatus = useCallback((id: string, status: TestStatus) => {
    setIssueTestStatusMap(prev => ({ ...prev, [id]: status }));
    api.setIssueTestStatus(id, status)
      .catch((e: Error) => {
        console.error('Failed to save issue test status', e);
        // On error, revert local state by triggering a refresh
        window.dispatchEvent(new Event('issue-statuses-updated'));
      });
  }, [api]);

  return {
    issueStatusMap,
    issueTestStatusMap,
    statusesLoaded,
    setIssueStatus,
    setTestStatus
  };
}

