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
        Map issue custom fields used to mark planned and released versions. These are names or IDs of custom fields in your tracker.
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
              plannedReleaseField: value,
              releasedField: prev.customFieldMapping?.releasedField,
              valueTemplate: prev.customFieldMapping?.valueTemplate
            }
          }));
        }}
        placeholder="e.g., Planned Release"
      />
      <div className="field-help">Name or ID of the custom field that stores planned release value.</div>
      <br/>

      <label htmlFor="releasedField">Released Field</label>
      <Input
        id="releasedField"
        value={settings.customFieldMapping?.releasedField || ''}
        onChange={e => {
          const value = e.target.value;
          setSettings(prev => ({
            ...prev,
            customFieldMapping: {
              plannedReleaseField: prev.customFieldMapping?.plannedReleaseField,
              releasedField: value,
              valueTemplate: prev.customFieldMapping?.valueTemplate
            }
          }));
        }}
        placeholder="e.g., Released In"
      />
      <div className="field-help">Name or ID of the custom field that indicates the released version.</div>
      <br/>

      <label htmlFor="valueTemplate">Value Template</label>
      <Input
        id="valueTemplate"
        value={settings.customFieldMapping?.valueTemplate || ''}
        onChange={e => {
          const value = e.target.value;
          setSettings(prev => ({
            ...prev,
            customFieldMapping: {
              plannedReleaseField: prev.customFieldMapping?.plannedReleaseField,
              releasedField: prev.customFieldMapping?.releasedField,
              valueTemplate: value
            }
          }));
        }}
        placeholder="e.g., ${version}"
      />
      <div className="field-help">Template for the value written to the fields. You can use {'${version}'} placeholder.</div>
    </div>
  );
};

export default CustomFieldMapping;
