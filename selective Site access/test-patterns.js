/**
 * Test script for pattern-based blocking functionality
 * Run this in browser console to test pattern matching logic
 */

// Test pattern matching function (copy from content.js)
function matchesPattern(url, patternRule) {
  if (!patternRule.enabled) return false;
  
  switch (patternRule.type) {
    case 'path':
      // Convert path pattern to regex
      // Example: */shorts/* becomes .*/shorts/.*
      const pathRegex = patternRule.pattern
        .replace(/\*/g, '.*')
        .replace(/\//g, '\\/');
      return new RegExp(pathRegex, 'i').test(url);
      
    case 'regex':
      try {
        return new RegExp(patternRule.pattern, 'i').test(url);
      } catch (e) {
        console.warn('Invalid regex pattern:', patternRule.pattern);
        return false;
      }
      
    case 'url':
      return url.startsWith(patternRule.pattern);
      
    case 'domain':
      const hostname = new URL(url).hostname;
      return hostname.endsWith(patternRule.pattern);
      
    default:
      console.warn('Unknown pattern type:', patternRule.type);
      return false;
  }
}

// Test cases for YouTube Shorts blocking
const testCases = [
  // YouTube Shorts URLs that should be blocked
  { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', shouldBlock: true },
  { url: 'https://youtube.com/shorts/abcd1234', shouldBlock: true },
  { url: 'https://m.youtube.com/shorts/xyz789', shouldBlock: true },
  
  // Regular YouTube URLs that should NOT be blocked
  { url: 'https://www.youtube.com/', shouldBlock: false },
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', shouldBlock: false },
  { url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab', shouldBlock: false },
  { url: 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw', shouldBlock: false },
  { url: 'https://www.youtube.com/@mkbhd', shouldBlock: false },
  { url: 'https://www.youtube.com/results?search_query=test', shouldBlock: false },
];

// Test pattern rule for YouTube Shorts
const youtubeShortPattern = {
  id: 'test-youtube-shorts',
  pattern: '*/shorts/*',
  type: 'path',
  description: 'Block YouTube Shorts',
  enabled: true
};

// Run tests
console.log('🧪 Testing YouTube Shorts Pattern Blocking');
console.log('Pattern:', youtubeShortPattern);
console.log('');

let passedTests = 0;
let totalTests = testCases.length;

testCases.forEach((testCase, index) => {
  const result = matchesPattern(testCase.url, youtubeShortPattern);
  const passed = result === testCase.shouldBlock;
  
  console.log(`Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  URL: ${testCase.url}`);
  console.log(`  Expected: ${testCase.shouldBlock ? 'BLOCK' : 'ALLOW'}`);
  console.log(`  Got: ${result ? 'BLOCK' : 'ALLOW'}`);
  console.log('');
  
  if (passed) passedTests++;
});

console.log(`📊 Results: ${passedTests}/${totalTests} tests passed`);

// Test other pattern types
console.log('🔍 Testing other pattern types:');

const regexPattern = {
  pattern: 'youtube\\.com\\/shorts\\/',
  type: 'regex',
  enabled: true
};

const urlPattern = {
  pattern: 'https://www.youtube.com/shorts/',
  type: 'url',
  enabled: true
};

const domainPattern = {
  pattern: 'youtube.com',
  type: 'domain',
  enabled: true
};

console.log('Regex pattern test:', matchesPattern('https://www.youtube.com/shorts/test', regexPattern));
console.log('URL pattern test:', matchesPattern('https://www.youtube.com/shorts/test', urlPattern));
console.log('Domain pattern test:', matchesPattern('https://www.youtube.com/anything', domainPattern));

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { matchesPattern, testCases, youtubeShortPattern };
}
