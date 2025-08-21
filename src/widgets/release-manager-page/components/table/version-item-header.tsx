import React, {useState, useEffect, useRef} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import DropdownMenu from '@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu';
import {Directions} from "@jetbrains/ring-ui-built/components/popup/popup.consts";
import {Expander} from './expander.tsx';
import {formatDate, isExpired, isToday} from '../../utils/date-utils.tsx';
import {ProductTag} from '../../utils/product-utils.tsx';
import {StatusTag, ReleaseStatus} from '../../utils/status-utils.tsx';
import {ReleaseVersion} from '../../interfaces';
import {ProgressBar} from './progress/progress-bar.tsx';
import {api} from '../../app';
import {AppSettings} from '../../interfaces';
import type {ListDataItem} from '@jetbrains/ring-ui-built/components/list/list';

/* eslint-disable complexity, no-console */


/**
 * Props for the VersionItemHeader component
 */
export interface VersionItemHeaderProps {
  /** Release version item data */
  item: ReleaseVersion;
  /** Whether the item is closed (not expanded) */
  isClosed: boolean;
  /** The status to display */
  displayStatus: ReleaseStatus;
  /** Whether to show the freeze indicator */
  showFreezeIndicator: boolean;
  /** Whether to show the release-today indicator */
  showReleaseTodayIndicator: boolean;
  /** Class name for release date */
  releaseDateClassName: string;
  /** Class name for feature freeze date */
  featureFreezeDateClassName: string;
  /** Handler for expand/collapse click */
  handleExpandClick: (e?: React.MouseEvent) => void;
  /** Handler for double-click */
  handleDoubleClick: () => void;
  /** Handler for edit action */
  handleEditReleaseVersion: (releaseVersion: ReleaseVersion) => void;
  /** Handler for delete action */
  handleConfirmDelete: (releaseVersion: ReleaseVersion) => void;
  /** Show product column */
  showProductColumn?: boolean;
  /** Show progress column */
  showProgressColumn?: boolean;
  /** Permissions */
  canEdit?: boolean;
  canDelete?: boolean;
  /** Manual issue management flag */
  manualIssueManagement?: boolean;
  /** Feature flag for meta issues */
  metaIssuesEnabled?: boolean;
  /** Handler to open meta-issue form */
  handleAddMetaIssue?: (releaseVersion: ReleaseVersion) => void;
  /** Handler to generate release notes */
  handleGenerateReleaseNotes?: (releaseVersion: ReleaseVersion) => void;
}

/**
 * Component for the header row of a release version item
 */
export const VersionItemHeader: React.FC<VersionItemHeaderProps> = ({
  item,
  isClosed,
  displayStatus,
  showFreezeIndicator,
  showReleaseTodayIndicator,
  releaseDateClassName,
  featureFreezeDateClassName,
  handleExpandClick,
  handleDoubleClick,
  handleEditReleaseVersion,
  handleConfirmDelete,
  showProductColumn = true,
  showProgressColumn = true,
  canEdit,
  canDelete,
  manualIssueManagement,
  metaIssuesEnabled,
  handleAddMetaIssue,
  handleGenerateReleaseNotes
}) => {
  // State for storing progress settings
  const [progressSettings, setProgressSettings] = useState<AppSettings>({
    customFieldNames: [],
    greenZoneValues: [],
    yellowZoneValues: [],
    redZoneValues: [],
    greenColor: '#4CAF50',
    yellowColor: '#FFC107',
    redColor: '#F44336',
    greyColor: '#9E9E9E'
  });
  
  // State for storing progress data (two levels: main and task)
  const [mainProgress, setMainProgress] = useState<{ green: number; yellow: number; red: number; grey: number; total: number }>({
    green: 0, yellow: 0, red: 0, grey: 0, total: 0
  });
  // Flags indicating whether any configured custom field is present for main level
  const [mainAvailable, setMainAvailable] = useState<boolean>(false);

  // Manual issue statuses to support excluding Discoped issues from progress
  type IssueStatus = 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped';
  const [issueStatusMap, setIssueStatusMap] = useState<Record<string, IssueStatus>>(() => (
    Object.fromEntries((item.plannedIssues || []).map(it => [it.id, 'Unresolved'])) as Record<string, IssueStatus>
  ));
  
  // Guards to avoid duplicate settings fetches and coalesce concurrent calls
  const didInitRef = useRef(false);
  const inFlightSettingsRef = useRef<Promise<AppSettings> | null>(null);
  
  // Load persisted manual issue statuses on mount to support filtering Discoped issues from progress
  useEffect(() => {
    let isMounted = true;
    if (manualIssueManagement) {
      api.getIssueStatuses()
        .then(({ issueStatuses }) => {
          if (!isMounted) { return; }
          const castIssue = issueStatuses as Record<string, IssueStatus>;
          setIssueStatusMap(prev => ({ ...prev, ...castIssue }));
        })
        .catch((e: Error) => {
          console.error('Failed to load issue statuses', e);
        });
    }
    return () => { isMounted = false; };
  }, [manualIssueManagement]);

  // Fetch progress settings on component mount and listen for updates (guarded to avoid duplicate calls)
  useEffect(() => {
    let mounted = true;

    const fetchAndSet = () => {
      if (inFlightSettingsRef.current) {
        return inFlightSettingsRef.current;
      }
      const p = api.getAppSettings()
        .then((settings: AppSettings) => {
          if (mounted) {
            setProgressSettings(settings);
          }
          return settings;
        })
        .catch((error: Error) => {
          console.error('Failed to fetch progress settings:', error);
        })
        .finally(() => {
          inFlightSettingsRef.current = null;
        }) as Promise<AppSettings> | null;
      inFlightSettingsRef.current = p;
      return p;
    };

    if (!didInitRef.current) {
      didInitRef.current = true;
      fetchAndSet();
    }

    const handler = () => { fetchAndSet(); };

    window.addEventListener('settings-updated', handler as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('settings-updated', handler as EventListener);
    };
  }, []);

  // Listen for manual issue status updates and refresh local status map to recalc progress bar
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      if (!manualIssueManagement) { return; }
      api.getIssueStatuses()
        .then(({ issueStatuses }) => {
          if (!mounted) { return; }
          const castIssue = issueStatuses as Record<string, IssueStatus>;
          setIssueStatusMap(prev => ({ ...prev, ...castIssue }));
        })
        .catch((e: Error) => {
          console.error('Failed to refresh issue statuses', e);
        });
    };
    const handler = () => { refresh(); };
    if (manualIssueManagement) {
      window.addEventListener('issue-statuses-updated', handler as EventListener);
    }
    return () => {
      mounted = false;
      if (manualIssueManagement) {
        window.removeEventListener('issue-statuses-updated', handler as EventListener);
      }
    };
  }, [manualIssueManagement]);
  
  /**
   * Determine the zone for a field value
   */
  const getZoneForValue = (value: string | null): 'green' | 'yellow' | 'red' | 'grey' => {
    if (!value) {
      return 'grey';
    }
    const v = value.toString().toLowerCase();
    const green = (progressSettings.greenZoneValues || []).map(s => s.toLowerCase());
    const yellow = (progressSettings.yellowZoneValues || []).map(s => s.toLowerCase());
    const red = (progressSettings.redZoneValues || []).map(s => s.toLowerCase());

    if (green.includes(v)) {
      return 'green';
    }
    if (yellow.includes(v)) {
      return 'yellow';
    }
    if (red.includes(v)) {
      return 'red';
    }
    return 'grey';
  };
  

  /**
   * Try fetching bulk field values for the first available custom field in order
   */
  const fetchBulkForFirstAvailableField = async (
    issueId: string,
    fieldNames: string[]
  ): Promise<{ items: Array<{ id: string; value: string | null }>; usedField?: string }> => {
    return api.getIssueFieldBulkForFirstAvailable(issueId, fieldNames);
  };

  /**
   * Fetch field values for an issue and produce a single-issue aggregate result (main level only)
   */
  const fetchFieldValues = async (
    issueId: string
  ): Promise<{
    parent: { green: number; yellow: number; red: number; grey: number; total: number; available: boolean };
  }> => {
    try {
      const { items } = await fetchBulkForFirstAvailableField(issueId, progressSettings.customFieldNames);

      const parent = { green: 0, yellow: 0, red: 0, grey: 1, total: 1, available: false };

      const hasAnyNonNull = items.some(it => it && it.value !== null);
      if (!hasAnyNonNull) {
        return { parent };
      }

      parent.available = true;
      parent.grey = 0;

      const parentValue = items.find(it => it.id === issueId)?.value ?? null;

      // If parent value is missing but subtasks have values, derive zone from subtasks:
      // - GREEN only when all subtasks are GREEN (and at least one subtask exists)
      // - YELLOW when at least one subtask is YELLOW
      // - RED when at least one subtask is RED
      // - GREY otherwise
      let parentZone: 'green' | 'yellow' | 'red' | 'grey';
      if (parentValue === null || parentValue === undefined) {
        const subtaskValues = items.filter(it => it.id !== issueId).map(it => it.value);
        if (subtaskValues.length === 0) {
          parentZone = 'grey';
        } else {
          let hasRed = false;
          let hasYellow = false;
          let allGreen = true;
          let hasGreen = false;
          for (const v of subtaskValues) {
            const z = getZoneForValue(v);
            if (z === 'red') { hasRed = true; }
            if (z === 'yellow') { hasYellow = true; }
            if (z === 'green') { hasGreen = true; } else { allGreen = false; }
          }
          if (hasRed) {
            parentZone = 'red';
          } else if (hasYellow) {
            parentZone = 'yellow';
          } else if (allGreen && hasGreen) {
            parentZone = 'green';
          } else {
            parentZone = 'grey';
          }
        }
      } else {
        parentZone = getZoneForValue(parentValue);
      }

      const register = (state: 'green' | 'yellow' | 'grey' | 'red') => {
        parent.green += state === 'green' ? 1 : 0;
        parent.yellow += state === 'yellow' ? 1 : 0;
        parent.red += state === 'red' ? 1 : 0;
        parent.grey += state === 'grey' ? 1 : 0;
      };

      // Main level: register derived/parent zone
      register(parentZone);

      return { parent };
    } catch (error) {
      console.error(`Failed to fetch bulk field values for issue ${issueId}:`, error);
      return {
        parent: { green: 0, yellow: 0, red: 0, grey: 1, total: 1, available: false }
      };
    }
  };
  
  // Calculate progress for planned issues on two levels
  useEffect(() => {
    if (!item.plannedIssues || item.plannedIssues.length === 0 || !progressSettings.customFieldNames || progressSettings.customFieldNames.length === 0) {
      return;
    }

    const fetchIssueData = async () => {
      try {
        const initial = { green: 0, yellow: 0, red: 0, grey: 0, total: 0 };
        let mainAny = false;

        // Build effective list of issue IDs to consider in header progress:
        // - Count every linked issue as a single unit, including meta issues
        //   so the header progress matches the per-row progress dot zone
        const effectiveIdsRaw: string[] = [];
        (item.plannedIssues || []).forEach(issue => {
          if (issue && issue.id) {
            effectiveIdsRaw.push(issue.id);
          }
        });
        // Deduplicate IDs
        const effectiveIds = Array.from(new Set(effectiveIdsRaw));

        // Exclude Discoped issues by manual status
        const filteredIds = effectiveIds.filter(id => {
          const st = (issueStatusMap[id] || 'Unresolved');
          return st !== 'Discoped';
        });

        if (filteredIds.length === 0) {
          setMainProgress({ green: 0, yellow: 0, red: 0, grey: 0, total: 0 });
          setMainAvailable(false);
          return;
        }

        // Build quick index to access issue details (e.g., meta flags)
        type IssueRef = { id: string; isMeta?: boolean; metaRelatedIssueIds?: string[] };
        const idToIssue: Record<string, IssueRef> = Object.fromEntries(
          (item.plannedIssues || [])
            .filter(Boolean)
            .map(it => [it.id, { id: it.id, isMeta: (it as unknown as IssueRef).isMeta, metaRelatedIssueIds: (it as unknown as IssueRef).metaRelatedIssueIds }])
        );

        const results = await Promise.all(
          filteredIds.map(async (id) => {
            const issue = idToIssue[id];
            // Manual override: if the issue (including meta) itself is Fixed/Merged -> green
            const st = (issueStatusMap[id] || 'Unresolved');
            if (st === 'Fixed' || st === 'Merged') {
              return { parent: { green: 1, yellow: 0, red: 0, grey: 0, total: 1, available: true } };
            }

            // If this is a meta issue with related issues, aggregate by related issues states
            if (issue && issue.isMeta && Array.isArray(issue.metaRelatedIssueIds) && issue.metaRelatedIssueIds.length > 0) {
              // Aggregate meta by related issues
              const relatedIds = issue.metaRelatedIssueIds;

              let considered = 0;
              let hasRed = false; let hasYellow = false; let allGreen = true; let hasGreen = false;
              let available = false;

              for (const relId of relatedIds) {
                const relStatus = (issueStatusMap[relId] || 'Unresolved');
                // Exclude Discoped related issues
                if (relStatus === 'Discoped') { continue; }
                considered++;

                // Manual override for related items: Fixed/Merged => GREEN and available
                if (relStatus === 'Fixed' || relStatus === 'Merged') {
                  hasGreen = true; available = true; continue;
                }

                // Fetch parent field value for the related issue and derive its zone
                try {
                  const { items } = await fetchBulkForFirstAvailableField(relId, progressSettings.customFieldNames);
                  const parentVal = (items.find(it => it.id === relId)?.value) ?? null;
                  if (parentVal !== null) { available = true; }
                  const z = getZoneForValue(parentVal);
                  if (z === 'red') { hasRed = true; }
                  if (z === 'yellow') { hasYellow = true; }
                  if (z === 'green') { hasGreen = true; } else { allGreen = false; }
                } catch {
                  // On error, treat as GREY (no availability change)
                  allGreen = false;
                }
              }

              let zone: 'green' | 'yellow' | 'red' | 'grey';
              if (considered > 0) {
                if (hasRed) { zone = 'red'; }
                else if (hasYellow) { zone = 'yellow'; }
                else if (allGreen && hasGreen) { zone = 'green'; }
                else { zone = 'grey'; }
              } else {
                // No related issues considered -> grey, not available
                available = false;
                zone = 'grey';
              }

              return {
                parent: {
                  green: zone === 'green' ? 1 : 0,
                  yellow: zone === 'yellow' ? 1 : 0,
                  red: zone === 'red' ? 1 : 0,
                  grey: zone === 'grey' ? 1 : 0,
                  total: 1,
                  available
                }
              };
            }

            // Regular issue flow
            return fetchFieldValues(id);
          })
        );

        const aggregatedMain = results.reduce((acc, r) => {
          acc.green += r.parent.green;
          acc.yellow += r.parent.yellow;
          acc.red += r.parent.red;
          acc.grey += r.parent.grey;
          acc.total += r.parent.total;
          if (r.parent.available) { mainAny = true; }
          return acc;
        }, { ...initial });

        setMainProgress(aggregatedMain);
        setMainAvailable(mainAny);
      } catch (error) {
        console.error('Failed to calculate version progress:', error);
      }
    };

    fetchIssueData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.plannedIssues, progressSettings, issueStatusMap]);
  
  // Configure dropdown menu props (untyped to avoid generic mismatch)
  const menuProps = {
    directions: [Directions.RIGHT_BOTTOM, Directions.LEFT_BOTTOM] as const,
    ['data-test']: 'actions-menu',
    hidden: false,
    activateFirstItem: false
  };

  // Render progress bar if we have planned issues and relevant custom fields available
  const renderProgressBar = () => {
    if (!item.plannedIssues || item.plannedIssues.length === 0) {
      return <div className="no-progress">No linked issues</div>;
    }
    if (!mainAvailable) {
      // Reserve space to prevent layout jumping while we compute availability
      return (
        <div className="progress-placeholder">
          <div className="progress-placeholder-bar"/>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {mainAvailable && (
          <ProgressBar
            total={mainProgress.total}
            green={mainProgress.green}
            yellow={mainProgress.yellow}
            red={mainProgress.red}
            grey={mainProgress.grey}
            greenColor={progressSettings.greenColor}
            yellowColor={progressSettings.yellowColor}
            redColor={progressSettings.redColor}
            greyColor={progressSettings.greyColor}
            className="no-counters"
          />
        )}
      </div>
    );
  };

  return (
    <div className="version-list-row">
      <div className="version-list-cell expand-cell">
        <Expander
          closed={isClosed}
          treeState="node"
          onClick={handleExpandClick}
          onDoubleClick={handleDoubleClick}
        />
      </div>
      {showProductColumn ? (
        <div className="version-list-cell product-cell">
          <ProductTag product={item.product || ''}/>
        </div>
      ) : null}
      <div className="version-list-cell version-cell">
        <div className="version-text">{item.version}</div>
      </div>
      {showProgressColumn ? (
        <div className="version-list-cell progress-cell">
          {renderProgressBar()}
        </div>
      ) : null}
      <div className="version-list-cell status-cell">
        {displayStatus && (
          canEdit ? (
            <DropdownMenu<unknown>
              menuProps={menuProps}
              anchor={(
                <StatusTag
                  status={displayStatus}
                  showFreezeIndicator={showFreezeIndicator}
                  showTodayIndicator={showReleaseTodayIndicator}
                />
              )}
              data={(() => {
                const statuses: ReleaseStatus[] = ['Planning', 'In progress', 'Released', 'Canceled'];
                const items: readonly ListDataItem<unknown>[] = statuses.map(st => ({
                  label: st,
                  onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                    event.stopPropagation?.();
                    if (item.status === st) { return; }
                    api.updateReleaseVersion({ ...item, status: st })
                      .then(() => {
                        // Dispatch targeted update to avoid full table refresh
                        window.dispatchEvent(new CustomEvent('release-version-status-updated', { detail: { id: item.id, status: st } }));
                        // Keep legacy event for backward compatibility (no-op listeners can ignore)
                        window.dispatchEvent(new Event('release-versions-updated'));
                      })
                      .catch((error: unknown) => {
                        console.error('Failed to update status', error);
                      });
                  }
                }));
                return items;
              })()}
              onSelect={(_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                event.stopPropagation?.();
              }}
            />
          ) : (
            <StatusTag
              status={displayStatus}
              showFreezeIndicator={showFreezeIndicator}
              showTodayIndicator={showReleaseTodayIndicator}
            />
          )
        )}
      </div>
      <div className="version-list-cell date-cell">
        <span className={releaseDateClassName}>
          {formatDate(item.releaseDate)}
        </span>
      </div>
      <div className="version-list-cell date-cell">
        <span className={featureFreezeDateClassName}>
          {formatDate(item.featureFreezeDate)}
        </span>
      </div>
      <div className="version-list-cell actions-cell">
        <div className="actions">
          <DropdownMenu<unknown>
            menuProps={menuProps}
            anchor={(
              <Button
                title="Actions"
                data-test="actions-button"
              >
                Actions
              </Button>
            )}
            data={(() => {
              const items: Array<ListDataItem<unknown>> = [];
              if (canEdit) {
                items.push({
                  label: 'Edit',
                  'data-test': 'edit-action',
                  onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                    event.stopPropagation?.();
                    handleEditReleaseVersion(item);
                  }
                });

                // Feature flag: add action to add meta issue by opening edit form
                if (manualIssueManagement && (typeof window !== 'undefined')) {
                  // no-op; manualIssueManagement unrelated, kept for compatibility
                }
                if (typeof (metaIssuesEnabled) !== 'undefined' && metaIssuesEnabled) {
                  items.push({
                    label: 'Add Meta Issue',
                    'data-test': 'add-meta-issue-action',
                    onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                      event.stopPropagation?.();
                      if (handleAddMetaIssue) {
                        handleAddMetaIssue(item);
                      } else {
                        // fallback: open edit form
                        handleEditReleaseVersion(item);
                      }
                    }
                  });
                }

                const showConfirmFreeze = (item.featureFreezeDate && (isToday(item.featureFreezeDate) || isExpired(item.featureFreezeDate))) && !item.freezeConfirmed;
                if (showConfirmFreeze) {
                  items.push({
                    label: 'Confirm Freeze',
                    'data-test': 'confirm-freeze-action',
                    onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                      event.preventDefault?.();
                      event.stopPropagation?.();
                      api.updateReleaseVersion({ ...item, freezeConfirmed: true })
                        .then(() => {
                          window.dispatchEvent(new Event('release-versions-updated'));
                        })
                        .catch((error: unknown) => {
                          console.error('Failed to confirm freeze', error);
                        });
                    }
                  });
                }
              }
              // Always available: Generate Release Notes action (read-only)
              items.push({
                label: 'Generate Release Notes',
                'data-test': 'generate-release-notes-action',
                onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                  event.stopPropagation?.();
                  if (handleGenerateReleaseNotes) {
                    handleGenerateReleaseNotes(item);
                  }
                }
              });

              if (canDelete) {
                items.push({
                  label: 'Delete',
                  'data-test': 'delete-action',
                  onClick: (_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
                    event.preventDefault?.();
                    event.stopPropagation?.();
                    handleConfirmDelete(item);
                  }
                });
              }
              return items;
            })()}
            onSelect={(_menuItem: ListDataItem<unknown>, event: Event | React.SyntheticEvent<Element>) => {
              event.stopPropagation?.();
            }}
          />
        </div>
      </div>
    </div>
  );
};

VersionItemHeader.displayName = 'VersionItemHeader';