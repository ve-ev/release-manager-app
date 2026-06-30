import React, { useEffect, useState } from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';
import {AppSettings} from '../../interfaces';
import {API} from '../../api';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  api: API;
}

export const CustomFieldMapping: React.FC<Props> = ({ settings, setSettings, api }) => {
  const mapping = settings.customFieldMapping;
  const [availableFields, setAvailableFields] = useState<Array<{ name: string; localizedName: string | null }>>([]);
  const [fieldsLoaded, setFieldsLoaded] = useState(false);

  useEffect(() => {
    api.listProjectVersionFields().then(fields => {
      setAvailableFields(fields);
      setFieldsLoaded(true);
    }).catch(() => setFieldsLoaded(true));
  }, [api]);

  const configuredName = mapping?.plannedReleaseField || '';
  const lowerConfigured = configuredName.toLowerCase();
  const fieldMatch = availableFields.find(f =>
    f.name.toLowerCase() === lowerConfigured ||
    (f.localizedName && f.localizedName.toLowerCase() === lowerConfigured)
  );
  const showMismatchHint = fieldsLoaded && configuredName && !fieldMatch && availableFields.length > 0;

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
        value={configuredName}
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
        placeholder="e.g., Fix versions"
      />

      {showMismatchHint && (
        <div className="field-help" style={{ marginTop: '4px', padding: '6px 8px', backgroundColor: '#fff8e1', borderLeft: '3px solid #ff9800', color: '#5d4037' }}>
          <strong>⚠️ Field not found.</strong> Enter the REST API name, not the localised display name.
          {availableFields.length > 0 && (
            <>
              {' '}Available bundle fields:
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {availableFields.map(f => (
                  <li key={f.name} style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      customFieldMapping: { ...prev.customFieldMapping, plannedReleaseField: f.name }
                    }))}>
                    <strong>{f.name}</strong>
                    {f.localizedName && f.localizedName !== f.name && (
                      <span style={{ color: '#888', marginLeft: 4 }}>({f.localizedName})</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {fieldMatch && fieldMatch.localizedName && fieldMatch.localizedName !== fieldMatch.name && (
        <div className="field-help" style={{ marginTop: '4px', color: '#888' }}>
          Localised as &ldquo;{fieldMatch.localizedName}&rdquo; in your YouTrack instance.
        </div>
      )}

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
