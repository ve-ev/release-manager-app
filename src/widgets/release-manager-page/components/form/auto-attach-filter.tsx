import React, {useEffect, useState} from 'react';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import searchIcon from '@jetbrains/icons/search';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import {api} from '../../app.tsx';
import {getBackendErrorMessage} from '../../utils/helpers';

const PREVIEW_DEBOUNCE_MS = 500;

type Preview = { count: number; limit: number; project: string } | { error: string } | null;

/** YouTrack issues search with the same scope as the filter: the release's project only. */
function scopedSearchUrl(preview: Preview, query: string, disabledReason?: string): string | null {
  if (disabledReason || !preview || 'error' in preview || !preview.project || !query.trim()) { return null; }
  const scoped = `project: {${preview.project}} and (${query.trim()})`;
  return `${api.getBaseUrl()}issues?q=${encodeURIComponent(scoped)}`;
}

/**
 * Text to show under the filter input for the current preview state.
 * Returns null when there is nothing to show.
 */
function describePreview(preview: Preview): { text: string; isError: boolean } | null {
  if (!preview) { return null; }
  if ('error' in preview) { return {text: preview.error, isError: true}; }
  if (preview.count > preview.limit) {
    return {text: `${preview.count} issues match. The limit is ${preview.limit}. Make the filter narrower.`, isError: true};
  }
  if (preview.count === 0) {
    return {text: 'No issues in this project match. The filter searches only the project of this release.', isError: false};
  }
  return {text: `${preview.count} of max ${preview.limit} issues in this project match.`, isError: false};
}

/** True when the last preview ran and its matches fit the limit (zero matches is valid: it removes filter-added issues). */
function hasSyncableMatches(preview: Preview): boolean {
  return !!preview && !('error' in preview) && preview.count <= preview.limit;
}

/** Maps the preview state to the Input's grey help text or red error text. */
function describeField(preview: Preview, disabledReason?: string, syncResult?: string | null): { help?: string; error?: string } {
  if (disabledReason) { return {help: disabledReason}; }
  if (syncResult) { return {help: syncResult}; }
  const described = describePreview(preview);
  if (!described) { return {}; }
  return described.isError ? {error: described.text} : {help: described.text};
}

const HelpLine: React.FC<{text: string; url: string | null}> = ({text, url}) => (
  <div className="auto-attach-help">
    {text}
    {url && <> <a href={url} target="_blank" rel="noopener noreferrer">Open in YouTrack</a></>}
  </div>
);

interface AutoAttachFilterProps {
  value: string;
  onChange: (value: string) => void;
  /** Updates the form's filter-added issues from the query and returns what changed. */
  onSyncMatches: (query: string) => Promise<{ added: number; removed: number }>;
  /** When set, the input is disabled and this text explains why. */
  disabledReason?: string;
}

const AutoAttachFilter: React.FC<AutoAttachFilterProps> = ({value, onChange, onSyncMatches, disabledReason}) => {
  const [preview, setPreview] = useState<Preview>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleSyncMatches = () => {
    setIsSyncing(true);
    onSyncMatches(value.trim())
      .then(({added, removed}) => setSyncResult(`Planned issues updated: ${added} added, ${removed} removed.`))
      .catch(e => setPreview({error: getBackendErrorMessage(e, 'Could not run the filter')}))
      .finally(() => setIsSyncing(false));
  };
  const canSync = !disabledReason && !isSyncing && hasSyncableMatches(preview);

  useEffect(() => {
    setSyncResult(null);
    const query = value.trim();
    if (!query || disabledReason) {
      setPreview(null);
      return undefined;
    }
    // ponytail: the abort only drops stale responses; host.fetchApp cannot take a signal
    // because requests cross the widget iframe boundary
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.previewAutoAttach(query)
        .then(res => { if (!controller.signal.aborted) { setPreview(res); } })
        .catch(e => {
          if (!controller.signal.aborted) {
            setPreview({error: getBackendErrorMessage(e, 'Could not run the filter')});
          }
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, disabledReason]);

  const field = describeField(preview, disabledReason, syncResult);
  const searchUrl = scopedSearchUrl(preview, value, disabledReason);

  return (
    <div>
      <div className="issueSearchContainer">
        <Input
          icon={searchIcon}
          size={Size.FULL}
          className="issueSearchInput"
          label="YouTrack search query"
          name="autoAttachQuery"
          value={value}
          disabled={!!disabledReason}
          onChange={e => onChange(e.target.value)}
        />
        <Button onClick={handleSyncMatches} disabled={!canSync}>
          {isSyncing ? <LoaderInline/> : 'Sync matching issues'}
        </Button>
      </div>
      {field.error && <div className="errorMessage">{field.error}</div>}
      {field.help && <HelpLine text={field.help} url={searchUrl}/>}
    </div>
  );
};

export default AutoAttachFilter;
