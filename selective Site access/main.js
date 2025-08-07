// main.js
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as auth from './auth.js';

// Utility functions
function isValidDomain(domain) {
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
}
function isValidUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}
function getTimeMs(value, unit) {
  if (unit === 'hour') return value * 60 * 60 * 1000;
  return value * 60 * 1000;
}

// DOM Elements
const el = {
  pauseValue: document.getElementById('pause-value'),
  pauseUnit: document.getElementById('pause-unit'),
  pauseBtn: document.getElementById('pause-btn'),
  autoRefreshToggle: document.getElementById('auto-refresh-toggle'),
  autoRefreshInterval: document.getElementById('auto-refresh-interval'),
  autoRefreshUnit: document.getElementById('auto-refresh-unit'),
  refreshNowBtn: document.getElementById('refresh-now-btn'),
  unlockPassword: document.getElementById('unlock-password'),
  togglePasswordBtn: document.getElementById('toggle-password-visibility'),
  eyeIcon: document.getElementById('eye-icon'),
  blockDomainInput: document.getElementById('block-domain-input'),
  blockDomainError: document.getElementById('block-domain-error'),
  allowlistUrlInput: document.getElementById('allowlist-url-input'),
  allowlistUrlError: document.getElementById('allowlist-url-error'),
  unlockPasswordError: document.getElementById('unlock-error'),
  resumeBtn: document.getElementById('resume-btn'),
  // New elements for quick actions
  quickBlockBtn: document.getElementById('quick-block-btn'),
  currentSiteInfo: document.getElementById('current-site-info'),
  // New elements for whitelist mode
  whitelistModeToggle: document.getElementById('whitelist-mode-toggle'),
  modeToggleSection: document.getElementById('mode-toggle-section'),
  modeTitle: document.getElementById('mode-title'),
  modeDescription: document.getElementById('mode-description'),
  whitelistToggleText: document.getElementById('whitelist-toggle-text'),
  blockedDomainsTitle: document.getElementById('blocked-domains-title'),
  allowlistUrlsTitle: document.getElementById('allowlist-urls-title'),
  blockDomainSubmit: document.getElementById('block-domain-submit'),
  allowlistUrlSubmit: document.getElementById('allowlist-url-submit'),
};

// Show/hide password
if (el.togglePasswordBtn && el.unlockPassword) {
  el.togglePasswordBtn.addEventListener('click', () => {
    const isPassword = el.unlockPassword.type === 'password';
    el.unlockPassword.type = isPassword ? 'text' : 'password';
    el.togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });
}

// Pause Blocking
el.pauseBtn?.addEventListener('click', () => {
  const value = parseInt(el.pauseValue.value, 10);
  const unit = el.pauseUnit.value;
  if (isNaN(value) || value < 1) {
    ui.showToast('Enter a valid time period.', true);
    return;
  }
  const ms = getTimeMs(value, unit);
  const pauseUntil = Date.now() + ms;
  storage.setPauseWindow(pauseUntil, Date.now(), () => {
    ui.showPauseCountdown(storage.getPauseUntil, storage.getPauseStart);
    ui.showToast(`Blocking paused for ${value} ${unit === 'min' ? 'min' : 'hour'}${value > 1 ? 's' : ''}`);
  });
});
ui.bindTimeInputEvents(el.pauseValue, el.pauseUnit, () => {});

// Resume Now
el.resumeBtn?.addEventListener('click', () => {
  storage.setPauseWindow(0, 0, () => {
    ui.showPauseCountdown(storage.getPauseUntil, storage.getPauseStart);
    ui.showToast('Blocking resumed!');
  });
});

// Auto-Refresh
el.autoRefreshToggle?.addEventListener('change', () => {
  const enabled = el.autoRefreshToggle.checked;
  const value = parseInt(el.autoRefreshInterval.value, 10);
  const unit = el.autoRefreshUnit.value;
  if (isNaN(value) || value < 1) {
    ui.showToast('Enter a valid interval.', true);
    return;
  }
  storage.setAutoRefreshConfig(enabled, getTimeMs(value, unit), () => {
    ui.showToast(enabled ? 'Smart refresh enabled!' : 'Smart refresh disabled!');
  });
});
function handleAutoRefreshTimeChange() {
  const value = parseInt(el.autoRefreshInterval.value, 10);
  const unit = el.autoRefreshUnit.value;
  if (isNaN(value) || value < 1) {
    ui.showToast('Enter a valid interval.', true);
    return;
  }
  storage.getAutoRefreshConfig(({ enabled }) => {
    storage.setAutoRefreshConfig(enabled, getTimeMs(value, unit), () => {
      ui.showToast(`Smart refresh interval updated!`);
    });
  });
}
ui.bindTimeInputEvents(el.autoRefreshInterval, el.autoRefreshUnit, handleAutoRefreshTimeChange);
el.refreshNowBtn?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'refreshNow' }, () => {
    ui.showToast('Refreshed blocked tabs!');
  });
});

// Block domain form validation
const blockDomainForm = document.getElementById('block-domain-form');
blockDomainForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const domain = el.blockDomainInput.value.trim();
  el.blockDomainError.textContent = '';
  if (!domain) {
    el.blockDomainError.textContent = 'Domain cannot be empty.';
    el.blockDomainInput.focus();
    ui.showToast('Domain cannot be empty.', true);
    return;
  } else if (!isValidDomain(domain)) {
    el.blockDomainError.textContent = 'Invalid domain format.';
    el.blockDomainInput.focus();
    ui.showToast('Invalid domain format.', true);
    return;
  }
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    if (!blockedDomains.includes(domain)) {
      blockedDomains.push(domain);
      storage.setLists(blockedDomains, allowlistUrls, () => {
        ui.showToast('Blocked domain added!');
        updateLists();
      });
    } else {
      ui.showToast('Domain already blocked.', true);
    }
  });
  el.blockDomainInput.value = '';
});
el.blockDomainInput.addEventListener('input', () => { el.blockDomainError.textContent = ''; });

// Allowlist URL form validation
const allowlistUrlForm = document.getElementById('allowlist-url-form');
allowlistUrlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = el.allowlistUrlInput.value.trim();
  el.allowlistUrlError.textContent = '';
  if (!url) {
    el.allowlistUrlError.textContent = 'URL cannot be empty.';
    el.allowlistUrlInput.focus();
    ui.showToast('URL cannot be empty.', true);
    return;
  } else if (!isValidUrl(url)) {
    el.allowlistUrlError.textContent = 'Invalid URL format.';
    el.allowlistUrlInput.focus();
    ui.showToast('Invalid URL format.', true);
    return;
  }
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    if (!allowlistUrls.includes(url)) {
      allowlistUrls.push(url);
      storage.setLists(blockedDomains, allowlistUrls, () => {
        ui.showToast('Allowlist URL added!');
        updateLists();
      });
    } else {
      ui.showToast('URL already in allowlist.', true);
    }
  });
  el.allowlistUrlInput.value = '';
});
el.allowlistUrlInput.addEventListener('input', () => { el.allowlistUrlError.textContent = ''; });

// Unlock password validation
const unlockForm = document.getElementById('unlock-form');
unlockForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = el.unlockPassword;
  const errorDiv = el.unlockPasswordError;
  errorDiv.textContent = '';
  storage.getPassword((storedPassword) => {
    if (input.value === storedPassword) {
      auth.unlockExtension(storage.setLocked);
      input.value = '';
      errorDiv.textContent = '';
    } else {
      errorDiv.textContent = 'Incorrect password.';
      input.focus();
      ui.showToast('Incorrect password.', true);
      input.value = '';
    }
  });
});
el.unlockPassword.addEventListener('input', () => { el.unlockPasswordError.textContent = ''; });

// Focus Mode toggle
const focusModeToggle = document.getElementById('focus-mode-toggle');
focusModeToggle.addEventListener('change', (e) => {
  storage.setFocusMode(e.target.checked, () => {
    ui.showToast(e.target.checked ? 'Focus Mode enabled' : 'Focus Mode disabled');
    chrome.runtime.sendMessage({ type: 'focusModeChanged' });
  });
});

// Quick Actions - Block Current Site
let currentSiteDomain = '';

// Get current active tab and update quick block button
function updateCurrentSiteInfo() {
  if (el.currentSiteInfo && el.quickBlockBtn) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          currentSiteDomain = url.hostname.replace(/^www\./, '');
          
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            el.currentSiteInfo.textContent = `Current site: ${currentSiteDomain}`;
            el.quickBlockBtn.disabled = false;
            el.quickBlockBtn.textContent = `Block ${currentSiteDomain}`;
          } else {
            el.currentSiteInfo.textContent = 'Cannot block this type of page';
            el.quickBlockBtn.disabled = true;
            el.quickBlockBtn.textContent = 'Block Current Site';
          }
        } catch (e) {
          el.currentSiteInfo.textContent = 'Invalid URL';
          el.quickBlockBtn.disabled = true;
          el.quickBlockBtn.textContent = 'Block Current Site';
        }
      } else {
        el.currentSiteInfo.textContent = 'No active tab';
        el.quickBlockBtn.disabled = true;
        el.quickBlockBtn.textContent = 'Block Current Site';
      }
    });
  }
}

// Make function globally available
window.updateCurrentSiteInfo = updateCurrentSiteInfo;

// Quick block button functionality
el.quickBlockBtn?.addEventListener('click', () => {
  if (!currentSiteDomain) {
    ui.showToast('No valid site to block', true);
    return;
  }
  
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    if (blockedDomains.includes(currentSiteDomain)) {
      ui.showToast('Site is already blocked', true);
      return;
    }
    
    blockedDomains.push(currentSiteDomain);
    storage.setLists(blockedDomains, allowlistUrls, () => {
      ui.showToast(`Blocked ${currentSiteDomain}!`);
      updateLists();
      // Refresh the current tab to apply blocking immediately
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    });
  });
});

// Whitelist Mode Toggle
function updateWhitelistModeUI() {
  storage.getWhitelistMode((isWhitelistMode) => {
    if (el.whitelistModeToggle) {
      el.whitelistModeToggle.checked = isWhitelistMode;
    }
    
    if (isWhitelistMode) {
      // Whitelist mode UI
      el.modeToggleSection?.classList.add('whitelist-active');
      if (el.modeTitle) el.modeTitle.textContent = '🔒 Whitelist Mode Active';
      if (el.modeDescription) el.modeDescription.textContent = 'Block everything except specifically allowed domains/URLs';
      if (el.whitelistToggleText) el.whitelistToggleText.textContent = 'Switch to Standard Mode';
      if (el.blockedDomainsTitle) el.blockedDomainsTitle.textContent = 'Allowed Domains';
      if (el.allowlistUrlsTitle) el.allowlistUrlsTitle.textContent = 'Allowed URLs';
      if (el.blockDomainSubmit) el.blockDomainSubmit.textContent = 'Allow';
      if (el.allowlistUrlSubmit) el.allowlistUrlSubmit.textContent = 'Allow';
      if (el.blockDomainInput) el.blockDomainInput.placeholder = 'e.g. google.com (domain to allow)';
    } else {
      // Standard mode UI
      el.modeToggleSection?.classList.remove('whitelist-active');
      if (el.modeTitle) el.modeTitle.textContent = '🛡️ Standard Blocking Mode';
      if (el.modeDescription) el.modeDescription.textContent = 'Block specific domains, allow specific URLs within blocked domains';
      if (el.whitelistToggleText) el.whitelistToggleText.textContent = 'Switch to Whitelist Mode (Block Everything Except Allowed)';
      if (el.blockedDomainsTitle) el.blockedDomainsTitle.textContent = 'Blocked Domains';
      if (el.allowlistUrlsTitle) el.allowlistUrlsTitle.textContent = 'Allowlist URLs';
      if (el.blockDomainSubmit) el.blockDomainSubmit.textContent = 'Add';
      if (el.allowlistUrlSubmit) el.allowlistUrlSubmit.textContent = 'Add';
      if (el.blockDomainInput) el.blockDomainInput.placeholder = 'e.g. youtube.com';
    }
  });
}

el.whitelistModeToggle?.addEventListener('change', (e) => {
  const isWhitelistMode = e.target.checked;
  storage.setWhitelistMode(isWhitelistMode, () => {
    updateWhitelistModeUI();
    ui.showToast(isWhitelistMode ? 'Whitelist Mode enabled - Blocking everything except allowed sites' : 'Standard Mode enabled');
    chrome.runtime.sendMessage({ type: 'whitelistModeChanged' });
  });
});

// Backup/Restore
function updateLists() {
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    const blockedList = document.getElementById('blocked-domains-list');
    const allowlistList = document.getElementById('allowlist-urls-list');
    blockedList.innerHTML = '';
    allowlistList.innerHTML = '';
    blockedDomains.forEach((domain, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<span style='margin-right:6px;' title='Blocked Domain'>🔒</span>${domain}`;
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.onclick = () => {
        if (confirm(`Are you sure you want to remove the blocked domain: ${domain}?`)) {
          removeBlockedDomain(idx);
        }
      };
      li.appendChild(btn);
      blockedList.appendChild(li);
    });
    allowlistUrls.forEach((url, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<span style='margin-right:6px;' title='Allowlist URL'>✅</span>${url}`;
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.onclick = () => {
        if (confirm(`Are you sure you want to remove the allowlist URL: ${url}?`)) {
          removeAllowlistUrl(idx);
        }
      };
      li.appendChild(btn);
      allowlistList.appendChild(li);
    });
  });
}

function removeBlockedDomain(idx) {
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    const removed = blockedDomains.splice(idx, 1);
    storage.setLists(blockedDomains, allowlistUrls, () => {
      const blockedList = document.getElementById('blocked-domains-list');
      const li = blockedList.children[idx];
      if (li) {
        li.classList.add('removed');
        setTimeout(() => updateLists(), 700);
      } else {
        updateLists();
      }
      ui.showToast(`Removed: ${removed[0]}`);
    });
  });
}

function removeAllowlistUrl(idx) {
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    const removed = allowlistUrls.splice(idx, 1);
    storage.setLists(blockedDomains, allowlistUrls, () => {
      const allowlistList = document.getElementById('allowlist-urls-list');
      const li = allowlistList.children[idx];
      if (li) {
        li.classList.add('removed');
        setTimeout(() => updateLists(), 700);
      } else {
        updateLists();
      }
      ui.showToast(`Removed: ${removed[0]}`);
    });
  });
}

document.getElementById('export-btn').addEventListener('click', () => {
  storage.getLists((data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-access-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.showToast('Exported lists!');
  });
});

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (!Array.isArray(data.blockedDomains) || !Array.isArray(data.allowlistUrls)) {
        ui.showToast('Invalid backup file.', true);
        return;
      }
      storage.setLists(data.blockedDomains, data.allowlistUrls, () => {
        ui.showToast('Lists imported!');
        updateLists();
      });
    } catch {
      ui.showToast('Invalid JSON file.', true);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Password change logic
import { handlePasswordChange } from './auth.js';
handlePasswordChange(storage.getPassword, storage.setPassword);

document.getElementById('show-change-password').addEventListener('click', () => {
  document.getElementById('unlock-form').style.display = 'none';
  document.getElementById('show-change-password').style.display = 'none';
  document.getElementById('change-password-form').style.display = 'block';
  document.getElementById('unlock-error').textContent = '';
  
  // Hide security warning when changing password
  const securityWarning = document.getElementById('security-warning');
  if (securityWarning) {
    securityWarning.style.display = 'none';
  }
});

document.getElementById('cancel-change-password').addEventListener('click', () => {
  document.getElementById('change-password-form').reset();
  document.getElementById('change-password-form').style.display = 'none';
  document.getElementById('unlock-form').style.display = 'block';
  document.getElementById('show-change-password').style.display = 'block';
  document.getElementById('unlock-error').textContent = '';
  
  // Hide password strength indicators
  document.getElementById('password-strength').style.display = 'none';
  document.getElementById('password-strength-text').style.display = 'none';
  
  // Show security warning again if using default password
  auth.checkAndShowSecurityWarning(storage.isDefaultPassword);
});

// Initialization
function initialize() {
  storage.setLocked(true, () => {
    auth.showLockScreen();
    // Check and show security warning for default password
    auth.checkAndShowSecurityWarning(storage.isDefaultPassword);
    document.getElementById('main-ui').style.display = 'none';
  });
  updateLists();
  updateCurrentSiteInfo();
  updateWhitelistModeUI();
  ui.setDarkMode();
  ui.showPauseCountdown(storage.getPauseUntil, storage.getPauseStart);
  ui.updateFocusModeToggle(storage.getFocusMode);
  ui.updateWhitelistModeToggle(storage.getWhitelistMode);
}
document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('unload', () => {
  storage.setLocked(true);
}); 