import React, {useCallback, useEffect, useState, useMemo} from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import {ReleaseVersion} from '../../../interfaces';
import {api} from '../../../app.tsx';
import {useTagOptions, useAppConfig, useSettingsData} from '../../../hooks';
import {RELEASE_STATUS_OPTIONS} from '../../../utils/constants';

// Import CSS classes
const styles = {
  formGroup: 'formGroup',
  errorMessage: 'errorMessage',
  label: 'label',
  datePickerWrapper: 'datePickerWrapper'
};

interface BasicInfoProps {
  formData: ReleaseVersion;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDateChange: (name: string) => (date: Date | null | undefined) => void;
  versionError?: string;
  releaseDateError?: string;
  existingReleaseVersions?: ReleaseVersion[];
}

type VersionMode = 'select' | 'input';

// eslint-disable-next-line complexity
const BasicInfo: React.FC<BasicInfoProps> = ({
  formData,
  handleInputChange,
  handleDateChange,
  versionError,
  releaseDateError,
  existingReleaseVersions
}) => {
  // Use custom hook to fetch and manage tag options (backed by products in settings)
  const productOptions = useTagOptions(api);
  const appConfig = useAppConfig(api);
  const { settings } = useSettingsData(api);

  const fieldName = settings.customFieldMapping?.plannedReleaseField;
  const useExistingFieldValues = !!settings.customFieldMapping?.useExistingFieldValues;
  const isCustomFieldMode = appConfig.customFieldsMapping && !!fieldName && useExistingFieldValues;

  // Version field options state
  const [versionOptions, setVersionOptions] = useState<Array<{name: string; releaseDate: string | null; isReleased: boolean; isArchived: boolean}>>([]);
  const [versionMode, setVersionMode] = useState<VersionMode>('select');

  // Fetch version field values when custom field mode is active
  useEffect(() => {
    if (!isCustomFieldMode || !fieldName) { return undefined; }
    let cancelled = false;
    api.getVersionFieldValues(fieldName).then(response => {
      if (!cancelled) {
        setVersionOptions(response.values || []);
      }
    }).catch(() => {
      // silently ignore
    });
    return () => { cancelled = true; };
  }, [isCustomFieldMode, fieldName]);

  // Build set of version names already used by existing releases (excluding current release being edited)
  const usedVersionNames = useMemo(() => {
    const names = new Set<string>();
    if (existingReleaseVersions) {
      for (const rv of existingReleaseVersions) {
        if (rv.version && rv.id !== formData.id) {
          names.add(rv.version);
        }
      }
    }
    return names;
  }, [existingReleaseVersions, formData.id]);

  // Build select data: apply archived/released filters and hide already-used versions
  const versionSelectData = useMemo(() => {
    const includeArchived = !!settings.customFieldMapping?.includeArchivedVersions;
    const includeReleased = settings.customFieldMapping?.includeReleasedVersions !== false;
    return versionOptions
      .filter(v => {
        if (!includeArchived && v.isArchived) { return false; }
        if (!includeReleased && v.isReleased) { return false; }
        return !usedVersionNames.has(v.name);

      })
      .map(v => ({
        key: v.name,
        label: v.name,
        description: v.releaseDate ? `Release: ${v.releaseDate}` : undefined
      }));
  }, [versionOptions, settings.customFieldMapping?.includeArchivedVersions, settings.customFieldMapping?.includeReleasedVersions, usedVersionNames]);

  // Handle tag selection
  const handleProductSelect = useCallback((selected: SelectItem<{key: string, label: string}> | null) => {
    if (selected) {
      // Create a synthetic event to match the handleInputChange signature
      const syntheticEvent = {
        target: {
          name: 'product', // underlying field name kept for backward compatibility
          value: selected.key
        }
      } as React.ChangeEvent<HTMLInputElement>;

      handleInputChange(syntheticEvent);
    } else {
      // Handle null case (when selection is cleared)
      const syntheticEvent = {
        target: {
          name: 'product', // underlying field name kept for backward compatibility
          value: ''
        }
      } as React.ChangeEvent<HTMLInputElement>;

      handleInputChange(syntheticEvent);
    }
  }, [handleInputChange]);

  // Handle status selection
  const handleStatusSelect = useCallback((selected: SelectItem<{key: string, label: string}> | null) => {
    if (selected) {
      // Create a synthetic event to match the handleInputChange signature
      const syntheticEvent = {
        target: {
          name: 'status',
          value: selected.key
        }
      } as React.ChangeEvent<HTMLInputElement>;

      handleInputChange(syntheticEvent);
    } else {
      // Default to 'Planning' if cleared
      const syntheticEvent = {
        target: {
          name: 'status',
          value: 'Planning'
        }
      } as React.ChangeEvent<HTMLInputElement>;

      handleInputChange(syntheticEvent);
    }
  }, [handleInputChange]);

  // Handle version selection from Select — also auto-set release date if available
  const handleVersionSelect = useCallback((selected: SelectItem<{key: string, label: string}> | null) => {
    const syntheticEvent = {
      target: {
        name: 'version',
        value: selected ? selected.key : ''
      }
    } as React.ChangeEvent<HTMLInputElement>;
    handleInputChange(syntheticEvent);

    // Auto-set release date from custom field value if present
    if (selected) {
      const match = versionOptions.find(v => v.name === selected.key);
      if (match?.releaseDate) {
        handleDateChange('releaseDate')(new Date(match.releaseDate));
      }
    }
  }, [handleInputChange, handleDateChange, versionOptions]);


  // Render version field: Select or Input depending on mode when custom field mode, plain Input otherwise
  const renderVersionField = () => {
    if (isCustomFieldMode) {
      const selectedItem = formData.version
        ? versionSelectData.find(o => o.key === formData.version) || {key: formData.version, label: formData.version}
        : null;
      return (
        <div>
          <div className={styles.label}>Version *</div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            {versionMode === 'input' ? (
              <div style={{flex: 1}}>
                <Input
                  name="version"
                  value={formData.version}
                  onChange={handleInputChange}
                  required
                />
              </div>
            ) : (
              <div style={{flex: 1}}>
                <Select
                  data={versionSelectData}
                  selected={selectedItem}
                  onSelect={handleVersionSelect}
                />
              </div>
            )}
            <Toggle
              checked={versionMode === 'input'}
              onChange={() => setVersionMode(versionMode === 'select' ? 'input' : 'select')}
            >
              <div style={{opacity: 0.5, pointerEvents: 'none'}}>Add New Value</div>
            </Toggle>
          </div>
          {versionError && (
            <div className={styles.errorMessage}>
              {versionError}
            </div>
          )}
        </div>
      );
    }
    return (
      <div>
        <Input
          label="Version *"
          name="version"
          value={formData.version}
          onChange={handleInputChange}
          required
        />
        {versionError && (
          <div className={styles.errorMessage}>
            {versionError}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Row className="flex-row">
        {productOptions.length > 0 ? (
          <>
            <Col xs={12} sm={6}>
              <div>
                <Select
                  selectedLabel="Tag"
                  data={productOptions}
                  selected={productOptions.find(option => option.key === formData.product)}
                  onSelect={handleProductSelect}
                  clear
                />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              {renderVersionField()}
            </Col>
          </>
        ) : (
          <Col xs={12} sm={12}>
            {renderVersionField()}
          </Col>
        )}
      </Row>

      <Row>
        <Col xs={12} sm={6}>
          <div>
            <Select
              selectedLabel="Status"
              data={RELEASE_STATUS_OPTIONS as unknown as Array<{key: string, label: string}>}
              selected={RELEASE_STATUS_OPTIONS.find(option => option.key === formData.status)}
              onSelect={handleStatusSelect}
            />
          </div>
        </Col>
      </Row>

      <Row className="flex-row">
        <Col xs={12} sm={6}>
          <div className={styles.datePickerWrapper}>
            <div className={styles.label}>Feature Freeze Date</div>
            <DatePicker
              date={formData.featureFreezeDate ? new Date(formData.featureFreezeDate) : null}
              onChange={handleDateChange('featureFreezeDate')}
              size={Size.M}
            />
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className={styles.datePickerWrapper}>
            <div className={styles.label}>Release Date *</div>
            <DatePicker
              date={formData.releaseDate ? new Date(formData.releaseDate) : null}
              onChange={handleDateChange('releaseDate')}
              size={Size.M}
            />
            {releaseDateError && (
              <div className={styles.errorMessage}>
                {releaseDateError}
              </div>
            )}
          </div>
        </Col>
      </Row>
    </>
  );
};

export default BasicInfo;
