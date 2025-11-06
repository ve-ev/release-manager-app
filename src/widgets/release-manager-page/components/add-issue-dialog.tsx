import React, {memo, useCallback, useEffect, useState} from 'react';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import {ReleaseVersion, PlannedOrMetaIssue} from '../interfaces';
import {host} from '../app.tsx';
import {useInitialRelatedIssues, useIssueSearch} from '../hooks';
import PlannedIssues from './form/planned-issues.tsx';
import '../styles/add-issue-dialog.css';
import '../styles/release-version-form.css';
import ButtonGroup from "@jetbrains/ring-ui-built/components/button-group/button-group";

interface AddIssueDialogProps {
  open: boolean;
  item: ReleaseVersion;
  onClose: () => void;
  onSave: (updated: ReleaseVersion) => Promise<void> | void;
  isLoadingIssues: boolean;
  searchError?: string;
  searchAndResolve: (query: string, existing: Array<{id: string; idReadable?: string; summary: string}>) => Promise<Array<{id: string; idReadable?: string; summary: string}>>;
  metaIssuesEnabled?: boolean;
}

const AddIssueDialog: React.FC<AddIssueDialogProps> = ({
  open,
  item,
  onClose,
  onSave,
  isLoadingIssues,
  searchError,
  searchAndResolve,
  metaIssuesEnabled = true
}) => {
  const [mode, setMode] = useState<'existing' | 'meta'>(() => (metaIssuesEnabled ? 'existing' : 'existing'));
  // Keep a local copy to reflect changes immediately in the dialog
  const [localItem, setLocalItem] = useState<ReleaseVersion>(item);
  useEffect(() => {
    if (open) {
      setLocalItem(item);
    }
  }, [item, open]);

  // Existing issues (PlannedIssues) — copy usage from FormFields, but with isolated input in the dialog
  const [linkedIssuesInputExisting, setLinkedIssuesInputExisting] = useState<string>('');

  // Meta issue form state — copied from meta-issue-form for consistent look & behavior
  const [metaSummary, setMetaSummary] = useState<string>('');
  const [linkedIssuesInputMeta, setLinkedIssuesInputMeta] = useState<string>('');
  const [metaErrors, setMetaErrors] = useState<string[]>([]);
  const [isSubmittingMeta, setIsSubmittingMeta] = useState<boolean>(false);

  const { relatedIssues, setRelatedIssues, isLoading: isLoadingInitialRelated } = useInitialRelatedIssues(host, []);
  const { isLoadingIssues: isLoadingIssuesHook, searchError: metaSearchError, searchIssues, setSearchError } = useIssueSearch(host);

  // Existing: handlers copied conceptually from edit form, adapted to dialog context
  const handleSearchExisting = useCallback(async () => {
    const existingList = (localItem.plannedIssues || []) as Array<{id: string; idReadable?: string; summary: string}>;
    const uniqueIssues = await searchAndResolve(linkedIssuesInputExisting, existingList);
    if (uniqueIssues.length > 0) {
      const updated: ReleaseVersion = {
        ...localItem,
        plannedIssues: [...(localItem.plannedIssues || []), ...uniqueIssues]
      };
      setLocalItem(updated);
      await onSave(updated);
    }
  }, [localItem, linkedIssuesInputExisting, searchAndResolve, onSave]);

  const handleRemoveExisting = useCallback(async (issueId: string) => {
    const updated: ReleaseVersion = {
      ...localItem,
      plannedIssues: (localItem.plannedIssues || []).filter(it => it.id !== issueId)
    };
    setLocalItem(updated);
    await onSave(updated);
  }, [localItem, onSave]);

  // Meta: copied from meta-issue-form
  const validateMetaIssue = (summary: string, relIssues: Array<{id: string}>): string[] => {
    const errs: string[] = [];
    if (!summary || !summary.trim()) {
      errs.push('Issue summary is required');
    }
    if (!relIssues || relIssues.length === 0) {
      errs.push('At least one related issue is required');
    }
    return errs;
  };

  const handleSearchMetaRelated = useCallback(async () => {
    const uniqueIssues = await searchIssues(linkedIssuesInputMeta, relatedIssues);
    if (uniqueIssues.length > 0) {
      setRelatedIssues(prev => [...(prev || []), ...uniqueIssues]);
    }
  }, [linkedIssuesInputMeta, relatedIssues, searchIssues, setRelatedIssues]);

  const handleRemoveMetaRelated = useCallback((issueId: string) => {
    setRelatedIssues(prev => (prev || []).filter(it => it.id !== issueId));
  }, [setRelatedIssues]);

  const handleMetaSubmit = useCallback(async () => {
    const errs = validateMetaIssue(metaSummary, relatedIssues);
    setMetaErrors(errs);
    if (errs.length > 0) {return;}
    setIsSubmittingMeta(true);
    try {
      const newItem: PlannedOrMetaIssue = {
        id: `META-${Date.now()}`,
        idReadable: 'META',
        summary: metaSummary.trim(),
        isMeta: true,
        metaRelatedIssueIds: relatedIssues.map(it => it.id)
      };
      const updated = { ...localItem, plannedIssues: [...(localItem.plannedIssues || []), newItem] } as ReleaseVersion;
      setLocalItem(updated);
      await onSave(updated);
      // reset meta form for convenience
      setMetaSummary('');
      setLinkedIssuesInputMeta('');
      setRelatedIssues([]);
      setSearchError(undefined);
      // Close dialog after adding meta issue
      onClose();
    } finally {
      setIsSubmittingMeta(false);
    }
  }, [localItem, metaSummary, relatedIssues, onSave, setRelatedIssues, setSearchError, onClose]);

  if (!open) { return null; }

  return (
    <div className="add-issue-overlay" role="dialog" aria-modal="true" data-test="add-issue-dialog">
      <Panel className={`add-issue-panel formPanel`}>
        <div className="add-issue-header">
          <div className="title">{mode === 'meta' ? 'Add Meta Issue' : 'Add Issue'}</div>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
        {metaIssuesEnabled && (
          <ButtonGroup className="type-toggle" aria-label="Issue type toggle">
            <Button primary={mode === 'existing'} onClick={() => setMode('existing')}>Existing</Button>
            <Button primary={mode === 'meta'} onClick={() => setMode('meta')}>Meta</Button>
          </ButtonGroup>
        )}
        <div className="add-issue-container" style={{ padding: 12 }}>
          {/* EXISTING: copy of FormFields -> PlannedIssues usage */}
          <div style={{ display: mode === 'existing' ? 'block' : 'none' }}>
            <PlannedIssues
              formData={localItem}
              linkedIssuesInput={linkedIssuesInputExisting}
              handleLinkedIssuesInputChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkedIssuesInputExisting(e.target.value)}
              handleSearchIssues={handleSearchExisting}
              isLoadingIssues={isLoadingIssues}
              handleRemoveIssue={handleRemoveExisting}
              searchError={searchError}
              label="Planned Issues (comma-separated issue IDs)"
            />
          </div>

          {/* META: copy of meta-issue-form fields and related issues */}
          <div style={{ display: mode === 'meta' ? 'block' : 'none' }}>
            <div className="meta-issue-form-container container">

              {metaErrors.length > 0 && (
                <div className="error">
                  {metaErrors.map(err => (
                    <ErrorMessage key={`meta-err-${err}`}>{err}</ErrorMessage>
                  ))}
                </div>
              )}

              <div className="formGroup">
                <Input
                  label="Issue summary"
                  name="metaIssueSummary"
                  value={metaSummary}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetaSummary(e.target.value)}
                />
              </div>

              <PlannedIssues
                formData={{ id: '', version: '', releaseDate: '', plannedIssues: relatedIssues } as ReleaseVersion}
                linkedIssuesInput={linkedIssuesInputMeta}
                handleLinkedIssuesInputChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkedIssuesInputMeta(e.target.value)}
                handleSearchIssues={handleSearchMetaRelated}
                isLoadingIssues={isLoadingIssuesHook || isLoadingInitialRelated}
                handleRemoveIssue={handleRemoveMetaRelated}
                searchError={metaSearchError}
                label="Related Issues (comma-separated issue IDs)"
              />

              <div className="buttons" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <Button primary onClick={handleMetaSubmit} disabled={isSubmittingMeta}>
                  {isSubmittingMeta ? <LoaderInline/> : 'Add Meta Issue'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
};

export default memo(AddIssueDialog);
