#!/usr/bin/env node

/**
 * Complete E2E Test with Comprehensive Screenshot Documentation
 * 
 * This test captures EVERY aspect of the onboarding flow:
 * 1. Dev Toolkit - Task creation and agent context
 * 2. User Dashboard - Onboarding card and user experience
 * 3. Real-time orchestration events
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const TEST_OUTPUT_DIR = process.env.TEST_OUTPUT_DIR || '/Users/gianmatteo/Documents/Arcana-Prototype/tests';
const SUPABASE_URL = "https://raenkewzlvrdqufwxjpl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDczODMsImV4cCI6MjA2ODYyMzM4M30.CvnbE8w1yEX4zYHjHmxRIpTlh4O7ZClbcNSEfYFGlag";

const CONFIG = {
  frontendUrl: 'http://localhost:5173',
  devToolkitUrl: 'http://localhost:5173/dev/toolkit',
  testEmail: 'e2e-screenshot-test@example.com',
  testPassword: 'Screenshot123!@#',
  businessName: 'Screenshot Test Company LLC'
};

// Create timestamped directory for this test run
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const testRunDir = path.join(TEST_OUTPUT_DIR, 'screenshots', `onboarding-${timestamp}`);

// Ensure directories exist
function ensureDirectories() {
  const dirs = [
    testRunDir,
    path.join(testRunDir, 'dev-toolkit'),
    path.join(testRunDir, 'user-dashboard'),
    path.join(testRunDir, 'orchestration'),
    path.join(testRunDir, 'agent-contexts')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  console.log(`📁 Test output directory: ${testRunDir}`);
}

// Screenshot helper
async function screenshot(page, category, name, description) {
  const filepath = path.join(testRunDir, category, `${name}.png`);
  await page.screenshot({ 
    path: filepath, 
    fullPage: true,
    type: 'png'
  });
  console.log(`📸 [${category}] ${name}: ${description}`);
  return filepath;
}

// Wait helper with screenshot on error
async function waitAndClick(page, selector, description, category = 'errors') {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await page.click(selector);
    await page.waitForTimeout(500); // Let UI update
    return true;
  } catch (error) {
    await screenshot(page, category, `error-${Date.now()}`, `Failed to find: ${description}`);
    console.error(`❌ Failed to find ${description}: ${error.message}`);
    return false;
  }
}

// Expand all collapsible sections
async function expandAllSections(page, category) {
  const expandButtons = await page.$$('[data-testid*="expand"], [aria-expanded="false"], .collapsible:not(.expanded), button:has-text("Show more"), button:has-text("Expand")');
  
  for (let i = 0; i < expandButtons.length; i++) {
    try {
      await expandButtons[i].click();
      await page.waitForTimeout(200);
    } catch (e) {
      // Some buttons might not be expandable
    }
  }
  
  console.log(`🔓 Expanded ${expandButtons.length} sections in ${category}`);
}

// Main test flow
async function runFullE2ETest() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('🎬 COMPREHENSIVE E2E ONBOARDING TEST WITH SCREENSHOTS');
  console.log('════════════════════════════════════════════════════════════\n');
  
  ensureDirectories();
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let mainPage = null;
  let devToolkitPage = null;
  
  try {
    // ============================================================
    // PART 1: USER ACCOUNT SETUP
    // ============================================================
    console.log('\n📋 PART 1: User Account Setup\n');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Delete existing user if exists
    console.log('🗑️  Cleaning up existing test user...');
    try {
      await supabase.auth.signInWithPassword({
        email: CONFIG.testEmail,
        password: CONFIG.testPassword
      });
      await supabase.auth.signOut();
    } catch (e) {
      // User doesn't exist, that's fine
    }
    
    // Create new user
    console.log('👤 Creating fresh test user...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: CONFIG.testEmail,
      password: CONFIG.testPassword,
      options: {
        data: {
          name: 'E2E Screenshot Test User'
        }
      }
    });
    
    if (signUpError) throw signUpError;
    console.log('✅ User created successfully');
    
    // ============================================================
    // PART 2: USER DASHBOARD - INITIAL STATE
    // ============================================================
    console.log('\n📋 PART 2: User Dashboard - Initial State\n');
    
    mainPage = await browser.newPage();
    await mainPage.goto(CONFIG.frontendUrl, { waitUntil: 'networkidle2' });
    
    // Screenshot 1: Landing page
    await screenshot(mainPage, 'user-dashboard', '01-landing-page', 'Initial landing page');
    
    // Sign in
    console.log('🔐 Signing in to user dashboard...');
    await waitAndClick(mainPage, 'button:has-text("Sign in"), a:has-text("Sign in")', 'Sign in button');
    await mainPage.waitForTimeout(1000);
    
    // Fill login form
    await mainPage.type('input[type="email"]', CONFIG.testEmail);
    await mainPage.type('input[type="password"]', CONFIG.testPassword);
    
    // Screenshot 2: Login form filled
    await screenshot(mainPage, 'user-dashboard', '02-login-form', 'Login form with credentials');
    
    await mainPage.click('button[type="submit"]');
    await mainPage.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // Screenshot 3: Dashboard after login
    await screenshot(mainPage, 'user-dashboard', '03-dashboard-initial', 'Dashboard immediately after login');
    
    // Look for onboarding prompts
    await mainPage.waitForTimeout(2000);
    await screenshot(mainPage, 'user-dashboard', '04-dashboard-onboarding-prompt', 'Dashboard showing onboarding prompt');
    
    // ============================================================
    // PART 3: DEV TOOLKIT - ORCHESTRATION SETUP
    // ============================================================
    console.log('\n📋 PART 3: Dev Toolkit - Real-Time Agent Visualizer\n');
    
    devToolkitPage = await browser.newPage();
    await devToolkitPage.goto(CONFIG.devToolkitUrl, { waitUntil: 'networkidle2' });
    
    // Screenshot 5: Dev Toolkit initial
    await screenshot(devToolkitPage, 'dev-toolkit', '01-initial-state', 'Dev Toolkit initial load');
    
    // Authenticate in Dev Toolkit
    console.log('🔐 Authenticating in Dev Toolkit...');
    const authButton = await devToolkitPage.$('button:has-text("Authenticate with Google"), button:has-text("Sign in")');
    if (authButton) {
      await authButton.click();
      await devToolkitPage.waitForTimeout(1000);
      
      // Fill credentials if needed
      const emailInput = await devToolkitPage.$('input[type="email"]');
      if (emailInput) {
        await devToolkitPage.type('input[type="email"]', CONFIG.testEmail);
        await devToolkitPage.type('input[type="password"]', CONFIG.testPassword);
        await devToolkitPage.click('button[type="submit"]');
      }
      
      await devToolkitPage.waitForTimeout(2000);
    }
    
    // Navigate to Real-Time Agent Visualizer
    console.log('📊 Opening Real-Time Agent Visualizer...');
    await waitAndClick(devToolkitPage, 'button:has-text("Real-Time Agent Visualizer"), [data-testid="agent-visualizer-tab"]', 'Agent Visualizer tab');
    await devToolkitPage.waitForTimeout(1000);
    
    // Screenshot 6: Agent Visualizer empty state
    await screenshot(devToolkitPage, 'dev-toolkit', '02-visualizer-empty', 'Agent Visualizer before task creation');
    
    // ============================================================
    // PART 4: CREATE ONBOARDING TASK
    // ============================================================
    console.log('\n📋 PART 4: Creating Onboarding Task\n');
    
    // Click Start New Onboarding
    console.log('🚀 Starting new onboarding...');
    const startButton = await devToolkitPage.$('button:has-text("Start New Onboarding")');
    if (startButton) {
      await startButton.click();
      console.log('✅ Clicked Start New Onboarding');
    } else {
      console.error('❌ Could not find Start New Onboarding button');
    }
    
    await devToolkitPage.waitForTimeout(3000);
    
    // Screenshot 7: Task creation in progress
    await screenshot(devToolkitPage, 'orchestration', '01-task-creating', 'Task being created');
    
    // ============================================================
    // PART 5: ORCHESTRATION EVENTS
    // ============================================================
    console.log('\n📋 PART 5: Capturing Orchestration Events\n');
    
    // Wait for events to appear
    console.log('⏳ Waiting for orchestration events...');
    await devToolkitPage.waitForTimeout(5000);
    
    // Screenshot 8: Initial events
    await screenshot(devToolkitPage, 'orchestration', '02-initial-events', 'First orchestration events appearing');
    
    // Expand all event details
    await expandAllSections(devToolkitPage, 'events');
    
    // Screenshot 9: Expanded events
    await screenshot(devToolkitPage, 'orchestration', '03-events-expanded', 'All event details expanded');
    
    // ============================================================
    // PART 6: AGENT CONTEXTS
    // ============================================================
    console.log('\n📋 PART 6: Agent Context Details\n');
    
    // Look for agent cards and expand them
    const agentCards = await devToolkitPage.$$('.agent-card, [data-testid*="agent"], .card:has-text("Agent")');
    console.log(`Found ${agentCards.length} agent cards`);
    
    for (let i = 0; i < agentCards.length; i++) {
      try {
        // Click to expand
        await agentCards[i].click();
        await devToolkitPage.waitForTimeout(500);
        
        // Expand all subsections
        await expandAllSections(devToolkitPage, `agent-${i}`);
        
        // Screenshot each agent's full context
        await screenshot(devToolkitPage, 'agent-contexts', `agent-${i + 1}-expanded`, `Agent ${i + 1} with full context expanded`);
      } catch (e) {
        console.log(`Could not expand agent ${i + 1}`);
      }
    }
    
    // ============================================================
    // PART 7: TASK TIMELINE
    // ============================================================
    console.log('\n📋 PART 7: Task Timeline and Progress\n');
    
    // Scroll to timeline if present
    const timeline = await devToolkitPage.$('.timeline, [data-testid="task-timeline"]');
    if (timeline) {
      await timeline.scrollIntoViewIfNeeded();
      await devToolkitPage.waitForTimeout(500);
    }
    
    // Screenshot 10: Task timeline
    await screenshot(devToolkitPage, 'orchestration', '04-task-timeline', 'Task execution timeline');
    
    // ============================================================
    // PART 8: USER DASHBOARD - ONBOARDING CARD
    // ============================================================
    console.log('\n📋 PART 8: User Dashboard - Onboarding Card\n');
    
    // Switch back to main dashboard
    await mainPage.bringToFront();
    await mainPage.reload({ waitUntil: 'networkidle2' });
    await mainPage.waitForTimeout(2000);
    
    // Look for onboarding card
    console.log('🔍 Looking for onboarding task card...');
    
    // Screenshot 11: Dashboard with task
    await screenshot(mainPage, 'user-dashboard', '05-dashboard-with-task', 'Dashboard showing onboarding task');
    
    // Find and expand onboarding card
    const onboardingCard = await mainPage.$('.task-card, [data-testid*="onboarding"], .card:has-text("Onboarding")');
    if (onboardingCard) {
      await onboardingCard.click();
      await mainPage.waitForTimeout(500);
      
      // Expand all sections in the card
      await expandAllSections(mainPage, 'onboarding-card');
      
      // Screenshot 12: Expanded onboarding card
      await screenshot(mainPage, 'user-dashboard', '06-onboarding-card-expanded', 'Onboarding card fully expanded with all details');
    }
    
    // ============================================================
    // PART 9: ORCHESTRATION PROGRESS
    // ============================================================
    console.log('\n📋 PART 9: Orchestration Progress Updates\n');
    
    // Switch back to Dev Toolkit
    await devToolkitPage.bringToFront();
    
    // Wait for more events
    for (let i = 0; i < 3; i++) {
      await devToolkitPage.waitForTimeout(5000);
      await devToolkitPage.reload({ waitUntil: 'networkidle2' });
      await devToolkitPage.waitForTimeout(2000);
      
      // Expand new events
      await expandAllSections(devToolkitPage, `progress-${i}`);
      
      // Screenshot progress
      await screenshot(devToolkitPage, 'orchestration', `05-progress-${i + 1}`, `Orchestration progress update ${i + 1}`);
    }
    
    // ============================================================
    // PART 10: FINAL STATE
    // ============================================================
    console.log('\n📋 PART 10: Final State Documentation\n');
    
    // Final Dev Toolkit state
    await screenshot(devToolkitPage, 'dev-toolkit', '03-final-state', 'Dev Toolkit final state with all orchestration');
    
    // Final Dashboard state
    await mainPage.bringToFront();
    await mainPage.reload({ waitUntil: 'networkidle2' });
    await mainPage.waitForTimeout(2000);
    await screenshot(mainPage, 'user-dashboard', '07-final-state', 'User dashboard final state');
    
    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ E2E TEST COMPLETE - ALL SCREENSHOTS CAPTURED');
    console.log('════════════════════════════════════════════════════════════\n');
    
    console.log('📁 Screenshots saved to:', testRunDir);
    console.log('\nCategories captured:');
    console.log('  • user-dashboard/ - User-facing UI and onboarding card');
    console.log('  • dev-toolkit/ - Developer toolkit interface');
    console.log('  • orchestration/ - Real-time orchestration events');
    console.log('  • agent-contexts/ - Expanded agent context details');
    
    // Create summary file
    const summary = {
      testRun: timestamp,
      testUser: CONFIG.testEmail,
      businessName: CONFIG.businessName,
      categories: {
        'user-dashboard': fs.readdirSync(path.join(testRunDir, 'user-dashboard')).length,
        'dev-toolkit': fs.readdirSync(path.join(testRunDir, 'dev-toolkit')).length,
        'orchestration': fs.readdirSync(path.join(testRunDir, 'orchestration')).length,
        'agent-contexts': fs.readdirSync(path.join(testRunDir, 'agent-contexts')).length
      },
      totalScreenshots: 0
    };
    
    summary.totalScreenshots = Object.values(summary.categories).reduce((a, b) => a + b, 0);
    
    fs.writeFileSync(
      path.join(testRunDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log(`\n📊 Total screenshots captured: ${summary.totalScreenshots}`);
    console.log('\n🎯 View screenshots:');
    console.log(`   open ${testRunDir}`);
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    
    // Take error screenshot
    if (mainPage) {
      await screenshot(mainPage, 'errors', 'main-page-error', 'Main page at time of error');
    }
    if (devToolkitPage) {
      await screenshot(devToolkitPage, 'errors', 'dev-toolkit-error', 'Dev toolkit at time of error');
    }
    
    process.exit(1);
  } finally {
    // Keep browser open for inspection if needed
    console.log('\n💡 Browser will close in 10 seconds (or press Ctrl+C)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  runFullE2ETest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runFullE2ETest };