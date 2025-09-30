/**
 * @fileoverview Shared constants for the Selective Site Access Chrome Extension
 * @description This file contains all constants used across the extension to ensure consistency
 * and prevent duplication. All modules should import constants from this file.
 */

/**
 * @constant {Object} STORAGE_KEYS
 * @description All Chrome storage keys used throughout the extension.
 * Centralizing these prevents typos and ensures consistency.
 */
export const STORAGE_KEYS = {
  // Core blocking functionality
  allowlistUrls: 'allowlistUrls',
  patternRules: 'patternRules',

  // Authentication and security
  locked: 'locked',
  password: 'password',
  passwordSet: 'passwordSet',
  passwordDisplayed: 'passwordDisplayed',

  // Pause and timer functionality
  pauseUntil: 'pauseUntil',
  pauseStart: 'pauseStart',

  // Analytics and tracking
  blockCount: 'blockCount',
  lastBlockedUrl: 'lastBlockedUrl'
};

/**
 * @constant {Object} RULE_PRIORITIES
 * @description Priority levels for Chrome declarativeNetRequest rules.
 * Higher numbers indicate higher priority.
 */
export const RULE_PRIORITIES = {
  ALLOW: 100,    // Much higher priority - allowlist URLs override everything
  PATTERN: 50,   // Medium priority - pattern-based blocking rules
  BLOCK: 10      // Lowest priority - simple domain blocks
};

/**
 * @constant {Object} CONFIG
 * @description Configuration constants for the extension.
 */
export const CONFIG = {
  // UI and UX settings
  BLOCK_DELAY_MS: 100,
  PASSWORD_MIN_LENGTH: 6,

  // Security limits
  MAX_PATTERN_LENGTH: 1000,
  MAX_REGEX_EXECUTION_TIME: 1000,

  // File paths
  BLOCKED_PAGE_PATH: '/blocked.html'
};

/**
 * @constant {Object} ERROR_CODES
 * @description Error codes for consistent error handling.
 */
export const ERROR_CODES = {
  GENERIC: 'GENERIC',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_URL: 'INVALID_URL',
  INVALID_PATTERN: 'INVALID_PATTERN',
  STORAGE_ERROR: 'STORAGE_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  REGEX_ERROR: 'REGEX_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR'
};

/**
 * @constant {Array<string>} DANGEROUS_REGEX_PATTERNS
 * @description Regex patterns that could cause ReDoS attacks.
 */
export const DANGEROUS_REGEX_PATTERNS = [
  /\(\?=/,     // Positive lookahead
  /\(\?!/,     // Negative lookahead
  /\(\?<=/,    // Positive lookbehind
  /\(\?</,     // Negative lookbehind
  /\{[0-9]+,\}/, // Open-ended quantifiers
  /\+\+/,       // Nested quantifiers
  /\*\*/        // Nested quantifiers
];

/**
 * @constant {Object} DEFAULT_SETTINGS
 * @description Default settings for new installations.
 */
export const DEFAULT_SETTINGS = {
  locked: true,
  pauseUntil: 0,
  pauseStart: 0,
  blockCount: 0,
  allowlistUrls: [],
  patternRules: []
};
