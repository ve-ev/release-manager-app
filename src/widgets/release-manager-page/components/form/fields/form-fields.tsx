import React from 'react';
import {Grid} from '@jetbrains/ring-ui-built/components/grid/grid';
import {ReleaseVersion} from '../../../interfaces';
import {PlannedOrMetaIssue} from '../../../interfaces';
import BasicInfo from './basic-info.tsx';
import Description from './description.tsx';
import PlannedIssues from '../planned-issues.tsx';
import AdditionalInfo from './additional-info.tsx';

interface FormFieldsProps {
  formData: ReleaseVersion;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTextareaChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleDateChange: (name: string) => (date: Date | null | undefined) => void;
  handleLinkedIssuesInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSearchIssues: () => void;
  handleRemoveIssue: (issueId: string) => void;
  linkedIssuesInput: string;
  isLoadingIssues: boolean;
  searchError?: string;
  versionError?: string;
  releaseDateError?: string;
  plannedIssuesExtraAction?: React.ReactNode;
  plannedIssuesReplacement?: React.ReactNode;
  onEditMetaIssue?: (issue: PlannedOrMetaIssue, index: number) => void;
}

const FormFields: React.FC<FormFieldsProps> = (props) => (
  <Grid>
    <BasicInfo
      formData={props.formData}
      handleInputChange={props.handleInputChange}
      handleDateChange={props.handleDateChange}
      versionError={props.versionError}
      releaseDateError={props.releaseDateError}
    />

    <Description
      formData={props.formData}
      handleTextareaChange={props.handleTextareaChange}
    />

    {props.plannedIssuesReplacement ? (
      props.plannedIssuesReplacement
    ) : (
      <PlannedIssues
        formData={props.formData}
        linkedIssuesInput={props.linkedIssuesInput}
        handleLinkedIssuesInputChange={props.handleLinkedIssuesInputChange}
        handleSearchIssues={props.handleSearchIssues}
        isLoadingIssues={props.isLoadingIssues}
        handleRemoveIssue={props.handleRemoveIssue}
        searchError={props.searchError}
        extraAction={props.plannedIssuesExtraAction}
        onEditMetaIssue={props.onEditMetaIssue}
      />
    )}

    <AdditionalInfo
      formData={props.formData}
      handleTextareaChange={props.handleTextareaChange}
    />
  </Grid>
);

export default FormFields;