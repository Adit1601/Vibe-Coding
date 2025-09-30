// ui.js
// UI update and utility functions for Selective Site Access extension

// Toast notification
/**
* Displays a toast message on the screen with optional error styling.
* @example
* showToast('Operation successful', false)
* Displays a success message on the toast.
* @param {string} message - The message to be displayed on the toast.
* @param {boolean} [isError=false] - Optional flag to indicate if the toast is an error message.
* @returns {void} No return value. The function appends a toast element to the DOM.
**/
export function showToast(message, isError = false) {
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

// Set dark mode styles
/**
* Sets the theme of the UI to dark mode by updating CSS variables and styles.
* @example
* setDarkMode();
* // Changes the background and text colors to a dark theme.
* @returns {void} Does not return a value.
**/
export function setDarkMode() {
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

// Set time input value/unit from ms
export function setTimeInput(ms, valueInput, unitInput) {
  if (ms % (60 * 60 * 1000) === 0) {
    valueInput.value = ms / (60 * 60 * 1000);
    unitInput.value = 'hour';
  } else {
    valueInput.value = ms / (60 * 1000);
    unitInput.value = 'min';
  }
}

// Bind change events for time input
export function bindTimeInputEvents(valueInput, unitInput, onChange) {
  valueInput?.addEventListener('change', onChange);
  unitInput?.addEventListener('change', onChange);
}

// Show and update the pause countdown and progress bar
let pauseInterval = null;
/**
 * Displays a countdown for when the blocking pause will end.
 * @example
 * showPauseCountdown(getPauseUntil, getPauseStart)
 * // Calls functions to display remaining time until resume, manage UI elements and progress bar.
 * @param {function} getPauseUntil - A function that retrieves the timestamp indicating when the pause ends.
 * @param {function} getPauseStart - A function that retrieves the timestamp indicating when the pause started.
 * @returns {void} Does not return a value, but updates the UI with remaining pause time and progress.
 */
export function showPauseCountdown(getPauseUntil, getPauseStart) {
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
        pauseInterval = setInterval(() => showPauseCountdown(getPauseUntil, getPauseStart), 1000);
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