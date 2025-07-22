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

// Password change logic
export function handlePasswordChange(getPassword, setPassword) {
  const form = document.getElementById('change-password-form');
  const errorDiv = document.getElementById('unlock-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    errorDiv.textContent = '';
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
        form.reset();
        setTimeout(() => {
          form.style.display = 'none';
          document.getElementById('unlock-form').style.display = 'block';
          document.getElementById('show-change-password').style.display = 'block';
          errorDiv.textContent = '';
        }, 1200);
      });
    });
  });
} 