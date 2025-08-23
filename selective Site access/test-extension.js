/**
 * Comprehensive test suite for Pattern-Based Blocking Extension
 */

// Test YouTube Shorts blocking scenario
async function testYouTubeShorts() {
  console.log('🧪 Testing YouTube Shorts Blocking Scenario');
  console.log('=========================================');
  
  try {
    // Step 1: Add a pattern rule to block YouTube Shorts
    const shortsPattern = {
      pattern: '*/shorts/*',
      type: 'path',
      description: 'Block YouTube Shorts',
      enabled: true
    };
    
    console.log('1. Adding YouTube Shorts pattern rule...');
    const addResult = await chrome.runtime.sendMessage({ 
      type: 'addPatternRule', 
      rule: shortsPattern 
    });
    
    if (addResult.success) {
      console.log('✅ Pattern rule added successfully');
      console.log('   Rule ID:', addResult.rule.id);
    } else {
      console.log('❌ Failed to add pattern rule:', addResult.error);
      return;
    }
    
    // Step 2: Verify the rule was saved
    console.log('\n2. Verifying pattern rules storage...');
    const rulesResult = await chrome.runtime.sendMessage({ type: 'getPatternRules' });
    
    if (rulesResult.success && rulesResult.rules.length > 0) {
      console.log('✅ Pattern rules retrieved successfully');
      console.log(`   Found ${rulesResult.rules.length} rule(s)`);
      rulesResult.rules.forEach(rule => {
        console.log(`   - ${rule.pattern} (${rule.type}) - ${rule.enabled ? 'Enabled' : 'Disabled'}`);
      });
    } else {
      console.log('❌ No pattern rules found');
    }
    
    // Step 3: Test different URL scenarios
    console.log('\n3. Testing URL matching scenarios...');
    const testUrls = [
      { url: 'https://www.youtube.com/shorts/abc123', shouldBlock: true },
      { url: 'https://www.youtube.com/watch?v=abc123', shouldBlock: false },
      { url: 'https://www.youtube.com/', shouldBlock: false },
      { url: 'https://m.youtube.com/shorts/xyz789', shouldBlock: true }
    ];
    
    for (const test of testUrls) {
      // Simulate pattern matching (this would normally happen in content script)
      const matches = rulesResult.rules.some(rule => {
        if (!rule.enabled) return false;
        if (rule.type === 'path') {
          const pathRegex = rule.pattern.replace(/\*/g, '.*').replace(/\//g, '\\/');
          return new RegExp(pathRegex, 'i').test(test.url);
        }
        return false;
      });
      
      const result = matches === test.shouldBlock ? '✅ PASS' : '❌ FAIL';
      console.log(`   ${result} ${test.url} → ${matches ? 'BLOCKED' : 'ALLOWED'}`);
    }
    
    // Step 4: Test rule management
    console.log('\n4. Testing rule management...');
    
    // Disable the rule
    const disableResult = await chrome.runtime.sendMessage({
      type: 'updatePatternRule',
      ruleId: addResult.rule.id,
      rule: { ...shortsPattern, enabled: false }
    });
    
    if (disableResult.success) {
      console.log('✅ Successfully disabled pattern rule');
    } else {
      console.log('❌ Failed to disable pattern rule');
    }
    
    // Re-enable the rule
    const enableResult = await chrome.runtime.sendMessage({
      type: 'updatePatternRule',
      ruleId: addResult.rule.id,
      rule: { ...shortsPattern, enabled: true }
    });
    
    if (enableResult.success) {
      console.log('✅ Successfully re-enabled pattern rule');
    } else {
      console.log('❌ Failed to re-enable pattern rule');
    }
    
    // Clean up - remove the test rule
    console.log('\n5. Cleaning up test rule...');
    const removeResult = await chrome.runtime.sendMessage({
      type: 'removePatternRule',
      ruleId: addResult.rule.id
    });
    
    if (removeResult.success) {
      console.log('✅ Test rule removed successfully');
    } else {
      console.log('❌ Failed to remove test rule');
    }
    
    console.log('\n🎉 YouTube Shorts blocking test completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Test different pattern types
async function testPatternTypes() {
  console.log('\n🔍 Testing Different Pattern Types');
  console.log('==================================');
  
  const patterns = [
    {
      pattern: '*/shorts/*',
      type: 'path',
      description: 'Path pattern test',
      testUrl: 'https://example.com/shorts/test',
      shouldMatch: true
    },
    {
      pattern: 'example\\.com\\/api\\/',
      type: 'regex',
      description: 'Regex pattern test',
      testUrl: 'https://example.com/api/data',
      shouldMatch: true
    },
    {
      pattern: 'https://blocked.example.com/',
      type: 'url',
      description: 'URL prefix test',
      testUrl: 'https://blocked.example.com/page',
      shouldMatch: true
    },
    {
      pattern: 'facebook.com',
      type: 'domain',
      description: 'Domain pattern test',
      testUrl: 'https://www.facebook.com/profile',
      shouldMatch: true
    }
  ];
  
  for (const pattern of patterns) {
    console.log(`\nTesting ${pattern.type} pattern: ${pattern.pattern}`);
    
    // Validate pattern
    const validation = await chrome.runtime.sendMessage({
      type: 'validatePatternRule',
      rule: pattern
    });
    
    if (validation.valid) {
      console.log('✅ Pattern validation passed');
    } else {
      console.log('❌ Pattern validation failed:', validation.error);
      continue;
    }
    
    // Add pattern
    const addResult = await chrome.runtime.sendMessage({
      type: 'addPatternRule',
      rule: pattern
    });
    
    if (addResult.success) {
      console.log('✅ Pattern added successfully');
      
      // Test matching logic here (simplified)
      console.log(`   Testing against: ${pattern.testUrl}`);
      
      // Clean up
      await chrome.runtime.sendMessage({
        type: 'removePatternRule',
        ruleId: addResult.rule.id
      });
      console.log('✅ Pattern removed');
    } else {
      console.log('❌ Failed to add pattern:', addResult.error);
    }
  }
}

// Main test function
async function runAllTests() {
  console.log('🚀 Starting Pattern-Based Blocking Tests');
  console.log('==========================================');
  
  try {
    await testYouTubeShorts();
    await testPatternTypes();
    
    console.log('\n✨ All tests completed!');
    console.log('\nTo manually test:');
    console.log('1. Open extension popup');
    console.log('2. Add pattern rule: */shorts/* (Path type)');
    console.log('3. Visit https://www.youtube.com/shorts/any-video');
    console.log('4. Verify it gets blocked');
    console.log('5. Visit https://www.youtube.com/watch?v=any-video');
    console.log('6. Verify it is NOT blocked');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.runPatternTests = runAllTests;
  window.testYouTubeShorts = testYouTubeShorts;
  window.testPatternTypes = testPatternTypes;
}

// Auto-run if in extension context
if (typeof chrome !== 'undefined' && chrome.runtime) {
  runAllTests();
}
