// =====================
// Config & Constants
// =====================
/**
 * @constant {Object} STORAGE_KEYS
 * @description All chrome.storage keys used in the extension.
 */
const STORAGE_KEYS = {
  blockedDomains: 'blockedDomains',
  allowlistUrls: 'allowlistUrls',
  locked: 'locked',
  password: 'password',
  pauseUntil: 'pauseUntil',
  pauseStart: 'pauseStart',
  focusMode: 'focusMode',
  autoRefreshEnabled: 'autoRefreshEnabled',
  autoRefreshInterval: 'autoRefreshInterval',
  autoRefreshDomains: 'autoRefreshDomains',
};

/**
 * @constant {string} DEFAULT_PASSWORD
 */
const DEFAULT_PASSWORD = 'Adit#@235791113';

// =====================
// Storage Module
// =====================
/**
 * Get blocklist and allowlist from storage.
 * @param {function} callback
 */
function getLists(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.blockedDomains, STORAGE_KEYS.allowlistUrls], (data) => {
    callback({
      blockedDomains: data[STORAGE_KEYS.blockedDomains] || [],
      allowlistUrls: data[STORAGE_KEYS.allowlistUrls] || []
    });
  });
}

/**
 * Set blocklist and allowlist in storage.
 * @param {Array} blockedDomains
 * @param {Array} allowlistUrls
 * @param {function} callback
 */
function setLists(blockedDomains, allowlistUrls, callback) {
  chrome.storage.sync.set({
    [STORAGE_KEYS.blockedDomains]: blockedDomains,
    [STORAGE_KEYS.allowlistUrls]: allowlistUrls
  }, callback);
}

/**
 * Set lock state in storage.
 * @param {boolean} locked
 * @param {function} callback
 */
function setLocked(locked, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.locked]: locked }, callback);
}

/**
 * Get lock state from storage.
 * @param {function} callback
 */
function getLocked(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.locked], (data) => {
    callback(data[STORAGE_KEYS.locked]);
  });
}

/**
 * Get password from storage.
 * @param {function} callback
 */
function getPassword(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.password], (data) => {
    callback(data[STORAGE_KEYS.password] || DEFAULT_PASSWORD);
  });
}

/**
 * Set password in storage.
 * @param {string} newPassword
 * @param {function} callback
 */
function setPassword(newPassword, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.password]: newPassword }, callback);
}

/**
 * Get pauseUntil timestamp from storage.
 * @param {function} callback
 */
function getPauseUntil(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseUntil], (data) => {
    callback(data[STORAGE_KEYS.pauseUntil] || 0);
  });
}

/**
 * Set pauseUntil timestamp in storage.
 * @param {number} timestamp
 * @param {function} callback
 */
function setPauseUntil(timestamp, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.pauseUntil]: timestamp }, callback);
}

/**
 * Get pauseStart timestamp from storage.
 * @param {function} callback
 */
function getPauseStart(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.pauseStart], (data) => {
    callback(data[STORAGE_KEYS.pauseStart] || 0);
  });
}

/**
 * Set pauseUntil and pauseStart in storage.
 * @param {number} until
 * @param {number} start
 * @param {function} callback
 */
function setPauseWindow(until, start, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.pauseUntil]: until, [STORAGE_KEYS.pauseStart]: start }, callback);
}

/**
 * Get focus mode state from storage.
 * @param {function} callback
 */
function getFocusMode(callback) {
  chrome.storage.sync.get([STORAGE_KEYS.focusMode], (data) => {
    callback(!!data[STORAGE_KEYS.focusMode]);
  });
}

/**
 * Set focus mode state in storage.
 * @param {boolean} enabled
 * @param {function} callback
 */
function setFocusMode(enabled, callback) {
  chrome.storage.sync.set({ [STORAGE_KEYS.focusMode]: enabled }, callback);
}

/**
 * Get auto-refresh configuration from storage.
 * @param {function} callback
 */
function getAutoRefreshConfig(callback) {
  chrome.storage.sync.get([
    STORAGE_KEYS.autoRefreshEnabled,
    STORAGE_KEYS.autoRefreshInterval
  ], (data) => {
    callback({
      enabled: !!data[STORAGE_KEYS.autoRefreshEnabled],
      interval: data[STORAGE_KEYS.autoRefreshInterval] || 3600000
    });
  });
}

/**
 * Set auto-refresh configuration in storage.
 * @param {boolean} enabled
 * @param {number} interval
 * @param {Array} domains
 * @param {function} callback
 */
function setAutoRefreshConfig(enabled, interval, callback) {
  chrome.runtime.sendMessage({
    type: 'setAutoRefreshConfig',
    enabled: enabled,
    interval: interval,
    domains: [] // ignored in background now
  }, callback);
}

/**
 * Trigger immediate refresh of matching tabs.
 * @param {function} callback
 */
function refreshNow(callback) {
  chrome.runtime.sendMessage({ type: 'refreshNow' }, callback);
}

// =====================
// UI Module
// =====================
/**
 * Show a toast notification.
 * @param {string} message
 * @param {boolean} [isError=false]
 */
function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.display = 'inline-block';
  toast.style.background = isError ? '#e74c3c' : '#4caf50';
  toast.style.color = '#fff';
  toast.style.padding = '8px 20px';
  toast.style.margin = '5px auto';
  toast.style.borderRadius = '4px';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  toast.style.fontSize = '1em';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.3s';
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Update the blocklist and allowlist UI.
 */
function updateLists() {
  getLists(({ blockedDomains, allowlistUrls }) => {
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

/**
 * Set dark mode styles.
 */
function setDarkMode() {
  const root = document.documentElement;
  root.style.setProperty('--bg', '#181a1b');
  root.style.setProperty('--fg', '#fff');
  root.style.setProperty('--input-bg', '#222');
  root.style.setProperty('--input-fg', '#fff');
  root.style.setProperty('--border', '#333');
  document.body.style.background = 'var(--bg)';
  document.body.style.color = 'var(--fg)';
  document.querySelectorAll('input[type="text"], input[type="password"], input[type="number"]').forEach(input => {
    input.style.background = 'var(--input-bg)';
    input.style.color = 'var(--input-fg)';
    input.style.borderColor = 'var(--border)';
  });
}

/**
 * Update the Focus Mode toggle UI.
 */
function updateFocusModeToggle() {
  getFocusMode((enabled) => {
    document.getElementById('focus-mode-toggle').checked = enabled;
  });
}

// =====================
// Lock & Auth Module
// =====================
/**
 * Show the lock screen UI.
 */
function showLockScreen() {
  document.getElementById('lock-screen').style.display = 'block';
  document.getElementById('main-ui').style.display = 'none';
  document.getElementById('pause-section').style.display = 'none';
  showPauseCountdown();
}

/**
 * Show the main UI (after unlock).
 */
function showMainUI() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('main-ui').style.display = 'block';
  document.getElementById('pause-section').style.display = 'block';
  showPauseCountdown();
}

/**
 * Lock the extension.
 */
function lockExtension() {
  setLocked(true);
  showLockScreen();
}

/**
 * Unlock the extension.
 */
function unlockExtension() {
  setLocked(false, () => {
    showMainUI();
    document.getElementById('main-ui').style.display = '';
    document.getElementById('lock-screen').style.display = 'none';
  });
}

// =====================
// Pause Blocking Module
// =====================
/**
 * Show and update the pause countdown and progress bar.
 */
let pauseInterval = null;
function showPauseCountdown() {
  getPauseUntil((pauseUntil) => {
    const now = Date.now();
    const pauseMsg = document.getElementById('pause-message');
    const resumeBtn = document.getElementById('resume-btn');
    const progressContainer = document.getElementById('pause-progress-container');
    const progressBar = document.getElementById('pause-progress');
    if (pauseUntil > now) {
      const ms = pauseUntil - now;
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      const hr = Math.floor(min / 60);
      const minDisplay = min % 60;
      let msg = 'Blocking paused. Resumes in ';
      if (hr > 0) msg += `${hr}h `;
      msg += `${minDisplay}m ${sec < 10 ? '0' : ''}${sec}s.`;
      pauseMsg.textContent = msg;
      resumeBtn.style.display = 'block';
      // Progress bar
      progressContainer.style.display = 'block';
      getPauseStart((pauseStart) => {
        const total = pauseUntil - pauseStart;
        const elapsed = now - pauseStart;
        const percent = Math.max(0, Math.min(100, 100 * (elapsed / total)));
        progressBar.style.width = `${percent}%`;
      });
      if (!pauseInterval) {
        pauseInterval = setInterval(showPauseCountdown, 1000);
      }
    } else {
      pauseMsg.textContent = '';
      resumeBtn.style.display = 'none';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0';
      if (pauseInterval) {
        clearInterval(pauseInterval);
        pauseInterval = null;
      }
    }
  });
}

// =====================
// Focus Mode Module
// =====================
/**
 * Update the Focus Mode toggle UI.
 */
document.getElementById('focus-mode-toggle').addEventListener('change', (e) => {
  setFocusMode(e.target.checked, () => {
    showToast(e.target.checked ? 'Focus Mode enabled' : 'Focus Mode disabled');
    chrome.runtime.sendMessage({ type: 'focusModeChanged' });
  });
});

// =====================
// Main Logic & Event Handlers
// =====================
function isValidDomain(domain) {
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function addBlockedDomain(domain) {
  getLists(({ blockedDomains, allowlistUrls }) => {
    if (!blockedDomains.includes(domain)) {
      blockedDomains.push(domain);
      setLists(blockedDomains, allowlistUrls, () => {
        updateLists();
        showToast('Blocked domain added!');
      });
    } else {
      showToast('Domain already blocked.', true);
    }
  });
}

function removeBlockedDomain(idx) {
  getLists(({ blockedDomains, allowlistUrls }) => {
    const removed = blockedDomains.splice(idx, 1);
    setLists(blockedDomains, allowlistUrls, () => {
      const blockedList = document.getElementById('blocked-domains-list');
      const li = blockedList.children[idx];
      if (li) {
        li.classList.add('removed');
        setTimeout(() => updateLists(), 700);
      } else {
        updateLists();
      }
      showToast(`Removed: ${removed[0]}`);
    });
  });
}

function addAllowlistUrl(url) {
  getLists(({ blockedDomains, allowlistUrls }) => {
    if (!allowlistUrls.includes(url)) {
      allowlistUrls.push(url);
      setLists(blockedDomains, allowlistUrls, () => {
        updateLists();
        showToast('Allowlist URL added!');
      });
    } else {
      showToast('URL already in allowlist.', true);
    }
  });
}

function removeAllowlistUrl(idx) {
  getLists(({ blockedDomains, allowlistUrls }) => {
    const removed = allowlistUrls.splice(idx, 1);
    setLists(blockedDomains, allowlistUrls, () => {
      const allowlistList = document.getElementById('allowlist-urls-list');
      const li = allowlistList.children[idx];
      if (li) {
        li.classList.add('removed');
        setTimeout(() => updateLists(), 700);
      } else {
        updateLists();
      }
      showToast(`Removed: ${removed[0]}`);
    });
  });
}

// =====================
// Auto-Refresh UI Functions
// =====================
/**
 * Update the auto-refresh configuration UI.
 */
function updateAutoRefreshUI() {
  getAutoRefreshConfig(({ enabled, interval }) => {
    const toggle = document.getElementById('auto-refresh-toggle');
    if (toggle) toggle.checked = enabled;
    const intervalInput = document.getElementById('auto-refresh-interval');
    const unitInput = document.getElementById('auto-refresh-unit');
    if (intervalInput && unitInput) setTimeInput(interval, intervalInput, unitInput);
  });
}

// =====================
// DOM Elements (cache for performance)
// =====================
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
  eyeIcon: document.getElementById('eye-icon')
};

// =====================
// Show/Hide Password Logic
// =====================
if (el.togglePasswordBtn && el.unlockPassword) {
  el.togglePasswordBtn.addEventListener('click', () => {
    const isPassword = el.unlockPassword.type === 'password';
    el.unlockPassword.type = isPassword ? 'text' : 'password';
    // Optionally, toggle the eye icon style (open/closed)
    el.togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    // You could swap SVG here for a closed eye if desired
  });
}

// =====================
// Time Input Utilities
// =====================
function getTimeMs(value, unit) {
  if (unit === 'hour') return value * 60 * 60 * 1000;
  return value * 60 * 1000;
}
function setTimeInput(ms, valueInput, unitInput) {
  if (ms % (60 * 60 * 1000) === 0) {
    valueInput.value = ms / (60 * 60 * 1000);
    unitInput.value = 'hour';
  } else {
    valueInput.value = ms / (60 * 1000);
    unitInput.value = 'min';
  }
}
function bindTimeInputEvents(valueInput, unitInput, onChange) {
  valueInput?.addEventListener('change', onChange);
  unitInput?.addEventListener('change', onChange);
}

// =====================
// Event Handlers
// =====================
// Pause Blocking
el.pauseBtn?.addEventListener('click', () => {
  const value = parseInt(el.pauseValue.value, 10);
  const unit = el.pauseUnit.value;
  if (isNaN(value) || value < 1) {
    showToast('Enter a valid time period.', true);
    return;
  }
  const ms = getTimeMs(value, unit);
  const pauseUntil = Date.now() + ms;
  setPauseWindow(pauseUntil, Date.now(), () => {
    showPauseCountdown();
    showToast(`Blocking paused for ${value} ${unit === 'min' ? 'min' : 'hour'}${value > 1 ? 's' : ''}`);
  });
});
bindTimeInputEvents(el.pauseValue, el.pauseUnit, () => {
  // No-op: Pause only triggers on button click
});

// Auto-Refresh
el.autoRefreshToggle?.addEventListener('change', () => {
  const enabled = el.autoRefreshToggle.checked;
  const value = parseInt(el.autoRefreshInterval.value, 10);
  const unit = el.autoRefreshUnit.value;
  if (isNaN(value) || value < 1) {
    showToast('Enter a valid interval.', true);
    return;
  }
  setAutoRefreshConfig(enabled, getTimeMs(value, unit), () => {
    showToast(enabled ? 'Auto-refresh enabled!' : 'Auto-refresh disabled!');
  });
});
function handleAutoRefreshTimeChange() {
  const value = parseInt(el.autoRefreshInterval.value, 10);
  const unit = el.autoRefreshUnit.value;
  if (isNaN(value) || value < 1) {
    showToast('Enter a valid interval.', true);
    return;
  }
  getAutoRefreshConfig(({ enabled }) => {
    setAutoRefreshConfig(enabled, getTimeMs(value, unit), () => {
      showToast(`Auto-refresh interval updated!`);
    });
  });
}
bindTimeInputEvents(el.autoRefreshInterval, el.autoRefreshUnit, handleAutoRefreshTimeChange);
el.refreshNowBtn?.addEventListener('click', refreshNow);

// Resume Now button handler
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) {
  resumeBtn.addEventListener('click', () => {
    setPauseWindow(0, 0, () => {
      showPauseCountdown();
      showToast('Blocking resumed!');
    });
  });
}

// Backup (export) and restore (import) functionality
function exportLists() {
  getLists((data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-access-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported lists!');
  });
}

document.getElementById('export-btn').addEventListener('click', exportLists);

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
        showToast('Invalid backup file.', true);
        return;
      }
      setLists(data.blockedDomains, data.allowlistUrls, () => {
        updateLists();
        showToast('Lists imported!');
      });
    } catch {
      showToast('Invalid JSON file.', true);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// =====================
// Auth & Password Change Handlers
// =====================
document.getElementById('show-change-password').addEventListener('click', () => {
  document.getElementById('unlock-form').style.display = 'none';
  document.getElementById('show-change-password').style.display = 'none';
  document.getElementById('change-password-form').style.display = 'block';
  document.getElementById('unlock-error').textContent = '';
});

document.getElementById('cancel-change-password').addEventListener('click', () => {
  document.getElementById('change-password-form').reset();
  document.getElementById('change-password-form').style.display = 'none';
  document.getElementById('unlock-form').style.display = 'block';
  document.getElementById('show-change-password').style.display = 'block';
  document.getElementById('unlock-error').textContent = '';
});

document.getElementById('change-password-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const current = document.getElementById('current-password').value;
  const newPass = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;
  const errorDiv = document.getElementById('unlock-error');
  getPassword((storedPassword) => {
    if (current !== storedPassword) {
      errorDiv.textContent = 'Current password is incorrect.';
      return;
    }
    if (!newPass) {
      errorDiv.textContent = 'New password cannot be empty.';
      return;
    }
    if (newPass !== confirm) {
      errorDiv.textContent = 'New passwords do not match.';
      return;
    }
    setPassword(newPass, () => {
      errorDiv.textContent = 'Password changed!';
      document.getElementById('change-password-form').reset();
      setTimeout(() => {
        document.getElementById('change-password-form').style.display = 'none';
        document.getElementById('unlock-form').style.display = 'block';
        document.getElementById('show-change-password').style.display = 'block';
        errorDiv.textContent = '';
      }, 1200);
    });
  });
});

document.getElementById('unlock-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('unlock-password');
  const errorDiv = document.getElementById('unlock-error');
  getPassword((storedPassword) => {
    if (input.value === storedPassword) {
      unlockExtension();
      input.value = '';
      errorDiv.textContent = '';
    } else {
      errorDiv.textContent = 'Incorrect password.';
      input.value = '';
    }
  });
});

// =====================
// Pause, Focus, and Main Event Handlers
// =====================
document.getElementById('block-domain-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('block-domain-input');
  const domain = input.value.trim();
  if (!domain) {
    showToast('Domain cannot be empty.', true);
  } else if (!isValidDomain(domain)) {
    showToast('Invalid domain format.', true);
  } else {
    addBlockedDomain(domain);
  }
  input.value = '';
});

document.getElementById('allowlist-url-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('allowlist-url-input');
  const url = input.value.trim();
  if (!url) {
    showToast('URL cannot be empty.', true);
  } else if (!isValidUrl(url)) {
    showToast('Invalid URL format.', true);
  } else {
    addAllowlistUrl(url);
  }
  input.value = '';
});

document.addEventListener('DOMContentLoaded', () => {
  // Always relock on popup open
  setLocked(true, () => {
    showLockScreen();
    // Hide main UI until unlocked
    document.getElementById('main-ui').style.display = 'none';
  });
  updateLists();
  updateAutoRefreshUI();
  setDarkMode();
  showPauseCountdown();
  updateFocusModeToggle();
});

// Relock when popup closes
window.addEventListener('unload', () => {
  setLocked(true);
}); 