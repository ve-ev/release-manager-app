import React from 'react';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {formatDateTime} from '../utils/date-utils';
import {ReleaseAuditEvent} from '../interfaces';
import '../styles/audit-events-dialog.css';

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
                // eslint-disable-next-line complexity
                .map(ev => (
                  <li
                    key={`${ev.type}-${ev.at}-${ev.by || ''}-${ev.fromStatus || ''}-${ev.toStatus || ''}`}
                    className="event-row"
                  >
                    <div className="event-type">{ev.type}</div>
                    <div className="event-at">{formatDateTime(ev.at)}</div>
                    <div className="event-meta">
                      {ev.type === 'STATUS_CHANGED' && (ev.fromStatus || ev.toStatus) ? (
                        <span>{`${ev.fromStatus || '?'} → ${ev.toStatus || '?'}`}</span>
                      ) : null}
                      {ev.by ? <span>{` by ${ev.by}`}</span> : null}
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
