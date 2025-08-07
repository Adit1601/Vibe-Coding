// storage.js
// Chrome storage operations for Selective Site Access extension

const STORAGE_KEYS = {
  blockedDomains: 'blockedDomains',
  allowlistUrls: 'allowlistUrls',
  locked: 'locked',
  password: 'password',
  passwordSet: 'passwordSet', // Track if user has set a custom password
  pauseUntil: 'pauseUntil',
  pauseStart: 'pauseStart',
  focusMode: 'focusMode',
  whitelistMode: 'whitelistMode', // New: Reverse mode - block everything except allowed
  autoRefreshEnabled: 'autoRefreshEnabled',
  autoRefreshInterval: 'autoRefreshInterval',
  autoRefreshDomains: 'autoRefreshDomains',
};

// Default password - users should change this for security
// This is encoded to make it less obvious in the source code
const getDefaultPassword = () => {
  // Base64 encoded version of 'Adit#@235791113'
  return atob('QWRpdCNAMjM1NzkxMTEz');
};

export function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains, STORAGE_KEYS.allowlistUrls], (data) => {
    callback({
      blockedDomains: data[STORAGE_KEYS.blockedDomains] || [],
      allowlistUrls: data[STORAGE_KEYS.allowlistUrls] || []
    });
  });
}

export function setLists(blockedDomains, allowlistUrls, callback) {
  chrome.storage.sync.set({
    [STORAGE_KEYS.blockedDomains]: blockedDomains,
    [STORAGE_KEYS.allowlistUrls]: allowlistUrls
  }, callback);
}

export function setLocked(locked, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.locked]: locked }, callback);
}

export function getLocked(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.locked], (data) => {
    callback(data[STORAGE_KEYS.locked]);
  });
}

export function getPassword(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.password], (data) => {
    callback(data[STORAGE_KEYS.password] || getDefaultPassword());
  });
}

export function setPassword(newPassword, callback) {
  chrome.storage.sync.set({ 
    [STORAGE_KEYS.password]: newPassword,
    [STORAGE_KEYS.passwordSet]: true 
  }, callback);
}

export function isDefaultPassword(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.passwordSet, STORAGE_KEYS.password], (data) => {
    if (data[STORAGE_KEYS.passwordSet]) {
      callback(false); // User has set a custom password
    } else {
      // Check if current password is still the default
      const currentPassword = data[STORAGE_KEYS.password] || getDefaultPassword();
      callback(currentPassword === getDefaultPassword());
    }
  });
}

export function getPauseUntil(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    callback(data[STORAGE_KEYS.pauseUntil] || 0);
  });
}

export function setPauseUntil(timestamp, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.pauseUntil]: timestamp }, callback);
}

export function getPauseStart(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseStart], (data) => {
    callback(data[STORAGE_KEYS.pauseStart] || 0);
  });
}

export function setPauseWindow(until, start, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.pauseUntil]: until, [STORAGE_KEYS.pauseStart]: start }, callback);
}

export function getFocusMode(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.focusMode], (data) => {
    callback(!!data[STORAGE_KEYS.focusMode]);
  });
}

export function setFocusMode(enabled, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.focusMode]: enabled }, callback);
}

export function getAutoRefreshConfig(callback) {
  chrome.storage.sync.get([
    STORAGE_KEYS.autoRefreshEnabled,
    STORAGE_KEYS.autoRefreshInterval
  ], (data) => {
    callback({
      enabled: !!data[STORAGE_KEYS.autoRefreshEnabled],
      interval: data[STORAGE_KEYS.autoRefreshInterval] || 3600000
    });
  });
}

export function setAutoRefreshConfig(enabled, interval, callback) {
  chrome.runtime.sendMessage({
    type: 'setAutoRefreshConfig',
    enabled: enabled,
    interval: interval,
    domains: [] // ignored in background now
  }, callback);
}

export function getWhitelistMode(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.whitelistMode], (data) => {
    callback(!!data[STORAGE_KEYS.whitelistMode]);
  });
}

export function setWhitelistMode(enabled, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.whitelistMode]: enabled }, callback);
} 