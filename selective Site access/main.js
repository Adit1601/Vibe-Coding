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
    ui.showToast(enabled ? 'Auto-refresh enabled!' : 'Auto-refresh disabled!');
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
      ui.showToast(`Auto-refresh interval updated!`);
    });
  });
}
ui.bindTimeInputEvents(el.autoRefreshInterval, el.autoRefreshUnit, handleAutoRefreshTimeChange);
el.refreshNowBtn?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'refreshNow' }, () => {
    ui.showToast('Refreshed matching tabs!');
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
});

document.getElementById('cancel-change-password').addEventListener('click', () => {
  document.getElementById('change-password-form').reset();
  document.getElementById('change-password-form').style.display = 'none';
  document.getElementById('unlock-form').style.display = 'block';
  document.getElementById('show-change-password').style.display = 'block';
  document.getElementById('unlock-error').textContent = '';
});

// Initialization
function initialize() {
  storage.setLocked(true, () => {
    auth.showLockScreen();
    document.getElementById('main-ui').style.display = 'none';
  });
  updateLists();
  ui.setDarkMode();
  ui.showPauseCountdown(storage.getPauseUntil, storage.getPauseStart);
  ui.updateFocusModeToggle(storage.getFocusMode);
}
document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('unload', () => {
  storage.setLocked(true);
}); 