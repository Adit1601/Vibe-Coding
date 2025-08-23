// storage.js
// Chrome storage operations for Selective Site Access extension

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { passwordManager } from './password-manager.js';
import { handleError, StorageError } from './error-handler.js';

/**
 * Get blocked domains and allowlist URLs from storage
 * @param {Function} callback - Callback function
 */
export function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains, STORAGE_KEYS.allowlistUrls], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('getLists', chrome.runtime.lastError.message);
      handleError(error, 'storage.getLists');
      callback({ blockedDomains: [], allowlistUrls: [] });
      return;
    }
    
    callback({
      blockedDomains: data[STORAGE_KEYS.blockedDomains] || DEFAULT_SETTINGS.blockedDomains,
      allowlistUrls: data[STORAGE_KEYS.allowlistUrls] || DEFAULT_SETTINGS.allowlistUrls
    });
  });
}

/**
 * Set blocked domains and allowlist URLs in storage
 * @param {Array} blockedDomains - Array of blocked domains
 * @param {Array} allowlistUrls - Array of allowlist URLs
 * @param {Function} callback - Callback function
 */
export function setLists(blockedDomains, allowlistUrls, callback) {
  chrome.storage.sync.set({
    [STORAGE_KEYS.blockedDomains]: blockedDomains,
    [STORAGE_KEYS.allowlistUrls]: allowlistUrls
  }, () => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('setLists', chrome.runtime.lastError.message);
      handleError(error, 'storage.setLists');
    }
    if (callback) callback();
  });
}

/**
 * Set lock state
 * @param {boolean} locked - Lock state
 * @param {Function} callback - Callback function
 */
export function setLocked(locked, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.locked]: locked }, () => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('setLocked', chrome.runtime.lastError.message);
      handleError(error, 'storage.setLocked');
    }
    if (callback) callback();
  });
}

/**
 * Get lock state
 * @param {Function} callback - Callback function
 */
export function getLocked(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.locked], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('getLocked', chrome.runtime.lastError.message);
      handleError(error, 'storage.getLocked');
      callback(DEFAULT_SETTINGS.locked);
      return;
    }
    
    callback(data[STORAGE_KEYS.locked] ?? DEFAULT_SETTINGS.locked);
  });
}

/**
 * Get password (delegates to password manager)
 * @param {Function} callback - Callback function
 */
export function getPassword(callback) {
  passwordManager.getPassword()
    .then(password => callback(password))
    .catch(error => {
      handleError(error, 'storage.getPassword');
      callback(null);
    });
}

/**
 * Set password (delegates to password manager)
 * @param {string} newPassword - New password
 * @param {Function} callback - Callback function
 */
export function setPassword(newPassword, callback) {
  passwordManager.setPassword(newPassword)
    .then(() => {
      if (callback) callback();
    })
    .catch(error => {
      handleError(error, 'storage.setPassword');
      if (callback) callback(error);
    });
}

/**
 * Check if using default password (delegates to password manager)
 * @param {Function} callback - Callback function
 */
export function isDefaultPassword(callback) {
  passwordManager.isUsingDefaultPassword()
    .then(isDefault => callback(isDefault))
    .catch(error => {
      handleError(error, 'storage.isDefaultPassword');
      callback(false);
    });
}

/**
 * Get pause until timestamp
 * @param {Function} callback - Callback function
 */
export function getPauseUntil(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('getPauseUntil', chrome.runtime.lastError.message);
      handleError(error, 'storage.getPauseUntil');
      callback(DEFAULT_SETTINGS.pauseUntil);
      return;
    }
    
    callback(data[STORAGE_KEYS.pauseUntil] || DEFAULT_SETTINGS.pauseUntil);
  });
}

/**
 * Set pause until timestamp
 * @param {number} timestamp - Timestamp when pause ends
 * @param {Function} callback - Callback function
 */
export function setPauseUntil(timestamp, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.pauseUntil]: timestamp }, () => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('setPauseUntil', chrome.runtime.lastError.message);
      handleError(error, 'storage.setPauseUntil');
    }
    if (callback) callback();
  });
}

/**
 * Get pause start timestamp
 * @param {Function} callback - Callback function
 */
export function getPauseStart(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseStart], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('getPauseStart', chrome.runtime.lastError.message);
      handleError(error, 'storage.getPauseStart');
      callback(DEFAULT_SETTINGS.pauseStart);
      return;
    }
    
    callback(data[STORAGE_KEYS.pauseStart] || DEFAULT_SETTINGS.pauseStart);
  });
}

/**
 * Set pause window (start and end timestamps)
 * @param {number} until - End timestamp
 * @param {number} start - Start timestamp
 * @param {Function} callback - Callback function
 */
export function setPauseWindow(until, start, callback) {
  chrome.storage.sync.set({ 
    [STORAGE_KEYS.pauseUntil]: until, 
    [STORAGE_KEYS.pauseStart]: start 
  }, () => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('setPauseWindow', chrome.runtime.lastError.message);
      handleError(error, 'storage.setPauseWindow');
    }
    if (callback) callback();
  });
} 