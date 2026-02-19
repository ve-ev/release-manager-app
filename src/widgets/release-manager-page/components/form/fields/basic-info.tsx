import React, {useCallback, useEffect, useState, useMemo} from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
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

  // Fetch version field values when custom field mode is active
  useEffect(() => {
    if (!isCustomFieldMode || !fieldName) { return; }
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
        if (usedVersionNames.has(v.name)) { return false; }
        return true;
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

  // Handle version selection from Select
  const handleVersionSelect = useCallback((selected: SelectItem<{key: string, label: string}> | null) => {
    const syntheticEvent = {
      target: {
        name: 'version',
        value: selected ? selected.key : ''
      }
    } as React.ChangeEvent<HTMLInputElement>;
    handleInputChange(syntheticEvent);
  }, [handleInputChange]);

  // Handle adding a new custom version value
  const handleVersionAdd = useCallback((value: string) => {
    // Add the new value to local options so it appears in the dropdown
    setVersionOptions(prev => {
      if (prev.some(v => v.name === value)) { return prev; }
      return [...prev, { name: value, releaseDate: null, isReleased: false, isArchived: false }];
    });
    const syntheticEvent = {
      target: {
        name: 'version',
        value
      }
    } as React.ChangeEvent<HTMLInputElement>;
    handleInputChange(syntheticEvent);
  }, [handleInputChange]);

  // Render version field: Select with allowAny when custom field mode, plain Input otherwise
  const renderVersionField = () => {
    if (isCustomFieldMode) {
      const selectedItem = formData.version
        ? versionSelectData.find(o => o.key === formData.version) || {key: formData.version, label: formData.version}
        : null;
      return (
        <div>
          <Select
            selectedLabel="Version *"
            data={versionSelectData}
            selected={selectedItem}
            onSelect={handleVersionSelect}
            allowAny
            add={{alwaysVisible: true, prefix: 'Add new: '}}
            onAdd={handleVersionAdd}
            filter
            clear
          />
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
