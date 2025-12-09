import {useState, useEffect, useCallback} from 'react';
import {ReleaseVersion} from '../interfaces';
import {API} from '../api';
import {reconcileReleaseVersions, ReleaseStatus} from '../utils/helpers';

const POLL_INTERVAL_MS = 5000;

/**
 * Options for useReleaseVersions hook
 * onBackgroundMembershipChange is triggered when silent polling detects that
 * issue memberships in releases have changed (e.g. via workflow rule),
 * allowing the caller to surface a dedicated "Updated via workflow" UI hint.
 */
interface UseReleaseVersionsOptions {
  onBackgroundMembershipChange?: () => void;
}

/**
 * Detect whether release memberships (planned or linked issues) have changed
 * between two snapshots of release versions.
 */
function hasMembershipChanges(prev: ReleaseVersion[], next: ReleaseVersion[]): boolean {
  if (!Array.isArray(prev) || !Array.isArray(next)) {
    return false;
  }

  const prevById = new Map(prev.map(it => [it.id, it] as const));

  const collectIssueIds = (items: ReleaseVersion['plannedIssues'] | ReleaseVersion['linkedIssues']): string[] => {
    if (!Array.isArray(items)) {
      return [];
    }
    // Ignore meta issues; only real issue memberships matter for this signal
    return items.filter(it => it && !it.isMeta).map(it => it.id);
  };

  for (let i = 0; i < next.length; i++) {
    const nextRv = next[i];
    const prevRv = prevById.get(nextRv.id);
    if (!prevRv) {
      // New releases are not treated as workflow membership changes here
      continue;
    }

    const prevPlannedIds = collectIssueIds(prevRv.plannedIssues);
    const nextPlannedIds = collectIssueIds(nextRv.plannedIssues);
    if (prevPlannedIds.length !== nextPlannedIds.length) {
      return true;
    }

    const prevLinkedIds = collectIssueIds(prevRv.linkedIssues);
    const nextLinkedIds = collectIssueIds(nextRv.linkedIssues);
    if (prevLinkedIds.length !== nextLinkedIds.length) {
      return true;
    }

    // Optional stricter check: same length but different contents
    const makeSet = (ids: string[]) => {
      const s = new Set<string>();
      ids.forEach(id => s.add(id));
      return s;
    };

    const prevPlannedSet = makeSet(prevPlannedIds);
    for (let j = 0; j < nextPlannedIds.length; j++) {
      if (!prevPlannedSet.has(nextPlannedIds[j])) {
        return true;
      }
    }

    const prevLinkedSet = makeSet(prevLinkedIds);
    for (let j = 0; j < nextLinkedIds.length; j++) {
      if (!prevLinkedSet.has(nextLinkedIds[j])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Custom hook to manage release versions data
 */
export function useReleaseVersions(api: API, options?: UseReleaseVersionsOptions) {
  const [releaseVersions, setReleaseVersions] = useState<ReleaseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onBackgroundMembershipChange = options && options.onBackgroundMembershipChange;

  // Fetch release versions from backend
  const fetchReleaseVersions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getReleaseVersions();
      setReleaseVersions(result);
      setError(null);
    } catch (err) {
      setError('Failed to load release versions');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Silent background fetch for polling
  const fetchReleaseVersionsSilently = useCallback(async () => {
    try {
      const result = await api.getReleaseVersions();
      setReleaseVersions(prev => {
        try {
          if (onBackgroundMembershipChange && hasMembershipChanges(prev, result)) {
            onBackgroundMembershipChange();
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
        return reconcileReleaseVersions(prev, result);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [api, onBackgroundMembershipChange]);

  // Load release versions on mount
  useEffect(() => {
    fetchReleaseVersions();
  }, [fetchReleaseVersions]);

  // Setup event listeners for updates
  useEffect(() => {
    // Legacy full refresh handler
    const legacyHandler = () => { fetchReleaseVersions(); };
    window.addEventListener('release-versions-updated', legacyHandler as EventListener);

    // Targeted status update handler
    const targetedHandler = ((e: Event) => {
      const ce = e as CustomEvent<{ id: string | number; status: ReleaseStatus; freezeConfirmed?: boolean }>;
      const detail = ce?.detail;
      if (!detail) { return; }
      setReleaseVersions(prev => prev.map(rv =>
        (rv.id === detail.id ? {
          ...rv,
          status: detail.status,
          // Update freezeConfirmed if it's included in the event
          ...(detail.freezeConfirmed !== undefined ? { freezeConfirmed: detail.freezeConfirmed } : {})
        } : rv)
      ));
    }) as EventListener;
    window.addEventListener('release-version-status-updated', targetedHandler);

    return () => {
      window.removeEventListener('release-versions-updated', legacyHandler as EventListener);
      window.removeEventListener('release-version-status-updated', targetedHandler);
    };
  }, [fetchReleaseVersions]);

  // Setup polling
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchReleaseVersionsSilently();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchReleaseVersionsSilently]);

  return {
    releaseVersions,
    loading,
    error,
    refetch: fetchReleaseVersions
  };
}
