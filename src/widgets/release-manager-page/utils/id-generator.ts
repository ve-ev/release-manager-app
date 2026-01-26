/**
 * Generate unique client-side IDs
 * 
 * Uses crypto.randomUUID() when available for maximum uniqueness.
 * Falls back to timestamp + high-entropy random values.
 */

/**
 * Generate a unique ID with optional prefix
 * 
 * @param prefix - Optional prefix for the ID (e.g., 'META', 'PRODUCT')
 * @returns Unique ID string
 */
export function generateClientId(prefix = ''): string {
  const BASE36_RADIX = 36;
  const RANDOM_START_INDEX = 2;
  const RANDOM_END_INDEX = 15;

  // Use crypto.randomUUID if available (most modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    const uuid = crypto.randomUUID();
    return prefix ? `${prefix}-${uuid}` : uuid;
  }
  
  // Fallback to timestamp + high-entropy random
  // Using base36 encoding for shorter, readable IDs
  const timestamp = Date.now().toString(BASE36_RADIX);
  const random1 = Math.random().toString(BASE36_RADIX).substring(RANDOM_START_INDEX, RANDOM_END_INDEX);
  const random2 = Math.random().toString(BASE36_RADIX).substring(RANDOM_START_INDEX, RANDOM_END_INDEX);
  const uniqueId = `${timestamp}-${random1}${random2}`;
  
  return prefix ? `${prefix}-${uniqueId}` : uniqueId;
}

