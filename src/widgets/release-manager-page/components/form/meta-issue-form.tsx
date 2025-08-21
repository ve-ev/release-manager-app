import React, {useCallback, useEffect, useState} from 'react';
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
    // Local state for summary and related issues (reuse structure of plannedIssues)
    const [summary, setSummary] = useState<string>(initialSummary);
    const [relatedIssues, setRelatedIssues] = useState<Array<{ id: string; idReadable: string; summary: string }>>([]);
    const [linkedIssuesInput, setLinkedIssuesInput] = useState<string>(initialRelatedIssueIds.join(', '));
    const [isLoadingIssues, setIsLoadingIssues] = useState<boolean>(false);
    const [searchError, setSearchError] = useState<string | undefined>(undefined);
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Helper to load issue data by ID
    const fetchSingleIssue = async (issueId: string): Promise<{
        found: boolean;
        issue?: { id: string; idReadable: string; summary: string };
    }> => {
        try {
            const response = await host.fetchApp(`backend-global/issue?issueId=${encodeURIComponent(issueId)}`, {scope: false});
            if (response) {
                const issueResponse = response as { id: string; idReadable: string; summary: string };
                return {
                    found: true,
                    issue: {id: issueResponse.id, idReadable: issueResponse.idReadable, summary: issueResponse.summary}
                };
            }
            return {found: false};
        } catch {
            return {found: false};
        }
    };

    // Initialize relatedIssues from initial ids if provided
    useEffect(() => {
        const load = async () => {
            if (!initialRelatedIssueIds || initialRelatedIssueIds.length === 0) {
                return;
            }
            setIsLoadingIssues(true);
            const found: Array<{ id: string; idReadable: string; summary: string }> = [];
            for (const id of initialRelatedIssueIds) {
                const res = await fetchSingleIssue(id);
                if (res.found && res.issue) {
                    found.push(res.issue);
                }
            }
            setRelatedIssues(found);
            setIsLoadingIssues(false);
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const validate = (): string[] => {
        const errs: string[] = [];
        if (!summary || summary.trim() === '') {
            errs.push('Issue summary is required');
        }
        if (!relatedIssues || relatedIssues.length === 0) {
            errs.push('Please add at least one related issue');
        }
        return errs;
    };

    // Add issues from comma-separated input
    const handleSearchIssues = useCallback(async () => {
        setSearchError(undefined);
        const ids = (linkedIssuesInput || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (ids.length === 0) {
            return;
        }

        setIsLoadingIssues(true);
        const newIssues: Array<{ id: string; idReadable: string; summary: string }> = [];
        const notFound: string[] = [];

        for (const id of ids) {
            const res = await fetchSingleIssue(id);
            if (res.found && res.issue) {
                newIssues.push(res.issue);
            } else {
                notFound.push(id);
            }
        }
        setIsLoadingIssues(false);

        if (notFound.length > 0) {
            setSearchError(`Could not find the following issues: ${notFound.join(', ')}`);
            if (newIssues.length === 0) {
                return;
            }
        }

        setRelatedIssues(prev => {
            const existing = prev || [];
            const unique = newIssues.filter(ni => !existing.some(e => e.id === ni.id));
            return unique.length ? [...existing, ...unique] : existing;
        });
    }, [linkedIssuesInput]);

    const handleRemoveIssue = useCallback((issueId: string) => {
        setRelatedIssues(prev => (prev || []).filter(it => it.id !== issueId));
    }, []);

    const handleSubmit = async () => {
        const v = validate();
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
    };

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

            {(() => {
                const tmpFormData: ReleaseVersion = {
                    id: '',
                    version: '',
                    releaseDate: '',
                    plannedIssues: relatedIssues
                };
                return (
                    <PlannedIssues
                        formData={tmpFormData}
                        linkedIssuesInput={linkedIssuesInput}
                        handleLinkedIssuesInputChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkedIssuesInput(e.target.value)}
                        handleSearchIssues={handleSearchIssues}
                        isLoadingIssues={isLoadingIssues}
                        handleRemoveIssue={handleRemoveIssue}
                        searchError={searchError}
                        label="Related Issues (comma-separated issue IDs)"
                    />
                );
            })()}

            <Panel className={styles.formPanel}>
                <div className={styles.buttons}>
                    <Button onClick={onCancel}>Cancel</Button>
                    <Button primary onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <LoaderInline/> : (isEdit ? 'Save' : 'Add Meta Issue')}
                    </Button>
                </div>
            </Panel>
        </div>
    );
};

export default MetaIssueForm;
