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
  // Use crypto.randomUUID if available (most modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    const uuid = crypto.randomUUID();
    return prefix ? `${prefix}-${uuid}` : uuid;
  }
  
  // Fallback to timestamp + high-entropy random
  // Using base36 encoding for shorter, readable IDs
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2, 15);
  const random2 = Math.random().toString(36).substring(2, 15);
  const uniqueId = `${timestamp}-${random1}${random2}`;
  
  return prefix ? `${prefix}-${uniqueId}` : uniqueId;
}

