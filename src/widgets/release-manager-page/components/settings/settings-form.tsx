import React, { useState, useEffect } from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import { H3 } from '@jetbrains/ring-ui-built/components/heading/heading';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import { api } from '../../app';
import '../../styles/settings.css';
import {AppSettings} from '../../interfaces';


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
  const RANDOM_MULTIPLIER = 1000000; // used to generate client-side IDs for new products
  const DEFAULT_PRODUCT_COLORS = [
    '#5cb85c', // green
    '#337ab7', // blue
    '#f0ad4e', // orange
    '#5bc0de', // light blue
    '#d9534f', // red
    '#9370db', // medium purple
    '#20b2aa', // light sea green
    '#ff7f50'  // coral
  ];
  // State for storing progress settings
  const [settings, setSettings] = useState<AppSettings>({
    customFieldNames: [],
    greenZoneValues: [],
    yellowZoneValues: [],
    redZoneValues: []
  });
  const [customFieldNamesInput, setCustomFieldNamesInput] = useState<string>('');
  

  // State for storing form errors
  const [errors, setErrors] = useState<string[]>([]);
  
  // State for tracking loading and saving states
  const [isLoading, setIsLoading] = useState(true);
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
  const handleAddProduct = () => {
    const name = newProductName.trim();
    if (!name) { return; }
    const currentCount = (settings.products || []).length;
    const defaultColor = DEFAULT_PRODUCT_COLORS[currentCount % DEFAULT_PRODUCT_COLORS.length];
    const newProduct = { id: `${Date.now()}-${Math.floor(Math.random() * RANDOM_MULTIPLIER)}` , name, color: defaultColor };
    setSettings(prev => ({
      ...prev,
      products: [ ...(prev.products || []), newProduct ]
    }));
    setNewProductName('');
  };

  // Start editing a product
  const startEditProduct = (p: { id: string; name: string }) => {
    setEditProductId(p.id);
    setEditProductName(p.name);
  };

  // Save product name locally
  const handleSaveProduct = () => {
    if (!editProductId) { return; }
    const name = editProductName.trim();
    if (!name) { return; }
    setSettings(prev => ({
      ...prev,
      products: (prev.products || []).map(p => p.id === editProductId ? { ...p, id: editProductId, name } : p)
    }));
    setEditProductId(null);
    setEditProductName('');
  };

  // Delete product locally
  const handleDeleteProduct = (id: string) => {
    setSettings(prev => ({
      ...prev,
      products: (prev.products || []).filter(p => p.id !== id)
    }));
    if (editProductId === id) {
      setEditProductId(null);
      setEditProductName('');
    }
  };

  // Helper: fallback color detection (same as ProductTag)
  const getFallbackColor = (name: string) => {
    const SHIFT_FACTOR = 5;
    const hash = name.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << SHIFT_FACTOR) - acc);
    }, 0);
    const colors = [
      '#5cb85c', // green
      '#337ab7', // blue
      '#f0ad4e', // orange
      '#5bc0de', // light blue
      '#d9534f', // red
      '#9370db', // medium purple
      '#20b2aa', // light sea green
      '#ff7f50'  // coral
    ];
    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
  };

  // Fetch existing settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const response = await api.getAppSettings();
        const withDetectedProductColors = (response.products || []).map(p => ({
          ...p,
          color: p.color || getFallbackColor(p.name)
        }));
        setSettings({ ...response, products: withDetectedProductColors });
        const names = Array.isArray(response.customFieldNames) ? response.customFieldNames : [];
        setCustomFieldNamesInput(names.join('; '));
      } catch {
        setErrors(['Failed to load progress settings']);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, []);

  // Handle saving settings
  const handleSave = async () => {
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
  };

  // Handle adding a new value to a zone
  const handleAddValue = (zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues', value: string) => {
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
  };

  // Handle removing a value from a zone
  const handleRemoveValue = (zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues', value: string) => {
    setSettings(prev => ({
      ...prev,
      [zone]: prev[zone].filter(v => v !== value)
    }));
  };

  // Render value tags for a zone
  const renderValueTags = (zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues') => {
    return settings[zone].map(value => (
      <Tag
        key={value}
        onRemove={() => handleRemoveValue(zone, value)}
        className={`tag-${zone.replace('ZoneValues', '')}`}
      >
        {value}
      </Tag>
    ));
  };

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
                            value={p.color || getFallbackColor(p.name)}
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
                            backgroundColor={p.color || getFallbackColor(p.name)}
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