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
        Choose the custom field that stores the release version. Use the field name from your project.
      </div>
      <div className="field-help" style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0f8ff', borderLeft: '3px solid #2196F3' }}>
        <strong>ℹ️ Workflow:</strong> When you change this field in an issue, the &#34;Update Releases on Custom Field Change&#34; workflow will sync the issue with the right release in this app. Make sure the workflow is enabled in your project.
      </div>
      <br/>

      <label htmlFor="plannedReleaseField">Release Field</label>
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
        placeholder="e.g., Release Version"
      />
      <div className="field-help">Name of the custom field that stores the planned release value.</div>
    </div>
  );
};

export default CustomFieldMapping;
