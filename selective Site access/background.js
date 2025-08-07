// =====================
// Config & Constants
// =====================
/**
 * @constant {Object} STORAGE_KEYS
 * @description All chrome.storage keys used in the background script.
 */
const STORAGE_KEYS = {
  blockedDomains: 'blockedDomains',
  allowlistUrls: 'allowlistUrls',
  pauseUntil: 'pauseUntil',
  focusMode: 'focusMode',
  whitelistMode: 'whitelistMode', // New: Reverse mode - block everything except allowed
  blockCount: 'blockCount',
  lastBlockedUrl: 'lastBlockedUrl',
  autoRefreshEnabled: 'autoRefreshEnabled',
  autoRefreshInterval: 'autoRefreshInterval',
  autoRefreshDomains: 'autoRefreshDomains',
};

/**
 * @constant {Object} RULE_PRIORITIES
 * @description Priority levels for declarativeNetRequest rules.
 */
const RULE_PRIORITIES = {
  ALLOW: 2,
  BLOCK: 1,
};

/**
 * @constant {string} BLOCKED_PAGE_PATH
 * @description Path to the blocked page shown when URLs are blocked.
 */
const BLOCKED_PAGE_PATH = '/blocked.html';

// =====================
// Rule Generation Module
// =====================
/**
 * Generate declarativeNetRequest rules for blocking domains and allowing specific URLs.
 * @param {Array} blockedDomains - Array of domain names to block
 * @param {Array} allowlistUrls - Array of specific URLs to allow
 * @returns {Array} Array of rule objects for declarativeNetRequest
 */
function generateRules(blockedDomains, allowlistUrls) {
  let rules = [];
  let ruleId = 1;

  // Allow specific URLs (override block) - higher priority
  allowlistUrls.forEach(url => {
    rules.push({
      id: ruleId++,
      priority: RULE_PRIORITIES.ALLOW,
      action: { type: 'allow' },
      condition: {
        urlFilter: url,
        resourceTypes: ["main_frame"]
      }
    });
  });

  // Block all URLs for each blocked domain - lower priority
  blockedDomains.forEach(domain => {
    rules.push({
      id: ruleId++,
      priority: RULE_PRIORITIES.BLOCK,
      action: { 
        type: 'redirect', 
        redirect: { extensionPath: BLOCKED_PAGE_PATH } 
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"]
      }
    });
  });

  return rules;
}

/**
 * Generate rules for focus mode (only block domains, ignore allowlist).
 * @param {Array} blockedDomains - Array of domain names to block
 * @returns {Array} Array of rule objects for declarativeNetRequest
 */
function generateFocusModeRules(blockedDomains) {
  let rules = [];
  let ruleId = 1;

  blockedDomains.forEach(domain => {
    rules.push({
      id: ruleId++,
      priority: RULE_PRIORITIES.BLOCK,
      action: { 
        type: 'redirect', 
        redirect: { extensionPath: BLOCKED_PAGE_PATH } 
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"]
      }
    });
  });

  return rules;
}

/**
 * Generate rules for whitelist mode (block everything except allowed domains/URLs).
 * @param {Array} allowedDomains - Array of domain names to allow (from blockedDomains list in whitelist mode)
 * @param {Array} allowlistUrls - Array of specific URLs to allow
 * @returns {Array} Array of rule objects for declarativeNetRequest
 */
function generateWhitelistModeRules(allowedDomains, allowlistUrls) {
  let rules = [];
  let ruleId = 1;

  // Allow specific URLs - highest priority
  allowlistUrls.forEach(url => {
    rules.push({
      id: ruleId++,
      priority: RULE_PRIORITIES.ALLOW,
      action: { type: 'allow' },
      condition: {
        urlFilter: url,
        resourceTypes: ["main_frame"]
      }
    });
  });

  // Allow specific domains - high priority
  allowedDomains.forEach(domain => {
    rules.push({
      id: ruleId++,
      priority: RULE_PRIORITIES.ALLOW,
      action: { type: 'allow' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"]
      }
    });
  });

  // Block everything else - lowest priority
  // Use a broad pattern to block all HTTP/HTTPS traffic
  rules.push({
    id: ruleId++,
    priority: 1, // Lower than ALLOW priorities
    action: { 
      type: 'redirect', 
      redirect: { extensionPath: BLOCKED_PAGE_PATH } 
    },
    condition: {
      urlFilter: '||*',
      resourceTypes: ["main_frame"],
      excludedRequestDomains: ['localhost', '127.0.0.1'], // Don't block local development
    }
  });

  return rules;
}

// =====================
// Storage Module
// =====================
/**
 * Check if blocking is currently paused.
 * @param {function} callback - Callback with boolean result
 */
function isPaused(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    callback((data[STORAGE_KEYS.pauseUntil] || 0) > Date.now());
  });
}

/**
 * Get focus mode state from storage.
 * @param {function} callback - Callback with boolean result
 */
function getFocusMode(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.focusMode], (data) => {
    callback(!!data[STORAGE_KEYS.focusMode]);
  });
}

/**
 * Get whitelist mode state from storage.
 * @param {function} callback - Callback with boolean result
 */
function getWhitelistMode(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.whitelistMode], (data) => {
    callback(!!data[STORAGE_KEYS.whitelistMode]);
  });
}

/**
 * Get blocklist and allowlist from storage.
 * @param {function} callback - Callback with {blocked, allowlist} object
 */
function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains, STORAGE_KEYS.allowlistUrls], (data) => {
    callback({
      blocked: data[STORAGE_KEYS.blockedDomains] || [],
      allowlist: data[STORAGE_KEYS.allowlistUrls] || []
    });
  });
}

// =====================
// Rule Management Module
// =====================
/**
 * Update dynamic rules based on current state (paused, focus mode, whitelist mode, etc.).
 * This is the main function that manages all blocking rules.
 */
function updateDynamicRules() {
  isPaused((paused) => {
    if (paused) {
      // Remove all dynamic rules while paused
      removeAllDynamicRules();
      return;
    }

    getWhitelistMode((whitelistMode) => {
      if (whitelistMode) {
        // Whitelist mode: block everything except allowed domains/URLs
        getLists(({ blocked, allowlist }) => {
          const rules = generateWhitelistModeRules(blocked, allowlist);
          updateDynamicRulesWithNewRules(rules);
        });
      } else {
        // Standard or Focus mode
        getFocusMode((focusMode) => {
          getLists(({ blocked, allowlist }) => {
            let rules = [];
            
            if (focusMode) {
              // Focus mode: only block blocklist, ignore allowlist
              rules = generateFocusModeRules(blocked);
            } else {
              // Normal mode: block domains but allow specific URLs
              rules = generateRules(blocked, allowlist);
            }

            updateDynamicRulesWithNewRules(rules);
          });
        });
      }
    });
  });
}

/**
 * Remove all existing dynamic rules.
 */
function removeAllDynamicRules() {
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map(r => r.id);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: []
    });
  });
}

/**
 * Update dynamic rules with new rule set.
 * @param {Array} newRules - Array of new rules to apply
 */
function updateDynamicRulesWithNewRules(newRules) {
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map(r => r.id);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: newRules
    });
  });
}

// =====================
// Statistics Module
// =====================
/**
 * Update blocking statistics when a URL is blocked.
 * @param {string} url - The URL that was blocked
 */
function updateBlockStats(url) {
  chrome.storage.sync.get([STORAGE_KEYS.blockCount], (data) => {
    const count = (data[STORAGE_KEYS.blockCount] || 0) + 1;
    chrome.storage.sync.set({ 
      [STORAGE_KEYS.blockCount]: count, 
      [STORAGE_KEYS.lastBlockedUrl]: url 
    });
  });
}

// =====================
// Auto-Refresh Module
// =====================
// Remove setInterval-based timer
// let autoRefreshTimer = null;

/**
 * Get auto-refresh configuration from storage.
 * @param {function} callback - Callback with {enabled, interval} object
 */
function getAutoRefreshConfig(callback) {
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

/**
 * Extract domain from URL.
 * @param {string} url - The URL to extract domain from
 * @returns {string} The domain name
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

/**
 * Refresh tabs that match the configured domains.
 */
function refreshMatchingTabs() {
  getAutoRefreshConfig(({ enabled }) => {
    if (!enabled) return;
    chrome.storage.sync.get([STORAGE_KEYS.blockedDomains], (data) => {
      const domains = data[STORAGE_KEYS.blockedDomains] || [];
      if (domains.length === 0) return;
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && tab.url.startsWith('http')) {
            const domain = extractDomain(tab.url);
            if (domains.includes(domain)) {
              chrome.tabs.reload(tab.id);
              console.log(`Auto-refreshed tab: ${domain} (${tab.url})`);
            }
          }
        });
      });
    });
  });
}

/**
 * Start the auto-refresh alarm.
 */
function startAutoRefreshAlarm() {
  stopAutoRefreshAlarm(); // Clear any existing alarm
  getAutoRefreshConfig(({ enabled, interval }) => {
    if (enabled && interval > 0) {
      // Convert ms to minutes for chrome.alarms
      const minutes = Math.max(interval / 60000, 1);
      chrome.alarms.create('autoRefreshAlarm', { periodInMinutes: minutes });
      console.log(`Auto-refresh alarm started with interval: ${minutes} min`);
    }
  });
}

/**
 * Stop the auto-refresh alarm.
 */
function stopAutoRefreshAlarm() {
  chrome.alarms.clear('autoRefreshAlarm', () => {
    console.log('Auto-refresh alarm stopped');
  });
}

/**
 * Set an alarm for when pause ends to automatically refresh blocked tabs.
 */
function setPauseEndAlarm() {
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    const pauseUntil = data[STORAGE_KEYS.pauseUntil] || 0;
    
    // Clear any existing pause end alarm
    chrome.alarms.clear('pauseEndAlarm');
    
    if (pauseUntil > Date.now()) {
      // Set alarm for when pause ends
      chrome.alarms.create('pauseEndAlarm', { when: pauseUntil });
      console.log(`Pause end alarm set for: ${new Date(pauseUntil).toLocaleString()}`);
    }
  });
}

/**
 * Handle pause end - refresh blocked tabs and update rules.
 */
function handlePauseEnd() {
  console.log('Pause period ended - refreshing blocked tabs');
  
  // Update rules first
  updateDynamicRules();
  
  // Wait a bit for rules to update, then refresh blocked tabs
  setTimeout(() => {
    refreshBlockedTabs();
  }, 1000);
}

/**
 * Refresh only tabs that contain blocked domains.
 * This is specifically for when pause ends.
 */
function refreshBlockedTabs() {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains], (data) => {
    const blockedDomains = data[STORAGE_KEYS.blockedDomains] || [];
    if (blockedDomains.length === 0) return;
    
    chrome.tabs.query({}, (tabs) => {
      let refreshCount = 0;
      tabs.forEach(tab => {
        if (tab.url && tab.url.startsWith('http')) {
          const domain = extractDomain(tab.url);
          if (blockedDomains.includes(domain)) {
            chrome.tabs.reload(tab.id);
            refreshCount++;
            console.log(`Refreshed blocked tab: ${domain} (${tab.url})`);
          }
        }
      });
      console.log(`Refreshed ${refreshCount} blocked tabs after pause ended`);
    });
  });
}

/**
 * Initialize auto-refresh functionality and pause monitoring.
 */
function initializeAutoRefresh() {
  console.log('Initializing auto-refresh functionality...');
  startAutoRefreshAlarm();
  
  // Check if there's an active pause and set alarm if needed
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    const pauseUntil = data[STORAGE_KEYS.pauseUntil] || 0;
    if (pauseUntil > Date.now()) {
      setPauseEndAlarm();
      console.log('Found active pause period - setting alarm for auto-refresh when pause ends');
    }
  });
}

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === 'autoRefreshAlarm') {
    refreshMatchingTabs();
  } else if (alarm && alarm.name === 'pauseEndAlarm') {
    handlePauseEnd();
  }
});

// =====================
// Event Listeners
// =====================
/**
 * Handle storage changes and update rules accordingly.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    // Update blocking rules if relevant settings changed
    if (changes[STORAGE_KEYS.blockedDomains] || 
        changes[STORAGE_KEYS.allowlistUrls] || 
        changes[STORAGE_KEYS.pauseUntil] ||
        changes[STORAGE_KEYS.whitelistMode]) {
      updateDynamicRules();
    }
    
    // Handle pause changes
    if (changes[STORAGE_KEYS.pauseUntil]) {
      const newPauseUntil = changes[STORAGE_KEYS.pauseUntil].newValue;
      const oldPauseUntil = changes[STORAGE_KEYS.pauseUntil].oldValue;
      
      // If pause just started (new value is in the future)
      if (newPauseUntil && newPauseUntil > Date.now()) {
        setPauseEndAlarm();
        console.log('Pause started - alarm set for auto-refresh when pause ends');
      }
      // If pause just ended manually (new value is 0 or in the past, old value was in the future)
      else if ((newPauseUntil === 0 || newPauseUntil < Date.now()) && oldPauseUntil && oldPauseUntil > Date.now()) {
        // Clear the pause end alarm since it ended manually
        chrome.alarms.clear('pauseEndAlarm');
        handlePauseEnd();
      }
    }
    
    // Update auto-refresh timer if relevant settings changed
    if (changes[STORAGE_KEYS.autoRefreshEnabled] || 
        changes[STORAGE_KEYS.autoRefreshInterval]) {
      startAutoRefreshAlarm();
    }
  }
});

/**
 * Initialize rules when extension is installed.
 */
chrome.runtime.onInstalled.addListener(() => {
  updateDynamicRules();
  initializeAutoRefresh();
});

/**
 * Initialize rules when browser starts (if supported).
 */
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    updateDynamicRules();
    initializeAutoRefresh();
  });
}

/**
 * Handle messages from content scripts and popup.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'blocked':
      if (msg.url) {
        updateBlockStats(msg.url);
      }
      break;
    case 'focusModeChanged':
      updateDynamicRules();
      break;
    case 'whitelistModeChanged':
      updateDynamicRules();
      break;
    case 'getAutoRefreshConfig':
      getAutoRefreshConfig(sendResponse);
      return true; // Keep message channel open for async response
    case 'setAutoRefreshConfig':
      chrome.storage.sync.set({
        [STORAGE_KEYS.autoRefreshEnabled]: msg.enabled,
        [STORAGE_KEYS.autoRefreshInterval]: msg.interval
      }, () => {
        startAutoRefreshAlarm();
        sendResponse({ success: true });
      });
      return true; // Keep message channel open for async response
    case 'refreshNow':
      refreshBlockedTabs();
      sendResponse({ success: true });
      break;
    default:
      // Unknown message type - ignore
      break;
  }
});