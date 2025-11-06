import React, {useCallback, useEffect, useState, useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
// Import host from app.tsx instead of registering a new instance
import {host} from '../../app.tsx';
import '../../styles/release-version-form.css';
import FormFields from './fields/form-fields.tsx';
import {ReleaseVersion, PlannedOrMetaIssue} from '../../interfaces';
import MetaIssueForm, { MetaIssueData } from './meta-issue-form.tsx';
import {validateReleaseVersion} from '../../utils/validation-helpers';
import {useIssueSearch} from '../../hooks';
import {generateClientId} from '../../utils/id-generator';

// Define the form props
interface ReleaseVersionFormProps {
  releaseVersion?: ReleaseVersion;
  onSave: (releaseVersion: ReleaseVersion) => Promise<void>;
  onCancel: () => void;
  metaIssuesEnabled?: boolean;
  initialShowMetaIssueForm?: boolean;
}

// Import CSS classes
const styles = {
  container: 'container',
  formGroup: 'formGroup',
  buttons: 'buttons',
  error: 'error',
  heading: 'heading',
  markdownEditor: 'markdownEditor',
  markdownPreview: 'markdownPreview',
  linkedIssueItem: 'linkedIssueItem',
  issueIdBadge: 'issueIdBadge',
  issueSearchContainer: 'issueSearchContainer',
  issueSearchInput: 'issueSearchInput',
  errorMessage: 'errorMessage',
  issueItemContent: 'issueItemContent',
  issuesList: 'issuesList',
  issuesListTitle: 'issuesListTitle',
  previewTitle: 'previewTitle',
  monospaceInput: 'monospaceInput',
  removeButton: 'removeButton',
  issuesTable: 'issuesTable',
  label: 'label',
  datePickerWrapper: 'datePickerWrapper',
  formPanel: 'formPanel'
};

// All form field components have been moved to separate files in the components directory

const ReleaseVersionForm: React.FC<ReleaseVersionFormProps> = ({releaseVersion, onSave, onCancel, metaIssuesEnabled, initialShowMetaIssueForm}) => {
  // Initialize form state
  const [formData, setFormData] = useState<ReleaseVersion>({
    id: '',  // Empty id for new release versions
    version: '',
    description: '',
    featureFreezeDate: '',
    releaseDate: '',
    product: '',
    status: 'Planning', // Default status
    plannedIssues: [],
    additionalInfo: ''
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [versionError, setVersionError] = useState<string>();
  const [releaseDateError, setReleaseDateError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedIssuesInput, setLinkedIssuesInput] = useState('');
  const [showMetaIssueForm, setShowMetaIssueForm] = useState<boolean>(!!initialShowMetaIssueForm);
  const [editMetaIndex, setEditMetaIndex] = useState<number | null>(null);

  // Use custom hook for issue search functionality
  const { isLoadingIssues, searchError, searchIssues, setSearchError } = useIssueSearch(host);

  // Reference to store timeout ID for debounce
  const debounceTimeoutRef = React.useRef<number | null>(null);

  // Update form data when releaseVersion prop changes
  useEffect(() => {
    if (releaseVersion) {
      const updatedFormData = {
        ...releaseVersion,
        // Ensure plannedIssues is always an array
        plannedIssues: releaseVersion.plannedIssues || []
      };

      setFormData(updatedFormData);

      // Initialize linkedIssuesInput from plannedIssues
      if (updatedFormData.plannedIssues && updatedFormData.plannedIssues.length > 0) {
        setLinkedIssuesInput(updatedFormData.plannedIssues.map(issue => issue.id).join(', '));
      } else {
        setLinkedIssuesInput('');
      }
    } else {
      // Reset form for new release version
      setLinkedIssuesInput('');
    }

    // Clear any search errors when form is reset or new release version is loaded
    setSearchError(undefined);
  }, [releaseVersion]);

  // Clean up debounce timeout when component unmounts
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current !== null) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target;
    setFormData({
      ...formData,
      [name]: value
    });

    // Clear field-specific errors when user makes changes
    if (name === 'version') {
      setVersionError(undefined);
    }
  };

  // Handle textarea changes
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const {name, value} = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };


  // Handle date changes
  const handleDateChange = (name: string) => (date: Date | null | undefined) => {
    setFormData({
      ...formData,
      [name]: date ? date.toISOString().split('T')[0] : ''
    });

    // Clear field-specific errors when user makes changes
    if (name === 'releaseDate') {
      setReleaseDateError(undefined);
    }
  };

  // Handle search button click - uses shared issue search hook
  const handleSearchIssues = useCallback(async () => {
    const existingIssues = (formData.plannedIssues || []) as Array<{id: string; idReadable?: string; summary: string}>;
    const uniqueIssues = await searchIssues(linkedIssuesInput, existingIssues);

    if (uniqueIssues.length > 0) {
      setFormData(prev => ({
        ...prev,
        plannedIssues: [...(prev.plannedIssues || []), ...uniqueIssues]
      }));
    }
  }, [linkedIssuesInput, formData.plannedIssues, searchIssues]);

  // Handle removing an issue from the list
  const handleRemoveIssue = useCallback((issueId: string) => {
    if (formData.plannedIssues) {
      const updatedIssues = formData.plannedIssues.filter(issue => issue.id !== issueId);
      setFormData({
        ...formData,
        plannedIssues: updatedIssues
      });
    }
  }, [formData]);


  // Handle saving meta issue data
  const handleMetaIssueSave = useCallback(async (meta: MetaIssueData) => {
    // Prepare updated planned issues array
    let updatedPlannedIssues: PlannedOrMetaIssue[] = [];

    if (editMetaIndex !== null && formData.plannedIssues && formData.plannedIssues[editMetaIndex]) {
      const updated = [...(formData.plannedIssues || [])];
      const existing = updated[editMetaIndex];
      updated[editMetaIndex] = {
        ...existing,
        summary: meta.summary,
        isMeta: true,
        idReadable: existing.idReadable || 'META',
        metaRelatedIssueIds: meta.relatedIssueIds,
      } as PlannedOrMetaIssue;
      updatedPlannedIssues = updated as PlannedOrMetaIssue[];
    } else {
      const newItem = {
        id: generateClientId('META'),
        idReadable: 'META',
        summary: meta.summary,
        isMeta: true,
        metaRelatedIssueIds: meta.relatedIssueIds
      } as PlannedOrMetaIssue;
      updatedPlannedIssues = [...(formData.plannedIssues || []), newItem] as PlannedOrMetaIssue[];
    }

    // If MetaIssueForm was opened from Actions menu, persist immediately and let parent close & refresh
    if (initialShowMetaIssueForm) {
      const updatedFormData: ReleaseVersion = { ...formData, plannedIssues: updatedPlannedIssues };
      await onSave(updatedFormData);
      return; // App will close the form and refresh on successful save
    }

    // Otherwise, update local state and return to ReleaseVersion form
    setFormData(prev => ({ ...prev, plannedIssues: updatedPlannedIssues }));
    setShowMetaIssueForm(false);
    setEditMetaIndex(null);
  }, [editMetaIndex, formData, initialShowMetaIssueForm, onSave]);

  // Handle canceling meta issue form
  const handleMetaIssueCancel = useCallback(() => {
    setShowMetaIssueForm(false);
    setEditMetaIndex(null);
    // If MetaIssueForm was opened via Actions menu, close the whole form and return to the main page
    if (initialShowMetaIssueForm) {
      onCancel();
    }
  }, [initialShowMetaIssueForm, onCancel]);

  // Handle linked issues input changes
  const handleLinkedIssuesInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLinkedIssuesInput(e.target.value);
  }, []);

  // Handle button click for form submission - avoids standard form submission to work around sandbox restrictions
  const handleButtonSubmit = useCallback(async () => {
    const validationErrors = validateReleaseVersion(formData);
    setErrors(validationErrors);

    // Set field-specific errors
    setVersionError(!formData.version ? 'Version is required' : undefined);
    setReleaseDateError(!formData.releaseDate ? 'Release Date is required' : undefined);

    if (validationErrors.length === 0) {
      setIsSubmitting(true);
      try {
        await onSave(formData);
      } catch (error) {
        if (error instanceof Error) {
          setErrors([error.message]);
        } else {
          setErrors(['An unknown error occurred']);
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [formData, onSave]);

  // Determine button text
  const buttonText = useMemo(() => {
    if (isSubmitting) {
      return <LoaderInline/>;
    }
    return releaseVersion?.id ? 'Update' : 'Create';
  }, [isSubmitting, releaseVersion?.id]);

  // Memoize initial values for meta issue form
  const metaIssueInitialSummary = useMemo(() => {
    if (editMetaIndex !== null && formData.plannedIssues && formData.plannedIssues[editMetaIndex]) {
      return formData.plannedIssues[editMetaIndex].summary || '';
    }
    return '';
  }, [editMetaIndex, formData.plannedIssues]);

  const metaIssueInitialRelatedIds = useMemo(() => {
    if (editMetaIndex !== null && formData.plannedIssues && formData.plannedIssues[editMetaIndex]) {
      return (formData.plannedIssues[editMetaIndex] as PlannedOrMetaIssue).metaRelatedIssueIds || [];
    }
    return [];
  }, [editMetaIndex, formData.plannedIssues]);

  // Memoize the callback to add a new meta issue
  const handleAddMetaIssue = useCallback(() => {
    setEditMetaIndex(null);
    setShowMetaIssueForm(true);
  }, []);

  // Memoize the callback to edit an existing meta issue
  const handleEditMetaIssueClick = useCallback((issue: PlannedOrMetaIssue, index: number) => {
    if (issue.isMeta) {
      setEditMetaIndex(index);
      setShowMetaIssueForm(true);
    }
  }, []);

  // Show ONLY MetaIssueForm when requested (for both add and edit flows)
  if (metaIssuesEnabled && showMetaIssueForm) {
    return (
      <div className={`${styles.container} meta-issue-form-container`}>
        <MetaIssueForm
          onSave={handleMetaIssueSave}
          onCancel={handleMetaIssueCancel}
          initialSummary={metaIssueInitialSummary}
          initialRelatedIssueIds={metaIssueInitialRelatedIds}
          isEdit={editMetaIndex !== null}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.heading}>
        <H3>{releaseVersion?.id ? 'Edit Release Version' : 'Add Release Version'}</H3>
      </div>

      <div>
        {errors.length > 0 && (
          <div className={styles.error}>
            {errors.map((error) => (
              <ErrorMessage key={`error-${error}`}>{error}</ErrorMessage>
            ))}
          </div>
        )}

        <FormFields
          formData={formData}
          handleInputChange={handleInputChange}
          handleTextareaChange={handleTextareaChange}
          handleDateChange={handleDateChange}
          handleLinkedIssuesInputChange={handleLinkedIssuesInputChange}
          handleSearchIssues={handleSearchIssues}
          handleRemoveIssue={handleRemoveIssue}
          linkedIssuesInput={linkedIssuesInput}
          isLoadingIssues={isLoadingIssues}
          searchError={searchError}
          versionError={versionError}
          releaseDateError={releaseDateError}
          plannedIssuesExtraAction={metaIssuesEnabled ? (
            <Button onClick={handleAddMetaIssue}>Add Meta Issue</Button>
          ) : undefined}
          onEditMetaIssue={handleEditMetaIssueClick}
        />

        <Panel className={styles.formPanel}>
          <div className={styles.buttons}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button primary onClick={handleButtonSubmit} disabled={isSubmitting}>
              {buttonText}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default ReleaseVersionForm;
