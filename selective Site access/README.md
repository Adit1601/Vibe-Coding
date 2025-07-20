# Selective Site Access - Chrome Extension

A powerful Chrome extension for selective domain blocking with allowlist functionality, designed to help users maintain focus and control their web browsing habits.

## Features

- **Domain Blocking**: Block entire domains (e.g., youtube.com, facebook.com)
- **URL Allowlist**: Allow specific URLs within blocked domains
- **Password Protection**: Lock the extension with a customizable password
- **Pause Blocking**: Temporarily disable blocking for specified time periods
- **Focus Mode**: Ignore allowlist and block all domains in blocklist
- **Auto-Refresh**: Automatically refresh tabs with specific domains at scheduled intervals
- **Backup & Restore**: Export and import your blocklist and allowlist
- **Dark Mode UI**: Modern, elegant dark-themed interface
- **SPA Navigation Support**: Handles YouTube and other single-page applications

## Installation

### For Users

1. **Unpacked Extension (Development)**
   - Download or clone this repository
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension folder

2. **Packed Extension (Production)**
   - Download the `.crx` file
   - Drag and drop it into `chrome://extensions/`
   - Click "Add extension" when prompted

### For Developers

```bash
# Clone the repository
git clone <repository-url>
cd selective-site-access

# Load as unpacked extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this folder
```

## Architecture

### File Structure

```
selective-site-access/
├── manifest.json          # Extension configuration
├── popup.html            # Main UI interface
├── popup.js              # UI logic and user interactions
├── background.js         # Service worker for rule management
├── content.js            # Content script for SPA handling
├── blocked.html          # Custom blocked page
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

### Core Components

#### 1. Background Script (`background.js`)
- **Purpose**: Manages declarativeNetRequest rules
- **Key Functions**:
  - `generateRules()`: Creates DNR rules for blocking/allowlisting
  - `updateDynamicRules()`: Updates rules based on current state
  - `isPaused()`: Checks if blocking is temporarily disabled
  - `getFocusMode()`: Retrieves focus mode state

#### 2. Content Script (`content.js`)
- **Purpose**: Handles SPA navigation and URL monitoring
- **Key Functions**:
  - `checkAndBlock()`: Determines if current page should be blocked
  - `initializeSpaMonitoring()`: Monitors URL changes for SPAs
  - `shouldBlockUrl()`: Logic for blocking decisions

#### 3. Popup UI (`popup.js`)
- **Purpose**: User interface for managing settings
- **Key Modules**:
  - Storage Module: Chrome storage operations
  - UI Module: Interface updates and styling
  - Lock & Auth Module: Password protection
  - Pause Blocking Module: Timer and countdown
  - Focus Mode Module: Toggle functionality

### Data Flow

1. **User adds domain to blocklist** → Storage updated → Background script generates new rules
2. **User adds URL to allowlist** → Storage updated → Background script adds allow rule
3. **User enables pause** → Storage updated → Background script removes all rules
4. **User navigates to blocked site** → Content script checks → Redirects to blocked page
5. **SPA navigation occurs** → Content script detects URL change → Re-checks blocking logic

## Development

### Prerequisites

- Chrome browser (version 88+ for Manifest V3)
- Basic knowledge of JavaScript and Chrome Extension APIs

### Development Setup

1. **Load Extension**
   ```bash
   # Navigate to chrome://extensions/
   # Enable Developer mode
   # Click "Load unpacked" and select the extension folder
   ```

2. **Make Changes**
   - Edit files in your preferred editor
   - Changes are automatically reflected (reload extension if needed)

3. **Debug**
   - Use Chrome DevTools for popup debugging
   - Check background script in `chrome://extensions/` → "Service Worker"
   - View content script logs in page DevTools

### Code Style

- **JSDoc Comments**: All functions are documented
- **Modular Structure**: Code organized into logical sections
- **Constants**: Magic strings and numbers defined as constants
- **Error Handling**: Graceful error handling with user feedback
- **Async Patterns**: Consistent use of callbacks and promises

### Key APIs Used

- **`chrome.storage.sync`**: Persistent data storage
- **`chrome.declarativeNetRequest`**: URL blocking rules
- **`chrome.runtime.sendMessage`**: Inter-script communication
- **`chrome.tabs`**: Tab management (if needed)

### Testing

1. **Manual Testing**
   - Add domains to blocklist
   - Add URLs to allowlist
   - Test pause functionality
   - Verify focus mode behavior
   - Test password protection

2. **Edge Cases**
   - SPA navigation (YouTube)
   - Rapid URL changes
   - Extension reload scenarios
   - Storage sync conflicts

## Configuration

### Manifest V3 Features

- **Declarative Net Request**: Modern URL blocking API
- **Service Worker**: Background script replacement
- **Host Permissions**: Granular permission model

### Storage Schema

```javascript
{
  blockedDomains: ['youtube.com', 'facebook.com'],
  allowlistUrls: ['https://www.youtube.com/watch?v=specific'],
  locked: true,
  password: 'user-password',
  pauseUntil: 0,
  pauseStart: 0,
  focusMode: false,
  autoRefreshEnabled: true,
  autoRefreshInterval: 3600000, // 1 hour in milliseconds
  autoRefreshDomains: ['youtube.com'],
  blockCount: 42,
  lastBlockedUrl: 'https://youtube.com/blocked-video'
}
```

### Auto-Refresh Feature

The auto-refresh feature allows you to automatically refresh tabs containing specific domains at regular intervals. This is useful for:

- **Keeping content fresh**: Automatically refresh news sites or social media feeds
- **Session management**: Refresh pages that require periodic updates
- **Focus maintenance**: Refresh distracting sites to break engagement

#### How to Use Auto-Refresh

1. **Enable Auto-Refresh**: Check the "Enable Auto-Refresh" checkbox
2. **Set Interval**: Choose how often to refresh (in minutes, minimum 1 minute)
3. **Add Domains**: Add domains you want to auto-refresh (e.g., `youtube.com`)
4. **Manual Refresh**: Click "Refresh Now" to immediately refresh matching tabs

#### Auto-Refresh Configuration

- **Default Interval**: 60 minutes (1 hour)
- **Supported Domains**: Any domain format (e.g., `youtube.com`, `www.facebook.com`)
- **Tab Detection**: Automatically detects all open tabs with matching domains
- **Background Operation**: Works even when popup is closed

## Troubleshooting

### Common Issues

1. **Extension not blocking sites**
   - Check if domain is correctly added to blocklist
   - Verify allowlist doesn't contain the URL
   - Ensure extension is not paused

2. **SPA navigation not working**
   - Content script may need to be reloaded
   - Check for JavaScript errors in DevTools

3. **Rules not updating**
   - Background script may need restart
   - Check storage sync status

### Debug Steps

1. Open `chrome://extensions/`
2. Find your extension and click "Details"
3. Click "Service Worker" to debug background script
4. Check "Errors" tab for any issues
5. Use DevTools to debug popup and content scripts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper documentation
4. Test thoroughly
5. Submit a pull request

## License

[Add your license information here]

## Support

For issues and feature requests, please create an issue in the repository.

---

**Note**: This extension uses Manifest V3 and requires Chrome 88 or later. For older Chrome versions, consider using Manifest V2 with appropriate API changes. 