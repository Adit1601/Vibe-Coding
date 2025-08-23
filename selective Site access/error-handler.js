/**
 * @fileoverview Centralized error handling system for the Chrome Extension
 * @description Provides consistent error handling, logging, and user feedback
 */

import { ERROR_CODES } from './constants.js';

/**
 * Base extension error class
 */
export class ExtensionError extends Error {
  constructor(message, code = ERROR_CODES.GENERIC, context = {}) {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
  
  /**
   * Convert error to JSON for logging/storage
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Domain validation error
 */
export class DomainValidationError extends ExtensionError {
  constructor(domain, reason) {
    super(`Invalid domain "${domain}": ${reason}`, ERROR_CODES.INVALID_DOMAIN, { domain, reason });
    this.name = 'DomainValidationError';
  }
}

/**
 * URL validation error
 */
export class URLValidationError extends ExtensionError {
  constructor(url, reason) {
    super(`Invalid URL "${url}": ${reason}`, ERROR_CODES.INVALID_URL, { url, reason });
    this.name = 'URLValidationError';
  }
}

/**
 * Pattern validation error
 */
export class PatternValidationError extends ExtensionError {
  constructor(pattern, reason) {
    super(`Invalid pattern "${pattern}": ${reason}`, ERROR_CODES.INVALID_PATTERN, { pattern, reason });
    this.name = 'PatternValidationError';
  }
}

/**
 * Storage operation error
 */
export class StorageError extends ExtensionError {
  constructor(operation, reason) {
    super(`Storage operation failed: ${operation} - ${reason}`, ERROR_CODES.STORAGE_ERROR, { operation, reason });
    this.name = 'StorageError';
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends ExtensionError {
  constructor(reason) {
    super(`Authentication failed: ${reason}`, ERROR_CODES.AUTHENTICATION_ERROR, { reason });
    this.name = 'AuthenticationError';
  }
}

/**
 * Permission error
 */
export class PermissionError extends ExtensionError {
  constructor(permission, reason) {
    super(`Permission error: ${permission} - ${reason}`, ERROR_CODES.PERMISSION_ERROR, { permission, reason });
    this.name = 'PermissionError';
  }
}

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error handler configuration
 */
const ERROR_CONFIG = {
  maxLogEntries: 100,
  logToConsole: true,
  logToStorage: false, // Set to true to store errors for debugging
  notifyUser: true
};

/**
 * Centralized error handler class
 */
export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.errorCounts = new Map();
    this.lastNotification = new Map();
  }
  
  /**
   * Handle an error with appropriate logging and user notification
   * @param {Error} error - Error to handle
   * @param {string} context - Context where error occurred
   * @param {string} severity - Error severity level
   * @param {Object} options - Additional options
   */
  handleError(error, context = 'Unknown', severity = ERROR_SEVERITY.MEDIUM, options = {}) {
    const errorInfo = {
      error: error instanceof ExtensionError ? error : new ExtensionError(error.message, ERROR_CODES.GENERIC, { originalError: error.name }),
      context,
      severity,
      timestamp: new Date().toISOString(),
      ...options
    };
    
    // Log error
    this.logError(errorInfo);
    
    // Track error frequency
    this.trackErrorFrequency(error);
    
    // Notify user if appropriate
    if (ERROR_CONFIG.notifyUser && this.shouldNotifyUser(error, severity)) {
      this.notifyUser(errorInfo);
    }
    
    // Store critical errors for later analysis
    if (severity === ERROR_SEVERITY.CRITICAL || ERROR_CONFIG.logToStorage) {
      this.storeError(errorInfo);
    }
  }
  
  /**
   * Log error to console and internal log
   */
  logError(errorInfo) {
    if (ERROR_CONFIG.logToConsole) {
      const { error, context, severity } = errorInfo;
      console.group(`🚨 [${severity.toUpperCase()}] Extension Error in ${context}`);
      console.error('Error:', error.message);
      console.error('Code:', error.code);
      if (error.context && Object.keys(error.context).length > 0) {
        console.error('Context:', error.context);
      }
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
      console.groupEnd();
    }
    
    // Add to internal log
    this.errorLog.push(errorInfo);
    
    // Limit log size
    if (this.errorLog.length > ERROR_CONFIG.maxLogEntries) {
      this.errorLog.shift();
    }
  }
  
  /**
   * Track error frequency to detect patterns
   */
  trackErrorFrequency(error) {
    const errorKey = `${error.name}-${error.message}`;
    const count = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, count + 1);
    
    // Alert on repeated errors
    if (count >= 5) {
      console.warn(`⚠️ Repeated error detected (${count + 1} times):`, error.message);
    }
  }
  
  /**
   * Determine if user should be notified about this error
   */
  shouldNotifyUser(error, severity) {
    // Don't spam user with notifications
    const errorKey = `${error.name}-${error.message}`;
    const lastNotified = this.lastNotification.get(errorKey) || 0;
    const timeSinceLastNotification = Date.now() - lastNotified;
    
    // Only notify once per minute for the same error
    if (timeSinceLastNotification < 60000) {
      return false;
    }
    
    // Always notify for critical errors
    if (severity === ERROR_SEVERITY.CRITICAL) {
      return true;
    }
    
    // Notify for high severity or user-facing errors
    return severity === ERROR_SEVERITY.HIGH || 
           error instanceof DomainValidationError ||
           error instanceof URLValidationError ||
           error instanceof AuthenticationError;
  }
  
  /**
   * Show user-friendly error notification
   */
  notifyUser(errorInfo) {
    const { error, severity } = errorInfo;
    
    // Update last notification time
    const errorKey = `${error.name}-${error.message}`;
    this.lastNotification.set(errorKey, Date.now());
    
    // Get user-friendly message
    const userMessage = this.getUserFriendlyMessage(error);
    
    // Show notification in UI if available
    if (typeof window !== 'undefined' && window.showErrorNotification) {
      window.showErrorNotification(userMessage, severity);
    } else {
      // Fallback: show in console for background scripts
      console.warn(`User Notification: ${userMessage}`);
    }
  }
  
  /**
   * Convert technical error to user-friendly message
   */
  getUserFriendlyMessage(error) {
    switch (error.code) {
      case ERROR_CODES.INVALID_DOMAIN:
        return `Please enter a valid domain name (e.g., example.com)`;
      
      case ERROR_CODES.INVALID_URL:
        return `Please enter a valid URL starting with http:// or https://`;
      
      case ERROR_CODES.INVALID_PATTERN:
        return `The pattern you entered is not valid. Please check the syntax.`;
      
      case ERROR_CODES.STORAGE_ERROR:
        return `Unable to save your settings. Please try again.`;
      
      case ERROR_CODES.AUTHENTICATION_ERROR:
        return `Invalid password. Please try again.`;
      
      case ERROR_CODES.REGEX_ERROR:
        return `The regular expression pattern is invalid or potentially unsafe.`;
      
      case ERROR_CODES.PERMISSION_ERROR:
        return `The extension doesn't have the required permissions for this action.`;
      
      default:
        return `An unexpected error occurred. Please try again.`;
    }
  }
  
  /**
   * Store error for later analysis
   */
  async storeError(errorInfo) {
    try {
      const storedErrors = await this.getStoredErrors();
      storedErrors.push(errorInfo);
      
      // Keep only last 50 errors
      if (storedErrors.length > 50) {
        storedErrors.splice(0, storedErrors.length - 50);
      }
      
      await chrome.storage.local.set({ errorLog: storedErrors });
    } catch (e) {
      console.error('Failed to store error:', e);
    }
  }
  
  /**
   * Get stored errors for debugging
   */
  async getStoredErrors() {
    try {
      const result = await chrome.storage.local.get(['errorLog']);
      return result.errorLog || [];
    } catch (e) {
      console.error('Failed to retrieve stored errors:', e);
      return [];
    }
  }
  
  /**
   * Clear all stored errors
   */
  async clearStoredErrors() {
    try {
      await chrome.storage.local.remove(['errorLog']);
      this.errorLog = [];
      this.errorCounts.clear();
      this.lastNotification.clear();
    } catch (e) {
      console.error('Failed to clear stored errors:', e);
    }
  }
  
  /**
   * Get error statistics
   */
  getErrorStats() {
    const recentErrors = this.errorLog.filter(
      errorInfo => Date.now() - new Date(errorInfo.timestamp).getTime() < 24 * 60 * 60 * 1000
    );
    
    const errorTypes = new Map();
    recentErrors.forEach(errorInfo => {
      const type = errorInfo.error.name;
      errorTypes.set(type, (errorTypes.get(type) || 0) + 1);
    });
    
    return {
      totalErrors: this.errorLog.length,
      recentErrors: recentErrors.length,
      errorTypes: Object.fromEntries(errorTypes),
      mostFrequentErrors: Array.from(this.errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

/**
 * Convenience function for handling errors
 * @param {Error} error - Error to handle
 * @param {string} context - Context where error occurred
 * @param {string} severity - Error severity
 */
export function handleError(error, context = 'Unknown', severity = ERROR_SEVERITY.MEDIUM) {
  errorHandler.handleError(error, context, severity);
}

/**
 * Wrapper for async functions with automatic error handling
 * @param {Function} asyncFn - Async function to wrap
 * @param {string} context - Context for error handling
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(asyncFn, context = 'AsyncOperation') {
  return async function(...args) {
    try {
      return await asyncFn.apply(this, args);
    } catch (error) {
      handleError(error, context, ERROR_SEVERITY.HIGH);
      throw error; // Re-throw so calling code can handle if needed
    }
  };
}

/**
 * Promise wrapper with error handling
 * @param {Promise} promise - Promise to wrap
 * @param {string} context - Context for error handling
 * @returns {Promise} Wrapped promise
 */
export function withErrorHandlingPromise(promise, context = 'Promise') {
  return promise.catch(error => {
    handleError(error, context, ERROR_SEVERITY.HIGH);
    throw error;
  });
}
