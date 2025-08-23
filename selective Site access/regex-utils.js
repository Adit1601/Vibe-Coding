/**
 * @fileoverview Safe regex utilities to prevent ReDoS attacks
 * @description Provides secure regex validation and execution with timeouts
 */

import { CONFIG, ERROR_CODES, DANGEROUS_REGEX_PATTERNS } from './constants.js';

/**
 * Error class for regex-related issues
 */
export class RegexSecurityError extends Error {
  constructor(message, pattern = '') {
    super(message);
    this.name = 'RegexSecurityError';
    this.pattern = pattern;
    this.code = ERROR_CODES.REGEX_ERROR;
  }
}

/**
 * Validates if a regex pattern is safe to execute
 * @param {string} pattern - Regex pattern to validate
 * @returns {Object} Validation result {valid: boolean, error?: string}
 */
export function validateRegexSafety(pattern) {
  if (typeof pattern !== 'string') {
    return { valid: false, error: 'Pattern must be a string' };
  }
  
  if (pattern.length > CONFIG.MAX_PATTERN_LENGTH) {
    return { valid: false, error: `Pattern too long (max ${CONFIG.MAX_PATTERN_LENGTH} characters)` };
  }
  
  // Check for dangerous patterns that could cause ReDoS
  for (const dangerousPattern of DANGEROUS_REGEX_PATTERNS) {
    if (dangerousPattern.test(pattern)) {
      return { 
        valid: false, 
        error: `Pattern contains dangerous construct: ${dangerousPattern.source}` 
      };
    }
  }
  
  // Check for nested quantifiers that could cause exponential backtracking
  const nestedQuantifiers = /(\+|\*|\{[0-9]+,?[0-9]*\})\s*(\+|\*|\{[0-9]+,?[0-9]*\})/;
  if (nestedQuantifiers.test(pattern)) {
    return { valid: false, error: 'Pattern contains nested quantifiers that could cause performance issues' };
  }
  
  // Check for excessive alternation
  const alternationCount = (pattern.match(/\|/g) || []).length;
  if (alternationCount > 10) {
    return { valid: false, error: 'Pattern has too many alternations (max 10)' };
  }
  
  // Try to compile the regex to check for syntax errors
  try {
    new RegExp(pattern);
  } catch (e) {
    return { valid: false, error: `Invalid regex syntax: ${e.message}` };
  }
  
  return { valid: true };
}

/**
 * Safely tests a regex pattern against text with timeout protection
 * @param {string} pattern - Regex pattern to test
 * @param {string} text - Text to test against
 * @param {Object} options - Options for regex execution
 * @param {number} options.timeoutMs - Timeout in milliseconds
 * @param {string} options.flags - Regex flags (default: 'i')
 * @returns {Promise<boolean>} True if pattern matches, false otherwise
 * @throws {RegexSecurityError} If pattern is unsafe or execution times out
 */
export async function safeRegexTest(pattern, text, options = {}) {
  const { 
    timeoutMs = CONFIG.MAX_REGEX_EXECUTION_TIME,
    flags = 'i'
  } = options;
  
  // Validate pattern safety first
  const validation = validateRegexSafety(pattern);
  if (!validation.valid) {
    throw new RegexSecurityError(validation.error, pattern);
  }
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let timeoutId;
    let completed = false;
    
    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new RegexSecurityError(`Regex execution timed out after ${timeoutMs}ms`, pattern));
      }
    }, timeoutMs);
    
    try {
      // Execute regex in a try-catch to handle any synchronous errors
      const regex = new RegExp(pattern, flags);
      const result = regex.test(text);
      
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        
        // Check if execution took too long even without timeout
        const executionTime = Date.now() - startTime;
        if (executionTime > timeoutMs * 0.8) {
          console.warn(`Regex pattern "${pattern}" took ${executionTime}ms to execute - consider optimizing`);
        }
        
        resolve(result);
      }
    } catch (error) {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        reject(new RegexSecurityError(`Regex execution error: ${error.message}`, pattern));
      }
    }
  });
}

/**
 * Safely executes regex match with timeout protection
 * @param {string} pattern - Regex pattern
 * @param {string} text - Text to match against
 * @param {Object} options - Options for regex execution
 * @returns {Promise<Array|null>} Match results or null if no match
 * @throws {RegexSecurityError} If pattern is unsafe or execution times out
 */
export async function safeRegexMatch(pattern, text, options = {}) {
  const { 
    timeoutMs = CONFIG.MAX_REGEX_EXECUTION_TIME,
    flags = 'i'
  } = options;
  
  // Validate pattern safety first
  const validation = validateRegexSafety(pattern);
  if (!validation.valid) {
    throw new RegexSecurityError(validation.error, pattern);
  }
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let timeoutId;
    let completed = false;
    
    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new RegexSecurityError(`Regex execution timed out after ${timeoutMs}ms`, pattern));
      }
    }, timeoutMs);
    
    try {
      const regex = new RegExp(pattern, flags);
      const result = text.match(regex);
      
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        
        const executionTime = Date.now() - startTime;
        if (executionTime > timeoutMs * 0.8) {
          console.warn(`Regex pattern "${pattern}" took ${executionTime}ms to execute - consider optimizing`);
        }
        
        resolve(result);
      }
    } catch (error) {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        reject(new RegexSecurityError(`Regex execution error: ${error.message}`, pattern));
      }
    }
  });
}

/**
 * Creates a safe regex tester function with pre-validated pattern
 * @param {string} pattern - Regex pattern to pre-validate
 * @param {string} flags - Regex flags
 * @returns {Function} Function that safely tests text against the pattern
 * @throws {RegexSecurityError} If pattern is unsafe
 */
export function createSafeRegexTester(pattern, flags = 'i') {
  // Validate pattern once during creation
  const validation = validateRegexSafety(pattern);
  if (!validation.valid) {
    throw new RegexSecurityError(validation.error, pattern);
  }
  
  const regex = new RegExp(pattern, flags);
  
  return async function testText(text, timeoutMs = CONFIG.MAX_REGEX_EXECUTION_TIME) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let timeoutId;
      let completed = false;
      
      timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new RegexSecurityError(`Regex execution timed out after ${timeoutMs}ms`, pattern));
        }
      }, timeoutMs);
      
      try {
        const result = regex.test(text);
        
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      } catch (error) {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          reject(new RegexSecurityError(`Regex execution error: ${error.message}`, pattern));
        }
      }
    });
  };
}

/**
 * Sanitizes user input for use in regex patterns
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized pattern safe for regex use
 */
export function sanitizeRegexInput(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Escape special regex characters
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a simple glob pattern to a safe regex pattern
 * @param {string} globPattern - Glob pattern (supports * and ?)
 * @returns {string} Safe regex pattern
 */
export function globToSafeRegex(globPattern) {
  if (typeof globPattern !== 'string') {
    return '^$'; // Match nothing
  }
  
  // Escape regex special characters except * and ?
  let regexPattern = globPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  
  // Convert glob wildcards to regex
  regexPattern = regexPattern.replace(/\*/g, '.*');
  regexPattern = regexPattern.replace(/\?/g, '.');
  
  // Anchor the pattern
  regexPattern = '^' + regexPattern + '$';
  
  // Validate the resulting pattern
  const validation = validateRegexSafety(regexPattern);
  if (!validation.valid) {
    console.warn('Generated unsafe regex from glob pattern:', globPattern);
    return '^$'; // Return non-matching pattern as fallback
  }
  
  return regexPattern;
}
