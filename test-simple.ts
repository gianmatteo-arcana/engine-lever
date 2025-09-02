/**
 * Simple test to verify Stagehand works
 */

import { Stagehand } from '@browserbasehq/stagehand';

async function testStagehand() {
  console.log('Testing Stagehand initialization...');
  
  const stagehand = new Stagehand({
    env: 'LOCAL',
    verbose: 1
  });
  
  try {
    await stagehand.init();
    console.log('✅ Stagehand initialized successfully');
    
    const page = stagehand.page;
    await page.goto('https://www.google.com');
    console.log('✅ Navigated to Google');
    
    await stagehand.close();
    console.log('✅ Closed browser');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testStagehand();