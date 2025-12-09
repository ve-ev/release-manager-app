import React from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import {AppSettings} from '../../interfaces';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const CustomFieldMapping: React.FC<Props> = ({ settings, setSettings }) => {
  return (
    <div className="settings-field custom-field-mapping">
      <H3>Custom Field Mapping</H3>
      <div className="field-help">
        Map issue custom field used to mark planned release version. This is the name or ID of a custom field in your tracker.
      </div>
      <br/>

      <label htmlFor="plannedReleaseField">Planned Release Field</label>
      <Input
        id="plannedReleaseField"
        value={settings.customFieldMapping?.plannedReleaseField || ''}
        onChange={e => {
          const value = e.target.value;
          setSettings(prev => ({
            ...prev,
            customFieldMapping: {
              plannedReleaseField: value
            }
          }));
        }}
        placeholder="e.g., Planned Release"
      />
      <div className="field-help">Name or ID of the custom field that stores planned release value.</div>
    </div>
  );
};

export default CustomFieldMapping;
