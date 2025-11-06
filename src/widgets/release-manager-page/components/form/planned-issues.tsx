import React from 'react';
import {Col, Row} from '@jetbrains/ring-ui-built/components/grid/grid';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import {ReleaseVersion} from '../../interfaces';
import {PlannedOrMetaIssue} from '../../interfaces';

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
}

const PlannedIssues: React.FC<PlannedIssuesProps> = ({
  formData,
  handleLinkedIssuesInputChange,
  handleSearchIssues,
  isLoadingIssues,
  handleRemoveIssue,
  searchError,
  label,
  extraAction,
  onEditMetaIssue
}) => (
  <Row className={'planned-issues'}>
    <Col xs={12}>
      <div className={styles.formGroup} style={{paddingRight: "8px"}}>
        <div className={styles.issueSearchContainer}>
          <Input
            label={(
              <span>
                {label || 'Planned Issues (comma-separated issue IDs)'}
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
                    <td>{issue.summary}</td>
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

export default PlannedIssues;
