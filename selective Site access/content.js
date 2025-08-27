// =====================
// Config & Constants
// =====================
// Minimal constants needed for content script
const STORAGE_KEYS = {
  allowlistUrls: 'allowlistUrls', 
  patternRules: 'patternRules',
  pauseUntil: 'pauseUntil'
};

const CONFIG = {
  BLOCKED_PAGE_PATH: '/blocked.html',
  BLOCK_DELAY_MS: 100
};

const YOUTUBE_HOSTNAME = 'youtube.com';

// Global variables for recovery tracking
let reinitializationAttempts = 0;
const MAX_REINIT_ATTEMPTS = 3;
let isInitialized = false;

// =====================
// Storage Module
// =====================
/**
 * Check if extension context is valid
 */
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

/**
 * Attempt to recover from extension context invalidation
 */
function attemptRecovery() {
  if (reinitializationAttempts >= MAX_REINIT_ATTEMPTS) {
    console.log('Content Script: Max recovery attempts reached, giving up');
    return false;
  }
  
  reinitializationAttempts++;
  console.log(`Content Script: Attempting recovery (attempt ${reinitializationAttempts}/${MAX_REINIT_ATTEMPTS})`);
  
  // Wait a bit and try to reinitialize
  setTimeout(() => {
    if (isExtensionContextValid()) {
      console.log('Content Script: Extension context recovered, reinitializing...');
      reinitializationAttempts = 0; // Reset counter on successful recovery
      isInitialized = false; // Reset initialization flag
      initialize();
    } else {
      console.log('Content Script: Context still invalid, will retry on next navigation');
    }
  }, 1000);
  
  return true;
}

/**
 * Check if blocking is currently paused.
 * @param {function} callback - Callback with boolean result
 */
function isPaused(callback) {
  if (!isExtensionContextValid()) {
    console.warn('Content Script: Extension context invalidated - skipping pause check');
    callback(false);
    return;
  }
  
  try {
    chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Content Script: Storage error in isPaused:', chrome.runtime.lastError);
        callback(false);
        return;
      }
      callback((data[STORAGE_KEYS.pauseUntil] || 0) > Date.now());
    });
  } catch (error) {
    console.warn('Content Script: Error in isPaused:', error);
    callback(false);
  }
}

/**
 * Get allowlist and pattern rules from storage.
 * @param {function} callback - Callback with {allowlist, patterns} object
 */
function getLists(callback) {
  if (!isExtensionContextValid()) {
    console.warn('Content Script: Extension context invalidated - using empty lists');
    callback({ allowlist: [], patterns: [] });
    return;
  }
  
  try {
    chrome.storage.sync.get([STORAGE_KEYS.allowlistUrls, STORAGE_KEYS.patternRules], (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Content Script: Storage error in getLists:', chrome.runtime.lastError);
        callback({ allowlist: [], patterns: [] });
        return;
      }
      
      callback({
        allowlist: data[STORAGE_KEYS.allowlistUrls] || [],
        patterns: data[STORAGE_KEYS.patternRules] || []
      });
    });
  } catch (error) {
    console.warn('Content Script: Error in getLists:', error);
    callback({ allowlist: [], patterns: [] });
  }
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
 * Check if current URL should be blocked based on pattern rules.
 * @param {Array} allowlistUrls - Array of allowed URLs
 * @param {Array} patternRules - Array of pattern-based blocking rules
 * @returns {boolean} True if URL should be blocked
 */
function shouldBlockUrl(allowlistUrls, patternRules) {
  const currentUrl = location.href;
  
  // Check if URL matches any pattern rule
  const matchesBlockingPattern = patternRules.some(rule => matchesPattern(currentUrl, rule));
  
  // Check if URL is in allowlist (handle both string and object formats)
  const isAllowed = allowlistUrls.some(item => {
    let allowUrl;
    if (typeof item === 'string') {
      allowUrl = item;
    } else if (typeof item === 'object' && item.url) {
      allowUrl = item.url;
    } else {
      return false;
    }
    
    // Only allow if current URL starts with the allowlisted URL
    // This correctly handles query parameter variations while preventing
    // domain-level bypasses (e.g., allowlisting specific video shouldn't unblock entire domain)
    return currentUrl.startsWith(allowUrl);
  });
  
  console.log('Content script check:', {
    currentUrl,
    matchesBlockingPattern,
    isAllowed,
    allowlistUrls: allowlistUrls.map(item => typeof item === 'string' ? item : item.url)
  });
  
  // Block if matches pattern AND URL is not in allowlist
  return matchesBlockingPattern && !isAllowed;
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
  // Immediately stop all media
  const videos = document.querySelectorAll('video');
  const audios = document.querySelectorAll('audio');
  
  videos.forEach(video => {
    video.pause();
    video.src = '';
    video.remove();
  });
  
  audios.forEach(audio => {
    audio.pause();
    audio.src = '';
    audio.remove();
  });
  
  // Stop any ongoing requests
  if (window.stop) {
    window.stop();
  }
  
  // Hide all content immediately
  if (document.body) {
    document.body.style.display = 'none';
  }
  
  // Add CSS to hide everything and stop media
  const style = document.createElement('style');
  style.textContent = `
    * { 
      display: none !important; 
      visibility: hidden !important;
    }
    video, audio, iframe, embed, object { 
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
    }
    html, body { 
      display: block !important; 
      visibility: visible !important;
      margin: 0 !important; 
      padding: 0 !important; 
      background: #667eea !important;
      overflow: hidden !important;
    }
  `;
  
  if (document.head) {
    document.head.appendChild(style);
  } else {
    // If head doesn't exist yet, add style when it's ready
    document.addEventListener('DOMContentLoaded', () => {
      document.head.appendChild(style);
    });
  }
  
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
      // Fix the script src to use the correct extension URL
      const extensionUrl = chrome.runtime.getURL('blocked.js');
      const fixedHtml = html.replace(
        '<script src="blocked.js"></script>',
        `<script src="${extensionUrl}"></script>`
      );
      
      // Replace the entire document with our blocked page
      document.open();
      document.write(fixedHtml);
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
  try {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('Content Script: Extension context invalidated - stopping execution');
      return;
    }
    
    // Don't run on extension pages or already blocked pages
    if (location.protocol === 'chrome-extension:' || 
        location.href.includes('blocked.html')) {
      return;
    }
    
    console.log('Content Script: Checking URL:', location.href);
    
    isPaused((paused) => {
      if (!isExtensionContextValid()) {
        console.warn('Content Script: Extension context invalidated during pause check');
        return;
      }
      
      if (paused) {
        console.log('Content Script: Blocking is paused');
        return; // Don't block if paused
      }

      getLists(({ allowlist, patterns }) => {
        if (!isExtensionContextValid()) {
          console.warn('Content Script: Extension context invalidated during getLists');
          return;
        }
        
        const shouldBlock = shouldBlockUrl(allowlist, patterns);
        console.log('Content Script: Should block?', shouldBlock);
        
        if (shouldBlock) {
          console.log('Content Script: Blocking URL:', location.href);
          // Use more aggressive blocking for better reliability
          forceBlock();
        } else {
          console.log('Content Script: URL allowed:', location.href);
        }
      });
    });
  } catch (error) {
    console.warn('Content Script: Error in checkAndBlock:', error);
    // Don't let errors break the functionality
  }
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
  console.log('Content Script: Initializing SPA monitoring for:', lastUrl);

  // Observe DOM changes to detect URL changes
  const observer = new MutationObserver(() => {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Content Script: Extension context invalidated during SPA monitoring');
        observer.disconnect();
        attemptRecovery();
        return;
      }
      
      if (location.href !== lastUrl) {
        console.log('Content Script: URL changed from', lastUrl, 'to', location.href);
        lastUrl = location.href;
        
        // Small delay to let the page settle
        setTimeout(() => {
          if (isExtensionContextValid()) {
            checkAndBlock();
          } else {
            attemptRecovery();
          }
        }, 100);
      }
    } catch (error) {
      console.warn('Content Script: Error in SPA monitoring:', error);
    }
  });

  // Start observing DOM changes
  observer.observe(document, { 
    subtree: true, 
    childList: true 
  });

  // Also monitor popstate events (back/forward navigation)
  window.addEventListener('popstate', () => {
    if (isExtensionContextValid()) {
      console.log('Content Script: Popstate event detected');
      setTimeout(() => {
        if (isExtensionContextValid()) {
          checkAndBlock();
        } else {
          attemptRecovery();
        }
      }, 100);
    } else {
      attemptRecovery();
    }
  });

  // Monitor pushstate/replacestate (programmatic navigation)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    if (isExtensionContextValid()) {
      console.log('Content Script: PushState detected');
      setTimeout(() => {
        if (isExtensionContextValid()) {
          checkAndBlock();
        } else {
          attemptRecovery();
        }
      }, 100);
    } else {
      attemptRecovery();
    }
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    if (isExtensionContextValid()) {
      console.log('Content Script: ReplaceState detected');
      setTimeout(() => {
        if (isExtensionContextValid()) {
          checkAndBlock();
        } else {
          attemptRecovery();
        }
      }, 100);
    } else {
      attemptRecovery();
    }
  };
}

// =====================
// Initialization
// =====================
/**
 * Initialize content script functionality.
 * Runs on all sites to check for blocking.
 */
function initialize() {
  if (isInitialized) {
    console.log('Content Script: Already initialized, skipping...');
    return;
  }
  
  if (!isExtensionContextValid()) {
    console.warn('Content Script: Extension context invalid during initialization');
    attemptRecovery();
    return;
  }
  
  console.log('Content Script: Initializing...');
  isInitialized = true;
  
  // Check on initial load for all sites
  checkAndBlock();
  
  // Set up SPA navigation monitoring for all sites
  // This is especially important for YouTube, but useful for other SPAs too
  initializeSpaMonitoring();
  
  // Monitor page visibility changes to detect potential extension reloads
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isExtensionContextValid()) {
      console.log('Content Script: Page became visible but extension context invalid, attempting recovery');
      isInitialized = false; // Reset flag to allow reinitialization
      attemptRecovery();
    }
  });
}

// Start the content script
initialize();
