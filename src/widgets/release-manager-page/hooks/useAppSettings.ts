import {useState, useEffect} from 'react';
import {API} from '../api';

/**
 * Custom hook to manage app settings (products and progress fields)
 */
export function useAppSettings(api: API) {
  const [hasProducts, setHasProducts] = useState<boolean>(false);
  const [hasProgress, setHasProgress] = useState<boolean>(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await api.getAppSettings();
        const list = settings.products || [];
        setHasProducts(Array.isArray(list) && list.length > 0);
        const cfList = Array.isArray(settings.customFieldNames) ? settings.customFieldNames : [];
        setHasProgress(cfList.length > 0);
      } catch {
        setHasProducts(false);
        setHasProgress(false);
      }
    };
    
    loadSettings();

    const onSettingsUpdated = () => loadSettings();
    window.addEventListener('settings-updated', onSettingsUpdated as EventListener);
    return () => window.removeEventListener('settings-updated', onSettingsUpdated as EventListener);
  }, [api]);

  return { hasProducts, hasProgress };
}

