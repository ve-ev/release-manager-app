import {ReleaseVersion} from '../interfaces';

export type IssueStatus = 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped';

export interface ReleaseNotesOptions {
  manualIssueManagement?: boolean;
  issueStatuses?: Record<string, IssueStatus | string>;
}

/**
 * Generate Markdown release notes for a ReleaseVersion
 * - Header: product name and version
 * - Description and Additional Info sections when present
 * - List of planned issues with ID and Summary
 * - If manual issue management is enabled, excludes issues with status Discoped
 */
/* eslint-disable complexity */
export function generateReleaseNotesMarkdown(rv: ReleaseVersion, opts?: ReleaseNotesOptions): string {
  const lines: string[] = [];
  const headerTitle = [rv.product, rv.version].filter(Boolean).join(' ');
  if (headerTitle) {
    lines.push(`# ${headerTitle}`);
    lines.push('');
  }

  if (rv.description && rv.description.trim()) {
    lines.push('## Description');
    lines.push('');
    lines.push(rv.description.trim());
    lines.push('');
  }

  if (rv.additionalInfo && rv.additionalInfo.trim()) {
    lines.push('## Additional Info');
    lines.push('');
    lines.push(rv.additionalInfo.trim());
    lines.push('');
  }

  const rawPlanned = Array.isArray(rv.plannedIssues) ? rv.plannedIssues : [];
  const planned = (opts?.manualIssueManagement && opts?.issueStatuses)
    ? rawPlanned.filter(it => (opts.issueStatuses as Record<string, string>)[it.id] !== 'Discoped')
    : rawPlanned;

  if (planned.length > 0) {
    lines.push('## Planned Issues');
    lines.push('');
    for (const it of planned) {
      const id = it.idReadable || it.id;
      const summary = it.summary || '';
      // Output only ID and Summary; no status
      lines.push(`- ${id}: ${summary}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
