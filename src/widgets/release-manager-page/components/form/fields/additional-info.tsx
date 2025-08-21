import React from 'react';
import {ReleaseVersion} from '../../../interfaces';
import TextAreaField from './common/text-area-field.tsx';

interface AdditionalInfoProps {
  formData: ReleaseVersion;
  handleTextareaChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const AdditionalInfo: React.FC<AdditionalInfoProps> = ({
  formData,
  handleTextareaChange
}) => (
  <TextAreaField
    label="Additional info"
    name="additionalInfo"
    value={formData.additionalInfo || ''}
    onChange={handleTextareaChange}
  />
);

export default AdditionalInfo;