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
        urlFilter = `*${  urlFilter}`;
      }
      if (!urlFilter.endsWith('*')) {
        urlFilter = `${urlFilter  }*`;
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
      return { valid: false, error: `Invalid regex pattern: ${  e.message}` };
    }
  }
  
  return { valid: true };
}

// =====================
// Rule ID Management
// =====================
let nextRuleId = 1;
let ruleUpdateInProgress = false;
let pendingRuleUpdateCallbacks = [];

/**
 * Store pattern rules in chrome storage
 * @param {Array} rules - Array of pattern rules to store

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
 * Create an optimized allowlist rule for a specific URL
 * 
 * This function creates a single, highly-optimized rule that replaces the previous
 * approach of creating 3 separate rules (exact, regex, path) per URL.
 * 
 * Performance improvement: 66.7% reduction in rules (3 rules → 1 rule per URL)
 * 
 * @param {string} url - The URL to allow
 * @param {number} ruleId - Unique rule ID
 * @returns {Object|null} The optimized rule object or null if invalid
 */
function createOptimizedAllowlistRule(url, ruleId) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  try {
    // Validate URL format
    new URL(url);
    
    // Escape special regex characters for exact URL matching
    // This creates a regex that matches the URL exactly, including query parameters
    let escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // For URLs with fragments (#), we want to be more flexible since browsers
    // often don't include fragments in the request URL
    if (url.includes('#')) {
      // Remove the fragment part and make it optional in the regex
      const urlWithoutFragment = url.split('#')[0];
      const fragmentPart = url.split('#')[1];
      const escapedBase = urlWithoutFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedFragment = fragmentPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      escapedUrl = `${escapedBase}(?:#${escapedFragment})?`;
    }
    
    // Create the optimized allow rule
    return {
      id: ruleId,
      priority: RULE_PRIORITIES.ALLOW + 10, // High priority to override blocks
      action: { type: 'allow' },
      condition: {
        regexFilter: `^${escapedUrl}$`, // Anchor to ensure exact match
        resourceTypes: ["main_frame", "sub_frame"]
      }
    };
    
  } catch (e) {
    // For malformed URLs, create a more permissive fallback rule
    if (url.trim()) {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return {
        id: ruleId,
        priority: RULE_PRIORITIES.ALLOW, // Lower priority for malformed URLs
        action: { type: 'allow' },
        condition: {
          regexFilter: escapedUrl, // No anchors for malformed URLs (more permissive)
          resourceTypes: ["main_frame"]
        }
      };
    }
    return null;
  }
}

/**
 * Generate declarativeNetRequest rules for pattern-based blocking and allowing specific URLs.
 * @param {Array} allowlistUrls - Array of specific URLs to allow
 * @param {Array} patternRules - Array of pattern-based blocking rules
 * @returns {Promise<Array>} Promise that resolves to array of rule objects for declarativeNetRequest
 */
async function generateRules(allowlistUrls, patternRules = []) {
  const rules = [];
  
  console.log('=== GENERATING RULES ===');
  console.log('Allowlist URLs:', allowlistUrls);
  console.log('Pattern rules:', patternRules.length, 'rules');

  // Calculate total number of rules we'll need
  let totalRulesNeeded = 0;
  
  // Count allowlist rules (1 per URL with single optimized rule)
  allowlistUrls.forEach(item => {
    if (typeof item === 'string' || (typeof item === 'object' && item.url)) {
      totalRulesNeeded += 1; // single optimized rule per URL
    }
  });
  
  // Count pattern rules (1 per enabled pattern)
  patternRules.forEach(patternRule => {
    if (patternRule.enabled) {
      totalRulesNeeded += 1;
    }
  });
  
  console.log('Total rules needed:', totalRulesNeeded);
  
  // If no rules are needed, return empty array immediately
  if (totalRulesNeeded === 0) {
    console.log('=== RULE GENERATION COMPLETE: 0 total rules ===');
    return rules;
  }
  
  // Get unique rule IDs for all rules at once
  const ruleIds = await getMultipleUniqueRuleIds(totalRulesNeeded);
  let ruleIdIndex = 0;

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
    
    // Create a single, optimized allowlist rule
    const allowRule = createOptimizedAllowlistRule(url, ruleIds[ruleIdIndex++]);
    
    if (allowRule) {
      rules.push(allowRule);
      console.log(`✅ Added OPTIMIZED ALLOW rule (priority ${allowRule.priority}):`, url);
    } else {
      console.warn('Failed to create allowlist rule for:', url);
    }
  });

  // Pattern-based blocking rules - medium priority
  patternRules.forEach(patternRule => {
    const rule = patternToNetRequestRule(patternRule, ruleIds[ruleIdIndex++]);
    if (rule) {
      rules.push(rule);
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
 * Uses mutual exclusion to prevent race conditions from simultaneous updates.
 */
function updateDynamicRules(callback) {
  // If an update is already in progress, queue this callback
  if (ruleUpdateInProgress) {
    console.log('Rule update already in progress, queuing callback');
    if (callback) {
      pendingRuleUpdateCallbacks.push(callback);
    }
    return;
  }
  
  ruleUpdateInProgress = true;
  
  /**
  * Processes pending callback functions sequentially.
  * @example
  * processCallbacks(() => console.log("Callback executed"))
  * // Executes the provided callback and any queued callbacks.
  * @param {function} callback - The callback function to be executed immediately.
  * @returns {void} This function does not return a value.
  **/
  const completeUpdate = () => {
    ruleUpdateInProgress = false;
    
    // Execute the current callback
    if (callback) {
      callback();
    }
    
    // Execute any queued callbacks
    const queuedCallbacks = pendingRuleUpdateCallbacks.splice(0);
    queuedCallbacks.forEach(cb => {
      try {
        cb();
      } catch (error) {
        console.error('Error in queued callback:', error);
      }
    });
  };

  isPaused((paused) => {
    if (paused) {
      // Remove all dynamic rules while paused
      removeAllDynamicRules(completeUpdate);
      return;
    }

    // Standard mode: block patterns but allow specific URLs
    getLists(async ({ allowlist, patterns }) => {
      try {
        const rules = await generateRules(allowlist, patterns);
        updateDynamicRulesWithNewRules(rules, completeUpdate);
      } catch (error) {
        console.error('Error generating rules:', error);
        completeUpdate();
      }
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
        console.error(`Critical error: Duplicate rule ID ${rule.id} detected in batch. This should not happen with the new ID generation system.`);
        // Skip this rule instead of trying to fix it, as this indicates a deeper problem
        console.error('Skipping duplicate rule:', rule);
        return;
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
  
  /**
  * Adds new network request rules dynamically and executes a callback upon completion.
  * @example
  * addNewRules([{id: 1, action: {type: "block"}, condition: {urlFilter: "example.com"}}], () => { console.log('Rules updated'); })
  * // Logs: "Successfully added 1 new rules", or logs errors if rules failed to add.
  * @param {Array} rules - Array of rule objects to be added, which define how network requests should be handled.
  * @param {Function} callback - Optional callback function called after attempting to add rules, regardless of success or failure.
  * @returns {void} This function does not return a value.
  **/
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
 * Refresh tabs that should be blocked after pause ends.
 * Instead of re-implementing blocking logic, this uses a more comprehensive approach
 * that trusts the declarativeNetRequest rules as the source of truth.
 */
function refreshBlockedTabs() {
  getLists(({ allowlist, patterns }) => {
    if (patterns.length === 0) {
      console.log('No pattern rules found - nothing to refresh');
      return;
    }

    console.log('Refreshing tabs after pause ended...');
    
    // Strategy: Refresh all non-allowlisted tabs from domains that have any blocking patterns
    // This avoids duplicating complex pattern matching logic while being comprehensive
    
    const isAllowlisted = (url) => allowlist.some(item => {
      const allowUrl = (typeof item === 'object' && item.url) ? item.url : item;
      return url.startsWith(allowUrl);
    });

    // Extract domains that have blocking patterns to get a broad scope of what might be blocked
    const domainsWithPatterns = new Set();
    const urlPrefixesWithPatterns = new Set();
    
    patterns.forEach(rule => {
      if (!rule.enabled) return;
      
      switch (rule.type) {
        case 'domain':
          domainsWithPatterns.add(rule.pattern);
          break;
        case 'url':
          // For URL patterns, extract the domain to include in refresh candidates
          try {
            const urlObj = new URL(rule.pattern);
            domainsWithPatterns.add(urlObj.hostname);
            urlPrefixesWithPatterns.add(rule.pattern);
          } catch (e) {
            // If not a valid URL, treat as a prefix
            urlPrefixesWithPatterns.add(rule.pattern);
          }
          break;
        case 'path':
        case 'regex':
          // For path and regex patterns, we can't easily extract domains
          // So we'll need to be more liberal and refresh more tabs
          // This is better than missing some that should be blocked
          break;
      }
    });

    /**
     * Determines whether a URL should trigger a refresh based on various patterns and rules.
     * @example
     * shouldRefreshTab("http://example.com");
     * false
     * @param {string} url - The URL to be checked against the refresh conditions.
     * @returns {boolean} Returns true if the URL should trigger a refresh, otherwise false.
     */
    const mightBeBlocked = (url) => {
      // Don't refresh allowlisted URLs
      if (isAllowlisted(url)) {
        return false;
      }
      
      // Don't refresh internal pages
      if (!url || !url.startsWith('http')) {
        return false;
      }
      
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Check if this domain has blocking patterns
        if (domainsWithPatterns.has(hostname)) {
          return true;
        }
        
        // Check if hostname matches any domain pattern (including subdomains)
        for (const domain of domainsWithPatterns) {
          if (hostname === domain || hostname.endsWith(`.${  domain}`)) {
            return true;
          }
        }
        
        // Check if URL starts with any URL prefix patterns
        for (const prefix of urlPrefixesWithPatterns) {
          if (url.startsWith(prefix)) {
            return true;
          }
        }
        
        // For path and regex patterns, we can't easily determine which domains they affect
        // So if we have any path/regex patterns, we refresh tabs from popular domains
        // that are commonly blocked to ensure we don't miss anything
        const hasComplexPatterns = patterns.some(rule => 
          rule.enabled && (rule.type === 'path' || rule.type === 'regex')
        );
        
        if (hasComplexPatterns) {
          // List of common domains that users often have complex patterns for
          const commonBlockedDomains = [
            'youtube.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
            'tiktok.com', 'reddit.com', 'twitch.tv', 'netflix.com', 'amazon.com'
          ];
          
          return commonBlockedDomains.some(domain => 
            hostname === domain || hostname.endsWith(`.${  domain}`)
          );
        }
        
        return false;
      } catch (e) {
        // If URL parsing fails, err on the side of refreshing
        return true;
      }
    };

    // Refresh candidate tabs
    chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
      let refreshCount = 0;
      console.log(`Checking ${tabs.length} tabs for potential blocking...`);

      tabs.forEach(tab => {
        if (mightBeBlocked(tab.url)) {
          chrome.tabs.reload(tab.id);
          refreshCount++;
          console.log(`✅ Refreshed tab (might be blocked): ${tab.url}`);
        }
      });
      
      console.log(`=== REFRESH COMPLETE: ${refreshCount} tabs refreshed ===`);
      
      // Log helpful information for debugging
      console.log('Domains with patterns:', Array.from(domainsWithPatterns));
      console.log('URL prefixes with patterns:', Array.from(urlPrefixesWithPatterns));
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

// =====================
// Export for testing
// =====================