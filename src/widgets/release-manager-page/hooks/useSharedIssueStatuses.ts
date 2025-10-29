import {useState, useEffect, useRef, useCallback} from 'react';
import {API} from '../api';
import type {IssueStatus, TestStatus} from './useIssueStatuses';

// Shared state for issue statuses across all hook instances
let globalIssueStatusMap: Record<string, IssueStatus> = {};
let globalIssueTestStatusMap: Record<string, TestStatus> = {};
let globalStatusesLoaded = false;
let isInitialFetchInProgress = false;
let lastFetchTime = 0;
const FETCH_DEBOUNCE_MS = 1000; // Prevent multiple fetches within 1 second
const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds

// Listeners for status updates
const listeners: Set<() => void> = new Set();

/**
 * Shared hook for issue statuses that prevents duplicate API calls
 * This is used internally by useIssueStatuses to optimize API usage
 */
export function useSharedIssueStatuses(
  api: API,
  pollInterval = DEFAULT_POLL_INTERVAL
): {
  issueStatusMap: Record<string, IssueStatus>;
  issueTestStatusMap: Record<string, TestStatus>;
  statusesLoaded: boolean;
  setIssueStatus: (id: string, status: IssueStatus) => Promise<void>;
  setTestStatus: (id: string, status: TestStatus) => Promise<void>;
} {
  const [, forceUpdate] = useState({});
  const isMountedRef = useRef(true);

  // Function to check if fetch is needed
  const shouldFetch = (): boolean => {
    const now = Date.now();
    if (now - lastFetchTime < FETCH_DEBOUNCE_MS) {
      return false;
    }

    return !isInitialFetchInProgress;
  };

  // Function to update global state with new data
  const updateGlobalState = (
    castIssue: Record<string, IssueStatus>,
    castTest: Record<string, TestStatus>
  ): { hasIssueChanges: boolean; hasTestChanges: boolean } => {
    // Only update if data has actually changed
    const hasIssueChanges = Object.keys(castIssue).some(key => globalIssueStatusMap[key] !== castIssue[key]);
    const hasTestChanges = Object.keys(castTest).some(key => globalIssueTestStatusMap[key] !== castTest[key]);

    if (hasIssueChanges) {
      globalIssueStatusMap = { ...globalIssueStatusMap, ...castIssue };
    }

    if (hasTestChanges) {
      globalIssueTestStatusMap = { ...globalIssueTestStatusMap, ...castTest };
    }

    return { hasIssueChanges, hasTestChanges };
  };

  // Function to fetch and update statuses
  const fetchAndApply = useCallback(async () => {
    if (!shouldFetch()) {
      return;
    }

    isInitialFetchInProgress = true;
    lastFetchTime = Date.now();

    try {
      const { issueStatuses, testStatuses } = await api.getIssueStatuses();

      const castIssue = issueStatuses as Record<string, IssueStatus>;
      const castTest = testStatuses as Record<string, TestStatus>;

      const { hasIssueChanges, hasTestChanges } = updateGlobalState(castIssue, castTest);

      globalStatusesLoaded = true;

      // Notify all listeners if there were changes
      if (hasIssueChanges || hasTestChanges) {
        listeners.forEach(listener => listener());
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load issue statuses', e as Error);
      // Even if failed, avoid indefinite hidden state
      globalStatusesLoaded = true;
    } finally {
      isInitialFetchInProgress = false;
    }
  }, [api]);

  // Register this component as a listener for updates
  useEffect(() => {
    const listener = () => {
      if (isMountedRef.current) {
        forceUpdate({});
      }
    };

    listeners.add(listener);

    // Initial fetch if not already loaded
    if (!globalStatusesLoaded && !isInitialFetchInProgress) {
      fetchAndApply();
    }

    // Set up polling
    const interval = window.setInterval(fetchAndApply, pollInterval);

    // Immediate refresh when someone updates in this or another tab
    const localHandler = () => {
      fetchAndApply();
    };
    window.addEventListener('issue-statuses-updated', localHandler as EventListener);

    return () => {
      isMountedRef.current = false;
      listeners.delete(listener);
      window.removeEventListener('issue-statuses-updated', localHandler as EventListener);
      window.clearInterval(interval);
    };
  }, [api, pollInterval, fetchAndApply]);

  // Wrapper for setIssueStatus that updates global state
  const setIssueStatus = async (id: string, status: IssueStatus) => {
    // Update global state immediately for responsive UI
    globalIssueStatusMap = { ...globalIssueStatusMap, [id]: status };

    // Reset test status when switching away from Fixed/Merged
    if (!(status === 'Fixed' || status === 'Merged')) {
      globalIssueTestStatusMap = { ...globalIssueTestStatusMap, [id]: 'Not tested' };
    }

    // Notify all listeners
    listeners.forEach(listener => listener());

    // Persist to backend
    try {
      await api.setIssueStatus(id, status);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to save issue status', e as Error);
      // On error, revert by triggering a refresh
      window.dispatchEvent(new Event('issue-statuses-updated'));
    }
  };

  // Wrapper for setTestStatus that updates global state
  const setTestStatus = async (id: string, status: TestStatus) => {
    // Update global state immediately for responsive UI
    globalIssueTestStatusMap = { ...globalIssueTestStatusMap, [id]: status };

    // Notify all listeners
    listeners.forEach(listener => listener());

    // Persist to backend
    try {
      await api.setIssueTestStatus(id, status);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to save issue test status', e as Error);
      // On error, revert by triggering a refresh
      window.dispatchEvent(new Event('issue-statuses-updated'));
    }
  };

  return {
    issueStatusMap: globalIssueStatusMap,
    issueTestStatusMap: globalIssueTestStatusMap,
    statusesLoaded: globalStatusesLoaded,
    setIssueStatus,
    setTestStatus
  };
}
