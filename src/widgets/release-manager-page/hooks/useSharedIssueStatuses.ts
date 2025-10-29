import {useState, useEffect, useRef, useCallback} from 'react';
import {API} from '../api';
import type {IssueStatus, TestStatus} from './useIssueStatuses';

// Shared state for issue statuses across all hook instances
let globalIssueStatusMap: Record<string, IssueStatus> = {};
let globalIssueTestStatusMap: Record<string, TestStatus> = {};
// Initialize as false - will be set to true only after successful data fetch
let globalStatusesLoaded = false;
let isInitialFetchInProgress = false;
let lastFetchTime = 0;
// Track if we've attempted a fetch at least once
let hasAttemptedFetch = false;
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
  hasAttemptedFetch: boolean; // Flag indicating if we've attempted to fetch
  setIssueStatus: (id: string, status: IssueStatus) => Promise<void>;
  setTestStatus: (id: string, status: TestStatus) => Promise<void>;
} {
  const [, forceUpdate] = useState({});
  const isMountedRef = useRef(true);

  // Function to check if fetch is needed
  const shouldFetch = (): boolean => {
    // Don't fetch if another fetch is already in progress
    if (isInitialFetchInProgress) {
      return false;
    }

    // Respect debounce period to prevent API hammering
    const now = Date.now();
    if (now - lastFetchTime < FETCH_DEBOUNCE_MS) {
      return false;
    }

    // If we pass the checks above, we should fetch
    // This includes:
    // 1. Initial fetch (hasAttemptedFetch is false)
    // 2. Polling (globalStatusesLoaded is true)
    // 3. Retry after failure (hasAttemptedFetch is true but globalStatusesLoaded is false)
    return true;
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
  // eslint-disable-next-line complexity
  const fetchAndApply = useCallback(async () => {
    if (!shouldFetch()) {
      return;
    }

    isInitialFetchInProgress = true;
    lastFetchTime = Date.now();
    // Mark that we've attempted a fetch, even if it fails
    hasAttemptedFetch = true;

    try {
      const { issueStatuses, testStatuses } = await api.getIssueStatuses();

      const castIssue = issueStatuses as Record<string, IssueStatus>;
      const castTest = testStatuses as Record<string, TestStatus>;

      const prevLoaded = globalStatusesLoaded;
      const { hasIssueChanges, hasTestChanges } = updateGlobalState(castIssue, castTest);

      // Mark loaded on any successful response, even if empty
      const hasData = Object.keys(castIssue).length > 0 || Object.keys(castTest).length > 0;
      globalStatusesLoaded = true;

      // Notify all listeners if there were changes or if loaded state changed
      if (hasIssueChanges || hasTestChanges || prevLoaded !== globalStatusesLoaded || hasData) {
        listeners.forEach(listener => listener());
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load issue statuses', e as Error);
      // Don't set globalStatusesLoaded to true on error - we'll retry
      // This prevents showing empty progress bars when the API fails
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

    // Initial fetch if we haven't attempted one yet or if we need to retry
    // This ensures we only try to fetch once, even if multiple components mount at the same time
    if ((!hasAttemptedFetch || !globalStatusesLoaded) && !isInitialFetchInProgress) {
      fetchAndApply();
    }

    // Set up polling - this will retry failed fetches and keep data in sync
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
    hasAttemptedFetch, // Add flag to indicate if we've attempted to fetch
    setIssueStatus,
    setTestStatus
  };
}
