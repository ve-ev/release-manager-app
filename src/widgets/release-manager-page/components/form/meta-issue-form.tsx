import React, {useCallback, useState, useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import {host} from '../../app.tsx';
import PlannedIssues from './planned-issues.tsx';
import {ReleaseVersion} from '../../interfaces';
import '../../styles/release-version-form.css';
import {validateMetaIssue} from '../../utils/validation-helpers';
import {useInitialRelatedIssues, useIssueSearch} from '../../hooks';

// Simple styles reuse from release-version-form.css
const styles = {
    container: 'container',
    heading: 'heading',
    formPanel: 'formPanel',
    buttons: 'buttons',
    formGroup: 'formGroup',
    error: 'error'
};

export interface MetaIssueData {
    summary: string;
    relatedIssueIds: string[];
}

interface MetaIssueFormProps {
    onSave: (meta: MetaIssueData) => Promise<void> | void,
    onCancel: () => void,
    initialSummary?: string,
    initialRelatedIssueIds?: string[],
    isEdit?: boolean
}

/**
 * Meta Issue Form
 * - Issue summary
 * - Related issues (reuses PlannedIssues component)
 */
const MetaIssueForm: React.FC<MetaIssueFormProps> = ({
                                                         onSave,
                                                         onCancel,
                                                         initialSummary = '',
                                                         initialRelatedIssueIds = [],
                                                         isEdit = false
                                                     }) => {
    // Local state for summary and form errors
    const [summary, setSummary] = useState<string>(initialSummary);
    const [linkedIssuesInput, setLinkedIssuesInput] = useState<string>(initialRelatedIssueIds.join(', '));
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Use custom hooks for data loading and issue search
    const { relatedIssues, setRelatedIssues, isLoading: isLoadingInitial } = useInitialRelatedIssues(host, initialRelatedIssueIds);
    const { isLoadingIssues, searchError, searchIssues} = useIssueSearch(host);

    // Add issues from comma-separated input
    const handleSearchIssues = useCallback(async () => {
      const uniqueIssues = await searchIssues(linkedIssuesInput, relatedIssues);
      if (uniqueIssues.length > 0) {
        setRelatedIssues(prev => [...(prev || []), ...uniqueIssues]);
      }
    }, [linkedIssuesInput, relatedIssues, searchIssues, setRelatedIssues]);

  const handleRemoveIssue = useCallback((issueId: string) => {
    setRelatedIssues(prev => (prev || []).filter(it => it.id !== issueId));
  }, [setRelatedIssues]);

  const handleSubmit = useCallback(async () => {
    const v = validateMetaIssue(summary, relatedIssues);
    setErrors(v);
    if (v.length > 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: MetaIssueData = {
        summary: summary.trim(),
        relatedIssueIds: relatedIssues.map(it => it.id)
      };
      await onSave(payload);
    } finally {
      setIsSubmitting(false);
    }
  }, [summary, relatedIssues, onSave]);

  // Memoize the temporary form data to prevent unnecessary recalculations
  const tmpFormData = useMemo((): ReleaseVersion => ({
    id: '',
    version: '',
    releaseDate: '',
    plannedIssues: relatedIssues
  }), [relatedIssues]);

    return (
      <div className={styles.container}>
        <div className={styles.heading}>
          <H3>{isEdit ? 'Edit Meta Issue' : 'Create Meta Issue'}</H3>
        </div>

        {errors.length > 0 && (
        <div className={styles.error}>
          {errors.map(err => (
            <ErrorMessage key={`err-${err}`}>{err}</ErrorMessage>
                    ))}
        </div>
            )}

        <div className={styles.formGroup}>
          <Input
            label="Issue summary"
            name="metaIssueSummary"
            value={summary}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSummary(e.target.value)}
          />
        </div>

        <div style={{paddingRight: '10px'}}>
          <PlannedIssues
            formData={tmpFormData}
            linkedIssuesInput={linkedIssuesInput}
            handleLinkedIssuesInputChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkedIssuesInput(e.target.value)}
            handleSearchIssues={handleSearchIssues}
            isLoadingIssues={isLoadingIssues || isLoadingInitial}
            handleRemoveIssue={handleRemoveIssue}
            searchError={searchError}
            label="Related Issues (comma-separated issue IDs)"
          />
        </div>

        <Panel className={styles.formPanel}>
          <div className={styles.buttons}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button primary onClick={handleSubmit} disabled={isSubmitting}>
              {/* eslint-disable-next-line no-nested-ternary */}
              {isSubmitting ? <LoaderInline/> : (isEdit ? 'Save' : 'Add Meta Issue')}
            </Button>
          </div>
        </Panel>
      </div>
    );
};

export default MetaIssueForm;
