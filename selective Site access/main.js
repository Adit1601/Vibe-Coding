// main.js
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import { passwordManager } from './password-manager.js';

// Utility functions
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

function getTimeMs(value, unit) {
  if (unit === 'hour') return value * 60 * 60 * 1000;
  return value * 60 * 1000;
}

// Generate a smart default name based on the URL
function generateDefaultName(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '');
    
    // For YouTube, try to get a more specific name
    if (domain.includes('youtube.com')) {
      if (url.includes('/watch?v=')) {
        return 'YouTube Video';
      } else if (url.includes('/playlist')) {
        return 'YouTube Playlist';
      } else if (url.includes('/channel/') || url.includes('/c/')) {
        return 'YouTube Channel';
      } else {
        return 'YouTube';
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

// DOM Elements
const el = {
  pauseValue: document.getElementById('pause-value'),
  pauseUnit: document.getElementById('pause-unit'),
  pauseBtn: document.getElementById('pause-btn'),
  unlockPassword: document.getElementById('unlock-password'),
  togglePasswordBtn: document.getElementById('toggle-password-visibility'),
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
  storage.getLists(({ allowlistUrls }) => {
    // Check if URL already exists (support both old string format and new object format)
    const urlExists = allowlistUrls.some(item => {
      if (typeof item === 'string') {
        return item === url;
      } else {
        return item.url === url;
      }
    });
    
    if (!urlExists) {
      const defaultName = generateDefaultName(url);
      
      // Store as object with smart default name
      allowlistUrls.push({
        name: defaultName,
        url: url,
        dateAdded: new Date().toISOString()
      });
      storage.setLists(allowlistUrls, () => {
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
  
  // Add the current URL to allowlist with smart default name
  storage.getLists(({ allowlistUrls }) => {
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
    
    storage.setLists(allowlistUrls, () => {
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
  // Update allowlist URLs
  storage.getLists(({ allowlistUrls }) => {
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
    updateUnifiedBlockingRules();
  });
}

function updateUnifiedBlockingRules() {
  const rulesList = document.getElementById('blocking-rules-list');
  if (!rulesList) return;
  
  // Get pattern rules only
  chrome.runtime.sendMessage({ type: 'getPatternRules' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting pattern rules:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.success) {
      const patternRules = response.rules || [];
      rulesList.innerHTML = '';
      
      if (patternRules.length === 0) {
        const li = document.createElement('div');
        li.style.fontStyle = 'italic';
        li.style.opacity = '0.7';
        li.style.padding = '20px';
        li.style.textAlign = 'center';
        li.textContent = 'No blocking rules configured. Add your first rule above!';
        rulesList.appendChild(li);
        return;
      }
      
      patternRules.forEach((rule) => {
        const ruleElement = createRuleElement(rule);
        rulesList.appendChild(ruleElement);
      });
      
      // Update blocked sites list
      updateBlockedSitesList(patternRules);
    } else {
      console.error('Failed to get pattern rules:', response);
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
    </div>
    <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 4px;">${rule.description}</div>
    ${rule.createdAt ? `<div style="font-size: 0.75em; opacity: 0.6;">Created: ${new Date(rule.createdAt).toLocaleDateString()}</div>` : ''}
  `;
  
  const actionsDiv = document.createElement('div');
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '8px';
  actionsDiv.style.marginLeft = '12px';
  
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
  };
  actionsDiv.appendChild(removeBtn);
  
  div.appendChild(infoDiv);
  div.appendChild(actionsDiv);
  
  return div;
}

function removeAllowlistUrl(idx) {
  storage.getLists(({ allowlistUrls }) => {
    const removed = allowlistUrls.splice(idx, 1);
    storage.setLists(allowlistUrls, () => {
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
  storage.getLists(({ allowlistUrls }) => {
    const item = allowlistUrls[idx];
    
    // Only edit if it's an object format entry
    if (typeof item === 'object') {
      item.name = newName;
      storage.setLists(allowlistUrls, () => {
        ui.showToast(`Renamed to "${newName}"`);
        updateLists();
        console.log(`Renamed allowlist entry to: ${newName}`);
      });
    } else {
      ui.showToast('Cannot edit name for this entry format', true);
    }
  });
}

// Update blocked sites list
function updateBlockedSitesList(patternRules) {
  const blockedSitesList = document.getElementById('blocked-sites-list');
  if (!blockedSitesList) return;
  
  if (patternRules.length === 0) {
    blockedSitesList.innerHTML = '<div style="font-style: italic; opacity: 0.7; padding: 20px; text-align: center;">No sites are currently blocked.</div>';
    return;
  }
  
  // Group rules by domain for better organization
  const domainGroups = {};
  
  patternRules.forEach(rule => {
    if (!rule.enabled) return;
    
    let domain = '';
    let displayName = '';
    
    switch (rule.type) {
      case 'domain':
        domain = rule.pattern;
        displayName = rule.pattern;
        break;
      case 'path':
        // Extract domain from path patterns
        if (rule.pattern.includes('youtube.com')) {
          domain = 'youtube.com';
          displayName = 'YouTube (Path: ' + rule.pattern + ')';
        } else if (rule.pattern.includes('facebook.com')) {
          domain = 'facebook.com';
          displayName = 'Facebook (Path: ' + rule.pattern + ')';
        } else {
          domain = 'path-pattern';
          displayName = 'Path Pattern: ' + rule.pattern;
        }
        break;
      case 'url':
        try {
          const urlObj = new URL(rule.pattern);
          domain = urlObj.hostname;
          displayName = domain + ' (URL: ' + rule.pattern + ')';
        } catch (e) {
          domain = 'url-pattern';
          displayName = 'URL Pattern: ' + rule.pattern;
        }
        break;
      case 'regex':
        domain = 'regex-pattern';
        displayName = 'Regex Pattern: ' + rule.pattern;
        break;
    }
    
    if (!domainGroups[domain]) {
      domainGroups[domain] = [];
    }
    domainGroups[domain].push({ rule, displayName });
  });
  
  // Create blocked sites list
  blockedSitesList.innerHTML = '';
  
  Object.entries(domainGroups).forEach(([domain, rules]) => {
    const domainDiv = document.createElement('div');
    domainDiv.style.marginBottom = '15px';
    domainDiv.style.padding = '12px';
    domainDiv.style.background = 'rgba(231, 76, 60, 0.1)';
    domainDiv.style.border = '1px solid rgba(231, 76, 60, 0.3)';
    domainDiv.style.borderRadius = '8px';
    
    const domainHeader = document.createElement('div');
    domainHeader.style.display = 'flex';
    domainHeader.style.justifyContent = 'space-between';
    domainHeader.style.alignItems = 'center';
    domainHeader.style.marginBottom = '8px';
    
    const domainTitle = document.createElement('strong');
    domainTitle.style.color = '#e74c3c';
    domainTitle.textContent = domain === 'path-pattern' ? 'Path Patterns' : 
                             domain === 'url-pattern' ? 'URL Patterns' : 
                             domain === 'regex-pattern' ? 'Regex Patterns' : domain;
    
    const visitBtn = document.createElement('button');
    visitBtn.textContent = 'Visit';
    visitBtn.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)';
    visitBtn.style.color = 'white';
    visitBtn.style.border = 'none';
    visitBtn.style.borderRadius = '6px';
    visitBtn.style.padding = '6px 12px';
    visitBtn.style.fontSize = '0.8em';
    visitBtn.style.cursor = 'pointer';
    visitBtn.style.transition = 'all 0.2s ease';
    
    visitBtn.onmouseenter = () => {
      visitBtn.style.background = 'linear-gradient(135deg, #2980b9 0%, #1f618d 100%)';
      visitBtn.style.transform = 'scale(1.05)';
    };
    visitBtn.onmouseleave = () => {
      visitBtn.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)';
      visitBtn.style.transform = 'scale(1)';
    };
    
    // Handle visit button click based on domain type
    visitBtn.onclick = () => {
      if (domain === 'youtube.com') {
        // For YouTube, open the main site
        chrome.tabs.create({ url: 'https://www.youtube.com' });
      } else if (domain === 'facebook.com') {
        // For Facebook, open the main site
        chrome.tabs.create({ url: 'https://www.facebook.com' });
      } else if (domain.startsWith('http')) {
        // For URL patterns, open the URL
        chrome.tabs.create({ url: domain });
      } else if (domain.includes('.com') || domain.includes('.org') || domain.includes('.net')) {
        // For domain patterns, open the domain
        chrome.tabs.create({ url: 'https://' + domain });
      } else {
        // For other patterns, show a message
        ui.showToast('Cannot directly visit this type of pattern. Modify your rules to allow access.', true);
      }
    };
    
    domainHeader.appendChild(domainTitle);
    domainHeader.appendChild(visitBtn);
    domainDiv.appendChild(domainHeader);
    
    // Add rule descriptions
    rules.forEach(({ rule, displayName }) => {
      const ruleDesc = document.createElement('div');
      ruleDesc.style.fontSize = '0.85em';
      ruleDesc.style.opacity = '0.8';
      ruleDesc.style.marginBottom = '4px';
      ruleDesc.textContent = '• ' + displayName;
      domainDiv.appendChild(ruleDesc);
    });
    
    blockedSitesList.appendChild(domainDiv);
  });
}

// Enhanced Export/Import functionality
document.getElementById('export-btn').addEventListener('click', () => {
  // Export both allowlist URLs and pattern rules
  Promise.all([
    new Promise((resolve) => {
      storage.getLists((data) => resolve(data));
    }),
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getPatternRules' }, (response) => {
        resolve(response && response.success ? response.rules : []);
      });
    })
  ]).then(([allowlistData, patternRules]) => {
    const exportData = {
      allowlistUrls: allowlistData.allowlistUrls || [],
      patternRules: patternRules || [],
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selective-site-access-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.showToast('Settings exported successfully!');
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
      
      // Validate import data structure
      if (!data.allowlistUrls || !Array.isArray(data.allowlistUrls)) {
        ui.showToast('Invalid backup file: missing allowlist data', true);
        return;
      }
      
      // Import allowlist URLs
      storage.setLists(data.allowlistUrls, () => {
        // Import pattern rules if they exist
        if (data.patternRules && Array.isArray(data.patternRules)) {
          // Clear existing pattern rules first
          chrome.runtime.sendMessage({ type: 'getPatternRules' }, (response) => {
            if (response && response.success) {
              const existingRules = response.rules || [];
              // Remove existing rules
              existingRules.forEach(rule => {
                chrome.runtime.sendMessage({ type: 'removePatternRule', ruleId: rule.id });
              });
              
              // Add imported rules
              let importedCount = 0;
              data.patternRules.forEach(rule => {
                chrome.runtime.sendMessage({ type: 'addPatternRule', rule }, (response) => {
                  if (response && response.success) {
                    importedCount++;
                    if (importedCount === data.patternRules.length) {
                      ui.showToast(`Import complete! ${data.allowlistUrls.length} allowlist entries and ${data.patternRules.length} pattern rules imported.`);
                      updateLists();
                    }
                  }
                });
              });
            }
          });
        } else {
          ui.showToast(`Import complete! ${data.allowlistUrls.length} allowlist entries imported.`);
          updateLists();
        }
      });
    } catch (error) {
      ui.showToast('Invalid JSON file or corrupted backup data', true);
      console.error('Import error:', error);
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

// Show generated password to user (persistent until user acknowledges)
function showGeneratedPassword(password) {
  const passwordDisplay = document.getElementById('current-password-display');
  if (passwordDisplay) {
    passwordDisplay.innerHTML = `
      <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin: 10px 0;">
        <strong>⚠️ Your generated password:</strong><br>
        <code style="font-size: 14px; background: #f8f9fa; padding: 2px 4px; border-radius: 2px;">${password}</code><br>
        <small style="color: #856404;">Please save this password! It will only be shown until you set a custom password.</small><br>
        <button id="password-acknowledged" style="margin-top: 8px; padding: 4px 8px; background: #28a745; color: white; border: none; border-radius: 2px; cursor: pointer;">I've saved this password</button>
      </div>
    `;
    passwordDisplay.style.display = 'block';
    
    // Mark as displayed but not acknowledged yet
    chrome.storage.sync.set({ passwordDisplayed: true });
    
    // Add click handler for acknowledgment
    const ackButton = document.getElementById('password-acknowledged');
    if (ackButton) {
      ackButton.addEventListener('click', () => {
        passwordDisplay.style.display = 'none';
        // Don't clear passwordDisplayed flag - keep it until password is changed
      });
    }
  }
}

// Wake up service worker and ensure it's ready
function ensureServiceWorkerReady(callback, retries = 3) {
  chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Service worker not ready, retrying...', chrome.runtime.lastError.message);
      if (retries > 0) {
        setTimeout(() => ensureServiceWorkerReady(callback, retries - 1), 100);
      } else {
        console.error('Failed to wake up service worker after multiple attempts');
        callback(false);
      }
    } else {
      console.log('Service worker is ready');
      callback(true);
    }
  });
}

// Initialization
async function initialize() {
  console.log('Initializing popup...');
  
  // First, ensure the service worker is awake and ready
  ensureServiceWorkerReady(async (ready) => {
    if (!ready) {
      console.error('Service worker could not be woken up');
      ui.showToast('Extension communication error. Please reload the extension.', true);
      return;
    }
    
    // Initialize password manager first
    try {
      const defaultPassword = await passwordManager.initialize();
      if (defaultPassword) {
        console.log('🔐 Generated secure default password for first-time setup');
        // Show the generated password to user once
        showGeneratedPassword(defaultPassword);
      } else {
        // Check if we have a generated password that hasn't been displayed yet
        const result = await chrome.storage.sync.get(['password', 'passwordSet', 'passwordDisplayed']);
        if (result.password && !result.passwordSet && !result.passwordDisplayed) {
          console.log('🔐 Showing previously generated password');
          showGeneratedPassword(result.password);
        }
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
    
    updateLists();
    updateCurrentSiteInfo();
    ui.setDarkMode();
    ui.showPauseCountdown(storage.getPauseUntil, storage.getPauseStart);
  });
}

document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('unload', () => {
  storage.setLocked(true);
}); 