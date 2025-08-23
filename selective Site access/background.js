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
      // Example: */shorts/* becomes *shorts*
      let urlFilter = patternRule.pattern
        .replace(/\*/g, '*')  // Keep wildcards
        .replace(/^\//, '')   // Remove leading slash
        .replace(/\/$/, '');  // Remove trailing slash
      
      condition = {
        urlFilter: `*${urlFilter}*`,
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
// Rule Generation Module
// =====================
/**
 * Generate declarativeNetRequest rules for blocking domains and allowing specific URLs.
 * @param {Array} blockedDomains - Array of domain names to block
 * @param {Array} allowlistUrls - Array of specific URLs to allow
 * @param {Array} patternRules - Array of pattern-based blocking rules
 * @returns {Array} Array of rule objects for declarativeNetRequest
 */
function generateRules(blockedDomains, allowlistUrls, patternRules = []) {
  let rules = [];
  let ruleId = 1;
  
  console.log('=== GENERATING RULES ===');
  console.log('Blocked domains:', blockedDomains);
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
      
      // Approach 1: Use regex filter for exact URL matching (most reliable)
      // Escape special regex characters in the URL
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      const regexRule = {
        id: ruleId++,
        priority: RULE_PRIORITIES.ALLOW + 10, // Even higher priority
        action: { type: 'allow' },
        condition: {
          regexFilter: escapedUrl, // Remove ^ and $ anchors to be less strict
          resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "stylesheet", "image", "media", "font", "websocket", "other"]
        }
      };
      
      rules.push(regexRule);
      console.log(`✅ Added REGEX ALLOW rule (priority ${regexRule.priority}):`, escapedUrl);
      
      // Approach 2: Also create a broader pattern for the path without query params
      const pathPattern = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}*`;
      
      const pathRule = {
        id: ruleId++,
        priority: RULE_PRIORITIES.ALLOW + 5,
        action: { type: 'allow' },
        condition: {
          urlFilter: pathPattern,
          resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "stylesheet", "image", "media", "font", "websocket", "other"]
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
          regexFilter: escapedUrl, // Remove anchors here too
          resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "stylesheet", "image", "media", "font", "websocket", "other"]
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

  // Block all URLs for each blocked domain - lowest priority
  blockedDomains.forEach(domain => {
    const blockRule = {
      id: ruleId++,
      priority: RULE_PRIORITIES.BLOCK,
      action: { 
        type: 'redirect', 
        redirect: { extensionPath: CONFIG.BLOCKED_PAGE_PATH } 
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"]
      }
    };
    
    rules.push(blockRule);
    console.log(`🚫 Added BLOCK rule (priority ${RULE_PRIORITIES.BLOCK}):`, domain);
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
 * @param {function} callback - Callback with {blocked, allowlist, patterns} object
 */
function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains, STORAGE_KEYS.allowlistUrls, STORAGE_KEYS.patternRules], (data) => {
    callback({
      blocked: data[STORAGE_KEYS.blockedDomains] || [],
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
function updateDynamicRules() {
  isPaused((paused) => {
    if (paused) {
      // Remove all dynamic rules while paused
      removeAllDynamicRules();
      return;
    }

    // Standard mode: block domains and patterns but allow specific URLs
    getLists(({ blocked, allowlist, patterns }) => {
      const rules = generateRules(blocked, allowlist, patterns);
      updateDynamicRulesWithNewRules(rules);
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
/**
 * Apply an array of new blocking rules, replacing all existing ones.
 * @param {Array} newRules - Array of new rules to apply
 */
function updateDynamicRulesWithNewRules(newRules) {
  console.log('Updating dynamic rules with:', newRules.length, 'rules');
  newRules.forEach(rule => {
    console.log('Rule:', rule.id, rule.action.type, rule.condition.urlFilter);
  });
  
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map(r => r.id);
    console.log('Removing existing rules:', removeRuleIds);
    
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: newRules
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error updating rules:', chrome.runtime.lastError);
      } else {
        console.log('Successfully updated rules');
      }
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
  console.log('Refreshing blocked tabs and updating rules...');
  
  // Update rules first
  updateDynamicRules();
  
  // Wait a bit for rules to update, then refresh blocked tabs
  setTimeout(() => {
    refreshBlockedTabs();
  }, 1000);
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
      const hostname = new URL(url).hostname;
      return hostname.endsWith(patternRule.pattern);
      
    default:
      console.warn('Unknown pattern type:', patternRule.type);
      return false;
  }
}

/**
 * Refresh tabs that have blocked domains open.
 * This is specifically for when pause ends or blocking is manually resumed.
 */
function refreshBlockedTabs() {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains, STORAGE_KEYS.allowlistUrls, STORAGE_KEYS.patternRules], (data) => {
    const blockedDomains = data[STORAGE_KEYS.blockedDomains] || [];
    const allowlistUrls = data[STORAGE_KEYS.allowlistUrls] || [];
    const patternRules = data[STORAGE_KEYS.patternRules] || [];
    
    console.log('refreshBlockedTabs called with:');
    console.log('- Blocked domains:', blockedDomains);
    console.log('- Allowlist URLs:', allowlistUrls.length, 'URLs');
    console.log('- Pattern rules:', patternRules.length, 'rules');
    
    if (blockedDomains.length === 0 && patternRules.length === 0) {
      console.log('No blocked domains or pattern rules found - nothing to refresh');
      return;
    }
    
    // Helper function to check if URL is in allowlist
    const isInAllowlist = (url) => {
      return allowlistUrls.some(item => {
        if (typeof item === 'string') {
          return item === url;
        } else if (typeof item === 'object' && item.url) {
          return item.url === url;
        }
        return false;
      });
    };
    
    chrome.tabs.query({}, (tabs) => {
      let refreshCount = 0;
      console.log(`Checking ${tabs.length} tabs for blocking...`);
      
      tabs.forEach(tab => {
        if (tab.url) {
          let shouldRefresh = false;
          
          // Case 1: Tab is showing a blocked domain directly
          if (tab.url.startsWith('http')) {
            // FIRST: Check if this URL is in allowlist - if so, never refresh it
            if (isInAllowlist(tab.url)) {
              console.log(`Tab is in allowlist, skipping refresh: ${tab.url}`);
              return;
            }
            
            const domain = extractDomain(tab.url);
            
            // Check if domain is in blocked domains list
            if (blockedDomains.includes(domain)) {
              shouldRefresh = true;
              console.log(`Tab matches blocked domain: ${domain}`);
            }
            
            // Check if URL matches any pattern rule
            if (!shouldRefresh) {
              for (const rule of patternRules) {
                if (rule.enabled && matchesPatternRule(tab.url, rule)) {
                  shouldRefresh = true;
                  console.log(`Tab matches pattern rule: ${rule.pattern} (${rule.type})`);
                  break;
                }
              }
            }
            
            if (shouldRefresh) {
              chrome.tabs.reload(tab.id);
              refreshCount++;
              console.log(`✅ Refreshed blocked tab: ${domain} (${tab.url})`);
            }
          }
          // Case 2: Tab is showing the blocked.html page (old blocked page)
          else if (tab.url.includes('blocked.html')) {
            chrome.tabs.reload(tab.id);
            refreshCount++;
            console.log(`✅ Refreshed blocked.html tab: ${tab.url}`);
          }
        }
      });
      console.log(`=== REFRESH COMPLETE: ${refreshCount} tabs refreshed ===`);
    });
  });
}

/**
 * Initialize pause monitoring.
 */
function initializePauseMonitoring() {
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
  initializePauseMonitoring();
});

/**
 * Initialize rules when browser starts (if supported).
 */
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    updateDynamicRules();
    initializePauseMonitoring();
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
        rules.forEach(rule => {
          console.log(`Rule ${rule.id}: ${rule.action.type} (priority: ${rule.priority}) - ${rule.condition.urlFilter}`);
        });
        sendResponse({ rules: rules });
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