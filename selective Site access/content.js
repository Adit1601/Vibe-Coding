// =====================
// Config & Constants
// =====================
/**
 * @constant {Object} STORAGE_KEYS
 * @description All chrome.storage keys used in the content script.
 */
const STORAGE_KEYS = {
  blockedDomains: 'blockedDomains',
  allowlistUrls: 'allowlistUrls',
  pauseUntil: 'pauseUntil',
  focusMode: 'focusMode',
};

/**
 * @constant {string} BLOCKED_PAGE_PATH
 * @description Path to the blocked page shown when URLs are blocked.
 */
const BLOCKED_PAGE_PATH = 'blocked.html';

/**
 * @constant {number} BLOCK_DELAY_MS
 * @description Delay before redirecting to blocked page (ms).
 */
const BLOCK_DELAY_MS = 100;

/**
 * @constant {string} YOUTUBE_HOSTNAME
 * @description YouTube hostname for domain checking.
 */
const YOUTUBE_HOSTNAME = 'youtube.com';

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
// URL Checking Module
// =====================
/**
 * Check if current URL should be blocked based on domain and allowlist.
 * @param {Array} blockedDomains - Array of blocked domain names
 * @param {Array} allowlistUrls - Array of allowed URLs
 * @param {boolean} focusMode - Whether focus mode is enabled
 * @returns {boolean} True if URL should be blocked
 */
function shouldBlockUrl(blockedDomains, allowlistUrls, focusMode) {
  const currentHostname = location.hostname;
  const currentUrl = location.href;
  
  const isBlocked = blockedDomains.some(domain => currentHostname.endsWith(domain));
  const isAllowed = allowlistUrls.some(url => currentUrl.startsWith(url));
  
  if (focusMode) {
    // Focus mode: only check if domain is blocked, ignore allowlist
    return isBlocked;
  } else {
    // Normal mode: block if domain is blocked AND URL is not in allowlist
    return isBlocked && !isAllowed;
  }
}

/**
 * Redirect to blocked page and notify background script.
 */
function redirectToBlockedPage() {
  setTimeout(() => {
    // Only redirect if not already on a chrome-extension page
    if (location.protocol !== 'chrome-extension:') {
      chrome.runtime.sendMessage({ 
        type: 'blocked', 
        url: location.href 
      });
      location.replace(chrome.runtime.getURL(BLOCKED_PAGE_PATH));
    }
  }, BLOCK_DELAY_MS);
}

// =====================
// Main Blocking Logic
// =====================
/**
 * Check current URL and block if necessary.
 * This is the main function that determines if the current page should be blocked.
 */
function checkAndBlock() {
  isPaused((paused) => {
    if (paused) {
      return; // Don't block if paused
    }

    getFocusMode((focusMode) => {
      getLists(({ blocked, allowlist }) => {
        if (shouldBlockUrl(blocked, allowlist, focusMode)) {
          redirectToBlockedPage();
        }
      });
    });
  });
}

// =====================
// SPA Navigation Handler
// =====================
/**
 * Initialize URL change monitoring for Single Page Applications.
 * This handles YouTube's SPA navigation where the URL changes without page reload.
 */
function initializeSpaMonitoring() {
  let lastUrl = location.href;

  // Observe DOM changes to detect URL changes
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkAndBlock();
    }
  });

  // Start observing DOM changes
  observer.observe(document, { 
    subtree: true, 
    childList: true 
  });
}

// =====================
// Initialization
// =====================
/**
 * Initialize content script functionality.
 * Only runs on YouTube domain.
 */
function initialize() {
  // Only run on YouTube
  if (location.hostname.endsWith(YOUTUBE_HOSTNAME)) {
    // Check on initial load
    checkAndBlock();
    
    // Set up SPA navigation monitoring
    initializeSpaMonitoring();
  }
}

// Start the content script
initialize(); 