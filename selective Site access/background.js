// =====================
// Config & Constants
// =====================
import { STORAGE_KEYS, RULE_PRIORITIES, CONFIG } from './constants.js';
import { safeRegexTest } from './regex-utils.js';
import { handleError, StorageError } from './error-handler.js';

// =====================
// Pattern Matching Utilities
// =====================
/**
 * Convert a pattern rule to a Chrome declarativeNetRequest rule.
 * @param {Object} patternRule - Pattern rule object {pattern, type, description, enabled}
 * @param {number} ruleId - Unique rule ID
 * @returns {Object|null} Chrome rule object or null if invalid
 */
function patternToNetRequestRule(patternRule, ruleId) {
  if (!patternRule.enabled) return null;
  
  let condition = {};
  
  switch (patternRule.type) {
    case 'path':
      // Convert path pattern to URL filter
      // Example: */shorts/* becomes */shorts/*
      let urlFilter = patternRule.pattern;
      
      // Ensure the pattern works correctly for Chrome's urlFilter
      if (!urlFilter.startsWith('*')) {
        urlFilter = '*' + urlFilter;
      }
      if (!urlFilter.endsWith('*')) {
        urlFilter = urlFilter + '*';
      }
      
      condition = {
        urlFilter: urlFilter,
        resourceTypes: ["main_frame"]
      };
      break;
      
    case 'regex':
      // Use regex condition (if supported by Chrome API)
      condition = {
        regexFilter: patternRule.pattern,
        resourceTypes: ["main_frame"]
      };
      break;
      
    case 'url':
      // Exact URL matching
      condition = {
        urlFilter: patternRule.pattern,
        resourceTypes: ["main_frame"]
      };
      break;
      
    case 'domain':
      // Domain-specific pattern
      condition = {
        urlFilter: `||${patternRule.pattern}^`,
        resourceTypes: ["main_frame"]
      };
      break;
      
    default:
      console.warn('Unknown pattern type:', patternRule.type);
      return null;
  }
  
  return {
    id: ruleId,
    priority: RULE_PRIORITIES.PATTERN,
    action: { 
      type: 'redirect', 
      redirect: { extensionPath: CONFIG.BLOCKED_PAGE_PATH } 
    },
    condition
  };
}

/**
 * Validate a pattern rule for correctness.
 * @param {Object} patternRule - Pattern rule to validate
 * @returns {Object} {valid: boolean, error?: string}
 */
function validatePatternRule(patternRule) {
  if (!patternRule.pattern || typeof patternRule.pattern !== 'string') {
    return { valid: false, error: 'Pattern must be a non-empty string' };
  }
  
  if (!['path', 'regex', 'url', 'domain'].includes(patternRule.type)) {
    return { valid: false, error: 'Pattern type must be: path, regex, url, or domain' };
  }
  
  // Validate regex patterns
  if (patternRule.type === 'regex') {
    try {
      new RegExp(patternRule.pattern);
    } catch (e) {
      return { valid: false, error: 'Invalid regex pattern: ' + e.message };
    }
  }
  
  return { valid: true };
}

// =====================
// Rule ID Management
// =====================
let nextRuleId = 1;

/**
 * Get a unique rule ID that doesn't conflict with existing rules
 * @returns {Promise<number>} A unique rule ID
 */
function getUniqueRuleId() {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
      const existingIds = new Set(existingRules.map(rule => rule.id));
      
      // Find the next available ID
      while (existingIds.has(nextRuleId)) {
        nextRuleId++;
      }
      
      const uniqueId = nextRuleId;
      nextRuleId++; // Increment for next use
      resolve(uniqueId);
    });
  });
}

/**
 * Generate multiple unique rule IDs
 * @param {number} count - Number of IDs needed
 * @returns {Promise<number[]>} Array of unique rule IDs
 */
function getMultipleUniqueRuleIds(count) {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
      const existingIds = new Set(existingRules.map(rule => rule.id));
      const uniqueIds = [];
      
      for (let i = 0; i < count; i++) {
        while (existingIds.has(nextRuleId)) {
          nextRuleId++;
        }
        uniqueIds.push(nextRuleId);
        existingIds.add(nextRuleId); // Add to set to avoid duplicates in this batch
        nextRuleId++;
      }
      
      resolve(uniqueIds);
    });
  });
}

// =====================
// Rule Generation Module
// =====================
/**
 * Generate declarativeNetRequest rules for pattern-based blocking and allowing specific URLs.
 * @param {Array} allowlistUrls - Array of specific URLs to allow
 * @param {Array} patternRules - Array of pattern-based blocking rules
 * @returns {Array} Array of rule objects for declarativeNetRequest
 */
function generateRules(allowlistUrls, patternRules = []) {
  let rules = [];
  // Generate a truly unique starting ID as an integer to avoid conflicts
  // Use a simpler approach that ensures integer values
  let ruleId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
  
  console.log('=== GENERATING RULES ===');
  console.log('Starting rule ID:', ruleId);
  console.log('Allowlist URLs:', allowlistUrls);
  console.log('Pattern rules:', patternRules.length, 'rules');

  // Allow specific URLs (override all blocks) - highest priority
  allowlistUrls.forEach(item => {
    // Handle both old format (string) and new format (object)
    let url;
    if (typeof item === 'string') {
      url = item;
    } else if (typeof item === 'object' && item.url) {
      url = item.url;
    } else {
      console.warn('Invalid allowlist item format:', item);
      return;
    }
    
    // Try multiple approaches to ensure the allowlist rule works
    try {
      const urlObj = new URL(url);
      
      // Approach 1: Use urlFilter for broader matching
      const exactRule = {
        id: ruleId++,
        priority: RULE_PRIORITIES.ALLOW + 15, // Highest priority
        action: { type: 'allow' },
        condition: {
          urlFilter: url,
          resourceTypes: ["main_frame", "sub_frame"]
        }
      };
      
      rules.push(exactRule);
      console.log(`✅ Added EXACT ALLOW rule (priority ${exactRule.priority}):`, url);

      // Approach 2: Use regex filter for exact URL matching (most reliable)
      // Escape special regex characters in the URL
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      const regexRule = {
        id: ruleId++,
        priority: RULE_PRIORITIES.ALLOW + 10, // Even higher priority
        action: { type: 'allow' },
        condition: {
          regexFilter: escapedUrl,
          resourceTypes: ["main_frame", "sub_frame"]
        }
      };
      
      rules.push(regexRule);
      console.log(`✅ Added REGEX ALLOW rule (priority ${regexRule.priority}):`, escapedUrl);
      
      // Approach 3: Also create a broader pattern for the path without query params
      const pathPattern = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}*`;
      
      const pathRule = {
        id: ruleId++,
        priority: RULE_PRIORITIES.ALLOW + 5,
        action: { type: 'allow' },
        condition: {
          urlFilter: pathPattern,
          resourceTypes: ["main_frame"]
        }
      };
      
      rules.push(pathRule);
      console.log(`✅ Added PATH ALLOW rule (priority ${pathRule.priority}):`, pathPattern);
      
    } catch (e) {
      console.warn('Failed to parse allowlist URL:', url, e);
      
      // Fallback: try regex approach even for malformed URLs
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fallbackRule = {
        id: ruleId++,
        priority: RULE_PRIORITIES.ALLOW,
        action: { type: 'allow' },
        condition: {
          regexFilter: escapedUrl,
          resourceTypes: ["main_frame"]
        }
      };
      
      rules.push(fallbackRule);
      console.log(`✅ Added FALLBACK REGEX ALLOW rule (priority ${fallbackRule.priority}):`, escapedUrl);
    }
  });

  // Pattern-based blocking rules - medium priority
  patternRules.forEach(patternRule => {
    const rule = patternToNetRequestRule(patternRule, ruleId);
    if (rule) {
      rules.push(rule);
      ruleId++;
    }
  });

  console.log(`=== RULE GENERATION COMPLETE: ${rules.length} total rules ===`);
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
 * Get blocklist, allowlist, and pattern rules from storage.
 * @param {function} callback - Callback with {allowlist, patterns} object
 */
function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.allowlistUrls, STORAGE_KEYS.patternRules], (data) => {
    callback({
      allowlist: data[STORAGE_KEYS.allowlistUrls] || [],
      patterns: data[STORAGE_KEYS.patternRules] || []
    });
  });
}

// =====================
// Rule Management Module
// =====================
/**
 * Update dynamic rules based on current state (paused state).
 * This is the main function that manages all blocking rules.
 */
function updateDynamicRules(callback) {
  isPaused((paused) => {
    if (paused) {
      // Remove all dynamic rules while paused
      removeAllDynamicRules(callback);
      return;
    }

    // Standard mode: block patterns but allow specific URLs
    getLists(({ allowlist, patterns }) => {
      const rules = generateRules(allowlist, patterns);
      updateDynamicRulesWithNewRules(rules, callback);
    });
  });
}

/**
 * Remove all existing dynamic rules.
 */
function removeAllDynamicRules(callback) {
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map(r => r.id);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: []
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error removing rules:', chrome.runtime.lastError.message || chrome.runtime.lastError);
      }
      if (callback) callback();
    });
  });
}

/**
 * Update dynamic rules with new rule set.
 * @param {Array} newRules - Array of new rules to apply
 */
/**
 * Apply an array of new blocking rules, replacing all existing ones.
 * @param {Array} newRules - Array of new rules to apply
 */
function updateDynamicRulesWithNewRules(newRules, callback) {
  console.log('Updating dynamic rules with:', newRules.length, 'rules');
  
  // Validate rules before applying
  const validRules = [];
  const usedIds = new Set(); // Track IDs to ensure uniqueness within this batch
  
  newRules.forEach((rule, index) => {
    if (rule && rule.id && rule.action && rule.condition) {
      // Ensure rule ID is unique within this batch and is an integer
      if (usedIds.has(rule.id)) {
        console.warn(`Duplicate rule ID ${rule.id} detected, generating new ID`);
        rule.id = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000) + index;
      }
      // Ensure the ID is an integer
      rule.id = Math.floor(rule.id);
      usedIds.add(rule.id);
      validRules.push(rule);
      console.log(`Rule ${rule.id}: ${rule.action.type} (priority: ${rule.priority}) - ${rule.condition.urlFilter || rule.condition.regexFilter || 'unknown'}`);
    } else {
      console.warn(`Invalid rule at index ${index}:`, rule);
    }
  });
  
  if (validRules.length !== newRules.length) {
    console.warn(`Filtered out ${newRules.length - validRules.length} invalid rules`);
  }
  
  // First, remove all existing dynamic rules
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map(r => r.id);
    console.log('Removing existing rules:', removeRuleIds);
    
    // Check for rule limits
    if (validRules.length > 5000) {
      console.error('Too many rules! Chrome limit is 5000, attempting to add:', validRules.length);
      if (callback) callback();
      return;
    }
    
    // Remove existing rules first, then add new ones
    if (removeRuleIds.length > 0) {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error removing existing rules:', chrome.runtime.lastError.message || chrome.runtime.lastError);
          if (callback) callback();
          return;
        }
        
        // Now add the new rules
        addNewRules(validRules, callback);
      });
    } else {
      // No existing rules to remove, just add new ones
      addNewRules(validRules, callback);
    }
  });
  
  function addNewRules(rules, callback) {
    if (rules.length === 0) {
      console.log('No rules to add');
      if (callback) callback();
      return;
    }
    
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error adding new rules:', chrome.runtime.lastError.message || chrome.runtime.lastError);
        console.error('Failed rules count:', rules.length);
        console.error('Sample of rules that failed:', JSON.stringify(rules.slice(0, 3), null, 2));
      } else {
        console.log('Successfully added', rules.length, 'new rules');
      }
      if (callback) callback();
    });
  }
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
 * Set an alarm for when pause ends to automatically refresh blocked tabs.
 */
function setPauseEndAlarm() {
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    const pauseUntil = data[STORAGE_KEYS.pauseUntil] || 0;
    
    console.log('setPauseEndAlarm called - pauseUntil:', pauseUntil, 'current time:', Date.now());
    
    // Clear any existing pause end alarm
    chrome.alarms.clear('pauseEndAlarm');
    
    if (pauseUntil > Date.now()) {
      // Set alarm for when pause ends
      chrome.alarms.create('pauseEndAlarm', { when: pauseUntil });
      console.log(`Pause end alarm set for: ${new Date(pauseUntil).toLocaleString()}`);
      console.log(`Alarm will trigger in ${Math.round((pauseUntil - Date.now()) / 1000)} seconds`);
    } else {
      console.log('No active pause period - no alarm set');
    }
  });
}

/**
 * Handle pause end - refresh blocked tabs and update rules.
 */
function handlePauseEnd() {
  console.log('=== PAUSE PERIOD ENDED ===');
  console.log('Current time:', new Date().toLocaleString());
  console.log('Re-enabling blocking rules and refreshing relevant tabs...');
  
  // Update rules first, and then refresh tabs in the callback
  updateDynamicRules(() => {
    console.log('Rules have been re-enabled. Refreshing tabs now.');
    refreshBlockedTabs();
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
 * Check if a URL matches a pattern rule.
 * @param {string} url - URL to check
 * @param {Object} patternRule - Pattern rule object
 * @returns {boolean} True if URL matches the pattern
 */
function matchesPatternRule(url, patternRule) {
  if (!patternRule.enabled) return false;
  
  switch (patternRule.type) {
    case 'path':
      // Convert path pattern to regex
      // Example: */shorts/* becomes .*/shorts/.*
      const pathRegex = patternRule.pattern
        .replace(/\*/g, '.*')
        .replace(/\//g, '\\/');
      return new RegExp(pathRegex, 'i').test(url);
      
    case 'regex':
      try {
        return safeRegexTest(patternRule.pattern, url);
      } catch (e) {
        console.warn('Invalid regex pattern:', patternRule.pattern);
        return false;
      }
      
    case 'url':
      return url.startsWith(patternRule.pattern);
      
    case 'domain':
      try {
        const hostname = new URL(url).hostname;
        const pattern = patternRule.pattern;
        // Exact match or subdomain match (e.g., pattern 'google.com' matches 'google.com' and 'www.google.com')
        return hostname === pattern || hostname.endsWith('.' + pattern);
      } catch (e) {
        // Invalid URL cannot match a domain.
        return false;
      }
      
    default:
      console.warn('Unknown pattern type:', patternRule.type);
      return false;
  }
}

/**
 * Refresh tabs that have pattern rules blocked.
 * This is specifically for when pause ends or blocking is manually resumed.
 */
function refreshBlockedTabs() {
  getLists(({ allowlist, patterns }) => {
    if (patterns.length === 0) {
      console.log('No pattern rules found - nothing to refresh');
      return;
    }

    const isAllowlisted = (url) => allowlist.some(item => {
      const allowUrl = (typeof item === 'object' && item.url) ? item.url : item;
      // Use startsWith for broader matching (e.g., allow a whole section of a site)
      return url.startsWith(allowUrl);
    });

    const shouldBeBlocked = (url) => {
      // Ensure URL is valid and not an internal chrome page
      if (!url || !url.startsWith('http')) {
        return false;
      }
      // Do not block allowlisted URLs
      if (isAllowlisted(url)) {
        return false;
      }

      // Check against pattern rules only
      return patterns.some(rule => matchesPatternRule(url, rule));
    };

    // Query for all active tabs in the current window
    chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
      let refreshCount = 0;
      console.log(`Checking ${tabs.length} tabs for blocking...`);

      tabs.forEach(tab => {
        if (shouldBeBlocked(tab.url)) {
          chrome.tabs.reload(tab.id);
          refreshCount++;
          console.log(`✅ Refreshed tab that should be blocked: ${tab.url}`);
        }
      });
      console.log(`=== REFRESH COMPLETE: ${refreshCount} tabs refreshed ===`);
    });
  });
}

// =====================
// Event Listeners
// =====================
/**
 * Handle storage changes and update rules accordingly.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    // Update blocking rules if relevant settings changed
    if (changes[STORAGE_KEYS.allowlistUrls] || 
        changes[STORAGE_KEYS.patternRules] ||
        changes[STORAGE_KEYS.pauseUntil]) {
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
  }
});

/**
 * Initialize rules when extension is installed.
 */
chrome.runtime.onInstalled.addListener(() => {
  updateDynamicRules();
  initPauseMonitoring();
});

/**
 * Initialize rules when browser starts (if supported).
 */
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    updateDynamicRules();
    initPauseMonitoring();
  });
}

/**
 * Handle messages from content scripts and popup.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'ping':
      // Simple ping/pong to ensure service worker is awake
      sendResponse({ success: true, message: 'pong' });
      break;
    case 'blocked':
      if (msg.url) {
        updateBlockStats(msg.url);
      }
      break;
    case 'refreshBlockedTabs':
      refreshBlockedTabs();
      sendResponse({ success: true });
      break;
    case 'addPatternRule':
      addPatternRule(msg.rule, sendResponse);
      return true; // Keep message channel open for async response
    case 'removePatternRule':
      removePatternRule(msg.ruleId, sendResponse);
      return true;
    case 'updatePatternRule':
      updatePatternRule(msg.ruleId, msg.rule, sendResponse);
      return true;
    case 'getPatternRules':
      getPatternRules(sendResponse);
      return true;
    case 'validatePatternRule':
      sendResponse(validatePatternRule(msg.rule));
      break;
    case 'debugRules':
      // Debug function to check current rules
      chrome.declarativeNetRequest.getDynamicRules((rules) => {
        console.log('=== CURRENT DYNAMIC RULES DEBUG ===');
        console.log('Total rules:', rules.length);
        
        // Check for duplicate IDs
        const ruleIds = rules.map(r => r.id);
        const duplicateIds = ruleIds.filter((id, index) => ruleIds.indexOf(id) !== index);
        
        if (duplicateIds.length > 0) {
          console.error('FOUND DUPLICATE RULE IDS:', duplicateIds);
        }
        
        rules.forEach(rule => {
          console.log(`Rule ${rule.id}: ${rule.action.type} (priority: ${rule.priority}) - ${rule.condition.urlFilter || rule.condition.regexFilter}`);
        });
        sendResponse({ rules: rules, duplicateIds: duplicateIds });
      });
      return true;
    case 'refreshRules':
      // Force refresh of all dynamic rules
      console.log('Manual rule refresh requested');
      updateDynamicRules();
      sendResponse({ success: true });
      break;
    default:
      // Unknown message type - ignore
      break;
  }
});

/**
 * Initialize pause monitoring.
 */
function initPauseMonitoring() {
  console.log('Initializing pause monitoring...');
  
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
  console.log('Alarm triggered:', alarm);
  if (alarm && alarm.name === 'pauseEndAlarm') {
    console.log('Pause end alarm triggered - calling handlePauseEnd()');
    handlePauseEnd();
  }
});

// =====================
// Pattern Rule Management API
// =====================
/**
 * Add a new pattern rule.
 * @param {Object} rule - Pattern rule object
 * @param {function} sendResponse - Response callback
 */
function addPatternRule(rule, sendResponse) {
  const validation = validatePatternRule(rule);
  if (!validation.valid) {
    sendResponse({ success: false, error: validation.error });
    return;
  }
  
  chrome.storage.sync.get([STORAGE_KEYS.patternRules], (data) => {
    const patterns = data[STORAGE_KEYS.patternRules] || [];
    
    // Add unique ID and default values
    const newRule = {
      id: Date.now().toString(),
      pattern: rule.pattern,
      type: rule.type,
      description: rule.description || '',
      enabled: rule.enabled !== false, // Default to true
      createdAt: new Date().toISOString()
    };
    
    patterns.push(newRule);
    
    chrome.storage.sync.set({ [STORAGE_KEYS.patternRules]: patterns }, () => {
      updateDynamicRules();
      sendResponse({ success: true, rule: newRule });
    });
  });
}

/**
 * Remove a pattern rule by ID.
 * @param {string} ruleId - ID of rule to remove
 * @param {function} sendResponse - Response callback
 */
function removePatternRule(ruleId, sendResponse) {
  chrome.storage.sync.get([STORAGE_KEYS.patternRules], (data) => {
    const patterns = data[STORAGE_KEYS.patternRules] || [];
    const updatedPatterns = patterns.filter(rule => rule.id !== ruleId);
    
    chrome.storage.sync.set({ [STORAGE_KEYS.patternRules]: updatedPatterns }, () => {
      updateDynamicRules();
      sendResponse({ success: true });
    });
  });
}

/**
 * Update an existing pattern rule.
 * @param {string} ruleId - ID of rule to update
 * @param {Object} updatedRule - Updated rule data
 * @param {function} sendResponse - Response callback
 */
function updatePatternRule(ruleId, updatedRule, sendResponse) {
  const validation = validatePatternRule(updatedRule);
  if (!validation.valid) {
    sendResponse({ success: false, error: validation.error });
    return;
  }
  
  chrome.storage.sync.get([STORAGE_KEYS.patternRules], (data) => {
    const patterns = data[STORAGE_KEYS.patternRules] || [];
    const ruleIndex = patterns.findIndex(rule => rule.id === ruleId);
    
    if (ruleIndex === -1) {
      sendResponse({ success: false, error: 'Rule not found' });
      return;
    }
    
    // Update the rule while preserving ID and creation date
    patterns[ruleIndex] = {
      ...patterns[ruleIndex],
      pattern: updatedRule.pattern,
      type: updatedRule.type,
      description: updatedRule.description || '',
      enabled: updatedRule.enabled !== false,
      updatedAt: new Date().toISOString()
    };
    
    chrome.storage.sync.set({ [STORAGE_KEYS.patternRules]: patterns }, () => {
      updateDynamicRules();
      sendResponse({ success: true, rule: patterns[ruleIndex] });
    });
  });
}

/**
 * Get all pattern rules.
 * @param {function} sendResponse - Response callback
 */
function getPatternRules(sendResponse) {
  chrome.storage.sync.get([STORAGE_KEYS.patternRules], (data) => {
    sendResponse({ success: true, rules: data[STORAGE_KEYS.patternRules] || [] });
  });
}

/**
 * Debug function to check current dynamic rules and find conflicts
 */
function debugRuleConflicts() {
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    console.log('=== CURRENT DYNAMIC RULES DEBUG ===');
    console.log('Total existing rules:', existingRules.length);
    
    const ruleIds = existingRules.map(r => r.id);
    const duplicateIds = ruleIds.filter((id, index) => ruleIds.indexOf(id) !== index);
    
    if (duplicateIds.length > 0) {
      console.error('FOUND DUPLICATE RULE IDS:', duplicateIds);
      existingRules.forEach(rule => {
        if (duplicateIds.includes(rule.id)) {
          console.error('Duplicate rule:', rule);
        }
      });
    } else {
      console.log('No duplicate rule IDs found');
    }
    
    console.log('Rule ID range:', Math.min(...ruleIds), 'to', Math.max(...ruleIds));
    console.log('=== END RULE DEBUG ===');
  });
}