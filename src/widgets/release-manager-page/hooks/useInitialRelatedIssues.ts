import {useState, useEffect} from 'react';
import {HostAPI} from '../../../../@types/globals';
import {fetchIssuesBatch} from '../utils/helpers';

interface IssueData {
  id: string;
  idReadable?: string;
  summary: string;
}

interface UseInitialRelatedIssuesReturn {
  relatedIssues: IssueData[];
  setRelatedIssues: React.Dispatch<React.SetStateAction<IssueData[]>>;
  isLoading: boolean;
}

/**
 * Custom hook to load initial related issues by their IDs
 * Used in meta issue forms to populate existing issues
 */
export function useInitialRelatedIssues(
  host: HostAPI,
  initialRelatedIssueIds: string[]
): UseInitialRelatedIssuesReturn {
  const [relatedIssues, setRelatedIssues] = useState<IssueData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const loadIssues = async () => {
      if (!initialRelatedIssueIds || initialRelatedIssueIds.length === 0) {
        return;
      }
      
      setIsLoading(true);
      
      // Batch fetch all issues in ONE request instead of sequential calls
      const results = await fetchIssuesBatch(host, initialRelatedIssueIds);
      const found: IssueData[] = [];
      
      results.forEach(res => {
        if (res.found && res.issue) {
          found.push(res.issue);
        }
      });
      
      setRelatedIssues(found);
      setIsLoading(false);
    };
    
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount, not when initialRelatedIssueIds changes

  return { relatedIssues, setRelatedIssues, isLoading };
}

