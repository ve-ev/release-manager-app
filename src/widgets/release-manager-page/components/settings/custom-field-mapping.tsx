import React from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';
import {AppSettings} from '../../interfaces';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const CustomFieldMapping: React.FC<Props> = ({ settings, setSettings }) => {
  const mapping = settings.customFieldMapping;

  return (
    <div className="settings-field custom-field-mapping">
      <div className="settings-section-heading">
        <H3>Custom Field Mapping</H3>
        <Tooltip
          title="Links a YouTrack custom field to releases so issues are auto-assigned when the field changes. Requires the 'Update Releases on Custom Field Change' workflow to be enabled in the project. 'Use existing field values' populates a dropdown of current field values when creating a release version."
        >
          <span className="settings-help-icon">?</span>
        </Tooltip>
      </div>
      <div className="field-help">
        Specify the custom field that stores the planned release version for issues.
      </div>
      <div className="field-help" style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0f8ff', borderLeft: '3px solid #2196F3' }}>
        <strong>ℹ️ Workflow:</strong> When this field is changed in an issue, the workflow will automatically sync the issue with the corresponding release. Ensure the workflow is enabled in your project.
      </div>
      <br/>

      <label className={'bold-label'} htmlFor="plannedReleaseField">Release Field</label>
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
          <div style={{marginTop: '20px', marginBottom: '12px'}}>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label style={{display: 'flex', height: '20px', gap: '4px'}}>
              <Checkbox
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
              Use existing field values in the version selector
            </label>
            <div className="field-help" style={{marginLeft: '24px', marginTop: '1px'}}>
              Show a dropdown with existing field values when creating a release version.
            </div>
          </div>
          {mapping.useExistingFieldValues && (
            <div style={{display: 'flex', gap: '10px', margin: '8px 0 12px 24px'}}>
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label style={{display: 'flex', gap: '4px'}}>
                <Checkbox
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
                Include archived versions
              </label>
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label style={{display: 'flex', gap: '4px'}}>
                <Checkbox
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
                Include released versions
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
};
