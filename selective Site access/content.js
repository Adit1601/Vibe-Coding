// =====================
// Config & Constants
// =====================
// Minimal constants needed for content script
const STORAGE_KEYS = {
  blockedDomains: 'blockedDomains',
  allowlistUrls: 'allowlistUrls', 
  patternRules: 'patternRules',
  pauseUntil: 'pauseUntil'
};

const CONFIG = {
  BLOCKED_PAGE_PATH: '/blocked.html',
  BLOCK_DELAY_MS: 100
};

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
// URL Checking Module
// =====================
/**
 * Check if a URL matches a pattern rule.
 * @param {string} url - URL to check
 * @param {Object} patternRule - Pattern rule object
 * @returns {boolean} True if URL matches the pattern
 */
function matchesPattern(url, patternRule) {
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
        return new RegExp(patternRule.pattern, 'i').test(url);
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
 * Check if current URL should be blocked based on settings.
 * @param {Array} blockedDomains - Array of blocked domain names
 * @param {Array} allowlistUrls - Array of allowed URLs
 * @param {Array} patternRules - Array of pattern-based blocking rules
 * @returns {boolean} True if URL should be blocked
 */
function shouldBlockUrl(blockedDomains, allowlistUrls, patternRules) {
  const currentHostname = location.hostname;
  const currentUrl = location.href;
  
  // Check if URL matches any pattern rule
  const matchesBlockingPattern = patternRules.some(rule => matchesPattern(currentUrl, rule));
  
  // Check if domain is in blocklist
  const isBlocked = blockedDomains.some(domain => currentHostname.endsWith(domain));
  
  // Check if URL is in allowlist
  const isAllowed = allowlistUrls.some(url => currentUrl.startsWith(url));
  
  // Block if (domain is blocked OR matches pattern) AND URL is not in allowlist
  return (isBlocked || matchesBlockingPattern) && !isAllowed;
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
  }, CONFIG.BLOCK_DELAY_MS);
}

/**
 * More aggressive blocking for sites that don't respond to declarativeNetRequest
 */
function forceBlock() {
  // Hide all content immediately
  if (document.body) {
    document.body.style.display = 'none';
  }
  
  // Add CSS to hide everything
  const style = document.createElement('style');
  style.textContent = `
    * { display: none !important; }
    html, body { 
      display: block !important; 
      margin: 0 !important; 
      padding: 0 !important; 
      background: #667eea !important;
    }
  `;
  document.head.appendChild(style);
  
  // Load blocked content
  redirectToBlockedPage();
}

/**
 * Load and display the enhanced blocked page content directly.
 */
function loadBlockedPageContent() {
  fetch(chrome.runtime.getURL(CONFIG.BLOCKED_PAGE_PATH))
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
  document.title = 'Site Blocked';
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

    getLists(({ blocked, allowlist, patterns }) => {
      if (shouldBlockUrl(blocked, allowlist, patterns)) {
        // Use more aggressive blocking for better reliability
        forceBlock();
      }
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
 * Runs on all sites to check for blocking.
 */
function initialize() {
  // Check on initial load for all sites
  checkAndBlock();
  
  // Set up SPA navigation monitoring for all sites
  // This is especially important for YouTube, but useful for other SPAs too
  initializeSpaMonitoring();
}

// Start the content script
initialize();
