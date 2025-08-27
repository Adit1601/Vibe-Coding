# Chrome Extension Development Guide

## Architecture Overview

This is a **Manifest V3 Chrome Extension** for selective site blocking with advanced pattern-based rules. The extension uses a **modular ES6 architecture** with clear separation of concerns:

### Core Components
- **`background.js`**: Service worker managing `declarativeNetRequest` rules and storage operations
- **`content.js`**: Injected script handling SPA navigation and real-time blocking with context recovery
- **`main.js`**: Popup UI controller with form handling and user interactions
- **`constants.js`**: Centralized configuration (storage keys, rule priorities, validation patterns)

### Key Architecture Patterns

**Rule-Based Blocking System**:
```javascript
// Rule priorities (constants.js)
RULE_PRIORITIES: {
  ALLOW: 100,    // Allowlist URLs override everything
  PATTERN: 50,   // Pattern-based blocking (path, regex, URL)
  BLOCK: 10      // Simple domain blocks
}
```

**Content Script Recovery Mechanism** (handles extension reload scenarios):
```javascript
// content.js implements automatic recovery from extension context invalidation
function attemptRecovery() {
  // Limited retry attempts with exponential backoff
  // Reinitializes SPA monitoring after extension reload
}
```

**Storage Architecture**:
- Chrome Sync Storage for cross-device settings
- Modular storage operations in `storage.js`
- Consistent error handling via `error-handler.js`

## Development Workflow

### Essential Commands
```bash
# Lint and format code
npm run lint
npm run lint:fix

# Load extension in Chrome
# Navigate to chrome://extensions/, enable Developer mode, click "Load unpacked"

# Debug background script
# Visit chrome://extensions/, click "Service Worker" link under extension

# Test extension functionality
# Open browser console and run: chrome.runtime.sendMessage({type: 'debugRules'})
```

### Testing Patterns
- Use `test-extension.js` in browser console for comprehensive testing
- Test SPA navigation on YouTube for content script behavior
- Verify rule priorities with overlapping patterns
- Test extension reload scenarios with multiple tabs open

## Key Development Conventions

### Error Handling
- All async operations use try-catch with centralized error handling
- Custom error classes: `ExtensionError`, `StorageError`, `RegexSecurityError`
- User feedback via toast notifications in UI (`ui.js`)

### Security Patterns
- **ReDoS Protection**: All regex patterns validated via `regex-utils.js`
- **Web Crypto API**: Secure password generation in `password-manager.js`
- **Input Validation**: Comprehensive sanitization using `VALIDATION_REGEX` constants

### Storage Conventions
```javascript
// Always use constants for storage keys
import { STORAGE_KEYS } from './constants.js';
chrome.storage.sync.get([STORAGE_KEYS.allowlistUrls], callback);

// Pattern for storage operations with error handling
export function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.allowlistUrls], (data) => {
    if (chrome.runtime.lastError) {
      handleError(new StorageError('getLists', chrome.runtime.lastError.message));
      callback({ allowlistUrls: [] }); // Always provide fallback
      return;
    }
    callback({ allowlistUrls: data[STORAGE_KEYS.allowlistUrls] || DEFAULT_SETTINGS.allowlistUrls });
  });
}
```

### Content Script Patterns
- **SPA Navigation**: Multiple detection methods (MutationObserver, popstate, pushState/replaceState)
- **Context Validation**: Always check `isExtensionContextValid()` before Chrome API calls
- **Recovery Logic**: Automatic reinitialization on extension reload with retry limits

## Integration Points

### Chrome APIs Used
- `declarativeNetRequest`: Rule-based blocking (background.js)
- `storage.sync`: Cross-device persistence
- `tabs`: Active tab detection and refresh operations
- `alarms`: Pause timer functionality

### Inter-Component Communication
```javascript
// Background ↔ Popup communication
chrome.runtime.sendMessage({ type: 'addPatternRule', rule: patternRule });

// Background ↔ Content Script messaging patterns
chrome.tabs.query({active: true}, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'checkBlocking' });
});
```

### Critical File Dependencies
- `constants.js` → All modules (centralized config)
- `error-handler.js` → All modules (consistent error handling)
- `regex-utils.js` → Background script (safe pattern validation)
- `password-manager.js` → Auth system (secure password operations)

## Debugging Guidelines

### Common Issues
- **"Extension context invalidated"**: Content script loses connection on extension reload - recovery mechanism handles this
- **Rule ID conflicts**: Background script uses randomized integer IDs for `declarativeNetRequest`
- **SPA navigation bypass**: Content script monitors multiple navigation types for coverage

### Debug Tools
- Background script console: Check rule generation and storage operations
- Content script console: Monitor SPA navigation detection and blocking logic
- Extension popup: Test UI interactions and immediate feedback
- `chrome://extensions/`: Monitor service worker status and reload behavior