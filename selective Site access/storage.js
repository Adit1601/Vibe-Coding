// storage.js
// Chrome storage operations for Selective Site Access extension

const STORAGE_KEYS = {
  blockedDomains: 'blockedDomains',
  allowlistUrls: 'allowlistUrls',
  locked: 'locked',
  password: 'password',
  pauseUntil: 'pauseUntil',
  pauseStart: 'pauseStart',
  focusMode: 'focusMode',
  autoRefreshEnabled: 'autoRefreshEnabled',
  autoRefreshInterval: 'autoRefreshInterval',
  autoRefreshDomains: 'autoRefreshDomains',
};

const DEFAULT_PASSWORD = 'Adit#@235791113';

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
    callback(data[STORAGE_KEYS.password] || DEFAULT_PASSWORD);
  });
}

export function setPassword(newPassword, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.password]: newPassword }, callback);
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