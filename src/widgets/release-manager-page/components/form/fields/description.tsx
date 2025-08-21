import React from 'react';
import {ReleaseVersion} from '../../../interfaces';
import TextAreaField from './common/text-area-field.tsx';

interface DescriptionProps {
  formData: ReleaseVersion;
  handleTextareaChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const Description: React.FC<DescriptionProps> = ({
  formData,
  handleTextareaChange
}) => (
  <TextAreaField
    label="Description"
    name="description"
    value={formData.description || ''}
    onChange={handleTextareaChange}
  />
);

export default Description;