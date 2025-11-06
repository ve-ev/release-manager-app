import React from 'react';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import {AppSettings} from '../../interfaces';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: string[];
  setErrors: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * Progress Tracking Settings component (left column)
 * - Custom field names
 * - Green/Yellow/Red zone values with add/remove
 * - Shows validation errors passed from parent
 */
export const ProgressTrackingSettings: React.FC<Props> = ({ settings, setSettings, errors, setErrors }) => {
  const initialCustomFieldNamesInput = React.useMemo(() => {
    const names = Array.isArray(settings.customFieldNames) ? settings.customFieldNames : [];
    return names.join('; ');
  }, [settings.customFieldNames]);

  const [customFieldNamesInput, setCustomFieldNamesInput] = React.useState<string>(initialCustomFieldNamesInput);
  const [newGreenValue, setNewGreenValue] = React.useState('');
  const [newYellowValue, setNewYellowValue] = React.useState('');
  const [newRedValue, setNewRedValue] = React.useState('');

  React.useEffect(() => {
    setCustomFieldNamesInput(initialCustomFieldNamesInput);
  }, [initialCustomFieldNamesInput]);

  const handleRemoveValue = React.useCallback((zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues', value: string) => {
    setSettings(prev => ({
      ...prev,
      [zone]: prev[zone].filter(v => v !== value)
    }));
  }, [setSettings]);

  const handleAddValue = React.useCallback((zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues', value: string) => {
    if (!value.trim()) { return; }

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

    if (zone === 'greenZoneValues') {setNewGreenValue('');}
    if (zone === 'yellowZoneValues') {setNewYellowValue('');}
    if (zone === 'redZoneValues') {setNewRedValue('');}

    setErrors([]);
  }, [settings.greenZoneValues, settings.yellowZoneValues, settings.redZoneValues, setErrors, setSettings]);

  const renderValueTags = React.useCallback((zone: 'greenZoneValues' | 'yellowZoneValues' | 'redZoneValues') => {
    return settings[zone].map(value => (
      <Tag key={value} onRemove={() => handleRemoveValue(zone, value)} className={`tag-${zone.replace('ZoneValues', '')}`}>
        {value}
      </Tag>
    ));
  }, [settings, handleRemoveValue]);

  return (
    <div className="settings-column left">
      <H3>Progress Tracking Settings</H3>
      <br/>

      {errors.length > 0 && (
        <div className="settings-errors">
          {errors.map((error) => (
            <ErrorMessage key={error}>{error}</ErrorMessage>
          ))}
        </div>
      )}

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
        <div className="zone-values">{renderValueTags('greenZoneValues')}</div>
        <div className="add-value">
          <Input value={newGreenValue} onChange={(e) => setNewGreenValue(e.target.value)} placeholder="e.g., Fixed, Verified"/>
          <Button onClick={() => handleAddValue('greenZoneValues', newGreenValue)} disabled={!newGreenValue.trim()}>Add</Button>
        </div>
      </div>

      <div className="settings-field">
        <div className="field-label">Yellow Zone Values (In Progress)</div>
        <div className="zone-values">{renderValueTags('yellowZoneValues')}</div>
        <div className="add-value">
          <Input value={newYellowValue} onChange={(e) => setNewYellowValue(e.target.value)} placeholder="e.g., In Progress"/>
          <Button onClick={() => handleAddValue('yellowZoneValues', newYellowValue)} disabled={!newYellowValue.trim()}>Add</Button>
        </div>
      </div>

      <div className="settings-field">
        <div className="field-label">Red Zone Values (Blocked)</div>
        <div className="zone-values">{renderValueTags('redZoneValues')}</div>
        <div className="add-value">
          <Input value={newRedValue} onChange={(e) => setNewRedValue(e.target.value)} placeholder="e.g., Stuck"/>
          <Button onClick={() => handleAddValue('redZoneValues', newRedValue)} disabled={!newRedValue.trim()}>Add</Button>
        </div>
      </div>
    </div>
  );
};

export default ProgressTrackingSettings;
