/**
 * Blocked page interactive functionality
 * Separated from HTML to avoid CSP violations
 */

// Add interactive elements when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners for buttons
  const closeBtn = document.querySelector('.btn-primary');
  const backBtn = document.querySelector('.btn-secondary');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      window.close();
    });
  }
  
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      history.back();
    });
  }
  
  // Add more particles dynamically
  const body = document.body;
  for (let i = 0; i < 8; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.width = `${Math.random() * 10 + 5  }px`;
    particle.style.height = particle.style.width;
    particle.style.left = `${Math.random() * 100  }%`;
    particle.style.top = `${Math.random() * 100  }%`;
    particle.style.animationDelay = `${Math.random() * 6  }s`;
    body.appendChild(particle);
  }
  
  // Show current time
  const now = new Date();
  const timeElement = document.createElement('div');
  timeElement.style.position = 'absolute';
  timeElement.style.top = '20px';
  timeElement.style.right = '20px';
  timeElement.style.fontSize = '0.9em';
  timeElement.style.opacity = '0.7';
  timeElement.textContent = now.toLocaleTimeString();
  body.appendChild(timeElement);
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    window.close();
  } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
    history.back();
  }
});
