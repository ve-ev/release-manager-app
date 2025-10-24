import {AppSettings} from '../interfaces';
import {ProgressZone} from '../components/table/progress/progress-bar';
import {DEFAULT_PROGRESS_COLORS} from './constants';
import {getNormalizedZones} from './progress-cache';

/**
 * Determine the zone for a field value based on settings
 * OPTIMIZED: Uses cached normalized zone values
 */
export function getZoneForValue(
  value: string | null,
  settings: AppSettings
): 'green' | 'yellow' | 'red' | 'grey' {
  if (!value) {
    return 'grey';
  }
  const v = value.toString().toLowerCase();
  
  // Get cached normalized zones (prevents repeated array creation)
  const zones = getNormalizedZones(settings);

  if (zones.green.includes(v)) {
    return 'green';
  }
  if (zones.yellow.includes(v)) {
    return 'yellow';
  }
  if (zones.red.includes(v)) {
    return 'red';
  }
  return 'grey';
}

/**
 * Get zone with custom color based on settings
 * OPTIMIZED: Uses cached normalized zone values
 */
export function getZoneWithColor(
  fieldValue: string | null,
  settings: AppSettings
): { zone: ProgressZone; customColor: string } {
  if (!fieldValue) {
    return { zone: ProgressZone.GREY, customColor: settings.greyColor || DEFAULT_PROGRESS_COLORS.grey };
  }
  const v = fieldValue.toString().toLowerCase();
  
  // Get cached normalized zones (prevents repeated array creation)
  const zones = getNormalizedZones(settings);
  
  if (zones.green.includes(v)) {
    return { zone: ProgressZone.GREEN, customColor: settings.greenColor || DEFAULT_PROGRESS_COLORS.green };
  }
  if (zones.yellow.includes(v)) {
    return { zone: ProgressZone.YELLOW, customColor: settings.yellowColor || DEFAULT_PROGRESS_COLORS.yellow };
  }
  if (zones.red.includes(v)) {
    return { zone: ProgressZone.RED, customColor: settings.redColor || DEFAULT_PROGRESS_COLORS.red };
  }
  return { zone: ProgressZone.GREY, customColor: settings.greyColor || DEFAULT_PROGRESS_COLORS.grey };
}

/**
 * Get status colors for issue status
 */
export function getStatusColor(
  status: 'Unresolved' | 'Fixed' | 'Merged' | 'Discoped'
): { bg: string; text: string } {
  switch (status) {
    case 'Unresolved':
      return { bg: '#ffe0e0', text: '#a02020' };
    case 'Fixed':
      return { bg: '#e0ffe0', text: '#206020' };
    case 'Merged':
      return { bg: '#d0f0ff', text: '#0060a0' };
    case 'Discoped':
      return { bg: '#f0f0f0', text: '#606060' };
    default:
      return { bg: '#e0e0e0', text: '#404040' };
  }
}

/**
 * Get test status colors
 */
export function getTestStatusColor(
  status: 'Tested' | 'Not tested' | 'Test NA'
): { bg: string; text: string } {
  switch (status) {
    case 'Tested':
      return { bg: '#e0ffe0', text: '#206020' };
    case 'Test NA':
      return { bg: '#ffe0e0', text: '#a02020' };
    case 'Not tested':
    default:
      return { bg: '#e0e0e0', text: '#404040' };
  }
}

