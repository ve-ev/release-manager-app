import {ReleaseVersion} from '../interfaces';

/**
 * Validate release version data
 */
export function validateReleaseVersion(formData: ReleaseVersion): string[] {
  const errors: string[] = [];

  // Only include non-field-specific errors in the general error list
  // Field-specific errors (version, releaseDate) are handled separately

  if (formData.featureFreezeDate && formData.releaseDate) {
    const freezeDate = new Date(formData.featureFreezeDate);
    const releaseDate = new Date(formData.releaseDate);

    if (freezeDate > releaseDate) {
      errors.push('Feature Freeze Date must be before Release Date');
    }
  }

  return errors;
}

/**
 * Validate meta issue data
 */
export function validateMetaIssue(summary: string, relatedIssues: unknown[]): string[] {
  const errors: string[] = [];
  
  if (!summary || summary.trim() === '') {
    errors.push('Issue summary is required');
  }
  
  if (!relatedIssues || relatedIssues.length === 0) {
    errors.push('Please add at least one related issue');
  }
  
  return errors;
}

