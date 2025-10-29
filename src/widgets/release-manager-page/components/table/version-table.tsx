import React, {memo, useState, useCallback, useMemo} from 'react';
import {ReleaseVersion, AppSettings} from '../../interfaces';
import {HostAPI} from '../../../../../@types/globals';
import {ReleaseVersionItem} from './release-version-item.tsx';
import {TableHeader, LoadingState, ErrorState} from './table-components.tsx';
import type {SortDirection, SortKey} from './table-components.tsx';
/* eslint-disable complexity */

/**
 * Props for the ReleaseTable component
 */
interface ReleaseTableProps {
  /** List of release versions to display */
  releaseVersions: ReleaseVersion[];
  /** Loading state indicator */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Set of IDs for expanded release versions */
  expandedReleaseVersions: Set<string | number>;
  /** Function to toggle expansion state of a release version */
  toggleExpandReleaseVersion: (id: string | number) => void;
  /** Function to handle editing a release version */
  handleEditReleaseVersion: (releaseVersion: ReleaseVersion) => void;
  /** Function to handle deletion confirmation for a release version */
  handleConfirmDelete: (releaseVersion: ReleaseVersion) => void;
  /** Show product column */
  showProductColumn?: boolean;
  /** Show progress column */
  showProgressColumn?: boolean;
  /** Host API for integration with external systems */
  host?: HostAPI;
  /** Permissions */
  canEdit?: boolean;
  canDelete?: boolean;
  /** Manual issue management flag */
  manualIssueManagement?: boolean;
  /** Feature flag for meta issues */
  metaIssuesEnabled?: boolean;
  /** Handler to open meta-issue form */
  handleAddMetaIssue?: (releaseVersion: ReleaseVersion) => void;
  handleGenerateReleaseNotes?: (releaseVersion: ReleaseVersion) => void;
  /** App settings (passed from top to avoid hook proliferation) */
  settings?: AppSettings;
  /** Progress settings (passed from top to avoid hook proliferation) */
  progressSettings?: AppSettings;
}

/**
 * Main component for displaying a table of release versions
 */
const ReleaseTableComponent: React.FC<ReleaseTableProps> = ({
  releaseVersions,
  loading,
  error,
  expandedReleaseVersions,
  toggleExpandReleaseVersion,
  handleEditReleaseVersion,
  handleConfirmDelete,
  showProductColumn = true,
  showProgressColumn = true,
  host,
  canEdit,
  canDelete,
  manualIssueManagement,
  metaIssuesEnabled,
  handleAddMetaIssue,
  handleGenerateReleaseNotes,
  settings,
  progressSettings
}) => {
  /** Set of IDs for release versions with expanded info sections */
  const [expandedInfoSections, setExpandedInfoSections] = useState<Set<string | number>>(new Set());

  /** Filters */
  const [productFilter, setProductFilter] = useState<string>('');
  const [versionFilter, setVersionFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  /** Sorting - default by releaseDate desc (new releases first) */
  const [sortKey, setSortKey] = useState<SortKey>('releaseDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  /** Unique products and statuses for filter options */
  const { products, statuses } = useMemo(() => {
    const prodSet = new Set<string>();
    const statSet = new Set<string>();
    for (const rv of releaseVersions) {
      if (rv.product) { prodSet.add(rv.product); }
      if (rv.status) { statSet.add(rv.status); }
    }
    return { products: Array.from(prodSet).sort((a, b) => a.localeCompare(b)), statuses: Array.from(statSet).sort((a, b) => a.localeCompare(b)) };
  }, [releaseVersions]);

  /** Toggle sort handler */
  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prevKey => {
      if (prevKey === key) {
        // toggle direction
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      // new key, set default direction: dates desc, others asc
      setSortDirection(key === 'releaseDate' || key === 'featureFreezeDate' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  /**
   * Toggles the expansion state of an info section
   * Only one item can be expanded at a time
   */
  const toggleInfoSection = useCallback((id: string | number, forceState?: boolean) => {
    setExpandedInfoSections(prev => {
      if ((forceState === false) || (forceState === undefined && prev.has(id))) {
        return new Set<string | number>();
      }
      toggleExpandReleaseVersion(id);
      return new Set<string | number>([id]);
    });
  }, [toggleExpandReleaseVersion]);

  /** Apply filters and sorting, then render items */
  const releaseVersionItems = useMemo(() => {
    const norm = (v?: string) => (v || '').toLowerCase();
    
    // Pre-normalize filter values once
    const normProductFilter = norm(productFilter);
    const normStatusFilter = norm(statusFilter);
    const normVersionFilter = norm(versionFilter);

    // Single-pass filtering (instead of 4 separate iterations)
    const filtered = releaseVersions.filter(item => {
      if (!item.id) return false;
      if (normProductFilter && norm(item.product) !== normProductFilter) return false;
      if (normStatusFilter && norm(item.status) !== normStatusFilter) return false;
      if (normVersionFilter && !norm(item.version).includes(normVersionFilter)) return false;
      return true;
    });

    const cmpStr = (a?: string, b?: string) => (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
    
    // Pre-compute date timestamps ONCE for all items (instead of creating Date objects repeatedly during sort)
    const releaseDates = new Map<string | number, number>();
    const freezeDates = new Map<string | number, number>();
    filtered.forEach(item => {
      if (item.releaseDate) releaseDates.set(item.id, new Date(item.releaseDate).getTime());
      if (item.featureFreezeDate) freezeDates.set(item.id, new Date(item.featureFreezeDate).getTime());
    });
    const getTime = (id: string | number, map: Map<string | number, number>) => map.get(id) || 0;

    const statusOrder = ['Planning', 'In progress', 'Overdue', 'Released', 'Canceled'];
    const statusRank = (s?: string) => {
      const idx = statusOrder.indexOf((s || '').toString());
      return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
    };

    const progressValue = (item: ReleaseVersion) => {
      // Approximate progress by number of planned issues (more issues -> higher)
      // If no plannedIssues, treat as 0. This keeps implementation local without heavy refactor.
      return Array.isArray(item.plannedIssues) ? item.plannedIssues.length : 0;
    };

    const sorted = filtered.sort((a, b) => {
      let base: number;
      switch (sortKey) {
        case 'product':
          base = cmpStr(a.product, b.product); break;
        case 'version':
          base = cmpStr(a.version, b.version); break;
        case 'status':
          base = statusRank(a.status) - statusRank(b.status); break;
        case 'featureFreezeDate':
          base = getTime(a.id, freezeDates) - getTime(b.id, freezeDates); break;
        case 'progress':
          base = progressValue(a) - progressValue(b); break;
        case 'releaseDate':
        default:
          base = getTime(a.id, releaseDates) - getTime(b.id, releaseDates); break;
      }
      return sortDirection === 'asc' ? base : -base;
    });

    return sorted.map(item => (
      <ReleaseVersionItem
        key={item.id}
        item={item}
        isExpanded={expandedReleaseVersions.has(item.id)}
        isInfoExpanded={expandedInfoSections.has(item.id)}
        toggleExpandReleaseVersion={toggleExpandReleaseVersion}
        toggleInfoSection={toggleInfoSection}
        handleEditReleaseVersion={handleEditReleaseVersion}
        handleConfirmDelete={handleConfirmDelete}
        showProductColumn={showProductColumn}
        showProgressColumn={showProgressColumn}
        host={host}
        canEdit={canEdit}
        canDelete={canDelete}
        manualIssueManagement={manualIssueManagement}
        metaIssuesEnabled={metaIssuesEnabled}
        handleAddMetaIssue={handleAddMetaIssue}
        handleGenerateReleaseNotes={handleGenerateReleaseNotes}
        settings={settings}
        progressSettings={progressSettings}
      />
    ));
  }, [
    releaseVersions,
    productFilter,
    statusFilter,
    versionFilter,
    sortKey,
    sortDirection,
    expandedReleaseVersions,
    expandedInfoSections,
    toggleExpandReleaseVersion,
    toggleInfoSection,
    handleEditReleaseVersion,
    handleConfirmDelete,
    showProductColumn,
    showProgressColumn,
    host,
    canEdit,
    canDelete,
    manualIssueManagement,
    metaIssuesEnabled,
    handleAddMetaIssue,
    handleGenerateReleaseNotes,
    settings,
    progressSettings
  ]);

  if (loading) {
    return <LoadingState/>;
  }

  if (error) {
    return <ErrorState message={error}/>;
  }

  return (
    <div className="version-list-container">
      {/* Filters */}
      <div className="version-list-filters" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {showProductColumn && (
          <select
            aria-label="Filter by product"
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
          >
            <option value="">All products</option>
            {products.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        <input
          aria-label="Filter by version"
          type="text"
          placeholder="Filter by version"
          value={versionFilter}
          onChange={e => setVersionFilter(e.target.value)}
        />
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <TableHeader
        showProductColumn={showProductColumn}
        showProgressColumn={showProgressColumn}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
      <div className="version-list">
        {releaseVersionItems}
      </div>
    </div>
  );
};

export const VersionTable = memo(ReleaseTableComponent);
VersionTable.displayName = 'VersionTable';