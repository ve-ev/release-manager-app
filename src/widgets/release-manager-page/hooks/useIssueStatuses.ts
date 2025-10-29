import {useState, useCallback} from 'react';
import {API} from '../api';
import {useSharedIssueStatuses} from './useSharedIssueStatuses';

export type IssueStatus = 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped';
export type TestStatus = 'Tested' | 'Not tested' | 'Test NA';

// Constants
const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds

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
 *
 * OPTIMIZED: Uses shared state across all instances to prevent duplicate API calls
 */
export function useIssueStatuses(
  api: API,
  issues: Array<{ id: string }>,
  manualIssueManagement?: boolean,
  pollInterval = DEFAULT_POLL_INTERVAL
): UseIssueStatusesReturn {
  // Use the shared hook to get global state and prevent duplicate API calls
  const {
    issueStatusMap: sharedIssueStatusMap,
    issueTestStatusMap: sharedIssueTestStatusMap,
    statusesLoaded: sharedStatusesLoaded,
    setIssueStatus: sharedSetIssueStatus,
    setTestStatus: sharedSetTestStatus
  } = useSharedIssueStatuses(api, pollInterval);

  // Local state for when manual management is disabled
  const [localStatusesLoaded] = useState<boolean>(() => !manualIssueManagement);

  // Create default maps for issues that aren't in the shared state yet
  const defaultIssueStatusMap = Object.fromEntries(
    issues.map(it => [it.id, sharedIssueStatusMap[it.id] || 'Unresolved' as IssueStatus])
  );

  const defaultIssueTestStatusMap = Object.fromEntries(
    issues.map(it => [it.id, sharedIssueTestStatusMap[it.id] || 'Not tested' as TestStatus])
  );

  // Merge shared state with defaults
  const effectiveIssueStatusMap = {
    ...defaultIssueStatusMap,
    ...sharedIssueStatusMap
  };

  const effectiveIssueTestStatusMap = {
    ...defaultIssueTestStatusMap,
    ...sharedIssueTestStatusMap
  };

  // Determine if statuses are loaded based on manual management setting
  const statusesLoaded = manualIssueManagement ? sharedStatusesLoaded : localStatusesLoaded;

  // Wrapper for setIssueStatus that uses the shared implementation
  const setIssueStatus = useCallback((id: string, status: IssueStatus) => {
    sharedSetIssueStatus(id, status).catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to save issue status', e);
    });
  }, [sharedSetIssueStatus]);

  // Wrapper for setTestStatus that uses the shared implementation
  const setTestStatus = useCallback((id: string, status: TestStatus) => {
    sharedSetTestStatus(id, status).catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to save issue test status', e);
    });
  }, [sharedSetTestStatus]);

  return {
    issueStatusMap: effectiveIssueStatusMap,
    issueTestStatusMap: effectiveIssueTestStatusMap,
    statusesLoaded,
    setIssueStatus,
    setTestStatus
  };
}
