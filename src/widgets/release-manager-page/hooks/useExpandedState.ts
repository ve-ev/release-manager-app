import {useState, useEffect, useCallback} from 'react';
import {API} from '../api';
import {logger} from '../utils/logger';

/**
 * Custom hook to manage expanded/collapsed state of release versions
 */
export function useExpandedState(api: API) {
  const [expandedReleaseVersions, setExpandedReleaseVersions] = useState<Set<string | number>>(new Set());

  // Load previously expanded version for the current user
  useEffect(() => {
    let isMounted = true;
    
    const loadExpanded = async () => {
      try {
        const res = await api.getExpandedVersion();
        if (!isMounted) return;
        
        const v = res && res.expandedVersion;
        if (v !== undefined && v !== null) {
          setExpandedReleaseVersions(new Set<string | number>([v]));
        }
      } catch (error) {
        logger.error('Failed to load expanded state:', error);
      }
    };
    
    loadExpanded();
    
    return () => {
      isMounted = false;
    };
  }, [api]);

  // Toggle expanded state - only one item can be expanded at a time
  const toggleExpandReleaseVersion = useCallback((id: string | number) => {
    setExpandedReleaseVersions(prevExpanded => {
      const expanding = !prevExpanded.has(id);
      const newExpanded = new Set<string | number>();
      if (expanding) {
        newExpanded.add(id);
        // Persist expanded id
        api.setExpandedVersion(id).catch((error) => {
          logger.error('Failed to save expanded state:', error);
        });
      } else {
        // Collapsing all
        api.setExpandedVersion(null).catch((error) => {
          logger.error('Failed to save expanded state:', error);
        });
      }
      return newExpanded;
    });
  }, [api]);

  return {
    expandedReleaseVersions,
    toggleExpandReleaseVersion
  };
}

