/**
 * Cache for normalized progress zone values
 * 
 * This optimization prevents repeated array creation and normalization
 * which was happening thousands of times for progress calculations
 */

import {AppSettings} from '../interfaces';

// Cache for normalized zone values
let cachedSettings: AppSettings | null = null;
let cachedNormalizedZones: {
  green: string[];
  yellow: string[];
  red: string[];
} | null = null;

/**
 * Get normalized zone values with caching
 * Only recalculates when settings change
 */
export function getNormalizedZones(settings: AppSettings): {
  green: string[];
  yellow: string[];
  red: string[];
} {
  // Check if cache is valid
  if (cachedSettings === settings && cachedNormalizedZones) {
    return cachedNormalizedZones;
  }

  // Recalculate and cache
  cachedSettings = settings;
  cachedNormalizedZones = {
    green: (settings.greenZoneValues || []).map(s => s.toLowerCase()),
    yellow: (settings.yellowZoneValues || []).map(s => s.toLowerCase()),
    red: (settings.redZoneValues || []).map(s => s.toLowerCase())
  };

  return cachedNormalizedZones;
}

/**
 * Invalidate the cache (call this when settings are updated)
 */
export function invalidateProgressCache(): void {
  cachedSettings = null;
  cachedNormalizedZones = null;
}

