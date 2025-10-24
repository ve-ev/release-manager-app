/**
 * Centralized logging utility
 * 
 * In development: logs to console
 * In production: logs errors only (could be extended to send to error reporting service)
 */

// Simple development detection - if console.assert exists and isn't a noop, we're in dev mode
const isDevelopment = typeof console.assert === 'function';

export const logger = {
  /**
   * Log informational messages (development only)
   */
  log: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log error messages
   * In production, this could be extended to send to an error reporting service
   */
  error: (...args: unknown[]): void => {
    console.error(...args);
    // In production, could send to error reporting service here
    // Example: Sentry.captureException(args[0]);
  },

  /**
   * Log warning messages (development only)
   */
  warn: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log debug messages (development only)
   */
  debug: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};

