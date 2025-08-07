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
  whitelistMode: 'whitelistMode',
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
// URL Checking Module
// =====================
/**
 * Check if current URL should be blocked based on mode and settings.
 * @param {Array} blockedDomains - Array of blocked domain names (or allowed domains in whitelist mode)
 * @param {Array} allowlistUrls - Array of allowed URLs
 * @param {boolean} focusMode - Whether focus mode is enabled
 * @param {boolean} whitelistMode - Whether whitelist mode is enabled
 * @returns {boolean} True if URL should be blocked
 */
function shouldBlockUrl(blockedDomains, allowlistUrls, focusMode, whitelistMode) {
  const currentHostname = location.hostname;
  const currentUrl = location.href;
  
  if (whitelistMode) {
    // Whitelist mode: block everything except allowed domains/URLs
    const isDomainAllowed = blockedDomains.some(domain => currentHostname.endsWith(domain));
    const isUrlAllowed = allowlistUrls.some(url => currentUrl.startsWith(url));
    
    // Block if neither domain nor URL is explicitly allowed
    return !isDomainAllowed && !isUrlAllowed;
  }
  
  // Standard or Focus mode
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
      
      // Instead of redirecting, replace the page content with our blocked page
      loadBlockedPageContent();
    }
  }, BLOCK_DELAY_MS);
}

/**
 * Load and display the enhanced blocked page content directly.
 */
function loadBlockedPageContent() {
  fetch(chrome.runtime.getURL(BLOCKED_PAGE_PATH))
    .then(response => response.text())
    .then(html => {
      // Replace the entire document with our blocked page
      document.open();
      document.write(html);
      document.close();
      
      // Update the page title
      document.title = 'Focus Mode - Site Blocked';
      
      console.log('Successfully loaded enhanced blocked page');
    })
    .catch(error => {
      console.error('Error loading blocked page:', error);
      // Fallback to basic blocking
      showBasicBlockedPage();
    });
}

/**
 * Fallback basic blocked page if the enhanced one fails to load.
 */
function showBasicBlockedPage() {
  document.body.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-family: 'Segoe UI', sans-serif;
      text-align: center;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      margin: 0;
      padding: 20px;
    ">
      <div style="max-width: 600px;">
        <div style="font-size: 4em; margin-bottom: 20px;">🛡️</div>
        <h1 style="font-size: 2.5em; margin-bottom: 15px;">Stay Focused!</h1>
        <p style="font-size: 1.2em; margin-bottom: 20px;">This site is blocked to help you maintain productivity</p>
        <p style="font-size: 1em; opacity: 0.9;">💪 "Success is built one focused moment at a time"</p>
        <div style="margin-top: 30px;">
          <button onclick="window.close()" style="
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
            border: none;
            border-radius: 25px;
            padding: 12px 24px;
            font-size: 1em;
            cursor: pointer;
            margin: 10px;
          ">Close Tab</button>
          <button onclick="history.back()" style="
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 25px;
            padding: 12px 24px;
            font-size: 1em;
            cursor: pointer;
            margin: 10px;
          ">Go Back</button>
        </div>
      </div>
    </div>
  `;
  document.title = 'Focus Mode - Site Blocked';
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

    getWhitelistMode((whitelistMode) => {
      getFocusMode((focusMode) => {
        getLists(({ blocked, allowlist }) => {
          if (shouldBlockUrl(blocked, allowlist, focusMode, whitelistMode)) {
            redirectToBlockedPage();
          }
        });
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