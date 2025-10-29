import {useState, useEffect, useCallback} from 'react';
import {ReleaseVersion} from '../interfaces';
import {API} from '../api';
import {reconcileReleaseVersions, ReleaseStatus} from '../utils/helpers';

const POLL_INTERVAL_MS = 5000;

/**
 * Custom hook to manage release versions data
 */
export function useReleaseVersions(api: API) {
  const [releaseVersions, setReleaseVersions] = useState<ReleaseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setReleaseVersions(prev => reconcileReleaseVersions(prev, result));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [api]);

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
