import React from 'react';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {formatDateTime} from '../utils/date-utils';
import {ReleaseAuditEvent} from '../interfaces';
import '../styles/audit-events-dialog.css';

const MAX_PREVIEW_LEN = 120;

const normalizePreview = (s?: string): string => {
  const raw = (s ?? '').toString();
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (compact.length === 0) { return '<empty>'; }
  return compact.length > MAX_PREVIEW_LEN ? `${compact.slice(0, MAX_PREVIEW_LEN)}…` : compact;
};

const normalizeFullText = (s?: string): string => (s ?? '').toString().replace(/\r\n/g, '\n');

const formatLen = (s?: string): string => {
  const raw = (s ?? '').toString();
  return raw.length.toString();
};

const buildInlineChangedSpan = (
  text: string,
  prefixLen: number,
  suffixLen: number,
  changedClassName: string
): React.ReactNode => {
  const start = text.slice(0, prefixLen);
  const changed = text.slice(prefixLen, Math.max(prefixLen, text.length - suffixLen));
  const end = text.slice(Math.max(prefixLen, text.length - suffixLen));

  return (
    <>
      {start}
      {changed.length > 0 ? <span className={changedClassName}>{changed}</span> : null}
      {end}
    </>
  );
};

const getCommonAffixes = (from: string, to: string): {prefixLen: number; suffixLen: number} => {
  // Find common prefix/suffix to highlight the changed middle part.
  let i = 0;
  const minLen = Math.min(from.length, to.length);
  while (i < minLen && from[i] === to[i]) { i += 1; }

  let j = 0;
  while (j < (minLen - i) && from[from.length - 1 - j] === to[to.length - 1 - j]) {
    j += 1;
  }

  return {prefixLen: i, suffixLen: j};
};

const renderDescriptionText = (
  text: string,
  isEmptyChange: boolean,
  prefixLen: number,
  suffixLen: number,
  changedClassName: string
): React.ReactNode => {
  if (text.length === 0) {
    return <span className="event-description-empty">&lt;empty&gt;</span>;
  }

  if (isEmptyChange) {
    return text;
  }

  return buildInlineChangedSpan(text, prefixLen, suffixLen, changedClassName);
};

const renderDescriptionDiffBlock = (ev: ReleaseAuditEvent): React.ReactNode => {
  if (ev.type !== 'DESCRIPTION_CHANGED') { return null; }

  const from = normalizeFullText(ev.fromDescription);
  const to = normalizeFullText(ev.toDescription);

  const {prefixLen, suffixLen} = getCommonAffixes(from, to);

  const isEmptyChange = from === to;

  return (
    <details className="event-details event-description-details" data-test="audit-event-description-diff">
      <summary className="event-details-title">
        Description diff
      </summary>

      <div className="event-description-diff">
        <div className="event-description-col">
          <div className="event-description-col-title">Before</div>
          <pre className="event-description-text">
            {renderDescriptionText(from, isEmptyChange, prefixLen, suffixLen, 'diff-removed')}
          </pre>
        </div>

        <div className="event-description-col">
          <div className="event-description-col-title">After</div>
          <pre className="event-description-text">
            {renderDescriptionText(to, isEmptyChange, prefixLen, suffixLen, 'diff-added')}
          </pre>
        </div>
      </div>
    </details>
  );
};

const renderIssuesBlock = (
  title: string,
  issues?: Array<{id: string; summary?: string}>
): React.ReactNode => {
  const list = Array.isArray(issues) ? issues : [];
  if (list.length === 0) { return null; }

  return (
    <div className="event-details" data-test="audit-event-issues">
      <div className="event-details-title">{`${title} (${list.length})`}</div>
      <ul className="event-issues">
        {list.map(it => (
          <li key={it.id} className="event-issue">
            <span className="event-issue-id">{it.id}</span>
            {it.summary ? <span className="event-issue-summary">{normalizePreview(it.summary)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

const getReleaseVersionPart = (ev: ReleaseAuditEvent): string => ev.releaseVersion ? ev.releaseVersion : '';

const getStatusChangePart = (ev: ReleaseAuditEvent): string => {
  if (ev.type !== 'STATUS_CHANGED') { return ''; }
  if (!ev.fromStatus && !ev.toStatus) { return ''; }
  return `${ev.fromStatus || '?'} → ${ev.toStatus || '?'}`;
};

const getPlannedIssuesChangedPart = (ev: ReleaseAuditEvent): string => {
  if (ev.type !== 'PLANNED_ISSUES_CHANGED') { return ''; }

  const base = `planned issues: ${ev.fromPlannedCount ?? '?'} → ${ev.toPlannedCount ?? '?'}`;
  const getListLen = <T,>(list?: T[]): number => (Array.isArray(list) ? list.length : 0);
  const addedCount = Math.max(getListLen(ev.addedPlannedIssues), getListLen(ev.addedPlannedIssueIds));
  const removedCount = Math.max(getListLen(ev.removedPlannedIssues), getListLen(ev.removedPlannedIssueIds));

  const details = [
    base,
    addedCount ? `added: ${addedCount}` : '',
    removedCount ? `removed: ${removedCount}` : '',
    ev.plannedReordered ? 'reordered' : ''
  ].filter(Boolean);

  return details.join('; ');
};

const getDescriptionChangedPart = (ev: ReleaseAuditEvent): string => {
  if (ev.type !== 'DESCRIPTION_CHANGED') { return ''; }
  const fromLen = formatLen(ev.fromDescription);
  const toLen = formatLen(ev.toDescription);

  // Keep the meta line compact; details are shown in an expandable block below.
  return `description changed (${fromLen} → ${toLen} chars)"`;
};

const getByPart = (ev: ReleaseAuditEvent): string => ev.by ? `by ${ev.by}` : '';

const buildEventMetaText = (ev: ReleaseAuditEvent): string => {
  const parts = [
    getReleaseVersionPart(ev),
    getStatusChangePart(ev),
    getPlannedIssuesChangedPart(ev),
    getDescriptionChangedPart(ev),
    getByPart(ev)
  ].filter(Boolean);

  return parts.join(' • ');
};

// eslint-disable-next-line complexity
const buildEventKey = (ev: ReleaseAuditEvent): string => [
  ev.releaseId || '',
  ev.type,
  ev.at || '',
  ev.by || '',
  ev.fromStatus || '',
  ev.toStatus || '',
  ev.fromPlannedCount ?? '',
  ev.toPlannedCount ?? '',
  (ev.addedPlannedIssueIds && ev.addedPlannedIssueIds.length) || 0,
  (ev.removedPlannedIssueIds && ev.removedPlannedIssueIds.length) || 0,
  ev.plannedReordered ? '1' : '0',
  ev.fromDescription || '',
  ev.toDescription || ''
].join('|');

interface AuditEventsDialogProps {
  open: boolean;
  version?: string;
  events: ReleaseAuditEvent[];
  onClose: () => void;
}

export const AuditEventsDialog: React.FC<AuditEventsDialogProps> = ({open, version, events, onClose}) => {
  if (!open) { return null; }

  const items = Array.isArray(events) ? events : [];

  return (
    <div
      className="audit-events-overlay"
      role="dialog"
      aria-modal="true"
      data-test="audit-events-dialog"
    >
      <button
        type="button"
        className="audit-events-backdrop"
        aria-label="Close audit events dialog"
        onClick={onClose}
      />
      <Panel className="audit-events-panel">
        <div className="audit-events-header">
          <div className="title">Audit events{version ? ` — ${version}` : ''}</div>
          <div className="header-actions">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className="audit-events-container">
          {items.length === 0 ? (
            <div className="empty">No audit events</div>
          ) : (
            <ul className="events-list">
              {items
                .slice()
                // Newest first
                .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
                .map(ev => (
                  <li
                    key={buildEventKey(ev)}
                    className="event-row"
                  >
                    <div className="event-type">{ev.type}</div>
                    <div className="event-at">{formatDateTime(ev.at)}</div>
                    <div className="event-meta">
                      {buildEventMetaText(ev) ? <div className="event-meta-line">{buildEventMetaText(ev)}</div> : null}

                      {renderDescriptionDiffBlock(ev)}

                      {renderIssuesBlock('Planned issues', ev.plannedIssuesSnapshot)}

                      {ev.type === 'PLANNED_ISSUES_CHANGED' ? (
                        <>
                          {renderIssuesBlock('Added planned issues', ev.addedPlannedIssues)}
                          {renderIssuesBlock('Removed planned issues', ev.removedPlannedIssues)}
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
};

export default AuditEventsDialog;
