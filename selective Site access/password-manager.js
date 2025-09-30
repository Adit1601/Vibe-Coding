/**
 * @fileoverview Secure password management for the Chrome Extension
 * @description Handles password generation, validation, and security checks
 */

import { STORAGE_KEYS, CONFIG, ERROR_CODES } from './constants.js';

/**
 * Generates a cryptographically secure random password
 * @param {number} length - Password length (minimum 12)
 * @returns {string} Generated password
 */
function generateSecurePassword(length = 12) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  return password;
}

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with score and feedback
 */
function validatePasswordStrength(password) {
  let score = 0;
  const feedback = [];
  
  if (password.length < CONFIG.PASSWORD_MIN_LENGTH) {
    feedback.push(`Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters long`);
  } else {
    score += 1;
  }
  
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  
  // Check for common weak patterns
  if (/(.)\1{2,}/.test(password)) {
    feedback.push('Avoid repeating characters');
    score -= 1;
  }
  
  if (/123|abc|qwe|password/i.test(password)) {
    feedback.push('Avoid common patterns');
    score -= 1;
  }
  
  let strength = 'weak';
  let percentage = 25;
  
  if (score <= 2) {
    strength = 'weak';
    percentage = 25;
    feedback.push('Weak - Add more characters and variety');
  } else if (score <= 3) {
    strength = 'fair';
    percentage = 50;
    feedback.push('Fair - Consider adding symbols or mixed case');
  } else if (score <= 4) {
    strength = 'good';
    percentage = 75;
    feedback.push('Good - Strong password');
  } else {
    strength = 'strong';
    percentage = 100;
    feedback.push('Strong - Excellent password');
  }
  
  return {
    valid: score >= 2,
    strength,
    percentage,
    score,
    feedback: feedback.join('. ')
  };
}

/**
 * Secure password manager class
 */
export class PasswordManager {
  constructor() {
    this.defaultPasswordGenerated = false;
  }
  
  /**
   * Initialize password system - generate default if none exists
   * @returns {Promise<string>} The default password (only returned once for user to see)
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get([STORAGE_KEYS.password, STORAGE_KEYS.passwordSet], (data) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`${ERROR_CODES.STORAGE_ERROR}: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        // If no password exists, generate a secure default
        if (!data[STORAGE_KEYS.password] && !data[STORAGE_KEYS.passwordSet]) {
          const defaultPassword = generateSecurePassword(12);
          
          chrome.storage.sync.set({
            [STORAGE_KEYS.password]: defaultPassword,
            [STORAGE_KEYS.passwordSet]: false // Indicates this is still the generated default
          }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`${ERROR_CODES.STORAGE_ERROR}: ${chrome.runtime.lastError.message}`));
              return;
            }
            
            console.log('🔐 Generated secure default password for first-time setup');
            this.defaultPasswordGenerated = true;
            resolve(defaultPassword); // Return only once so user can see it
          });
        } else {
          resolve(null); // Password already exists
        }
      });
    });
  }
  
  /**
   * Get current password
   * @returns {Promise<string>} Current password
   */
  async getPassword() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get([STORAGE_KEYS.password], (data) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`${ERROR_CODES.STORAGE_ERROR}: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        resolve(data[STORAGE_KEYS.password]);
      });
    });
  }
  
  /**
   * Set new password
   * @param {string} newPassword - New password to set
   * @returns {Promise<void>}
   */
  async setPassword(newPassword) {
    const validation = validatePasswordStrength(newPassword);
    
    if (!validation.valid) {
      throw new Error(`${ERROR_CODES.INVALID_PATTERN}: ${validation.feedback}`);
    }
    
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        [STORAGE_KEYS.password]: newPassword,
        [STORAGE_KEYS.passwordSet]: true // User has set a custom password
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`${ERROR_CODES.STORAGE_ERROR}: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        console.log('🔐 Password updated successfully');
        resolve();
      });
    });
  }
  
  /**
   * Check if current password is the generated default
   * @returns {Promise<boolean>} True if using default password
   */
  async isUsingDefaultPassword() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get([STORAGE_KEYS.passwordSet], (data) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`${ERROR_CODES.STORAGE_ERROR}: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        resolve(!data[STORAGE_KEYS.passwordSet]);
      });
    });
  }
  
  /**
   * Get password strength validation
   * @param {string} password - Password to check
   * @returns {Object} Validation result
   */
  getPasswordStrength(password) {
    return validatePasswordStrength(password);
  }
  
  /**
   * Generate a new password and set it (for password reset)
   * @returns {Promise<string>} The newly generated password
   */
  async generateNewPassword() {
    const newPassword = generateSecurePassword(12);
    
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        [STORAGE_KEYS.password]: newPassword,
        [STORAGE_KEYS.passwordSet]: false, // Mark as generated password
        [STORAGE_KEYS.passwordDisplayed]: true // Mark as displayed to user
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`${ERROR_CODES.STORAGE_ERROR}: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        console.log('🔐 Password reset successfully with new generated password');
        resolve(newPassword);
      });
    });
  }
}

// Export singleton instance
export const passwordManager = new PasswordManager();
