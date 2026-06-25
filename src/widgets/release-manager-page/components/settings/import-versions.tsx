import React, {useState, useCallback, useMemo, useEffect} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import {api} from '../../app';
import {ReleaseVersion} from '../../interfaces';

interface VersionValue {
  name: string;
  releaseDate: string | null;
  startDate: string | null;
  isReleased: boolean;
  isArchived: boolean;
}

interface Props {
  fieldName?: string;
  onClose?: () => void;
  onBackToSettings?: () => void;
}

// eslint-disable-next-line complexity
export const ImportVersions: React.FC<Props> = ({fieldName, onClose, onBackToSettings}) => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeReleased, setIncludeReleased] = useState(true);
  const [versions, setVersions] = useState<VersionValue[]>([]);
  const [selectedForImport, setSelectedForImport] = useState<Set<string>>(new Set());
  const [existingReleases, setExistingReleases] = useState<ReleaseVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ imported: string[]; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);


  // Fetch existing releases to detect already-present versions
  useEffect(() => {
    let cancelled = false;
    api.getReleaseVersions().then(releases => {
      if (!cancelled) { setExistingReleases(releases || []); }
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  // Build set of version names that already exist as releases
  const existingVersionNames = useMemo(() => {
    const names = new Set<string>();
    for (const rv of existingReleases) {
      if (rv.version) { names.add(rv.version); }
    }
    return names;
  }, [existingReleases]);

  // eslint-disable-next-line complexity
  const handleFetchVersions = useCallback(async () => {
    if (!fieldName) { return; }
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const [response, releases] = await Promise.all([
        api.getVersionFieldValues(fieldName),
        api.getReleaseVersions()
      ]);
      const vals = response.values || [];
      setVersions(vals);
      setExistingReleases(releases || []);
      // Pre-select all importable versions
      const releaseNames = new Set((releases || []).map(r => r.version));
      const importable = new Set<string>();
      for (const v of vals) {
        if (!releaseNames.has(v.name)) {
          if ((!v.isArchived || includeArchived) && (!v.isReleased || includeReleased)) {
            importable.add(v.name);
          }
        }
      }
      setSelectedForImport(importable);
    } catch (e) {
      setError('Failed to fetch version values: ' + ((e as Error).message || e));
    } finally {
      setIsLoading(false);
    }
  }, [fieldName, includeArchived, includeReleased]);

  const filteredVersions = versions.filter(v => {
    if (!includeArchived && v.isArchived) { return false; }
    if (!includeReleased && v.isReleased) { return false; }
    return true;
  });

  // Versions that can be imported (filtered and not already existing)
  const importableVersions = useMemo(() =>
    filteredVersions.filter(v => !existingVersionNames.has(v.name)),
  [filteredVersions, existingVersionNames]);

  // Versions selected by user for import
  const selectedImportableVersions = useMemo(() =>
    importableVersions.filter(v => selectedForImport.has(v.name)),
  [importableVersions, selectedForImport]);

  // Toggle selection of a single version
  const toggleVersionSelection = useCallback((name: string) => {
    setSelectedForImport(prev => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  }, []);

  // Toggle all importable versions
  const toggleAllImportable = useCallback(() => {
    const allSelected = importableVersions.every(v => selectedForImport.has(v.name));
    if (allSelected) {
      setSelectedForImport(prev => {
        const next = new Set(prev);
        for (const v of importableVersions) { next.delete(v.name); }
        return next;
      });
    } else {
      setSelectedForImport(prev => {
        const next = new Set(prev);
        for (const v of importableVersions) { next.add(v.name); }
        return next;
      });
    }
  }, [importableVersions, selectedForImport]);

  const handleImport = useCallback(async () => {
    if (!fieldName || selectedImportableVersions.length === 0) { return; }
    setIsImporting(true);
    setError(null);
    setResult(null);
    try {
      const toImport = selectedImportableVersions.map(v => ({
        name: v.name,
        releaseDate: v.releaseDate,
        startDate: v.startDate,
        isReleased: v.isReleased
      }));
      const response = await api.importVersions(fieldName, toImport);
      setResult({imported: response.imported, skipped: response.skipped});
      // Refresh existing releases after import
      const releases = await api.getReleaseVersions();
      setExistingReleases(releases || []);
      // Notify application to refresh releases
      window.dispatchEvent(new CustomEvent('settings-updated'));
    } catch (e) {
      setError('Failed to import versions: ' + ((e as Error).message || e));
    } finally {
      setIsImporting(false);
    }
  }, [fieldName, selectedImportableVersions]);

  if (!fieldName) {
    return (
      <div className="settings-field">
        <H3>Import</H3>
        <div className="field-help">
          Configure a release field in Custom Field Mapping settings to enable import.
        </div>
        {onBackToSettings && (
          <div style={{marginTop: '12px'}}>
            <Button onClick={onBackToSettings}>Back to Settings</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="settings-field import-versions" style={{padding: '16px'}}>
      <H3>Import</H3>
      <br/>
      <div className="field-help">
        Create release versions from existing values of the <strong>{fieldName}</strong> field.
        Issues with matching values will be automatically linked to the corresponding release.
      </div>

      <div style={{display: 'flex', gap: '8px', alignItems: 'center', margin: '12px 0', flexWrap: 'wrap'}}>
        <Button onClick={handleFetchVersions} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Fetch Versions'}
        </Button>
        {versions.length > 0 && (
          <>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label style={{display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px'}}>
              <Checkbox
                checked={includeArchived}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeArchived(e.target.checked)}
              />
              Include archived versions
            </label>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
              <Checkbox
                checked={includeReleased}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeReleased(e.target.checked)}
              />
              Include released versions
            </label>
          </>
        )}
      </div>

      {versions.length > 0 && (
        <div style={{margin: '8px 0', fontSize: '13px', color: '#666'}}>
          Found {versions.length} version{versions.length !== 1 ? 's' : ''} total,
          {' '}{filteredVersions.length} after filtering,
          {' '}{importableVersions.length} new to import,
          {' '}{selectedImportableVersions.length} selected.
        </div>
      )}

      <div style={{maxHeight: '300px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', margin: '12px 0'}}>
        <table style={{width: '100%', fontSize: '13px', borderCollapse: 'collapse'}}>
          <thead>
            <tr style={{borderBottom: '1px solid #ddd', textAlign: 'center'}}>
              <th style={{padding: '0 8px', width: '32px', verticalAlign: 'middle'}}>
                <Checkbox
                  checked={importableVersions.length > 0 && importableVersions.every(v => selectedForImport.has(v.name))}
                  indeterminate={importableVersions.some(v => selectedForImport.has(v.name)) && !importableVersions.every(v => selectedForImport.has(v.name))}
                  onChange={toggleAllImportable}
                />
              </th>
              <th style={{padding: '8px'}}>Version</th>
              <th style={{padding: '8px'}}>Release Date</th>
              <th style={{padding: '8px'}}>Start Date</th>
              <th style={{padding: '8px'}}>Released</th>
              <th style={{padding: '8px'}}>Archived</th>
              <th style={{padding: '8px', width: '120px', whiteSpace: 'nowrap'}}>Status</th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{padding: '24px 8px', textAlign: 'center', color: '#999'}}>
                  Click &quot;Fetch Versions&quot; to load available versions
                </td>
              </tr>
            ) : versions.map(v => {
              const included = filteredVersions.some(fv => fv.name === v.name);
              const alreadyExists = existingVersionNames.has(v.name);
              const isImportable = included && !alreadyExists;
              const isSelected = selectedForImport.has(v.name);
              const OPACITY_EXISTS = 0.6;
              const OPACITY_WILL_IMPORT = 1;
              const OPACITY_SKIPPED = 0.7;
              const OPACITY_EXCLUDED = 0.4;
              const getStatusAndOpacity = () => {
                if (alreadyExists) { return { status: 'Already exists', opacity: OPACITY_EXISTS }; }
                if (included && isSelected) { return { status: 'Will import', opacity: OPACITY_WILL_IMPORT }; }
                if (included) { return { status: 'Skipped', opacity: OPACITY_SKIPPED }; }
                return { status: 'Excluded', opacity: OPACITY_EXCLUDED };
              };
              const { status, opacity } = getStatusAndOpacity();
              return (
                <tr key={v.name} style={{borderBottom: '1px solid #f0f0f0', opacity}}>
                  <td style={{padding: '0 8px', width: '32px', textAlign: 'center', verticalAlign: 'middle'}}>
                    {isImportable ? (
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleVersionSelection(v.name)}
                      />
                    ) : null}
                  </td>
                  <td style={{padding: '8px', textAlign: 'center', verticalAlign: 'middle'}}>{v.name}</td>
                  <td style={{padding: '8px', textAlign: 'center', verticalAlign: 'middle'}}>{v.releaseDate || '—'}</td>
                  <td style={{padding: '8px', textAlign: 'center', verticalAlign: 'middle'}}>{v.startDate || '—'}</td>
                  <td style={{padding: '8px', textAlign: 'center', verticalAlign: 'middle'}}>{v.isReleased ? '✓' : ''}</td>
                  <td style={{padding: '8px', textAlign: 'center', verticalAlign: 'middle'}}>{v.isArchived ? '✓' : ''}</td>
                  <td style={{padding: '8px', textAlign: 'center', verticalAlign: 'middle', width: '120px', whiteSpace: 'nowrap', color: alreadyExists ? '#2196F3' : undefined}}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={{color: '#d32f2f', margin: '8px 0', fontSize: '13px'}}>{error}</div>
      )}

      {result && (
        <div style={{margin: '8px 0', fontSize: '13px'}}>
          <div style={{color: '#4CAF50'}}>
            ✓ Imported {result.imported.length} version{result.imported.length !== 1 ? 's' : ''}
            {result.imported.length > 0 && ': ' + result.imported.join(', ')}
          </div>
          {result.skipped.length > 0 && (
            <div style={{color: '#FF9800'}}>
              ⚠ Skipped {result.skipped.length} (already exist): {result.skipped.join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="settings-separator horizontal" role="separator" aria-orientation="horizontal"/>

      <div className="settings-actions" style={{justifyContent: 'space-between'}}>
        <div>
          {onBackToSettings && (
            <Button onClick={onBackToSettings}>Back to Settings</Button>
          )}
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          {versions.length > 0 && (
            <Button primary onClick={handleImport} disabled={isImporting || selectedImportableVersions.length === 0}>
              {isImporting ? 'Importing...' : `Import ${selectedImportableVersions.length} version${selectedImportableVersions.length !== 1 ? 's' : ''}`}
            </Button>
          )}
          {onClose && (
            <Button onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportVersions;
