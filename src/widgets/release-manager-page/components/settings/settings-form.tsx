import React, { useState, useCallback, useMemo } from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import { H3 } from '@jetbrains/ring-ui-built/components/heading/heading';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import { api } from '../../app';
import '../../styles/settings.css';
import {AppSettings} from '../../interfaces';
import {generateColorFromString} from '../../utils/helpers';
import {useSettingsData} from '../../hooks';
import {DEFAULT_PRODUCT_COLORS} from '../../utils/constants';
import {generateClientId} from '../../utils/id-generator';
import {invalidateProgressCache} from '../../utils/progress-cache';


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

  // Memoize custom field names input from settings
  const initialCustomFieldNamesInput = useMemo(() => {
    const names = Array.isArray(settings.customFieldNames) ? settings.customFieldNames : [];
    return names.join('; ');
  }, [settings.customFieldNames]);

  const [customFieldNamesInput, setCustomFieldNamesInput] = useState<string>(initialCustomFieldNamesInput);

  // Update customFieldNamesInput when settings are loaded
  React.useEffect(() => {
    setCustomFieldNamesInput(initialCustomFieldNamesInput);
  }, [initialCustomFieldNamesInput]);

  // State for storing form errors
  const [errors, setErrors] = useState<string[]>([]);

  // State for tracking saving state
  const [isSaving, setIsSaving] = useState(false);

  // State for new value inputs
  const [newGreenValue, setNewGreenValue] = useState('');
  const [newYellowValue, setNewYellowValue] = useState('');
  const [newRedValue, setNewRedValue] = useState('');

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

  // Handle adding a new value to a zone
  const handleAddValue = useCallback((zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues', value: string) => {
    if (!value.trim()) {
      return;
    }

    // Check if value already exists in any zone
    const allValues = [
      ...settings.greenZoneValues,
      ...settings.yellowZoneValues,
      ...settings.redZoneValues
    ];

    if (allValues.includes(value)) {
      setErrors([`Value "${value}" already exists in another zone`]);
      return;
    }

    setSettings(prev => ({
      ...prev,
      [zone]: [...prev[zone], value]
    }));

    // Clear the input
    switch (zone) {
      case 'greenZoneValues':
        setNewGreenValue('');
        break;
      case 'yellowZoneValues':
        setNewYellowValue('');
        break;
      case 'redZoneValues':
        setNewRedValue('');
        break;
      default:
        // No action needed for other cases
        break;
    }

    // Clear any errors
    setErrors([]);
  }, [settings.greenZoneValues, settings.yellowZoneValues, settings.redZoneValues, setSettings]);

  // Handle removing a value from a zone
  const handleRemoveValue = useCallback((zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues', value: string) => {
    setSettings(prev => ({
      ...prev,
      [zone]: prev[zone].filter(v => v !== value)
    }));
  }, [setSettings]);

  // Render value tags for a zone
  const renderValueTags = useCallback((zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues') => {
    return settings[zone].map(value => (
      <Tag
        key={value}
        onRemove={() => handleRemoveValue(zone, value)}
        className={`tag-${zone.replace('ZoneValues', '')}`}
      >
        {value}
      </Tag>
    ));
  }, [settings, handleRemoveValue]);

  return (
    <div className="app-settings-form">
      <Panel className="settings-panel">
        <H3>Progress Tracking Settings</H3>
        <br/>

        {errors.length > 0 && (
          <div className="settings-errors">
            {errors.map((error) => (
              // Using message text as key; list is small and not reordered
              <ErrorMessage key={error}>{error}</ErrorMessage>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="settings-loading">Loading settings...</div>
        ) : (
          <>
            <div className="settings-field">
              <label htmlFor="customFieldNames">Custom Field Name(s)</label>
              <Input
                id="customFieldNames"
                value={customFieldNamesInput}
                onChange={(e) => {
                  const text = e.target.value;
                  setCustomFieldNamesInput(text);
                  const names = text.split(/[;,]/).map(s => s.trim()).filter(Boolean);
                  setSettings(prev => ({ ...prev, customFieldNames: names }));
                }}
                placeholder="e.g., State; Progress; Status"
              />
              <div className="field-help">
                Enter one or several custom field names to track progress. If the first field is not present, the next one will be tried. Use comma or semicolon to separate names.
              </div>
            </div>

            <div className="settings-field">
              <div className="field-label">Green Zone Values (Completed)</div>
              <div className="zone-values">
                {renderValueTags('greenZoneValues')}
              </div>
              <div className="add-value">
                <Input
                  value={newGreenValue}
                  onChange={(e) => setNewGreenValue(e.target.value)}
                  placeholder="e.g., Fixed, Verified"
                />
                <Button
                  onClick={() => handleAddValue('greenZoneValues', newGreenValue)}
                  disabled={!newGreenValue.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="settings-field">
              <div className="field-label">Yellow Zone Values (In Progress)</div>
              <div className="zone-values">
                {renderValueTags('yellowZoneValues')}
              </div>
              <div className="add-value">
                <Input
                  value={newYellowValue}
                  onChange={(e) => setNewYellowValue(e.target.value)}
                  placeholder="e.g., In Progress"
                />
                <Button
                  onClick={() => handleAddValue('yellowZoneValues', newYellowValue)}
                  disabled={!newYellowValue.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="settings-field">
              <div className="field-label">Red Zone Values (Blocked)</div>
              <div className="zone-values">
                {renderValueTags('redZoneValues')}
              </div>
              <div className="add-value">
                <Input
                  value={newRedValue}
                  onChange={(e) => setNewRedValue(e.target.value)}
                  placeholder="e.g., Stuck"
                />
                <Button
                  onClick={() => handleAddValue('redZoneValues', newRedValue)}
                  disabled={!newRedValue.trim()}
                >
                  Add
                </Button>
              </div>
            </div>


            <div className="settings-field">
              <H3>Products</H3>
              {(settings.products || []).length === 0 ? (
                <div className="field-help">No products configured yet.</div>
              ) : (
                <div className="products-list">
                  {(settings.products || []).map(p => (
                    <div key={p.id} className="product-row">
                      {editProductId === p.id ? (
                        <>
                          <Input
                            value={editProductName}
                            onChange={(e) => setEditProductName(e.target.value)}
                            placeholder="Product name"
                          />
                          <input
                            className="product-color-input"
                            type="color"
                            value={p.color || generateColorFromString(p.name)}
                            title="Pick color"
                            onChange={(e) => {
                              const color = e.target.value;
                              setSettings(prev => ({
                                ...prev,
                                products: (prev.products || []).map(item => item.id === p.id ? { ...item, color } : item)
                              }));
                            }}
                          />
                          <Button onClick={handleSaveProduct} disabled={!editProductName.trim()}>Save</Button>
                          <Button onClick={() => { setEditProductId(null); setEditProductName(''); }}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Tag
                            readOnly
                            className="product-color-preview"
                            backgroundColor={p.color || generateColorFromString(p.name)}
                            textColor="#fff"
                            disabled
                          >
                            {p.name}
                          </Tag>
                          <Button onClick={() => startEditProduct(p)}>Edit</Button>
                          <Button onClick={() => handleDeleteProduct(p.id)}>Delete</Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="add-product">
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="New product name"
                />
                <Button onClick={handleAddProduct} disabled={!newProductName.trim()}>Add</Button>
              </div>
            </div>

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
