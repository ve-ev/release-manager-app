import {useState, useCallback} from 'react';
import {HostAPI} from '../../../../@types/globals';
import {fetchIssuesBatch} from '../utils/helpers';

interface IssueData {
  id: string;
  idReadable?: string;
  summary: string;
}

interface UseIssueSearchReturn {
  isLoadingIssues: boolean;
  searchError: string | undefined;
  searchIssues: (input: string, existingIssues: IssueData[]) => Promise<IssueData[]>;
  setSearchError: React.Dispatch<React.SetStateAction<string | undefined>>;
}

/**
 * Custom hook to handle searching and fetching issues by ID
 * Provides common logic for parsing comma-separated issue IDs,
 * fetching their details, and handling errors
 */
export function useIssueSearch(host: HostAPI): UseIssueSearchReturn {
  const [isLoadingIssues, setIsLoadingIssues] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | undefined>(undefined);

  const searchIssues = useCallback(async (input: string, existingIssues: IssueData[] = []): Promise<IssueData[]> => {
    setSearchError(undefined);
    
    const ids = input
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    
    if (ids.length === 0) {
      return [];
    }

    setIsLoadingIssues(true);
    
    // Batch fetch all issues in ONE request instead of sequential calls
    const results = await fetchIssuesBatch(host, ids);
    
    const newIssues: IssueData[] = [];
    const notFound: string[] = [];

    results.forEach(res => {
      if (res.found && res.issue) {
        newIssues.push(res.issue);
      } else {
        notFound.push(res.issueId || 'unknown');
      }
    });
    
    setIsLoadingIssues(false);

    // Set error if any issues weren't found
    if (notFound.length > 0) {
      setSearchError(`Could not find the following issues: ${notFound.join(', ')}`);
      if (newIssues.length === 0) {
        return [];
      }
    }

    // Filter out duplicates
    const existing = existingIssues || [];
    const unique = newIssues.filter(ni => !existing.some(e => e.id === ni.id));
    
    if (unique.length === 0 && newIssues.length > 0) {
      setSearchError('All issues are already added to the list.');
      return [];
    }
    
    return unique;
  }, [host]);

  return {
    isLoadingIssues,
    searchError,
    searchIssues,
    setSearchError
  };
}

