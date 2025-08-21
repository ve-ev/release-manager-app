import React from 'react';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';

// Import CSS classes
const styles = {
  formGroup: 'formGroup',
  label: 'label'
};

// Constants
const DEFAULT_ROWS = 5;

interface TextAreaFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}

const TextAreaField: React.FC<TextAreaFieldProps> = ({
  label,
  name,
  value,
  onChange,
  rows = DEFAULT_ROWS
}) => (
  <Row>
    <Col xs={12}>
      <div className={styles.formGroup}>
        <span className={styles.label}>{label}</span>
        <textarea
          className="ring-input ring-input-size_l"
          name={name}
          value={value || ''}
          onChange={onChange}
          rows={rows}
        />
      </div>
    </Col>
  </Row>
);

export default TextAreaField;