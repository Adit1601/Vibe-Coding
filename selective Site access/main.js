// main.js
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import { passwordManager } from './password-manager.js';
import { handleError, DomainValidationError, URLValidationError } from './error-handler.js';
import { VALIDATION_REGEX, CONFIG } from './constants.js';

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
  quickAllowlistBtn: document.getElementById('quick-allowlist-btn'),
  debugRulesBtn: document.getElementById('debug-rules-btn'),
  currentSiteInfo: document.getElementById('current-site-info'),
  quickDomainBtn: document.getElementById('quick-domain-btn'),
  quickYouTubeShortsBtn: document.getElementById('quick-youtube-shorts-btn'),
  advancedRuleToggle: document.getElementById('advanced-rule-toggle'),
  advancedPatternForm: document.getElementById('advanced-pattern-form'),
  // Pattern rule elements
  patternTypeSelect: document.getElementById('pattern-type-select'),
  patternInput: document.getElementById('pattern-input'),
  patternRuleError: document.getElementById('pattern-rule-error'),
  patternRuleSubmit: document.getElementById('pattern-rule-submit'),
  patternRulesList: document.getElementById('pattern-rules-list'),
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
    ui.showToast('Blocking resumed! Refreshing blocked tabs...');
    
    // Refresh all blocked tabs to show the new blocked page
    chrome.runtime.sendMessage({ type: 'refreshBlockedTabs' }, (response) => {
      if (response && response.success) {
        setTimeout(() => {
          ui.showToast('All blocked tabs refreshed with new blocked page!');
        }, 1000);
      }
    });
  });
});

// Keep old block domain form for backward compatibility (if it exists)
const blockDomainForm = document.getElementById('block-domain-form');
if (blockDomainForm) {
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
}

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
    // Check if URL already exists (support both old string format and new object format)
    const urlExists = allowlistUrls.some(item => {
      if (typeof item === 'string') {
        return item === url;
      } else {
        return item.url === url;
      }
    });
    
    if (!urlExists) {
      // Generate a smart default name for manual entries too
      function generateDefaultName(url) {
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace(/^www\./, '');
          
          // For YouTube, try to get a more specific name
          if (domain.includes('youtube.com')) {
            if (url.includes('/watch?v=')) {
              return `YouTube Video`;
            } else if (url.includes('/playlist')) {
              return `YouTube Playlist`;
            } else if (url.includes('/channel/') || url.includes('/c/')) {
              return `YouTube Channel`;
            } else {
              return `YouTube`;
            }
          }
          
          // For other common sites
          if (domain.includes('spotify.com')) return 'Spotify';
          if (domain.includes('soundcloud.com')) return 'SoundCloud';
          if (domain.includes('netflix.com')) return 'Netflix';
          if (domain.includes('github.com')) return 'GitHub';
          if (domain.includes('stackoverflow.com')) return 'Stack Overflow';
          
          // Default to domain name
          return domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch (e) {
          return 'Allowlisted Site';
        }
      }
      
      const defaultName = generateDefaultName(url);
      
      // Store as object with smart default name
      allowlistUrls.push({
        name: defaultName,
        url: url,
        dateAdded: new Date().toISOString()
      });
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

// Pattern rule form validation
const patternRuleForm = document.getElementById('pattern-rule-form');
patternRuleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pattern = el.patternInput.value.trim();
  const type = el.patternTypeSelect.value;
  
  el.patternRuleError.textContent = '';
  
  if (!pattern) {
    el.patternRuleError.textContent = 'Pattern cannot be empty.';
    el.patternInput.focus();
    ui.showToast('Pattern cannot be empty.', true);
    return;
  }
  
  const rule = {
    pattern: pattern,
    type: type,
    description: `${type.charAt(0).toUpperCase() + type.slice(1)} pattern: ${pattern}`,
    enabled: true
  };
  
  // Validate pattern rule via background script
  chrome.runtime.sendMessage({ type: 'validatePatternRule', rule }, (response) => {
    if (!response.valid) {
      el.patternRuleError.textContent = response.error;
      el.patternInput.focus();
      ui.showToast(response.error, true);
      return;
    }
    
    // Add the pattern rule
    chrome.runtime.sendMessage({ type: 'addPatternRule', rule }, (response) => {
      if (response.success) {
        ui.showToast('Pattern rule added!');
        updateLists();
        el.patternInput.value = '';
      } else {
        el.patternRuleError.textContent = response.error;
        ui.showToast(response.error, true);
      }
    });
  });
});
el.patternInput.addEventListener('input', () => { el.patternRuleError.textContent = ''; });

// Update pattern examples based on selected type
el.patternTypeSelect.addEventListener('change', () => {
  const type = el.patternTypeSelect.value;
  const examples = {
    domain: 'youtube.com',
    path: '*/shorts/*',
    regex: 'youtube\\.com\\/shorts\\/',
    url: 'https://example.com/blocked-section'
  };
  el.patternInput.placeholder = `e.g. ${examples[type]}`;
});

// =====================
// Simplified Pattern Rules UI
// =====================

// Quick action buttons
el.quickDomainBtn.addEventListener('click', () => {
  // Prompt user for domain to block
  const domain = prompt('Enter domain to block (e.g., youtube.com):');
  
  if (!domain) {
    return; // User cancelled
  }
  
  const trimmedDomain = domain.trim();
  
  if (!trimmedDomain) {
    ui.showToast('Domain cannot be empty.', true);
    return;
  }
  
  if (!isValidDomain(trimmedDomain)) {
    ui.showToast('Invalid domain format.', true);
    return;
  }
  
  // Create domain pattern rule
  const rule = {
    pattern: trimmedDomain,
    type: 'domain',
    description: `Block ${trimmedDomain}`,
    enabled: true
  };
  
  // Add the rule
  chrome.runtime.sendMessage({ type: 'addPatternRule', rule }, (response) => {
    if (response && response.success) {
      ui.showToast(`${trimmedDomain} blocked successfully!`);
      updateLists();
    } else {
      ui.showToast(response?.error || 'Failed to add blocking rule', true);
    }
  });
});

el.quickYouTubeShortsBtn.addEventListener('click', () => {
  const rule = {
    pattern: '*/shorts/*',
    type: 'path',
    description: 'Block YouTube Shorts',
    enabled: true
  };
  
  chrome.runtime.sendMessage({ type: 'addPatternRule', rule }, (response) => {
    if (response.success) {
      ui.showToast('YouTube Shorts blocking enabled!');
      updateLists();
    } else {
      ui.showToast(response.error, true);
    }
  });
});

// Advanced rules toggle
el.advancedRuleToggle.addEventListener('click', () => {
  const isAdvanced = el.advancedPatternForm.style.display !== 'none';
  
  if (isAdvanced) {
    // Hide advanced form
    el.advancedPatternForm.style.display = 'none';
    el.advancedRuleToggle.textContent = '⚙️ Advanced Rules';
    el.advancedRuleToggle.classList.remove('active');
  } else {
    // Show advanced form
    el.advancedPatternForm.style.display = 'block';
    el.advancedRuleToggle.textContent = '⚙️ Hide Advanced Rules';
    el.advancedRuleToggle.classList.add('active');
    el.patternInput.focus();
  }
});

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

// Quick Actions - Block Current Site
let currentSiteDomain = '';
let currentSiteUrl = '';

// Get current active tab and update quick action buttons
function updateCurrentSiteInfo() {
  if (el.currentSiteInfo && el.quickBlockBtn && el.quickAllowlistBtn) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          currentSiteDomain = url.hostname.replace(/^www\./, '');
          currentSiteUrl = tabs[0].url;
          
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            el.currentSiteInfo.textContent = `Current site: ${currentSiteDomain}`;
            
            // Enable and update block button
            el.quickBlockBtn.disabled = false;
            el.quickBlockBtn.textContent = `Block ${currentSiteDomain}`;
            
            // Enable and update allowlist button
            el.quickAllowlistBtn.disabled = false;
            el.quickAllowlistBtn.textContent = `✅ Add to Allowlist`;
          } else {
            el.currentSiteInfo.textContent = 'Cannot process this type of page';
            
            // Disable both buttons
            el.quickBlockBtn.disabled = true;
            el.quickBlockBtn.textContent = 'Block Current Site';
            el.quickAllowlistBtn.disabled = true;
            el.quickAllowlistBtn.textContent = '✅ Add to Allowlist';
          }
        } catch (e) {
          el.currentSiteInfo.textContent = 'Invalid URL';
          
          // Disable both buttons
          el.quickBlockBtn.disabled = true;
          el.quickBlockBtn.textContent = 'Block Current Site';
          el.quickAllowlistBtn.disabled = true;
          el.quickAllowlistBtn.textContent = '✅ Add to Allowlist';
        }
      } else {
        el.currentSiteInfo.textContent = 'No active tab';
        
        // Disable both buttons
        el.quickBlockBtn.disabled = true;
        el.quickBlockBtn.textContent = 'Block Current Site';
        el.quickAllowlistBtn.disabled = true;
        el.quickAllowlistBtn.textContent = '✅ Add to Allowlist';
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
  
  // Create domain pattern rule for current site
  const rule = {
    pattern: currentSiteDomain,
    type: 'domain',
    description: `Block ${currentSiteDomain}`,
    enabled: true
  };
  
  // Add the rule using the new pattern system
  chrome.runtime.sendMessage({ type: 'addPatternRule', rule }, (response) => {
    if (response && response.success) {
      ui.showToast(`${currentSiteDomain} blocked successfully!`);
      updateLists();
      // Refresh the current tab to apply blocking immediately
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    } else {
      ui.showToast(response?.error || 'Failed to block site', true);
    }
  });
});

// Quick allowlist button functionality
el.quickAllowlistBtn?.addEventListener('click', () => {
  if (!currentSiteUrl) {
    ui.showToast('No valid URL to allowlist', true);
    return;
  }
  
  // Generate a smart default name based on the URL
  function generateDefaultName(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      // For YouTube, try to get a more specific name
      if (domain.includes('youtube.com')) {
        if (url.includes('/watch?v=')) {
          return `YouTube Video`;
        } else if (url.includes('/playlist')) {
          return `YouTube Playlist`;
        } else if (url.includes('/channel/') || url.includes('/c/')) {
          return `YouTube Channel`;
        } else {
          return `YouTube`;
        }
      }
      
      // For other common sites
      if (domain.includes('spotify.com')) return 'Spotify';
      if (domain.includes('soundcloud.com')) return 'SoundCloud';
      if (domain.includes('netflix.com')) return 'Netflix';
      if (domain.includes('github.com')) return 'GitHub';
      if (domain.includes('stackoverflow.com')) return 'Stack Overflow';
      
      // Default to domain name
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (e) {
      return 'Allowlisted Site';
    }
  }
  
  // Add the current URL to allowlist with smart default name
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    // Check if URL already exists (support both old string format and new object format)
    const urlExists = allowlistUrls.some(item => {
      if (typeof item === 'string') {
        return item === currentSiteUrl;
      } else {
        return item.url === currentSiteUrl;
      }
    });
    
    if (urlExists) {
      ui.showToast('URL is already in allowlist', true);
      return;
    }
    
    const defaultName = generateDefaultName(currentSiteUrl);
    
    // Add as object with smart default name and url
    allowlistUrls.push({
      name: defaultName,
      url: currentSiteUrl,
      dateAdded: new Date().toISOString()
    });
    
    storage.setLists(blockedDomains, allowlistUrls, () => {
      ui.showToast(`✅ Added "${defaultName}" to allowlist!`);
      updateLists();
      console.log(`Added to allowlist: ${defaultName} (${currentSiteUrl})`);
    });
  });
});

// Debug Rules button functionality
el.debugRulesBtn?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'debugRules' }, (response) => {
    if (response && response.rules) {
      console.log('=== EXTENSION DEBUG: CURRENT RULES ===');
      console.log('Total rules:', response.rules.length);
      
      // Group rules by type and priority
      const allowRules = response.rules.filter(r => r.action.type === 'allow').sort((a, b) => b.priority - a.priority);
      const blockRules = response.rules.filter(r => r.action.type === 'redirect').sort((a, b) => b.priority - a.priority);
      
      console.log('\n🟢 ALLOW RULES:');
      allowRules.forEach(rule => {
        const condition = rule.condition;
        const filter = condition.urlFilter || condition.regexFilter || 'unknown';
        const filterType = condition.urlFilter ? 'URL' : condition.regexFilter ? 'REGEX' : 'UNKNOWN';
        console.log(`  Rule ${rule.id}: [${filterType}] ${filter} (priority: ${rule.priority})`);
      });
      
      console.log('\n🔴 BLOCK RULES:');
      blockRules.forEach(rule => {
        const condition = rule.condition;
        const filter = condition.urlFilter || condition.regexFilter || 'unknown';
        const filterType = condition.urlFilter ? 'URL' : condition.regexFilter ? 'REGEX' : 'UNKNOWN';
        console.log(`  Rule ${rule.id}: [${filterType}] ${filter} (priority: ${rule.priority})`);
      });
      
      // Show detailed summary in UI
      const summary = `Rules Debug:\n✅ ${allowRules.length} ALLOW rules (priorities: ${allowRules.map(r => r.priority).join(', ')})\n❌ ${blockRules.length} BLOCK rules (priorities: ${blockRules.map(r => r.priority).join(', ')})\n\nRegex rules: ${response.rules.filter(r => r.condition.regexFilter).length}\nURL rules: ${response.rules.filter(r => r.condition.urlFilter).length}\n\nCheck console for detailed patterns.`;
      alert(summary);
    } else {
      console.error('Failed to get debug rules');
      ui.showToast('Failed to get debug info', true);
    }
  });
});

// Backup/Restore
function updateLists() {
  // Update allowlist URLs (keeping this separate for now)
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    const allowlistList = document.getElementById('allowlist-urls-list');
    if (allowlistList) {
      allowlistList.innerHTML = '';
      allowlistUrls.forEach((item, idx) => {
        const li = document.createElement('li');
        
        // Handle both old format (string) and new format (object)
        let displayName, actualUrl;
        if (typeof item === 'string') {
          // Old format: just the URL
          displayName = item;
          actualUrl = item;
        } else {
          // New format: object with name and url
          displayName = item.name;
          actualUrl = item.url;
        }
        
        // Create URL text container
        const urlContainer = document.createElement('div');
        urlContainer.style.flex = '1';
        urlContainer.style.overflow = 'hidden';
        urlContainer.style.wordBreak = 'break-word';
        
        // Show name prominently, with URL as subtitle
        if (typeof item === 'object') {
          urlContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style='color: #27ae60; font-size: 1.1em;' title='Allowlist URL'>✅</span>
              <div>
                <div style="font-weight: 500; color: #fff; margin-bottom: 2px;">${displayName}</div>
                <div style="font-size: 0.75em; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;" title="${actualUrl}">${actualUrl}</div>
              </div>
            </div>
          `;
        } else {
          // Old format fallback
          urlContainer.innerHTML = `<span style='margin-right:6px;' title='Allowlist URL'>✅</span>${displayName}`;
        }
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '4px';
        buttonContainer.style.flexShrink = '0';
        
        // Create Edit Name button (only for object format entries)
        if (typeof item === 'object') {
          const editBtn = document.createElement('button');
          editBtn.textContent = '✏️';
          editBtn.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)';
          editBtn.style.color = 'white';
          editBtn.style.fontSize = '0.8em';
          editBtn.style.padding = '4px 8px';
          editBtn.style.minWidth = '35px';
          editBtn.style.border = 'none';
          editBtn.style.borderRadius = '4px';
          editBtn.style.cursor = 'pointer';
          editBtn.style.transition = 'all 0.2s ease';
          editBtn.title = `Edit name for ${displayName}`;
          
          // Add hover effects
          editBtn.onmouseenter = () => {
            editBtn.style.background = 'linear-gradient(135deg, #2980b9 0%, #1f618d 100%)';
            editBtn.style.transform = 'scale(1.05)';
          };
          editBtn.onmouseleave = () => {
            editBtn.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)';
            editBtn.style.transform = 'scale(1)';
          };
          
          editBtn.onclick = () => {
            const newName = prompt(`Edit name for this URL:`, displayName);
            if (newName && newName.trim()) {
              editAllowlistName(idx, newName.trim());
            }
          };
          
          buttonContainer.appendChild(editBtn);
        }
        
        // Create GO button
        const goBtn = document.createElement('button');
        goBtn.textContent = 'GO';
        goBtn.style.background = 'linear-gradient(135deg, #27ae60 0%, #229954 100%)';
        goBtn.style.color = 'white';
        goBtn.style.fontSize = '0.8em';
        goBtn.style.padding = '4px 8px';
        goBtn.style.minWidth = '35px';
        goBtn.style.border = 'none';
        goBtn.style.borderRadius = '4px';
        goBtn.style.cursor = 'pointer';
        goBtn.style.transition = 'all 0.2s ease';
        goBtn.title = `Open ${displayName} in a new tab`;
        
        // Add hover effects
        goBtn.onmouseenter = () => {
          goBtn.style.background = 'linear-gradient(135deg, #229954 0%, #1e8449 100%)';
          goBtn.style.transform = 'scale(1.05)';
        };
        goBtn.onmouseleave = () => {
          goBtn.style.background = 'linear-gradient(135deg, #27ae60 0%, #229954 100%)';
          goBtn.style.transform = 'scale(1)';
        };
        
        goBtn.onclick = () => {
          // Force rule refresh before opening URL to ensure allowlist rules are active
          chrome.runtime.sendMessage({ type: 'refreshRules' }, () => {
            // Small delay to ensure rules are updated
            setTimeout(() => {
              chrome.tabs.create({ url: actualUrl });
            }, 100);
          });
        };
        
        // Create Remove button
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
        removeBtn.style.color = 'white';
        removeBtn.style.fontSize = '0.8em';
        removeBtn.style.padding = '4px 8px';
        removeBtn.style.border = 'none';
        removeBtn.style.borderRadius = '4px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.transition = 'all 0.2s ease';
        removeBtn.title = `Remove ${displayName} from allowlist`;
        
        // Add hover effects for remove button
        removeBtn.onmouseenter = () => {
          removeBtn.style.background = 'linear-gradient(135deg, #c0392b 0%, #a93226 100%)';
          removeBtn.style.transform = 'scale(1.05)';
        };
        removeBtn.onmouseleave = () => {
          removeBtn.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
          removeBtn.style.transform = 'scale(1)';
        };
        
        removeBtn.onclick = () => {
          if (confirm(`Are you sure you want to remove "${displayName}" from allowlist?`)) {
            removeAllowlistUrl(idx);
          }
        };
        
        buttonContainer.appendChild(goBtn);
        buttonContainer.appendChild(removeBtn);
        
        li.appendChild(urlContainer);
        li.appendChild(buttonContainer);
        allowlistList.appendChild(li);
      });
    }
    
    // Update unified blocking rules list
    updateUnifiedBlockingRules(blockedDomains);
  });
}

function updateUnifiedBlockingRules(legacyBlockedDomains = []) {
  const rulesList = document.getElementById('blocking-rules-list');
  if (!rulesList) return;
  
  // Get pattern rules and combine with legacy blocked domains
  chrome.runtime.sendMessage({ type: 'getPatternRules' }, (response) => {
    if (response.success) {
      const patternRules = response.rules || [];
      rulesList.innerHTML = '';
      
      // Convert legacy blocked domains to display format
      const legacyRules = legacyBlockedDomains.map((domain, idx) => ({
        id: `legacy-${idx}`,
        pattern: domain,
        type: 'domain',
        description: `Block ${domain} (Legacy)`,
        enabled: true,
        isLegacy: true,
        legacyIndex: idx
      }));
      
      // Combine and sort rules
      const allRules = [...patternRules, ...legacyRules];
      
      if (allRules.length === 0) {
        const li = document.createElement('div');
        li.style.fontStyle = 'italic';
        li.style.opacity = '0.7';
        li.style.padding = '20px';
        li.style.textAlign = 'center';
        li.textContent = 'No blocking rules configured. Add your first rule above!';
        rulesList.appendChild(li);
        return;
      }
      
      allRules.forEach((rule) => {
        const ruleElement = createRuleElement(rule);
        rulesList.appendChild(ruleElement);
      });
    }
  });
}

function createRuleElement(rule) {
  const div = document.createElement('div');
  div.className = 'rule-item';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'space-between';
  div.style.padding = '12px';
  div.style.marginBottom = '8px';
  div.style.background = rule.enabled ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)';
  div.style.border = `1px solid ${rule.enabled ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`;
  div.style.borderRadius = '8px';
  div.style.borderLeft = `4px solid ${rule.enabled ? '#4caf50' : '#666'}`;
  
  const infoDiv = document.createElement('div');
  infoDiv.style.flex = '1';
  
  const typeIcons = {
    domain: '🌐',
    path: '🛤️',
    regex: '🔍',
    url: '🔗'
  };
  
  const typeLabels = {
    domain: 'Domain',
    path: 'Path',
    regex: 'Regex',
    url: 'URL'
  };
  
  infoDiv.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 6px;">
      <span style="margin-right: 8px; font-size: 1.2em;" title="${typeLabels[rule.type]} rule">${typeIcons[rule.type] || '⚙️'}</span>
      <strong style="color: ${rule.enabled ? '#4caf50' : '#999'}; font-size: 1.1em;">${rule.pattern}</strong>
      <span style="margin-left: 8px; padding: 3px 8px; background: rgba(25,118,210,0.2); border-radius: 4px; font-size: 0.8em; color: #64b5f6; text-transform: uppercase; font-weight: 500;">${typeLabels[rule.type]}</span>
      ${rule.isLegacy ? '<span style="margin-left: 8px; padding: 3px 8px; background: rgba(255,152,0,0.2); border-radius: 4px; font-size: 0.75em; color: #ffab40;">LEGACY</span>' : ''}
    </div>
    <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 4px;">${rule.description}</div>
    ${rule.createdAt ? `<div style="font-size: 0.75em; opacity: 0.6;">Created: ${new Date(rule.createdAt).toLocaleDateString()}</div>` : ''}
  `;
  
  const actionsDiv = document.createElement('div');
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '8px';
  actionsDiv.style.marginLeft = '12px';
  
  if (!rule.isLegacy) {
    // Toggle button for pattern rules
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = rule.enabled ? 'Disable' : 'Enable';
    toggleBtn.style.padding = '6px 12px';
    toggleBtn.style.fontSize = '0.8em';
    toggleBtn.style.background = rule.enabled ? 'rgba(255, 152, 0, 0.8)' : 'rgba(76, 175, 80, 0.8)';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.color = 'white';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.onclick = () => {
      const updatedRule = { ...rule, enabled: !rule.enabled };
      chrome.runtime.sendMessage({ type: 'updatePatternRule', ruleId: rule.id, rule: updatedRule }, (response) => {
        if (response.success) {
          ui.showToast(`Rule ${updatedRule.enabled ? 'enabled' : 'disabled'}`);
          updateLists();
        } else {
          ui.showToast(response.error, true);
        }
      });
    };
    actionsDiv.appendChild(toggleBtn);
  }
  
  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.style.padding = '6px 12px';
  removeBtn.style.fontSize = '0.8em';
  removeBtn.style.background = 'rgba(244, 67, 54, 0.8)';
  removeBtn.style.border = 'none';
  removeBtn.style.borderRadius = '4px';
  removeBtn.style.color = 'white';
  removeBtn.style.cursor = 'pointer';
  removeBtn.onclick = () => {
    if (confirm(`Are you sure you want to remove the rule: ${rule.pattern}?`)) {
      if (rule.isLegacy) {
        // Remove legacy blocked domain
        removeBlockedDomain(rule.legacyIndex);
      } else {
        // Remove pattern rule
        chrome.runtime.sendMessage({ type: 'removePatternRule', ruleId: rule.id }, (response) => {
          if (response.success) {
            ui.showToast('Rule removed');
            div.style.opacity = '0.5';
            div.style.transform = 'translateX(-20px)';
            setTimeout(() => updateLists(), 300);
          } else {
            ui.showToast('Error removing rule', true);
          }
        });
      }
    }
  };
  actionsDiv.appendChild(removeBtn);
  
  div.appendChild(infoDiv);
  div.appendChild(actionsDiv);
  
  return div;
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
      
      // Handle display name for both old and new formats
      let displayName;
      if (typeof removed[0] === 'string') {
        displayName = removed[0];
      } else {
        displayName = removed[0].name;
      }
      
      ui.showToast(`Removed: ${displayName}`);
    });
  });
}

function editAllowlistName(idx, newName) {
  storage.getLists(({ blockedDomains, allowlistUrls }) => {
    const item = allowlistUrls[idx];
    
    // Only edit if it's an object format entry
    if (typeof item === 'object') {
      item.name = newName;
      storage.setLists(blockedDomains, allowlistUrls, () => {
        ui.showToast(`Renamed to "${newName}"`);
        updateLists();
        console.log(`Renamed allowlist entry to: ${newName}`);
      });
    } else {
      ui.showToast('Cannot edit name for this entry format', true);
    }
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
auth.handlePasswordChange(storage.getPassword, storage.setPassword);

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

// Show generated password to user (only once)
function showGeneratedPassword(password) {
  const passwordDisplay = document.getElementById('current-password-display');
  if (passwordDisplay) {
    passwordDisplay.textContent = `Your generated password: ${password}`;
    passwordDisplay.style.display = 'block';
    
    // Hide after 10 seconds for security
    setTimeout(() => {
      passwordDisplay.style.display = 'none';
    }, 10000);
  }
}

// Initialization
async function initialize() {
  // Initialize password manager first
  try {
    const defaultPassword = await passwordManager.initialize();
    if (defaultPassword) {
      console.log('🔐 Generated secure default password for first-time setup');
      // Show the generated password to user once
      showGeneratedPassword(defaultPassword);
    }
  } catch (error) {
    console.error('Failed to initialize password manager:', error);
  }
  
  storage.setLocked(true, () => {
    auth.showLockScreen();
    // Check and show security warning for default password
    auth.checkAndShowSecurityWarning(storage.isDefaultPassword);
    document.getElementById('main-ui').style.display = 'none';
  });
  
  // Migrate legacy domains if needed
  migrateLegacyDomains();
  
  updateLists();
  updateCurrentSiteInfo();
  ui.setDarkMode();
  ui.showPauseCountdown(storage.getPauseUntil, storage.getPauseStart);
}
// Legacy domain migration function
async function migrateLegacyDomains() {
  try {
    const { blockedDomains } = await chrome.storage.sync.get(['blockedDomains']);
    const { patternRules } = await chrome.storage.sync.get(['patternRules']);
    
    if (blockedDomains && blockedDomains.length > 0) {
      const currentPatterns = patternRules || [];
      const migratedPatterns = [];
      
      for (const domain of blockedDomains) {
        // Check if this domain is already in pattern rules
        const exists = currentPatterns.some(rule => 
          rule.type === 'domain' && rule.pattern === domain
        );
        
        if (!exists) {
          migratedPatterns.push({
            type: 'domain',
            pattern: domain,
            action: 'block',
            description: `Migrated from legacy domain blocking: ${domain}`
          });
        }
      }
      
      if (migratedPatterns.length > 0) {
        const allPatterns = [...currentPatterns, ...migratedPatterns];
        await chrome.storage.sync.set({ patternRules: allPatterns });
        console.log(`Migrated ${migratedPatterns.length} legacy domains to pattern rules`);
      }
    }
  } catch (error) {
    console.error('Error migrating legacy domains:', error);
  }
}

document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('unload', () => {
  storage.setLocked(true);
}); 