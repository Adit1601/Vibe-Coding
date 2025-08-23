/**
 * Reset Extension Password - Development Utility
 * Run this script to clear the current password and force regeneration
 */

// Clear all password-related storage
chrome.storage.sync.remove(['password', 'passwordSet'], () => {
  console.log('✅ Password storage cleared');
  console.log('🔄 Reload the extension to generate a new password');
});

// Also clear the locked state
chrome.storage.sync.remove(['locked'], () => {
  console.log('✅ Lock state cleared');
});
