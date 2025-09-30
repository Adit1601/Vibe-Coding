# Selective Site Access - AI Coding Guidelines

This document provides essential knowledge for AI agents to effectively contribute to the Selective Site Access Chrome extension.

## Project Architecture

The extension follows a modular architecture using Chrome's Manifest V3:

- **Core Components:**
  - `background.js`: Service worker handling rule management and blocking logic
  - `content.js`: Fallback content script for blocking in edge cases
  - `main.js`: UI logic for the popup interface
  - `popup.html`: Extension popup UI
  - `blocked.html/js`: Custom blocking page

- **Utility Modules:**
  - `constants.js`: Centralized configuration and constants
  - `storage.js`: Chrome storage API abstractions
  - `auth.js`: Password protection system
  - `password-manager.js`: Password generation and validation
  - `regex-utils.js`: Safe regex handling with ReDoS protection
  - `error-handler.js`: Error management and recovery

## Key Workflows

### Rule Management

1. Rules are stored in Chrome's sync storage
2. Generated into `declarativeNetRequest` rules on application
3. Protected by a mutex system to prevent race conditions
4. Four pattern types supported: domain, URL, path, and regex

### Security Patterns

1. Password protection with auto-generated secure passwords
2. Password display persistence until acknowledged
3. All operations stay local - no remote APIs
4. Safe regex execution with timeouts to prevent ReDoS

### UI/UX Design

1. Popup interface with current site detection
2. Quick actions for blocking/allowing current site
3. Pattern rule management with type-specific interfaces
4. Pause functionality with countdown timer

## Development Patterns

### Storage Operations

```javascript
import { STORAGE_KEYS } from './constants.js';

// Read pattern
chrome.storage.sync.get([STORAGE_KEYS.patternRules], (data) => {
  const rules = data[STORAGE_KEYS.patternRules] || [];
  // Process rules
});

// Write pattern
chrome.storage.sync.set({ 
  [STORAGE_KEYS.patternRules]: updatedRules 
});
```

### Rule Conversion

Pattern rules are converted to Chrome `declarativeNetRequest` rules with type-specific handling:

```javascript
// Example: Convert domain pattern
{
  id: ruleId,
  priority: RULE_PRIORITIES.PATTERN,
  action: { 
    type: 'redirect', 
    redirect: { extensionPath: CONFIG.BLOCKED_PAGE_PATH } 
  },
  condition: {
    urlFilter: `||${pattern}^`,
    resourceTypes: ["main_frame"]
  }
}
```

## Integration Points

1. **Chrome API Dependencies:**
   - `declarativeNetRequest` API for rule management
   - `storage.sync` for cross-device settings
   - `tabs` API for tab operations
   - `alarms` API for pause functionality

2. **Extension Communication:**
   - Background to content script via `chrome.tabs.sendMessage()`
   - Content to background via `chrome.runtime.sendMessage()`
   - Popup to background via direct messaging

## Testing & Debugging

1. Use the built-in debug tools via the "🔍 Debug Rules" button
2. Test pattern rules with simple patterns before adding complexity
3. Ensure proper race condition handling when updating rules
4. Verify pause functionality with Chrome alarms API

## Common Pitfalls

1. Race conditions when updating rules - use mutex pattern
2. Regex pattern safety - always use `safeRegexTest()` from `regex-utils.js`
3. Password security - follow existing validation pattern
4. Rule limits - keep pattern count under 100 for optimal performance