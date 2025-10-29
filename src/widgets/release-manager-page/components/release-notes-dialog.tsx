import React, {useState, useCallback} from 'react';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import copyIcon from '@jetbrains/icons/copy';
import '../styles/release-notes-dialog.css';
import {COPY_RESET_MS} from '../utils/constants';

interface ReleaseNotesDialogProps {
  open: boolean;
  notes: string;
  onClose: () => void;
}

export const ReleaseNotesDialog: React.FC<ReleaseNotesDialogProps> = ({ open, notes, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(notes || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // fallback
      try {
        const el = document.createElement('textarea');
        el.value = notes || '';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPY_RESET_MS);
      } catch {
        // ignore
      }
    }
  }, [notes]);

  if (!open) { return null; }

  return (
    <div className="release-notes-overlay" role="dialog" aria-modal="true" data-test="release-notes-dialog">
      <Panel className="release-notes-panel">
        <div className="release-notes-header">
          <div className="title">Release Notes (Markdown)</div>
          <div className="header-actions">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="notes-container">
          <div className="notes-wrapper">
            <textarea
              className="ring-input notes-textarea"
              readOnly
              value={notes || ''}
              rows={14}
            />
            <button
              type="button"
              title={copied ? 'Copied' : 'Copy to clipboard'}
              className={`copy-button ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copy to clipboard"
            >
              <Icon glyph={copyIcon}/>
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
};

export default ReleaseNotesDialog;
