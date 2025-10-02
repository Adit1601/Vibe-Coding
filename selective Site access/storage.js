// storage.js
// Chrome storage operations for Selective Site Access extension

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { passwordManager } from './password-manager.js';
import { handleError, StorageError } from './error-handler.js';

/**
 * Get allowlist URLs from storage
 * @param {Function} callback - Callback function
 */
export function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.allowlistUrls], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('getLists', chrome.runtime.lastError.message);
      handleError(error, 'storage.getLists');
      callback({ allowlistUrls: [] });
      return;
    }
    
    callback({
      allowlistUrls: data[STORAGE_KEYS.allowlistUrls] || DEFAULT_SETTINGS.allowlistUrls
    });
  });
}

/**
 * Set allowlist URLs in storage
 * @param {Array} allowlistUrls - Array of allowlist URLs
 * @param {Function} callback - Callback function
 */
export function setLists(allowlistUrls, callback) {
  chrome.storage.sync.set({
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
      // Clear the password displayed flag when user sets custom password
      chrome.storage.sync.remove('passwordDisplayed');
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
    
    // After setting pause window, update the pause count statistics
    updatePauseCount(() => {
      if (callback) callback();
    });
  });
} 

/**
 * Update pause count for today and check if streaks need to be updated
 * @param {Function} callback - Callback function
 */
export function updatePauseCount(callback) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  chrome.storage.sync.get([
    STORAGE_KEYS.pauseCountToday, 
    STORAGE_KEYS.lastCountDate,
    STORAGE_KEYS.streakCount,
    STORAGE_KEYS.weeklyStats,
    STORAGE_KEYS.pauseThreshold
  ], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('updatePauseCount', chrome.runtime.lastError.message);
      handleError(error, 'storage.updatePauseCount');
      if (callback) callback();
      return;
    }
    
    let pauseCount = data[STORAGE_KEYS.pauseCountToday] || 0;
    const lastDate = data[STORAGE_KEYS.lastCountDate] || '';
    let streakCount = data[STORAGE_KEYS.streakCount] || 0;
    let weeklyStats = data[STORAGE_KEYS.weeklyStats] || DEFAULT_SETTINGS.weeklyStats;
    const threshold = data[STORAGE_KEYS.pauseThreshold] || DEFAULT_SETTINGS.pauseThreshold;
    
    // Check if it's a new day
    if (lastDate !== today) {
      // If yesterday's pause count was below threshold, increment streak
      // Otherwise reset streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISODate = yesterday.toISOString().split('T')[0];
      
      if (lastDate === yesterdayISODate) {
        const yesterdayDayOfWeek = yesterday.getDay(); // 0-6 (Sunday-Saturday)
        
        if (pauseCount < threshold) {
          streakCount++;
          weeklyStats[yesterdayDayOfWeek] = true; // Set yesterday as successful
        } else {
          streakCount = 0;
          weeklyStats[yesterdayDayOfWeek] = false; // Set yesterday as failed
        }
      }
      
      // Reset for new day
      pauseCount = 1; // Count this pause
    } else {
      // Same day, increment count
      pauseCount++;
    }
    
    // Update current day in weekly stats (as pending)
    const todayDayOfWeek = new Date().getDay();
    weeklyStats[todayDayOfWeek] = pauseCount < threshold;
    
    // Save updated statistics
    chrome.storage.sync.set({
      [STORAGE_KEYS.pauseCountToday]: pauseCount,
      [STORAGE_KEYS.lastCountDate]: today,
      [STORAGE_KEYS.streakCount]: streakCount,
      [STORAGE_KEYS.weeklyStats]: weeklyStats
    }, () => {
      if (chrome.runtime.lastError) {
        const error = new StorageError('savePauseStats', chrome.runtime.lastError.message);
        handleError(error, 'storage.savePauseStats');
      }
      if (callback) callback();
    });
  });
}

/**
 * Get statistics for display
 * @param {Function} callback - Callback function
 */
export function getStatistics(callback) {
  chrome.storage.sync.get([
    STORAGE_KEYS.pauseCountToday, 
    STORAGE_KEYS.lastCountDate,
    STORAGE_KEYS.streakCount,
    STORAGE_KEYS.weeklyStats,
    STORAGE_KEYS.pauseThreshold
  ], (data) => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('getStatistics', chrome.runtime.lastError.message);
      handleError(error, 'storage.getStatistics');
      callback({
        pauseCount: 0,
        streakCount: 0,
        weeklyStats: DEFAULT_SETTINGS.weeklyStats,
        threshold: DEFAULT_SETTINGS.pauseThreshold
      });
      return;
    }
    
    callback({
      pauseCount: data[STORAGE_KEYS.pauseCountToday] || 0,
      streakCount: data[STORAGE_KEYS.streakCount] || 0,
      weeklyStats: data[STORAGE_KEYS.weeklyStats] || DEFAULT_SETTINGS.weeklyStats,
      threshold: data[STORAGE_KEYS.pauseThreshold] || DEFAULT_SETTINGS.pauseThreshold
    });
  });
}

/**
 * Set pause threshold
 * @param {number} threshold - New threshold value
 * @param {Function} callback - Callback function
 */
export function setPauseThreshold(threshold, callback) {
  chrome.storage.sync.set({
    [STORAGE_KEYS.pauseThreshold]: threshold
  }, () => {
    if (chrome.runtime.lastError) {
      const error = new StorageError('setPauseThreshold', chrome.runtime.lastError.message);
      handleError(error, 'storage.setPauseThreshold');
    }
    if (callback) callback();
  });
}