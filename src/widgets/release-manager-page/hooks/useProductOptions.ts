import {useState, useEffect} from 'react';
import {API} from '../api';

export interface ProductOption {
  key: string;
  label: string;
}

/**
 * Custom hook to fetch and manage product options
 * Automatically refreshes when settings are updated
 */
export function useProductOptions(api: API): ProductOption[] {
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

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

