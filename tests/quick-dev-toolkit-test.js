#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function testDevToolkit() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();
  
  console.log('📋 Testing Dev Toolkit...\n');
  
  // Navigate to the app
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  
  // Take screenshot of landing page
  await page.screenshot({ 
    path: '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/dev-toolkit-test-1.png',
    fullPage: true 
  });
  console.log('✅ Screenshot 1: Landing page');
  
  // Click Dev Toolkit button
  const devButton = await page.$('[data-testid="dev-toolkit"]');
  if (devButton) {
    await devButton.click();
    console.log('✅ Clicked Dev Toolkit button');
    await new Promise(r => setTimeout(r, 1000));
    
    // Take screenshot after clicking
    await page.screenshot({ 
      path: '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/dev-toolkit-test-2.png',
      fullPage: true 
    });
    console.log('✅ Screenshot 2: After clicking Dev Toolkit');
    
    // Check if panel is visible
    const panelVisible = await page.evaluate(() => {
      const panel = document.querySelector('.fixed.bottom-0.right-0.w-96.h-96');
      const title = Array.from(document.querySelectorAll('*')).find(
        el => el.textContent?.includes('Dev Toolkit - Agent Activity')
      );
      return !!(panel || title);
    });
    
    console.log(panelVisible ? '✅ Dev Toolkit panel is VISIBLE!' : '❌ Dev Toolkit panel NOT visible');
  } else {
    console.log('❌ Dev Toolkit button not found');
  }
  
  // Click Get Started
  const getStarted = await page.$('[data-testid="get-started"]');
  if (getStarted) {
    await getStarted.click();
    console.log('✅ Clicked Get Started');
    await new Promise(r => setTimeout(r, 3000));
    
    // Take screenshot after Get Started
    await page.screenshot({ 
      path: '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/dev-toolkit-test-3.png',
      fullPage: true 
    });
    console.log('✅ Screenshot 3: After Get Started (should show Business Discovery)');
    
    // Check for agent logs
    const hasAgentLogs = await page.evaluate(() => {
      const content = document.body.textContent || '';
      return content.includes('BusinessDiscoveryAgent') || 
             content.includes('Searching public records');
    });
    
    console.log(hasAgentLogs ? '✅ Agent logs visible!' : '❌ No agent logs found');
  }
  
  await browser.close();
  console.log('\n✅ Test complete! Check screenshots in tests/screenshots/');
}

testDevToolkit().catch(console.error);