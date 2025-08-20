/**
 * Test Orchestration via Dev Toolkit Standalone
 * 
 * This test creates an onboarding task through the Dev Toolkit
 * with authentication to trigger proper orchestration
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Test configuration
const APP_URL = process.env.APP_URL || 'http://localhost:8081';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const GOOGLE_TEST_EMAIL = process.env.GOOGLE_TEST_EMAIL || 'gianmatteo.allyn.test@gmail.com';

// Logging
const logFile = path.join(__dirname, `devtoolkit-orchestration-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  logStream.write(`[${timestamp}] ${message}\n`);
  if (data) {
    logStream.write(JSON.stringify(data, null, 2) + '\n');
  }
}

async function testOrchestration() {
  log('=' .repeat(80));
  log('🎯 DEV TOOLKIT ORCHESTRATION TEST');
  log('=' .repeat(80));
  log(`📁 Log file: ${logFile}`);
  log(`🌐 Frontend: ${APP_URL}`);
  log(`🔧 Backend: ${BACKEND_URL}`);
  log(`👤 User: ${GOOGLE_TEST_EMAIL}`);
  log('=' .repeat(80));
  
  const browser = await chromium.launch({ 
    headless: process.env.HEADLESS !== 'false' 
  });
  
  try {
    // Create context with authentication
    const context = await browser.newContext({
      storageState: '.auth/user-state.json'
    });
    
    const page = await context.newPage();
    
    // Enable verbose console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Task') || text.includes('orchestrat') || text.includes('Agent')) {
        log('🔍 Console: ' + text.substring(0, 200));
      }
    });
    
    // Monitor API calls
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/tasks')) {
        log('🌐 API Request: ' + request.method() + ' ' + url);
        if (request.postData()) {
          try {
            const data = JSON.parse(request.postData());
            log('📦 Payload:', data);
          } catch {}
        }
      }
    });
    
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/api/tasks') && response.status() === 200) {
        log('✅ API Response: ' + response.status() + ' ' + url);
        try {
          const body = await response.json();
          if (body.task) {
            log('📋 Task Created:', {
              id: body.task.id,
              title: body.task.title,
              type: body.task.task_type
            });
          }
        } catch {}
      }
    });
    
    log('\n📍 STEP 1: Navigate to Dev Toolkit');
    await page.goto(`${APP_URL}/dev-toolkit-standalone`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check authentication
    const authStatus = await page.evaluate(() => {
      const authToken = localStorage.getItem('sb-raenkewzlvrdqufwxjpl-auth-token');
      if (authToken) {
        try {
          const parsed = JSON.parse(authToken);
          return {
            authenticated: !!parsed.access_token,
            userEmail: parsed.user?.email
          };
        } catch {}
      }
      return { authenticated: false };
    });
    
    log('🔐 Authentication Status:', authStatus);
    
    if (!authStatus.authenticated) {
      throw new Error('Not authenticated! Run universal-auth-capture.js first');
    }
    
    log('\n📍 STEP 2: Create Onboarding Task');
    
    // Open template dropdown
    const templateButton = page.locator('button[role="combobox"]:has-text("Select template")').first();
    if (await templateButton.isVisible()) {
      log('🔘 Opening template selector...');
      await templateButton.click();
      await page.waitForTimeout(1000);
      
      // Select Onboarding
      const onboardingOption = page.locator('[role="option"]:has-text("Onboarding")').first();
      if (await onboardingOption.isVisible()) {
        log('✅ Selecting Onboarding template...');
        await onboardingOption.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Click Create button
    const createButton = page.locator('button:has-text("Create")').first();
    if (await createButton.isVisible() && !await createButton.isDisabled()) {
      log('🚀 Clicking Create button...');
      await createButton.click();
      
      // Wait for task creation
      await page.waitForTimeout(5000);
      
      // Check for success indicators
      const successToast = await page.locator('text=/Task Created/i').isVisible();
      if (successToast) {
        log('✅ Task creation successful!');
      }
    } else {
      throw new Error('Create button not available');
    }
    
    log('\n📍 STEP 3: Monitor Orchestration');
    log('⏳ Waiting 20 seconds for orchestration to complete...');
    
    // Take screenshot periodically to see progress
    for (let i = 1; i <= 4; i++) {
      await page.waitForTimeout(5000);
      await page.screenshot({ 
        path: `orchestration-progress-${i}.png`,
        fullPage: true 
      });
      log(`📸 Screenshot ${i} captured`);
      
      // Check task selector for events
      const taskSelector = page.locator('select').first();
      if (await taskSelector.isVisible()) {
        const selectedOption = await taskSelector.evaluate(el => el.options[el.selectedIndex]?.text);
        log('📋 Selected task: ' + selectedOption);
      }
      
      // Look for event indicators
      const eventCount = await page.locator('text=/event/i').count();
      if (eventCount > 0) {
        log(`📊 Found ${eventCount} event indicators in UI`);
      }
    }
    
    log('\n📍 STEP 4: Extract Task ID from UI');
    
    // Try to get the task ID from the selector or other UI elements
    const taskInfo = await page.evaluate(() => {
      // Check task selector
      const selector = document.querySelector('select');
      if (selector && selector.value) {
        return { taskId: selector.value };
      }
      // Check for task ID in any visible text
      const bodyText = document.body.innerText;
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const match = bodyText.match(uuidPattern);
      if (match) {
        return { taskId: match[0] };
      }
      return null;
    });
    
    if (taskInfo) {
      log('📋 Task ID found:', taskInfo.taskId);
      
      // Make direct API call to check orchestration events
      const eventsResponse = await page.evaluate(async (taskId) => {
        try {
          const token = JSON.parse(localStorage.getItem('sb-raenkewzlvrdqufwxjpl-auth-token') || '{}');
          const response = await fetch(`https://raenkewzlvrdqufwxjpl.supabase.co/rest/v1/task_context_events?task_id=eq.${taskId}`, {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI2NTU1OTQsImV4cCI6MjAzODIzMTU5NH0.o7MDkPYqJJBJKTnNzssH0BRngUa9hpEAbnvCLWLgeNk',
              'Authorization': `Bearer ${token.access_token}`
            }
          });
          const events = await response.json();
          return { success: true, count: events.length, events: events.slice(0, 5) };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }, taskInfo.taskId);
      
      log('\n📊 ORCHESTRATION EVENTS CHECK:', eventsResponse);
      
      if (eventsResponse.success && eventsResponse.count > 0) {
        log('\n✅✅✅ ORCHESTRATION SUCCESS! ✅✅✅');
        log(`Found ${eventsResponse.count} orchestration events`);
        
        eventsResponse.events.forEach((event, i) => {
          log(`${i + 1}. ${event.operation} by ${event.actor_id || event.actor_type}`);
        });
      }
    }
    
    log('\n📍 STEP 5: Final Screenshot');
    await page.screenshot({ 
      path: 'orchestration-final-state.png',
      fullPage: true 
    });
    log('📸 Final screenshot saved');
    
  } catch (error) {
    log('❌ Test failed:', { error: error.message, stack: error.stack });
  } finally {
    await browser.close();
    logStream.end();
    log('\n📁 Full log saved to: ' + logFile);
  }
}

// Run the test
testOrchestration().catch(console.error);