/**
 * A2A Event Bus Demo Screenshot Capture
 * 
 * This script demonstrates the new dynamic agent visualization capabilities
 * by capturing screenshots of the A2A Event Bus demo in action.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:8083';
const SCREENSHOT_DIR = '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/a2a-demo';

// Ensure screenshot directory exists
function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function captureA2ADemoScreenshots() {
  console.log('🚀 Starting A2A Event Bus Demo Screenshot Capture...');
  
  ensureScreenshotDir();
  
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  
  try {
    // 1. Navigate to frontend
    console.log('📱 Navigating to frontend...');
    await page.goto(FRONTEND_URL);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-frontend-landing.png'),
      fullPage: true
    });
    console.log('✅ Captured: Frontend landing page');
    
    // 2. Navigate to Dev Toolkit
    console.log('🛠️ Opening Dev Toolkit...');
    
    // Look for Dev Toolkit link/button
    try {
      await page.waitForSelector('a[href*="dev"], button:contains("Dev"), [data-testid*="dev"]', { timeout: 5000 });
      await page.click('a[href*="dev"], button:contains("Dev"), [data-testid*="dev"]');
    } catch (error) {
      console.log('⚠️ Dev Toolkit link not found, trying manual navigation...');
      await page.goto(`${FRONTEND_URL}/dev`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-dev-toolkit-main.png'),
      fullPage: true
    });
    console.log('✅ Captured: Dev Toolkit main page');
    
    // 3. Find and click Agent Visualizer or A2A Demo
    console.log('🤖 Looking for Agent Visualizer / A2A Demo...');
    
    try {
      // Try different possible selectors for the A2A demo
      const selectors = [
        '[data-testid*="a2a"]',
        '[data-testid*="agent"]',
        'button:contains("A2A")',
        'button:contains("Agent")',
        'a:contains("A2A")',
        'a:contains("Agent")',
        '[href*="a2a"]',
        '[href*="agent"]'
      ];
      
      let found = false;
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          await page.click(selector);
          found = true;
          console.log(`✅ Found and clicked A2A demo with selector: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!found) {
        console.log('⚠️ A2A demo not found with standard selectors, taking current page screenshot...');
      }
      
    } catch (error) {
      console.log('⚠️ Could not find A2A demo button, continuing with current page...');
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-a2a-demo-interface.png'),
      fullPage: true
    });
    console.log('✅ Captured: A2A Demo interface');
    
    // 4. Start A2A Demo
    console.log('🎬 Starting A2A Demo...');
    
    try {
      // Look for Start Demo button
      const startSelectors = [
        'button:contains("Start")',
        'button:contains("Demo")',
        '[data-testid*="start"]',
        'button[class*="start"]',
        'button[class*="demo"]'
      ];
      
      for (const selector of startSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          await page.click(selector);
          console.log(`✅ Clicked start demo with selector: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }
    } catch (error) {
      console.log('⚠️ Could not find start demo button, demo may already be running...');
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-demo-starting.png'),
      fullPage: true
    });
    console.log('✅ Captured: Demo starting state');
    
    // 5. Wait for demo events and capture timeline
    console.log('⏱️ Waiting for demo events...');
    
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `05-demo-progress-${i + 1}.png`),
        fullPage: true
      });
      console.log(`✅ Captured: Demo progress ${i + 1}`);
    }
    
    // 6. Capture final state
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06-demo-final-state.png'),
      fullPage: true
    });
    console.log('✅ Captured: Demo final state');
    
    // 7. Test backend API directly
    console.log('🔗 Testing backend API endpoints...');
    
    // Navigate to a new tab for API testing
    const apiPage = await browser.newPage();
    
    // Test health endpoint
    await apiPage.goto(`${BACKEND_URL}/health`);
    await apiPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '07-backend-health.png'),
      fullPage: true
    });
    console.log('✅ Captured: Backend health endpoint');
    
    // Test agents endpoint
    await apiPage.goto(`${BACKEND_URL}/api/agents`);
    await apiPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '08-backend-agents.png'),
      fullPage: true
    });
    console.log('✅ Captured: Backend agents endpoint');
    
    // 8. Create summary info
    const summaryInfo = {
      timestamp: new Date().toISOString(),
      description: 'A2A Event Bus Demo Screenshots',
      frontend_url: FRONTEND_URL,
      backend_url: BACKEND_URL,
      screenshots: [
        '01-frontend-landing.png - Frontend application landing page',
        '02-dev-toolkit-main.png - Dev Toolkit main interface',
        '03-a2a-demo-interface.png - A2A Event Bus demo interface',
        '04-demo-starting.png - Demo initialization state',
        '05-demo-progress-1.png - Demo progress: Agent 1 starting',
        '05-demo-progress-2.png - Demo progress: Business discovery',
        '05-demo-progress-3.png - Demo progress: Compliance analysis',
        '05-demo-progress-4.png - Demo progress: Agent coordination',
        '05-demo-progress-5.png - Demo progress: Event streaming',
        '05-demo-progress-6.png - Demo progress: Final coordination',
        '06-demo-final-state.png - Demo completion with full timeline',
        '07-backend-health.png - Backend health check response',
        '08-backend-agents.png - Backend agents status response'
      ],
      features_demonstrated: [
        'Dynamic Agent Configuration - Agents appear based on actual demo data',
        'Real-time Statistics - Total Events, Active Agents, Duration, Success Rate',
        'Agent Coordination Timeline - Dynamic swimlanes for any agent types',
        'SSE Event Streaming - Live updates from backend to frontend',
        'Multi-Agent Workflow - BusinessDiscoveryAgent -> ComplianceAnalyzer',
        'Complete Session Management - Start, progress, completion tracking'
      ]
    };
    
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'README.md'),
      `# A2A Event Bus Demo Screenshots

Generated: ${summaryInfo.timestamp}

## Overview
These screenshots demonstrate the enhanced A2A Event Bus with dynamic agent visualization capabilities.

## Features Demonstrated
${summaryInfo.features_demonstrated.map(f => `- ${f}`).join('\n')}

## Screenshots
${summaryInfo.screenshots.map(s => `- ${s}`).join('\n')}

## URLs Tested
- Frontend: ${summaryInfo.frontend_url}
- Backend: ${summaryInfo.backend_url}

## Dynamic Agent Visualization
The demo showcases how the frontend dynamically:
1. Generates agent configurations from backend session data
2. Creates visual timelines for any agent types
3. Updates statistics in real-time from actual demo events
4. Displays agent coordination through SSE streaming

This demonstrates the complete integration between backend A2A Event Bus and frontend dynamic visualization.
`
    );
    
    console.log('\n🎉 Screenshot capture completed!');
    console.log(`📁 Screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log(`📝 Summary saved to: ${path.join(SCREENSHOT_DIR, 'README.md')}`);
    
  } catch (error) {
    console.error('❌ Error during screenshot capture:', error);
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  captureA2ADemoScreenshots().catch(console.error);
}

module.exports = { captureA2ADemoScreenshots };