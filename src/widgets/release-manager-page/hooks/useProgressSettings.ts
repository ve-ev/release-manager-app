import {useState, useEffect, useRef} from 'react';
import {API} from '../api';
import {AppSettings} from '../interfaces';

interface UseProgressSettingsReturn {
  progressSettings: AppSettings;
  isLoading: boolean;
}

/**
 * Custom hook to fetch and manage progress settings
 * Includes deduplication logic to avoid concurrent fetches
 * Automatically refreshes when settings are updated
 */
export function useProgressSettings(api: API): UseProgressSettingsReturn {
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
  const [isLoading, setIsLoading] = useState(true);

  // Guards to avoid duplicate settings fetches and coalesce concurrent calls
  const didInitRef = useRef(false);
  const inFlightSettingsRef = useRef<Promise<AppSettings> | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchAndSet = () => {
      // If there's already a request in flight, return it
      if (inFlightSettingsRef.current) {
        return inFlightSettingsRef.current;
      }

      const promise = api.getAppSettings()
        .then((settings: AppSettings) => {
          if (mounted) {
            setProgressSettings(settings);
            setIsLoading(false);
          }
          return settings;
        })
        .catch((error: Error) => {
          console.error('Failed to fetch progress settings:', error);
          setIsLoading(false);
          throw error;
        })
        .finally(() => {
          inFlightSettingsRef.current = null;
        });

      inFlightSettingsRef.current = promise;
      return promise;
    };

    // Initial fetch
    if (!didInitRef.current) {
      didInitRef.current = true;
      fetchAndSet();
    }

    // Listen for settings updates
    const handler = () => {
      fetchAndSet();
    };

    window.addEventListener('settings-updated', handler as EventListener);

    return () => {
      mounted = false;
      window.removeEventListener('settings-updated', handler as EventListener);
    };
  }, [api]);

  return {
    progressSettings,
    isLoading
  };
}

