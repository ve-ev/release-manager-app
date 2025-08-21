import React, {useCallback, useEffect, useState} from 'react';
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

// Validate release version data
const validateReleaseVersion = (formData: ReleaseVersion): string[] => {
  const errors: string[] = [];

  // Only include non-field-specific errors in the general error list
  // Field-specific errors (version, releaseDate) are handled separately

  if (formData.featureFreezeDate && formData.releaseDate) {
    const freezeDate = new Date(formData.featureFreezeDate);
    const releaseDate = new Date(formData.releaseDate);

    if (freezeDate > releaseDate) {
      errors.push('Feature Freeze Date must be before Release Date');
    }
  }

  return errors;
};

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
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [linkedIssuesInput, setLinkedIssuesInput] = useState('');
  const [searchError, setSearchError] = useState<string>();
  const [showMetaIssueForm, setShowMetaIssueForm] = useState<boolean>(!!initialShowMetaIssueForm);
  const [editMetaIndex, setEditMetaIndex] = useState<number | null>(null);

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

  // Planned issues are now handled by fetchIssues function

  // Helper function to fetch a single issue
  const fetchSingleIssue = async (issueId: string): Promise<{
    found: boolean;
    issue?: {
      id: string;
      idReadable: string;
      summary: string;
    };
  }> => {
    try {
      const response = await host.fetchApp(`backend-global/issue?issueId=${encodeURIComponent(issueId)}`, { scope: false });

      if (response) {
        // Type assertion for response
        const issueResponse = response as {
          id: string;
          idReadable: string;
          summary: string;
        };

        return {
          found: true,
          issue: {
            id: issueResponse.id,
            idReadable: issueResponse.idReadable,
            summary: issueResponse.summary
          }
        };
      }
      return { found: false };
    } catch {
      return { found: false };
    }
  };

  // Function to update the planned issues list (memoized, uses functional state update to avoid stale closures)
  const updatePlannedIssues = React.useCallback((newIssues: Array<{id: string; idReadable: string; summary: string}>) => {
    if (newIssues.length === 0) {
      return;
    }

    setFormData(prev => {
      const existingIssues = prev.plannedIssues || [];

      // Filter out duplicates by checking if issue ID already exists
      const uniqueNewIssues = newIssues.filter(newIssue =>
        !existingIssues.some(existingIssue => existingIssue.id === newIssue.id)
      );

      // If all issues were duplicates, show a message
      if (uniqueNewIssues.length === 0) {
        setSearchError('All issues are already added to the list.');
        return prev;
      }

      const combinedIssues = [...existingIssues, ...uniqueNewIssues];
      return {
        ...prev,
        plannedIssues: combinedIssues
      };
    });
  }, [setFormData, setSearchError]);

  // Function to fetch issues based on input
  const fetchIssues = useCallback(async (input: string) => {
    const issueIds = input.split(',').map(id => id.trim()).filter(id => id);

    // If no issue IDs, do nothing
    if (issueIds.length === 0) {
      return;
    }

    const newIssues = [];
    const notFoundIssues = [];

    setIsLoadingIssues(true);

    // Fetch each issue's details
    for (const issueId of issueIds) {
      const result = await fetchSingleIssue(issueId);

      if (result.found && result.issue) {
        newIssues.push(result.issue);
      } else {
        notFoundIssues.push(issueId);
      }
    }

    setIsLoadingIssues(false);

    // Show error message if any issues weren't found
    if (notFoundIssues.length > 0) {
      setSearchError(`Could not find the following issues: ${notFoundIssues.join(', ')}`);
      // Only update the list if we found any valid issues
      if (newIssues.length > 0) {
        updatePlannedIssues(newIssues);
      }
    } else {
      setSearchError(undefined);
      // Update the list with found issues
      updatePlannedIssues(newIssues);
    }
  }, [updatePlannedIssues]);

  // Handle search button click
  const handleSearchIssues = useCallback(() => {
    // Clear any previous search error
    setSearchError(undefined);
    fetchIssues(linkedIssuesInput);
  }, [fetchIssues, linkedIssuesInput, setSearchError]);

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

  // Handle linked issues input changes
  const handleLinkedIssuesInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLinkedIssuesInput(value);

    // No automatic search triggering - only update the input value
  }, []);

  // Handle button click for form submission - avoids standard form submission to work around sandbox restrictions
  const handleButtonSubmit = async () => {
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
  };

  // Determine button text
  const getButtonText = () => {
    if (isSubmitting) {
      return <LoaderInline/>;
    }
    return releaseVersion?.id ? 'Update' : 'Create';
  };

  // Show ONLY MetaIssueForm when requested (for both add and edit flows)
  if (metaIssuesEnabled && showMetaIssueForm) {
    return (
      <div className={`${styles.container} meta-issue-form-container`}>
        <MetaIssueForm
          onSave={async (meta: MetaIssueData) => {
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
                id: `META-${Date.now()}`,
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
          }}
          onCancel={() => {
            setShowMetaIssueForm(false);
            setEditMetaIndex(null);
            // If MetaIssueForm was opened via Actions menu, close the whole form and return to the main page
            if (initialShowMetaIssueForm) {
              onCancel();
            }
          }}
          initialSummary={(editMetaIndex !== null && formData.plannedIssues && formData.plannedIssues[editMetaIndex]?.summary) || ''}
          initialRelatedIssueIds={(editMetaIndex !== null && formData.plannedIssues && (formData.plannedIssues[editMetaIndex]?.metaRelatedIssueIds || [])) || []}
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
            <Button onClick={() => { setEditMetaIndex(null); setShowMetaIssueForm(true); }}>Add Meta Issue</Button>
          ) : undefined}
          onEditMetaIssue={(issue, index) => { if (issue.isMeta) { setEditMetaIndex(index); setShowMetaIssueForm(true); } }}
        />

        <Panel className={styles.formPanel}>
          <div className={styles.buttons}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button primary onClick={handleButtonSubmit} disabled={isSubmitting}>
              {getButtonText()}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default ReleaseVersionForm;