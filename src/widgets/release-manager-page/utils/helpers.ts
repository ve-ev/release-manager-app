/**
 * Common helper functions and utilities
 */
import {HostAPI} from "../../../../@types/globals";
import {ReleaseVersion} from '../interfaces';
import DOMPurify from 'dompurify';
import {marked} from 'marked';

// Configure marked for safe, basic markdown rendering suitable for description blocks
marked.setOptions({
  breaks: true,
  gfm: true
});

/**
 * ========================================
 * API / Issue Fetching
 * ========================================
 */

/**
 * Fetch a single issue from the backend
 */
export async function fetchSingleIssue(
  host: HostAPI,
  issueId: string
): Promise<{
  found: boolean;
  issue?: {
    id: string;
    idReadable: string;
    summary: string;
  };
}> {
  try {
    const response = await host.fetchApp(`backend-global/issue?issueId=${encodeURIComponent(issueId)}`, { scope: false });

    if (response) {
      // Type assertion for response
      const issueResponse = response as {
        id: string;
        idReadable: string;
        summary: string;
      };

      return {
        found: true,
        issue: {
          id: issueResponse.id,
          idReadable: issueResponse.idReadable,
          summary: issueResponse.summary
        }
      };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

/**
 * Batch fetch multiple issues from the backend
 * Much more efficient than calling fetchSingleIssue in a loop
 */
export async function fetchIssuesBatch(
  host: HostAPI,
  issueIds: string[]
): Promise<Array<{
  found: boolean;
  issue?: {
    id: string;
    idReadable: string;
    summary: string;
  };
  issueId?: string;
}>> {
  if (!issueIds || issueIds.length === 0) {
    return [];
  }

  try {
    const response = await host.fetchApp('backend-global/issues-batch', {
      method: 'POST',
      body: { issueIds },
      scope: false
    });

    if (response && Array.isArray(response)) {
      return response as Array<{
        found: boolean;
        issue?: {
          id: string;
          idReadable: string;
          summary: string;
        };
        issueId?: string;
      }>;
    }
    
    // If request fails, return not found for all
    return issueIds.map(id => ({ found: false, issueId: id }));
  } catch {
    // If request fails, return not found for all
    return issueIds.map(id => ({ found: false, issueId: id }));
  }
}

/**
 * ========================================
 * Color Generation
 * ========================================
 */

/**
 * Generate a consistent color based on a string (e.g., product name)
 */
export function generateColorFromString(name: string): string {
  // Simple hash function to generate a number from a string
  const SHIFT_FACTOR = 5;
  const hash = name.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << SHIFT_FACTOR) - acc);
  }, 0);

  // List of predefined colors (similar to those used in YouTrack)
  const colors = [
    '#5cb85c', // green
    '#337ab7', // blue
    '#f0ad4e', // orange
    '#5bc0de', // light blue
    '#d9534f', // red
    '#9370db', // medium purple
    '#20b2aa', // light sea green
    '#ff7f50'  // coral
  ];

  // Use the hash to select a color
  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
}

/**
 * ========================================
 * Status Helpers
 * ========================================
 */

/**
 * Status type definition
 */
export type ReleaseStatus = 'Planning' | 'In progress' | 'Released' | 'Overdue' | 'Canceled';

/**
 * Get color scheme for a release status
 */
export function getStatusColor(statusValue: ReleaseStatus): { bg: string; text: string } {
  switch (statusValue) {
    case 'Planning':
      return { bg: '#e0e0ff', text: '#4040a0' }; // Light blue
    case 'Released':
      return { bg: '#e0ffe0', text: '#206020' }; // Light green
    case 'In progress':
      return { bg: '#d0f0ff', text: '#0060a0' }; // Blue
    case 'Overdue':
      return { bg: '#ffe0e0', text: '#a02020' }; // Light red
    case 'Canceled':
      return { bg: '#f0f0f0', text: '#606060' }; // Gray
    default:
      return { bg: '#e0e0e0', text: '#404040' }; // Default gray
  }
}

/**
 * ========================================
 * Array Reconciliation
 * ========================================
 */

/**
 * Reconcile arrays to preserve object identity for unchanged items.
 * This optimization helps prevent unnecessary rerenders in memoized components.
 */
export function reconcileReleaseVersions(
  prev: ReleaseVersion[],
  next: ReleaseVersion[]
): ReleaseVersion[] {
  const prevById = new Map(prev.map(it => [it.id, it] as const));
  return next.map(n => {
    const p = prevById.get(n.id);
    if (!p) {
      return n;
    }
    // If shallow-equal for fields we render in a row, keep previous reference
    const same = (
      p.product === n.product &&
      p.version === n.version &&
      p.status === n.status &&
      p.releaseDate === n.releaseDate &&
      p.featureFreezeDate === n.featureFreezeDate &&
      (Array.isArray(p.plannedIssues) ? p.plannedIssues.length : 0) === (Array.isArray(n.plannedIssues) ? n.plannedIssues.length : 0)
    );
    return same ? p : n;
  });
}

/**
 * ========================================
 * Markdown Rendering
 * ========================================
 */

/**
 * Render markdown to safe HTML with sanitization
 */
export function renderMarkdownToSafeHtml(markdown?: string): string {
  if (!markdown) {
    return '';
  }
  // Render markdown to HTML
  const rawHtml = marked.parse(markdown) as string;
  // Sanitize the HTML
  return DOMPurify.sanitize(rawHtml, {
    // Allow common formatting and links; images are allowed but could be restricted if needed
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'em', 'strong', 'p', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel']
  });
}

