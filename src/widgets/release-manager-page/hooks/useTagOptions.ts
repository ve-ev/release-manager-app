import {useState, useEffect} from 'react';
import {API} from '../api';

export interface TagOption {
  key: string;
  label: string;
}

/**
 * Custom hook to fetch and manage product options
 * Automatically refreshes when settings are updated
 */
export function useTagOptions(api: API): TagOption[] {
  const [productOptions, setProductOptions] = useState<TagOption[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const settings = await api.getAppSettings();
        const options = (settings.products || []).map(p => ({ key: p.name, label: p.name }));
        setProductOptions(options);
      } catch {
        // Keep options empty on error
        setProductOptions([]);
      }
    };

    fetchProducts();

    // Listen for settings updates
    const onSettingsUpdated = () => fetchProducts();
    window.addEventListener('settings-updated', onSettingsUpdated as EventListener);

    return () => window.removeEventListener('settings-updated', onSettingsUpdated as EventListener);
  }, [api]);

  return productOptions;
}

