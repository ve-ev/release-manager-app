import {useState, useEffect} from 'react';
import {API} from '../api';
import {logger} from '../utils/logger';

interface Permissions {
  canAccessSettings: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Full release manager (can freeze/unfreeze, view audit, release/unrelease). */
  isReleaseManager: boolean;
  /** Limited manager (can edit releases but not lifecycle actions). */
  isLightManager: boolean;
}

/**
 * Custom hook to load user permissions
 */
export function usePermissions(api: API) {
  const [permissions, setPermissions] = useState<Permissions>({
    canAccessSettings: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    isReleaseManager: false,
    isLightManager: false
  });

  useEffect(() => {
    let isMounted = true;

    const loadPermissions = async () => {
      try {
        const response = await api.getPermissions();
        if (!isMounted) {return;}

        const isReleaseManager = response.isManager;
        const isLightManager = response.isLightManager;
        setPermissions({
          canAccessSettings: isReleaseManager,
          canCreate: isReleaseManager,
          canEdit: isLightManager || isReleaseManager,
          canDelete: isReleaseManager,
          isReleaseManager,
          isLightManager
        });
      } catch (error) {
        logger.error('Failed to load permissions:', error);
        if (!isMounted) {return;}

        setPermissions({
          canAccessSettings: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          isReleaseManager: false,
          isLightManager: false
        });
      }
    };

    loadPermissions();

    return () => {
      isMounted = false;
    };
  }, [api]);

  return permissions;
}

