import React, { useState, useCallback } from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import { api } from '../../app';
import '../../styles/settings.css';
import {AppSettings} from '../../interfaces';
import {useSettingsData, useAppConfig} from '../../hooks';
import {DEFAULT_PRODUCT_COLORS} from '../../utils/constants';
import {generateClientId} from '../../utils/id-generator';
import {invalidateProgressCache} from '../../utils/progress-cache';
import {CustomFieldMapping} from './custom-field-mapping';
import {ProgressTrackingSettings} from './progress-tracking-settings';
import {ProductsSettings} from './products-settings';


/**
 * Props for the ProgressSettingsForm component
 */
interface AppSettingsFormProps {
  onClose: () => void;
}

/**
 * Component for configuring progress tracking settings
 */
export const SettingsForm: React.FC<AppSettingsFormProps> = ({ onClose }) => {
  // Use custom hook to fetch and manage settings data
  const { settings, setSettings, isLoading, error: loadError } = useSettingsData(api);
  // Load app-level config to conditionally render sections
  const appConfig = useAppConfig(api);

  // ProgressTrackingSettings keeps its own local inputs; parent no longer mirrors customFieldNames text

  // State for storing form errors
  const [errors, setErrors] = useState<string[]>([]);

  // State for tracking saving state
  const [isSaving, setIsSaving] = useState(false);

  // Zone input fields moved into ProgressTrackingSettings

  // Products management state (kept locally inside settings until Save)
  const [newProductName, setNewProductName] = useState<string>('');
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState<string>('');

  // Add new product locally (no POST until Save)
  const handleAddProduct = useCallback(() => {
    const name = newProductName.trim();
    if (!name) { return; }
    const currentCount = (settings.products || []).length;
    const defaultColor = DEFAULT_PRODUCT_COLORS[currentCount % DEFAULT_PRODUCT_COLORS.length];
    const newProduct = { id: generateClientId('product'), name, color: defaultColor };
    setSettings(prev => ({
      ...prev,
      products: [ ...(prev.products || []), newProduct ]
    }));
    setNewProductName('');
  }, [newProductName, settings.products, setSettings]);

  // Start editing a product
  const startEditProduct = useCallback((p: { id: string; name: string }) => {
    setEditProductId(p.id);
    setEditProductName(p.name);
  }, []);

  // Save product name locally
  const handleSaveProduct = useCallback(() => {
    if (!editProductId) { return; }
    const name = editProductName.trim();
    if (!name) { return; }
    setSettings(prev => ({
      ...prev,
      products: (prev.products || []).map(p => p.id === editProductId ? { ...p, id: editProductId, name } : p)
    }));
    setEditProductId(null);
    setEditProductName('');
  }, [editProductId, editProductName, setSettings]);

  // Delete product locally
  const handleDeleteProduct = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      products: (prev.products || []).filter(p => p.id !== id)
    }));
    if (editProductId === id) {
      setEditProductId(null);
      setEditProductName('');
    }
  }, [editProductId, setSettings]);

  // Set initial errors from load error
  React.useEffect(() => {
    if (loadError) {
      setErrors([loadError]);
    }
  }, [loadError]);

  // Handle saving settings
  // eslint-disable-next-line complexity
  const handleSave = useCallback(async () => {
    // Validate settings
    const validationErrors = [];

    if (!settings.customFieldNames || settings.customFieldNames.length === 0) {
      validationErrors.push('At least one custom field name is required');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setIsSaving(true);
      // Prepare settings to save, applying any pending product edit
      let settingsToSave: AppSettings = { ...settings };
      if (editProductId) {
        const trimmed = editProductName.trim();
        if (trimmed) {
          const updatedProducts = (settingsToSave.products || []).map(p => p.id === editProductId ? { ...p, id: editProductId, name: trimmed } : p);
          settingsToSave = { ...settingsToSave, products: updatedProducts };
          setSettings(settingsToSave);
        }
        setEditProductId(null);
        setEditProductName('');
      }

      await api.fetchJson('backend/app-settings', {
        method: 'PUT',
        body: settingsToSave
      });

      // Invalidate progress settings cache and prefetch fresh settings
      api.invalidateProgressSettingsCache();
      invalidateProgressCache(); // Clear progress zone cache
      await api.getAppSettings();

      // Notify application to refresh settings without full reload
      window.dispatchEvent(new CustomEvent('settings-updated'));

      // Close the settings dialog
      onClose();
    } catch {
      setErrors(['Failed to save progress settings']);
    } finally {
      setIsSaving(false);
    }
  }, [settings, editProductId, onClose, editProductName, setSettings]);

  return (
    <div className="app-settings-form">
      <Panel className="settings-panel">
        {isLoading ? (
          <div className="settings-loading">Loading settings...</div>
        ) : (
          <>
            <div className={`settings-layout ${appConfig.customFieldsMapping ? 'two-columns' : 'single-column'}`}>
              <ProgressTrackingSettings
                settings={settings}
                setSettings={setSettings}
                errors={errors}
                setErrors={setErrors}
              />

              {appConfig.customFieldsMapping && (
                <>
                  <div className="settings-separator" role="separator" aria-orientation="vertical"/>
                  <div className="settings-column right">
                    <CustomFieldMapping settings={settings} setSettings={setSettings}/>
                  </div>
                </>
              )}
            </div>

            <div className="settings-separator horizontal" role="separator" aria-orientation="horizontal"/>

            <ProductsSettings
              settings={settings}
              setSettings={setSettings}
              newProductName={newProductName}
              setNewProductName={setNewProductName}
              editProductId={editProductId}
              editProductName={editProductName}
              setEditProductId={setEditProductId}
              setEditProductName={setEditProductName}
              handleAddProduct={handleAddProduct}
              startEditProduct={startEditProduct}
              handleSaveProduct={handleSaveProduct}
              handleDeleteProduct={handleDeleteProduct}
            />

            <div className="settings-separator horizontal" role="separator" aria-orientation="horizontal"/>

            <div className="settings-actions">
              <Button onClick={onClose}>Cancel</Button>
              <Button primary onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

export default SettingsForm;
