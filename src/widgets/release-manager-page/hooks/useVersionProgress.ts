import {useState, useEffect, useMemo} from 'react';
import {API} from '../api';
import {ReleaseVersion, AppSettings} from '../interfaces';
import {getZoneForValue} from '../utils/progress-helpers';
import type {IssueStatus} from './useIssueStatuses';

interface ProgressData {
  green: number;
  yellow: number;
  red: number;
  grey: number;
  total: number;
}

interface UseVersionProgressReturn {
  mainProgress: ProgressData;
  mainAvailable: boolean;
}

/**
 * Custom hook to calculate progress for planned issues in a release version
 * Handles both regular issues and meta issues with related issues
 * Supports manual issue status overrides (Fixed/Merged -> green)
 *
 * OPTIMIZED: Uses batch API to fetch all field data in one request
 */
export function useVersionProgress(
  item: ReleaseVersion,
  progressSettings: AppSettings,
  issueStatusMap: Record<string, IssueStatus>,
  api: API,
  statusesLoaded: boolean = true // Add statusesLoaded parameter with default value
): UseVersionProgressReturn {
  const [mainProgress, setMainProgress] = useState<ProgressData>({
    green: 0,
    yellow: 0,
    red: 0,
    grey: 0,
    total: 0
  });
  const [mainAvailable, setMainAvailable] = useState<boolean>(() => {
    // Initialize with hasManualStatuses to ensure manual statuses are counted on init
    // even if the release row is collapsed

    // Always check for manual statuses, regardless of statusesLoaded flag
    // This ensures manual statuses are counted on app init, even if statuses are not fully loaded yet

    if (!item.plannedIssues || item.plannedIssues.length === 0) {
      return false;
    }

    const issueIds = item.plannedIssues
      .filter(Boolean)
      .map(issue => issue.id)
      .filter(Boolean);

    const uniqueIds = Array.from(new Set(issueIds));
    const nonDiscopedIds = uniqueIds.filter(id => {
      const st = issueStatusMap[id as keyof typeof issueStatusMap] || 'Unresolved';
      return st !== 'Discoped';
    });

    return nonDiscopedIds.some(id => {
      const st = issueStatusMap[id as keyof typeof issueStatusMap] || 'Unresolved';
      return st === 'Fixed' || st === 'Merged';
    });
  });

  // Memoize the issue IDs to avoid unnecessary recalculations
  const effectiveIdsRaw = useMemo(() => {
    if (!item.plannedIssues || item.plannedIssues.length === 0) {
      return [];
    }
    return item.plannedIssues
      .filter(Boolean)
      .map(issue => issue.id)
      .filter(Boolean);
  }, [item.plannedIssues]);

  // Memoize the filtered IDs (excluding Discoped issues)
  const filteredIds = useMemo(() => {
    const uniqueIds = Array.from(new Set(effectiveIdsRaw));
    return uniqueIds.filter(id => {
      const st = issueStatusMap[id as keyof typeof issueStatusMap] || 'Unresolved';
      return st !== 'Discoped';
    });
  }, [effectiveIdsRaw, issueStatusMap]);

  // Memoize the issue map to avoid recreating it on every render
  type IssueRef = { id: string; isMeta?: boolean; metaRelatedIssueIds?: string[] };
  const idToIssue = useMemo(() => {
    return Object.fromEntries(
      (item.plannedIssues || [])
        .filter(Boolean)
        .map(it => [
          it.id,
          {
            id: it.id,
            isMeta: (it as unknown as IssueRef).isMeta,
            metaRelatedIssueIds: (it as unknown as IssueRef).metaRelatedIssueIds
          }
        ])
    );
  }, [item.plannedIssues]);

  // Memoize the set of issue IDs that need field data
  const allIssueIdsToFetch = useMemo(() => {
    const idsToFetch = new Set<string>();

    filteredIds.forEach((id: string) => {
      const issue = idToIssue[id];
      const st = issueStatusMap[id as keyof typeof issueStatusMap] || 'Unresolved';

      // Skip if manual override
      if (st === 'Fixed' || st === 'Merged') {
        return;
      }

      // For meta issues, collect related issue IDs
      if (issue && issue.isMeta && Array.isArray(issue.metaRelatedIssueIds)) {
        issue.metaRelatedIssueIds.forEach((relId: string) => {
          const relStatus = issueStatusMap[relId as keyof typeof issueStatusMap] || 'Unresolved';
          // Only fetch if not discoped and not manually set
          if (relStatus !== 'Discoped' && relStatus !== 'Fixed' && relStatus !== 'Merged') {
            idsToFetch.add(relId);
          }
        });
      } else {
        // Regular issue
        idsToFetch.add(id);
      }
    });

    return idsToFetch;
  }, [filteredIds, idToIssue, issueStatusMap]);

  // Check if there are any manual statuses (Fixed/Merged) that should be counted
  const hasManualStatuses = useMemo(() => {
    // Always check for manual statuses, regardless of statusesLoaded flag
    // This ensures manual statuses are counted on app init, even if statuses are not fully loaded yet
    return filteredIds.some(id => {
      const st = issueStatusMap[id as keyof typeof issueStatusMap] || 'Unresolved';
      return st === 'Fixed' || st === 'Merged';
    });
  }, [filteredIds, issueStatusMap]);

  // Update mainAvailable if manual statuses change after initialization
  useEffect(() => {
    if (hasManualStatuses) {
      setMainAvailable(true);
    }
  }, [hasManualStatuses]);

  useEffect(() => {
    // Early exit only if there are no planned issues
    // We still need to process manual status overrides (Fixed/Merged) even without custom fields!
    if (filteredIds.length === 0) {
      setMainProgress({ green: 0, yellow: 0, red: 0, grey: 0, total: 0 });
      setMainAvailable(false);
      return;
    }

    // If statuses are not loaded yet, don't calculate progress
    // This prevents race conditions with internal components
    if (!statusesLoaded && !hasManualStatuses) {
      return;
    }

    const fetchIssueData = async () => {
      try {
        // Step 1 & 2: Use memoized values for issue map and IDs to fetch

        // Step 3: Fetch ALL field data in ONE batch request
        // Only fetch if we have both issues to fetch AND custom field names configured
        // If no custom fields configured, we'll still process manual overrides (Fixed/Merged)
        const hasCustomFields = progressSettings.customFieldNames && progressSettings.customFieldNames.length > 0;
        const shouldFetch = allIssueIdsToFetch.size > 0 && hasCustomFields;

        // Use memoized allIssueIdsToFetch to avoid duplicate API calls
        const batchResults = shouldFetch
          ? await api.getIssueFieldBulkBatch(
              Array.from(allIssueIdsToFetch),
              progressSettings.customFieldNames
            )
          : {}; // Empty results when no field data needed or no custom fields configured

        // Step 4: Process results
        const initial = { green: 0, yellow: 0, red: 0, grey: 0, total: 0 };
        // Always use the memoized hasManualStatuses value to ensure manual statuses are counted
        // regardless of statusesLoaded flag, consistent with the initialization logic
        let mainAny = hasManualStatuses;

        // eslint-disable-next-line complexity
        const processedResults = filteredIds.map((id: string) => {
          const issue = idToIssue[id];
          const st = issueStatusMap[id as keyof typeof issueStatusMap] || 'Unresolved';

          // Manual override: Fixed/Merged -> green
          if (st === 'Fixed' || st === 'Merged') {
            mainAny = true; // Ensure manual statuses are counted in availability check
            return { parent: { green: 1, yellow: 0, red: 0, grey: 0, total: 1, available: true } };
          }

          // Meta issue handling
          if (issue && issue.isMeta && Array.isArray(issue.metaRelatedIssueIds) && issue.metaRelatedIssueIds.length > 0) {
            const relatedIds = issue.metaRelatedIssueIds;
            let considered = 0;
            let hasRed = false;
            let hasYellow = false;
            let allGreen = true;
            let hasGreen = false;
            let available = false;

            for (const relId of relatedIds) {
              const relStatus = issueStatusMap[relId as keyof typeof issueStatusMap] || 'Unresolved';
              if (relStatus === 'Discoped') {
                continue;
              }
              considered++;

              if (relStatus === 'Fixed' || relStatus === 'Merged') {
                hasGreen = true;
                available = true;
                continue;
              }

              // Get field data from batch result
              const result = batchResults[relId];
              if (result && result.items) {
                const parentVal = result.items.find(it => it.id === relId)?.value ?? null;
                if (parentVal !== null) {
                  available = true;
                }
                const z = getZoneForValue(parentVal, progressSettings);
                if (z === 'red') {
                  hasRed = true;
                }
                if (z === 'yellow') {
                  hasYellow = true;
                }
                if (z === 'green') {
                  hasGreen = true;
                } else {
                  allGreen = false;
                }
              } else {
                allGreen = false;
              }
            }

            let zone: 'green' | 'yellow' | 'red' | 'grey';
            if (considered > 0) {
              if (hasRed) {
                zone = 'red';
              } else if (hasYellow) {
                zone = 'yellow';
              } else if (allGreen && hasGreen) {
                zone = 'green';
              } else {
                zone = 'grey';
              }
            } else {
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

          // Regular issue handling
          const result = batchResults[id];
          if (!result || !result.items) {
            return { parent: { green: 0, yellow: 0, red: 0, grey: 1, total: 1, available: false } };
          }

          const items = result.items;
          const parent = { green: 0, yellow: 0, red: 0, grey: 1, total: 1, available: false };

          const hasAnyNonNull = items.some(it => it && it.value !== null);
          if (!hasAnyNonNull) {
            return { parent };
          }

          parent.available = true;
          parent.grey = 0;

          const parentValue = items.find(it => it.id === id)?.value ?? null;

          let parentZone: 'green' | 'yellow' | 'red' | 'grey';
          if (parentValue === null || parentValue === undefined) {
            const subtaskValues = items.filter(it => it.id !== id).map(it => it.value);
            if (subtaskValues.length === 0) {
              parentZone = 'grey';
            } else {
              let hasRed = false;
              let hasYellow = false;
              let allGreen = true;
              let hasGreen = false;
              for (const v of subtaskValues) {
                const z = getZoneForValue(v, progressSettings);
                if (z === 'red') {
                  hasRed = true;
                }
                if (z === 'yellow') {
                  hasYellow = true;
                }
                if (z === 'green') {
                  hasGreen = true;
                } else {
                  allGreen = false;
                }
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
            parentZone = getZoneForValue(parentValue, progressSettings);
          }

          const register = (state: 'green' | 'yellow' | 'grey' | 'red') => {
            parent.green += state === 'green' ? 1 : 0;
            parent.yellow += state === 'yellow' ? 1 : 0;
            parent.red += state === 'red' ? 1 : 0;
            parent.grey += state === 'grey' ? 1 : 0;
          };

          register(parentZone);

          return { parent };
        });

        const aggregatedMain = processedResults.reduce(
          (acc: ProgressData, r: { parent: ProgressData & { available: boolean } }) => {
            acc.green += r.parent.green;
            acc.yellow += r.parent.yellow;
            acc.red += r.parent.red;
            acc.grey += r.parent.grey;
            acc.total += r.parent.total;
            if (r.parent.available) {
              mainAny = true;
            }
            return acc;
          },
          { ...initial }
        );

        setMainProgress(aggregatedMain);
        setMainAvailable(mainAny);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to calculate version progress:', error);
      }
    };

    fetchIssueData();
    // Include all memoized values in dependencies to ensure effect only runs when inputs change
  }, [filteredIds, idToIssue, allIssueIdsToFetch, progressSettings, api, hasManualStatuses, issueStatusMap, statusesLoaded]);

  return {
    mainProgress,
    mainAvailable
  };
}
