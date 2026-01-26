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
  return `description: "${normalizePreview(ev.fromDescription)}" → "${normalizePreview(ev.toDescription)}"`;
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
