import {useState, useEffect} from 'react';
import {API} from '../api';
import {logger} from '../utils/logger';

interface AppConfig {
    manualIssueManagement: boolean;
    metaIssuesEnabled: boolean;
    customFieldsMapping: boolean;
}

/**
 * Custom hook to load application configuration
 */
export function useAppConfig(api: API) {
    const [config, setConfig] = useState<AppConfig>({
        manualIssueManagement: false,
        metaIssuesEnabled: false,
        customFieldsMapping: false
    });

    useEffect(() => {
        let isMounted = true;

        const loadConfig = async () => {
            try {
                const appConfig = await api.getConfig();
                if (!isMounted) {
                    return
                }

                const manualIssueManagement = appConfig.manualIssueManagement as boolean;
                const metaIssuesEnabled = (appConfig as unknown as {
                    metaIssuesEnabled?: boolean
                }).metaIssuesEnabled as boolean;
                const customFieldsMapping = (appConfig as unknown as {
                    customFieldsMapping?: boolean
                }).customFieldsMapping as boolean;
                setConfig({
                    manualIssueManagement: manualIssueManagement,
                    metaIssuesEnabled: metaIssuesEnabled,
                    customFieldsMapping: customFieldsMapping
                });
            } catch (error) {
                logger.error('Failed to load app config:', error);
            }
        };

        loadConfig();

        return () => {
            isMounted = false;
        };
    }, [api]);

    return config;
}

