import React, {useEffect, useRef, useState} from 'react';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import {ReleaseVersion} from '../../interfaces';
import {PlannedOrMetaIssue} from '../../interfaces';
import {AutoAttachBadge} from '../common';

// Import CSS classes
const styles = {
  formGroup: 'formGroup',
  issueSearchContainer: 'issueSearchContainer',
  issueSearchInput: 'issueSearchInput',
  errorMessage: 'errorMessage',
  issuesList: 'issuesList',
  issuesTable: 'issuesTable',
  issueIdBadge: 'issueIdBadge',
  removeButton: 'removeButton'
};

interface PlannedIssuesProps {
  formData: ReleaseVersion;
  linkedIssuesInput: string;
  handleLinkedIssuesInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSearchIssues: () => void;
  isLoadingIssues: boolean;
  handleRemoveIssue: (issueId: string) => void;
  searchError?: string;
  label?: string;
  extraAction?: React.ReactNode;
  onEditMetaIssue?: (issue: PlannedOrMetaIssue, index: number) => void;
  /** Auto-attach filter input. When set, the section offers "Issue IDs" and "Auto-attach filter" modes. */
  autoAttachFilter?: React.ReactNode;
}

type AddMode = 'ids' | 'filter';

const AddModeToggle: React.FC<{mode: AddMode; filterActive: boolean; onChange: (mode: AddMode) => void}> = ({mode, filterActive, onChange}) => (
  <div className="planned-issues-header">
    <span className="planned-issues-title">Planned Issues</span>
    <ButtonGroup aria-label="How to add planned issues">
      <Button primary={mode === 'ids'} onClick={() => onChange('ids')}>Issue IDs</Button>
      <Button primary={mode === 'filter'} onClick={() => onChange('filter')}>
        {filterActive ? 'Auto-attach filter (on)' : 'Auto-attach filter'}
      </Button>
    </ButtonGroup>
  </div>
);

// eslint-disable-next-line complexity
const PlannedIssues: React.FC<PlannedIssuesProps> = ({
  formData,
  handleLinkedIssuesInputChange,
  handleSearchIssues,
  isLoadingIssues,
  handleRemoveIssue,
  searchError,
  label,
  extraAction,
  onEditMetaIssue,
  autoAttachFilter
}) => {
  const [mode, setMode] = useState<AddMode>('ids');
  const modeChosenRef = useRef(false);

  // Release data loads after the first render: open the filter mode once if the release has a filter
  useEffect(() => {
    if (!modeChosenRef.current && formData.autoAttachQuery) {
      modeChosenRef.current = true;
      setMode('filter');
    }
  }, [formData.autoAttachQuery]);

  const handleModeChange = (next: AddMode) => {
    modeChosenRef.current = true;
    setMode(next);
  };
  const showIds = !autoAttachFilter || mode === 'ids';

  return (
    <Row className={'planned-issues'}>
      <Col xs={12}>
        <div className={styles.formGroup} style={{paddingRight: "8px"}}>
          {autoAttachFilter && (
          <AddModeToggle mode={mode} filterActive={!!formData.autoAttachQuery} onChange={handleModeChange}/>
        )}
          {/* Both inputs stay mounted so typed text and the filter preview survive a mode switch */}
          <div style={{display: showIds ? 'block' : 'none'}}>
            <div className={styles.issueSearchContainer}>
              <Input
                label={(
                  <span>
                    {label || (autoAttachFilter ? 'Comma-separated issue IDs' : 'Planned Issues (comma-separated issue IDs)')}
                    {isLoadingIssues && <LoaderInline className="linked-issues-loader"/>}
                  </span>
              )}
                name="linkedIssuesInput"
                onChange={handleLinkedIssuesInputChange}
                className={styles.issueSearchInput}
                onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchIssues();
                }
              }}
              />
              <Button
                onClick={handleSearchIssues}
                disabled={isLoadingIssues}
              >
                Search and Add
              </Button>
              {extraAction && (
              <span style={{ marginLeft: 8 }}>
                {extraAction}
              </span>
            )}
            </div>
            {searchError && (
            <div className={styles.errorMessage}>
              {searchError}
            </div>
          )}
          </div>
          {autoAttachFilter && (
          <div style={{display: showIds ? 'none' : 'block'}}>
            {autoAttachFilter}
          </div>
        )}

          {formData.plannedIssues && formData.plannedIssues.length > 0 && (
          <div className={styles.issuesList} style={{ overflowX: 'auto', paddingRight: 8 }}>
            <table className={styles.issuesTable} style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Summary</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {formData.plannedIssues.map((issue, idx) => (
                  <tr key={issue.id}>
                    <td>
                      <span className={styles.issueIdBadge}>
                        {issue.isMeta ? 'META' : (issue.idReadable || issue.id)}
                      </span>
                    </td>
                    <td>
                      <div className="issue-summary-with-badge">
                        <span className="issue-summary-text" title={issue.summary}>{issue.summary}</span>
                        {issue.source === 'filter' && <AutoAttachBadge/>}
                      </div>
                    </td>
                    <td>
                      {issue.isMeta && onEditMetaIssue && (
                        <Button
                          title="Edit"
                          onClick={() => onEditMetaIssue(issue as PlannedOrMetaIssue, idx)}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        title="Remove"
                        onClick={() => handleRemoveIssue(issue.id)}
                        className={styles.removeButton}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </Col>
    </Row>
  );
};

export default PlannedIssues;
