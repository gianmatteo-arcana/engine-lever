#!/usr/bin/env node

/**
 * Complete E2E Orchestration Trace Test
 * 
 * Mission: Create authenticated task through dev-toolkit-standalone
 * and trace EVERY orchestration step with complete logging in pretty print format
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Environment configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://raenkewzlvrdqufwxjpl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:8082';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.GOOGLE_TEST_EMAIL || 'gianmatteo.allyn.test@gmail.com';

// Initialize Supabase client for monitoring
const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

// Pretty print utilities with colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const printHeader = () => {
  console.log('\n' + colors.cyan + '🚀'.repeat(40) + colors.reset);
  console.log(colors.bright + colors.cyan + '    COMPLETE ORCHESTRATION TRACE TEST' + colors.reset);
  console.log(colors.cyan + '    Tracing EVERY step of task orchestration' + colors.reset);
  console.log(colors.cyan + '    All logs in pretty print format' + colors.reset);
  console.log(colors.cyan + '🚀'.repeat(40) + colors.reset + '\n');
};

const printSection = (title) => {
  console.log('\n' + colors.bright + colors.blue + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + colors.blue + `🎯 ${title}` + colors.reset);
  console.log(colors.blue + '═'.repeat(80) + colors.reset);
};

const printSubSection = (title) => {
  console.log('\n' + colors.cyan + '─'.repeat(60) + colors.reset);
  console.log(colors.cyan + `📍 ${title}` + colors.reset);
  console.log(colors.cyan + '─'.repeat(60) + colors.reset);
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
    task: '📋',
    network: '🌐',
    auth: '🔐',
    ui: '🖥️',
    data: '💾'
  };
  
  const typeColors = {
    info: colors.white,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    agent: colors.magenta,
    reasoning: colors.cyan,
    event: colors.blue,
    task: colors.green,
    network: colors.yellow,
    auth: colors.magenta,
    ui: colors.cyan,
    data: colors.blue
  };
  
  console.log(`${typeColors[type] || ''}${icons[type] || '•'} ${message}${colors.reset}`);
  
  if (data) {
    const formatted = JSON.stringify(data, null, 2)
      .split('\n')
      .map(line => '   ' + line)
      .join('\n');
    console.log(colors.white + formatted + colors.reset);
  }
};

async function setupAuthentication() {
  printSection('STEP 1: AUTHENTICATION SETUP');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  let context;
  let hasValidAuth = false;
  
  // Try to use existing auth state
  const authStatePath = '.auth/user-state.json';
  if (fs.existsSync(authStatePath)) {
    printLog('auth', 'Found existing auth state, attempting to use it...');
    
    try {
      context = await browser.newContext({
        storageState: authStatePath,
        viewport: { width: 1920, height: 1080 }
      });
      
      const page = await context.newPage();
      await page.goto(APP_URL);
      await page.waitForTimeout(3000);
      
      // Check if authenticated
      const authCheck = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const authKey = Object.keys(localStorage).find(key => 
          key.includes('supabase') && key.includes('auth')
        );
        const authData = authKey ? localStorage.getItem(authKey) : null;
        
        return {
          hasWelcome: bodyText.includes('Welcome'),
          hasEmail: bodyText.includes('gianmatteo'),
          hasAuthToken: !!authData,
          bodyPreview: bodyText.substring(0, 200)
        };
      });
      
      hasValidAuth = authCheck.hasWelcome || authCheck.hasEmail || authCheck.hasAuthToken;
      
      if (hasValidAuth) {
        printLog('success', 'Existing authentication is valid!');
        printLog('auth', 'Auth details:', {
          welcome: authCheck.hasWelcome,
          email: authCheck.hasEmail,
          token: authCheck.hasAuthToken
        });
      } else {
        printLog('warning', 'Existing auth state appears invalid');
        await page.close();
        await context.close();
      }
      
    } catch (error) {
      printLog('warning', 'Could not use existing auth state', { error: error.message });
    }
  } else {
    printLog('info', 'No existing auth state found');
  }
  
  // Create new context if needed
  if (!hasValidAuth) {
    printLog('auth', 'Creating new browser context without auth');
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    
    printLog('warning', 'Manual authentication may be required');
    printLog('info', 'If login is needed:');
    printLog('info', '  1. Click "Sign in with Google"');
    printLog('info', `  2. Use email: ${TEST_EMAIL}`);
    printLog('info', '  3. Complete OAuth flow');
  }
  
  return { browser, context };
}

async function navigateToDevToolkit(context) {
  printSection('STEP 2: NAVIGATE TO DEV TOOLKIT');
  
  const page = context.pages()[0] || await context.newPage();
  
  // Monitor console logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Task') || text.includes('Agent') || text.includes('Orchestr')) {
      printLog('ui', `Console: ${text.substring(0, 150)}`);
    }
  });
  
  // Monitor network requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/tasks') || url.includes('/api/agents')) {
      printLog('network', `Request: ${request.method()} ${url.replace(APP_URL, '').replace(BACKEND_URL, '')}`);
    }
  });
  
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/tasks') || url.includes('/api/agents')) {
      printLog('network', `Response: ${response.status()} ${url.replace(APP_URL, '').replace(BACKEND_URL, '')}`);
    }
  });
  
  printLog('info', `Navigating to: ${APP_URL}/dev-toolkit-standalone`);
  await page.goto(`${APP_URL}/dev-toolkit-standalone`);
  await page.waitForTimeout(3000);
  
  // Check authentication status
  const devToolkitStatus = await page.evaluate(() => {
    const bodyText = document.body.textContent || '';
    // Find create button - check for text content
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasCreateButton = buttons.some(btn => btn.textContent?.includes('Create'));
    
    return {
      hasAuth: bodyText.includes('Authenticated'),
      hasDemo: bodyText.includes('Demo Mode'),
      hasCreateButton,
      hasTemplateSelector: bodyText.includes('Select template'),
      previewText: bodyText.substring(0, 300)
    };
  });
  
  printSubSection('Dev Toolkit Status');
  printLog('auth', 'Authentication:', {
    authenticated: devToolkitStatus.hasAuth,
    demoMode: devToolkitStatus.hasDemo,
    createAvailable: devToolkitStatus.hasCreateButton,
    templateSelector: devToolkitStatus.hasTemplateSelector
  });
  
  if (!devToolkitStatus.hasAuth && devToolkitStatus.hasDemo) {
    printLog('warning', 'Dev Toolkit is in Demo Mode - authentication may be needed');
  }
  
  return page;
}

async function createTask(page) {
  printSection('STEP 3: CREATE TASK TO TRIGGER ORCHESTRATION');
  
  let taskId = null;
  
  try {
    // Select template
    printLog('ui', 'Looking for template selector...');
    const templateButton = page.locator('button[role="combobox"]:has-text("Select template"), button:has-text("Select template")').first();
    
    if (await templateButton.isVisible()) {
      printLog('ui', 'Opening template dropdown...');
      await templateButton.click();
      await page.waitForTimeout(1000);
      
      // Select onboarding option
      const onboardingOption = page.locator('[role="option"]:has-text("Onboarding"), text="Onboarding"').first();
      if (await onboardingOption.isVisible()) {
        printLog('ui', 'Selecting "Onboarding" template...');
        await onboardingOption.click();
        await page.waitForTimeout(1000);
        printLog('success', 'Template selected: Onboarding');
      } else {
        printLog('warning', 'Onboarding option not found in dropdown');
      }
    } else {
      printLog('warning', 'Template selector not found');
    }
    
    // Create task
    const createButton = page.locator('button:has-text("Create")').first();
    if (await createButton.isVisible() && !await createButton.isDisabled()) {
      printLog('task', 'Creating task...');
      
      // Capture the task creation response
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/tasks') && response.status() === 201,
        { timeout: 10000 }
      ).catch(() => null);
      
      await createButton.click();
      printLog('ui', 'Create button clicked');
      
      const response = await responsePromise;
      if (response) {
        try {
          const responseData = await response.json();
          taskId = responseData.task?.id || responseData.id;
          printLog('success', `Task created successfully!`);
          printLog('task', 'Task details:', {
            id: taskId,
            status: responseData.task?.status,
            type: responseData.task?.task_type
          });
        } catch (e) {
          printLog('warning', 'Could not parse task response');
        }
      } else {
        printLog('warning', 'No task creation response captured');
      }
    } else {
      printLog('error', 'Create button not available or disabled');
    }
    
  } catch (error) {
    printLog('error', 'Failed to create task', { error: error.message });
  }
  
  return taskId;
}

async function traceOrchestration(taskId, page) {
  printSection('STEP 4: TRACE ORCHESTRATION EVENTS');
  
  if (!taskId) {
    printLog('warning', 'No task ID available - will monitor general orchestration');
  } else {
    printLog('info', `Monitoring orchestration for task: ${taskId}`);
  }
  
  printSubSection('Real-time Orchestration Events');
  
  // Monitor database events if Supabase is configured
  if (supabase && taskId) {
    let lastEventTime = new Date(Date.now() - 60000).toISOString();
    let eventCount = 0;
    
    const pollEvents = async () => {
      try {
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
            
            console.log('\n' + colors.bright + colors.green + `┌─ Event #${eventCount} ─────────────────────────────────┐` + colors.reset);
            
            printLog('event', `Operation: ${colors.bright}${event.operation}${colors.reset}`);
            
            if (event.actor_id) {
              printLog('agent', `Actor: ${event.actor_id}`);
            }
            
            if (event.reasoning) {
              printLog('reasoning', 'Reasoning:');
              console.log(colors.cyan + event.reasoning + colors.reset);
            }
            
            if (event.data) {
              printLog('data', 'Event Data:');
              console.log(colors.blue + JSON.stringify(event.data, null, 2) + colors.reset);
            }
            
            console.log(colors.green + `└────────────────────────────────────────────┘` + colors.reset);
            
            lastEventTime = event.created_at;
          }
        }
      } catch (error) {
        printLog('error', 'Error polling events', { error: error.message });
      }
    };
    
    // Poll for events every 2 seconds
    const pollInterval = setInterval(pollEvents, 2000);
    
    // Stop after 30 seconds
    setTimeout(() => {
      clearInterval(pollInterval);
      printSubSection('Orchestration Trace Complete');
      printLog('success', `Total events captured: ${eventCount}`);
    }, 30000);
    
  } else {
    printLog('warning', 'Database monitoring not available - observing UI only');
    
    // Just wait and observe UI changes
    await page.waitForTimeout(20000);
  }
}

async function captureScreenshots(page) {
  printSection('STEP 5: CAPTURE FINAL STATE');
  
  const screenshotDir = 'orchestration-trace-screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `trace-${timestamp}.png`);
  
  await page.screenshot({ path: screenshotPath, fullPage: false });
  printLog('success', `Screenshot saved: ${screenshotPath}`);
}

async function main() {
  printHeader();
  
  try {
    // Step 1: Setup authentication
    const { browser, context } = await setupAuthentication();
    
    // Step 2: Navigate to Dev Toolkit
    const page = await navigateToDevToolkit(context);
    
    // Step 3: Create task
    const taskId = await createTask(page);
    
    // Step 4: Trace orchestration
    await traceOrchestration(taskId, page);
    
    // Step 5: Capture screenshots
    await captureScreenshots(page);
    
    // Keep browser open for inspection
    printSection('TEST COMPLETE');
    printLog('info', 'Keeping browser open for 30 seconds for inspection...');
    await page.waitForTimeout(30000);
    
    await browser.close();
    printLog('success', 'Test completed successfully!');
    
  } catch (error) {
    printLog('error', 'Test failed', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch(error => {
    console.error(colors.red + 'Fatal error:' + colors.reset, error);
    process.exit(1);
  });
}

module.exports = { main, setupAuthentication, navigateToDevToolkit, createTask, traceOrchestration };