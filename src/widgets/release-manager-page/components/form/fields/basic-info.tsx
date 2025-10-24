import React, {useCallback} from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import {ReleaseVersion} from '../../../interfaces';
import {api} from '../../../app.tsx';
import {useProductOptions} from '../../../hooks/useProductOptions';
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
}

const BasicInfo: React.FC<BasicInfoProps> = ({
  formData,
  handleInputChange,
  handleDateChange,
  versionError,
  releaseDateError
}) => {
  // Use custom hook to fetch and manage product options
  const productOptions = useProductOptions(api);

  // Handle product selection
  const handleProductSelect = useCallback((selected: SelectItem<{key: string, label: string}> | null) => {
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