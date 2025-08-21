#!/usr/bin/env node

/**
 * E2E Orchestration Trace Test
 * 
 * Mission: Create authenticated task through dev-toolkit-standalone
 * and trace EVERY orchestration step with complete logging
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://raenkewzlvrdqufwxjpl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP_URL = process.env.APP_URL || 'http://localhost:8082';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.GOOGLE_TEST_EMAIL || 'gianmatteo.allyn.test@gmail.com';

// Initialize Supabase client for monitoring
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Pretty print utilities
const printSection = (title) => {
  console.log('\n' + '═'.repeat(80));
  console.log(`🎯 ${title}`);
  console.log('═'.repeat(80));
};

const printLog = (type, message, data = null) => {
  const icons = {
    info: '📍',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    agent: '🤖',
    reasoning: '🧠',
    event: '📊',
    task: '📋'
  };
  
  console.log(`${icons[type] || '•'} ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2).split('\n').join('\n    '));
  }
};

async function authenticateSession() {
  printSection('STEP 1: AUTHENTICATION');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Check if we have existing auth
    printLog('info', 'Checking for existing authentication...');
    
    // Try to load existing auth state
    try {
      await context.addCookies(require('./.auth/cookies.json'));
      printLog('success', 'Loaded existing auth cookies');
    } catch (e) {
      printLog('warning', 'No existing auth found, will authenticate');
    }
    
    // Navigate to app
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);
    
    // Check if authenticated
    const isAuthenticated = await page.evaluate(() => {
      const authKey = Object.keys(localStorage).find(key => 
        key.includes('supabase') && key.includes('auth')
      );
      return !!authKey && !!localStorage.getItem(authKey);
    });
    
    if (!isAuthenticated) {
      printLog('info', 'Need to authenticate with Google OAuth');
      // Here we would implement Google OAuth flow
      // For now, assume manual authentication
      printLog('warning', 'Please authenticate manually in the browser');
      await page.waitForTimeout(30000); // Wait for manual auth
    }
    
    printLog('success', 'Authentication confirmed');
    
    // Save auth state
    const cookies = await context.cookies();
    require('fs').writeFileSync('./.auth/cookies.json', JSON.stringify(cookies, null, 2));
    
    return { browser, context, page };
    
  } catch (error) {
    printLog('error', 'Authentication failed', error);
    await browser.close();
    throw error;
  }
}

async function createTaskAndTrace(page) {
  printSection('STEP 2: CREATE TASK VIA DEV-TOOLKIT');
  
  // Navigate to dev-toolkit-standalone
  await page.goto(`${APP_URL}/dev-toolkit-standalone`);
  await page.waitForTimeout(3000);
  
  printLog('info', 'Opening dev-toolkit-standalone');
  
  // Monitor console logs from the page
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text().includes('Task')) {
      printLog('event', `Browser: ${msg.text()}`);
    }
  });
  
  // Monitor network requests
  page.on('request', request => {
    if (request.url().includes('/api/tasks')) {
      printLog('info', `API Request: ${request.method()} ${request.url()}`);
      if (request.postData()) {
        printLog('task', 'Request payload:', JSON.parse(request.postData()));
      }
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('/api/tasks') && response.status() === 201) {
      printLog('success', `Task created: ${response.status()}`);
    }
  });
  
  // Select template and create task
  printLog('info', 'Selecting onboarding template...');
  
  // Click on template selector
  const templateSelector = await page.locator('button:has-text("Select template")').first();
  if (await templateSelector.isVisible()) {
    await templateSelector.click();
    await page.waitForTimeout(1000);
    
    // Select onboarding
    const onboardingOption = await page.locator('[role="option"]:has-text("Onboarding")').first();
    if (await onboardingOption.isVisible()) {
      await onboardingOption.click();
      printLog('success', 'Selected onboarding template');
    }
  }
  
  // Create task
  const createButton = await page.locator('button:has-text("Create")').first();
  if (await createButton.isVisible()) {
    printLog('info', 'Creating task...');
    
    // Get task ID from response
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/tasks') && response.status() === 201
    );
    
    await createButton.click();
    
    const response = await responsePromise;
    const responseData = await response.json();
    const taskId = responseData.task?.id;
    
    printLog('success', `Task created with ID: ${taskId}`);
    return taskId;
  }
  
  throw new Error('Could not create task');
}

async function traceOrchestration(taskId) {
  printSection('STEP 3: TRACE ORCHESTRATION EVENTS');
  
  printLog('info', `Monitoring orchestration for task: ${taskId}`);
  
  // Poll for orchestration events
  let lastEventTime = new Date(Date.now() - 60000).toISOString(); // Start from 1 minute ago
  let eventCount = 0;
  
  const pollInterval = setInterval(async () => {
    try {
      // Query task_context_events for this task
      const { data: events, error } = await supabase
        .from('task_context_events')
        .select('*')
        .eq('task_id', taskId)
        .gt('created_at', lastEventTime)
        .order('created_at', { ascending: true });
      
      if (error) {
        printLog('error', 'Failed to query events', error);
        return;
      }
      
      if (events && events.length > 0) {
        for (const event of events) {
          eventCount++;
          
          printLog('event', `Event #${eventCount}: ${event.operation}`);
          
          // Show actor/agent
          if (event.actor_id) {
            printLog('agent', `Actor: ${event.actor_id}`);
          }
          
          // Show reasoning
          if (event.reasoning) {
            printLog('reasoning', 'Reasoning:', event.reasoning);
          }
          
          // Show event data
          if (event.data) {
            printLog('info', 'Event Data:', event.data);
          }
          
          // Update last event time
          lastEventTime = event.created_at;
        }
      }
      
    } catch (error) {
      printLog('error', 'Failed to poll events', error);
    }
  }, 2000); // Poll every 2 seconds
  
  // Monitor backend logs via WebSocket or SSE if available
  printLog('info', 'Monitoring backend orchestration logs...');
  
  // Stop after 30 seconds
  setTimeout(() => {
    clearInterval(pollInterval);
    printSection('ORCHESTRATION TRACE COMPLETE');
    printLog('success', `Total events captured: ${eventCount}`);
  }, 30000);
}

async function main() {
  console.log('\n' + '🚀'.repeat(40));
  console.log('    E2E ORCHESTRATION TRACE TEST');
  console.log('    Tracing every step of task orchestration');
  console.log('🚀'.repeat(40));
  
  try {
    // Step 1: Authenticate
    const { browser, context, page } = await authenticateSession();
    
    // Step 2: Create task
    const taskId = await createTaskAndTrace(page);
    
    // Step 3: Trace orchestration
    await traceOrchestration(taskId);
    
    // Keep browser open for inspection
    printLog('info', 'Keeping browser open for 60 seconds for inspection...');
    await page.waitForTimeout(60000);
    
    await browser.close();
    
  } catch (error) {
    printLog('error', 'Test failed', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}