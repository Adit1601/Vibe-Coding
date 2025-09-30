// auth.js
// Authentication and lock/unlock logic for Selective Site Access extension

// Show the lock screen UI
export function showLockScreen() {
  document.getElementById('lock-screen').style.display = 'block';
  document.getElementById('main-ui').style.display = 'none';
  document.getElementById('pause-section').style.display = 'none';
}

// Show the main UI (after unlock)
export function showMainUI() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('main-ui').style.display = 'block';
  document.getElementById('pause-section').style.display = 'block';
  
  // Update current site info when unlocking
  if (window.updateCurrentSiteInfo) {
    window.updateCurrentSiteInfo();
  }
}

// Check and show security warning for default password
/**
* Displays a security warning if the default password is being used.
* @example
* checkAndShowSecurityWarning(isDefaultPasswordFunc)
* // Displays or hides the security warning based on the password status.
* @param {function} isDefaultPasswordFunc - Function that checks if the default password is being used, executes a callback with a boolean result.
* @returns {void} No return value.
**/
export function checkAndShowSecurityWarning(isDefaultPasswordFunc) {
  const securityWarning = document.getElementById('security-warning');
  if (securityWarning && isDefaultPasswordFunc) {
    isDefaultPasswordFunc((isDefault) => {
      if (isDefault) {
        securityWarning.style.display = 'block';
      } else {
        securityWarning.style.display = 'none';
      }
    });
  }
}

// Lock the extension
export function lockExtension(setLocked) {
  setLocked(true);
  showLockScreen();
}

// Unlock the extension
export function unlockExtension(setLocked) {
  setLocked(false, () => {
    showMainUI();
    document.getElementById('main-ui').style.display = '';
    document.getElementById('lock-screen').style.display = 'none';
  });
}

// Password strength checker
/**
* Evaluates the strength of a given password and provides feedback.
* @example
* checkPasswordStrength('aB1#defg')
* // { strength: 'strong', percentage: 100, feedback: 'Strong - Excellent password' }
* @param {string} password - The password to be evaluated.
* @returns {Object} An object containing the strength, percentage, and feedback for the password.
**/
function checkPasswordStrength(password) {
  let score = 0;
  let feedback = '';
  
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  
  if (score <= 2) {
    return { strength: 'weak', percentage: 25, feedback: 'Weak - Add more characters and variety' };
  } else if (score <= 3) {
    return { strength: 'fair', percentage: 50, feedback: 'Fair - Consider adding symbols or mixed case' };
  } else if (score <= 4) {
    return { strength: 'good', percentage: 75, feedback: 'Good - Strong password' };
  } else {
    return { strength: 'strong', percentage: 100, feedback: 'Strong - Excellent password' };
  }
}

// Update password strength indicator
/**
* Updates the password strength UI elements based on user input.
* @example
* updatePasswordStrength()
* // Attaches event listener to update UI for password strength feedback
* @param {void} - No arguments are taken by this function.
* @returns {void} Does not return a value.
**/
function updatePasswordStrength() {
  const passwordInput = document.getElementById('new-password');
  const strengthBar = document.getElementById('password-strength-bar');
  const strengthText = document.getElementById('password-strength-text');
  const strengthContainer = document.getElementById('password-strength');
  
  if (!passwordInput || !strengthBar || !strengthText || !strengthContainer) return;
  
  passwordInput.addEventListener('input', (e) => {
    const password = e.target.value;
    
    if (password.length === 0) {
      strengthContainer.style.display = 'none';
      strengthText.style.display = 'none';
      return;
    }
    
    const result = checkPasswordStrength(password);
    
    strengthContainer.style.display = 'block';
    strengthText.style.display = 'block';
    
    // Update bar
    strengthBar.className = `password-strength-bar strength-${result.strength}`;
    strengthBar.style.width = `${result.percentage}%`;
    
    // Update text
    strengthText.textContent = result.feedback;
    strengthText.style.color = getStrengthColor(result.strength);
  });
}

function getStrengthColor(strength) {
  switch (strength) {
    case 'weak': return '#e74c3c';
    case 'fair': return '#f39c12';
    case 'good': return '#3498db';
    case 'strong': return '#27ae60';
    default: return '#999';
  }
}

// Password change logic
/**
 * Handles the password change process, validating inputs and updating the password.
 * @example
 * handlePasswordChange(getPasswordCallback, setPasswordCallback)
 * <button onclick="handlePasswordChange(getPasswordCallback, setPasswordCallback)">Change Password</button>
 * @param {Function} getPassword - A callback function to retrieve the current password for verification.
 * @param {Function} setPassword - A callback function to update the password after successful validation.
 * @returns {void} This function does not return a value; it manipulates the DOM to provide feedback to the user.
 */
export function handlePasswordChange(getPassword, setPassword) {
  const form = document.getElementById('change-password-form');
  const errorDiv = document.getElementById('unlock-error');
  
  // Initialize password strength checker
  updatePasswordStrength();
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    
    errorDiv.textContent = '';
    
    // Validate new password
    if (!newPass) {
      errorDiv.textContent = 'New password cannot be empty.';
      return;
    }
    
    if (newPass.length < 6) {
      errorDiv.textContent = 'New password must be at least 6 characters long.';
      return;
    }
    
    if (newPass !== confirm) {
      errorDiv.textContent = 'New passwords do not match.';
      return;
    }
    
    // Check current password
    getPassword((storedPassword) => {
      if (current !== storedPassword) {
        errorDiv.textContent = 'Current password is incorrect.';
        return;
      }
      
      // Set new password
      setPassword(newPass, () => {
        errorDiv.style.color = '#4caf50'; // Success color
        errorDiv.textContent = 'Password changed successfully!';
        form.reset();
        
        // Hide password strength indicator
        document.getElementById('password-strength').style.display = 'none';
        document.getElementById('password-strength-text').style.display = 'none';
        
        setTimeout(() => {
          form.style.display = 'none';
          document.getElementById('unlock-form').style.display = 'block';
          document.getElementById('show-change-password').style.display = 'block';
          errorDiv.textContent = '';
          errorDiv.style.color = '#e74c3c'; // Reset to error color
          
          // Hide security warning if it was shown
          const securityWarning = document.getElementById('security-warning');
          if (securityWarning) {
            securityWarning.style.display = 'none';
          }
        }, 1500);
      });
    });
  });
} 