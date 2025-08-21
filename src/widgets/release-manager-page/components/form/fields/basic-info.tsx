import React, {useEffect, useState} from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import {ReleaseVersion} from '../../../interfaces';
import {api} from '../../../app.tsx';

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
}

const BasicInfo: React.FC<BasicInfoProps> = ({
  formData,
  handleInputChange,
  handleDateChange,
  versionError,
  releaseDateError
}) => {
  const [productOptions, setProductOptions] = useState<Array<{key: string, label: string}>>([]);

  // Fetch products from settings
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const settings = await api.getAppSettings();
        const options = (settings.products || []).map(p => ({ key: p.name, label: p.name }));
        setProductOptions(options);
      } catch {
        // keep options empty on error
      }
    };

    fetchProducts();

    const onSettingsUpdated = () => fetchProducts();
    window.addEventListener('settings-updated', onSettingsUpdated as EventListener);
    return () => window.removeEventListener('settings-updated', onSettingsUpdated as EventListener);
  }, []);

  // Handle product selection
  const handleProductSelect = (selected: SelectItem<{key: string, label: string}> | null) => {
    if (selected) {
      // Create a synthetic event to match the handleInputChange signature
      const syntheticEvent = {
        target: {
          name: 'product',
          value: selected.key
        }
      } as React.ChangeEvent<HTMLInputElement>;

      handleInputChange(syntheticEvent);
    } else {
      // Handle null case (when selection is cleared)
      const syntheticEvent = {
        target: {
          name: 'product',
          value: ''
        }
      } as React.ChangeEvent<HTMLInputElement>;

      handleInputChange(syntheticEvent);
    }
  };
  
  // Status options
  const statusOptions = [
    { key: 'Planning', label: 'Planning' },
    { key: 'In progress', label: 'In progress' },
    { key: 'Released', label: 'Released' },
    { key: 'Overdue', label: 'Overdue' },
    { key: 'Canceled', label: 'Canceled' }
  ];
  
  // Handle status selection
  const handleStatusSelect = (selected: SelectItem<{key: string, label: string}> | null) => {
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
  };

  return (
    <>
      <Row className="flex-row">
        {productOptions.length > 0 ? (
          <>
            <Col xs={12} sm={6}>
              <div>
                <Select
                  selectedLabel="Product *"
                  data={productOptions}
                  selected={productOptions.find(option => option.key === formData.product)}
                  onSelect={handleProductSelect}
                  clear
                />
              </div>
            </Col>
            <Col xs={12} sm={6}>
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
            </Col>
          </>
        ) : (
          <Col xs={12} sm={12}>
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
          </Col>
        )}
      </Row>
      
      <Row>
        <Col xs={12} sm={6}>
          <div>
            <Select
              selectedLabel="Status"
              data={statusOptions}
              selected={statusOptions.find(option => option.key === formData.status)}
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