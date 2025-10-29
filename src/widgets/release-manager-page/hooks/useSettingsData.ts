import {useState, useEffect} from 'react';
import {API} from '../api';
import {AppSettings} from '../interfaces';
import {generateColorFromString} from '../utils/helpers';

interface UseSettingsDataReturn {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook to fetch and manage settings data
 * Loads settings on mount and applies default colors to products
 */
export function useSettingsData(api: API): UseSettingsDataReturn {
  const [settings, setSettings] = useState<AppSettings>({
    customFieldNames: [],
    greenZoneValues: [],
    yellowZoneValues: [],
    redZoneValues: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getAppSettings();
        
        // Apply default colors to products that don't have colors
        const withDetectedProductColors = (response.products || []).map(p => ({
          ...p,
          color: p.color || generateColorFromString(p.name)
        }));
        
        setSettings({ ...response, products: withDetectedProductColors });
      } catch {
        setError('Failed to load progress settings');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, [api]);

  return { settings, setSettings, isLoading, error };
}

