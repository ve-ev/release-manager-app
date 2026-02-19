import React from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import {AppSettings} from '../../interfaces';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const CustomFieldMapping: React.FC<Props> = ({ settings, setSettings }) => {
  const mapping = settings.customFieldMapping;

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
        value={mapping?.plannedReleaseField || ''}
        onChange={e => {
          const value = e.target.value;
          setSettings(prev => ({
            ...prev,
            customFieldMapping: {
              ...prev.customFieldMapping,
              plannedReleaseField: value
            }
          }));
        }}
        placeholder="e.g., Release Version"
      />
      <div className="field-help">Name of the custom field that stores the planned release value.</div>

      {mapping?.plannedReleaseField && (
        <>
          <div style={{margin: '12px 0'}}>
            <Checkbox
              label="Use existing field values in version selector"
              checked={!!mapping.useExistingFieldValues}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSettings(prev => ({
                  ...prev,
                  customFieldMapping: {
                    ...prev.customFieldMapping,
                    useExistingFieldValues: e.target.checked
                  }
                }));
              }}
            />
            <div className="field-help" style={{marginLeft: '24px', marginTop: '4px'}}>
              When enabled, the version field on the release form will show a dropdown with existing values from the custom field.
            </div>
          </div>
          {mapping.useExistingFieldValues && (
            <div style={{display: 'flex', gap: '16px', margin: '12px 0', marginLeft: '24px'}}>
              <Checkbox
                label="Include archived versions"
                checked={!!mapping.includeArchivedVersions}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSettings(prev => ({
                    ...prev,
                    customFieldMapping: {
                      ...prev.customFieldMapping,
                      includeArchivedVersions: e.target.checked
                    }
                  }));
                }}
              />
              <Checkbox
                label="Include released versions"
                checked={mapping.includeReleasedVersions !== false}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSettings(prev => ({
                    ...prev,
                    customFieldMapping: {
                      ...prev.customFieldMapping,
                      includeReleasedVersions: e.target.checked
                    }
                  }));
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CustomFieldMapping;
