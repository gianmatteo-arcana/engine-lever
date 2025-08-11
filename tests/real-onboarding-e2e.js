#!/usr/bin/env node

/**
 * REAL E2E Onboarding Test - Demo-Driven Development
 * 
 * This test runs against REAL services and captures ACTUAL screenshots.
 * When it fails, we implement the missing functionality.
 * 
 * Services required:
 * - Frontend: http://localhost:8081
 * - Backend: http://localhost:3001
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Configuration for real services
const CONFIG = {
  frontendUrl: 'http://localhost:8080',
  backendUrl: 'http://localhost:3001',
  screenshotDir: '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/real-e2e',
  testUser: {
    email: 'sarah.chen@techstartup.com',
    password: 'Test123!@#',
    name: 'Sarah Chen',
    business: 'TechStartup Inc.'
  }
};

class RealOnboardingE2E {
  constructor() {
    this.browser = null;
    this.page = null;
    this.devToolsPage = null;
    this.stepCounter = 0;
    this.failures = [];
  }

  async setup() {
    console.log('🚀 Starting REAL E2E Test (Demo-Driven Development)\n');
    console.log('Services:');
    console.log(`  Frontend: ${CONFIG.frontendUrl}`);
    console.log(`  Backend: ${CONFIG.backendUrl}\n`);
    
    // Create screenshot directory
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    
    // Launch browser
    this.browser = await puppeteer.launch({
      headless: false, // Show browser for debugging
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    
    // Set up console logging to see errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Browser Error:', msg.text());
      }
    });

    this.page.on('pageerror', error => {
      console.log('❌ Page Error:', error.message);
    });
  }

  async captureScreenshot(stepName, description) {
    this.stepCounter++;
    const timestamp = Date.now();
    const screenshotPath = path.join(
      CONFIG.screenshotDir,
      `${String(this.stepCounter).padStart(2, '0')}-${stepName}-${timestamp}.png`
    );
    
    console.log(`📸 Step ${this.stepCounter}: ${description}`);
    
    try {
      await this.page.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });
      console.log(`   ✅ Screenshot saved: ${stepName}.png\n`);
    } catch (error) {
      console.log(`   ❌ Failed to capture screenshot: ${error.message}\n`);
    }
    
    return screenshotPath;
  }

  async checkBackendHealth() {
    console.log('🔍 Checking backend health...');
    try {
      const response = await this.page.evaluate(async (url) => {
        const res = await fetch(`${url}/health`);
        return { status: res.status, ok: res.ok };
      }, CONFIG.backendUrl);
      
      if (response.ok) {
        console.log('   ✅ Backend is healthy\n');
        return true;
      }
    } catch (error) {
      console.log(`   ❌ Backend health check failed: ${error.message}\n`);
      this.failures.push('Backend not responding');
      return false;
    }
  }

  async navigateToFrontend() {
    console.log('🌐 Navigating to frontend...');
    try {
      await this.page.goto(CONFIG.frontendUrl, { 
        waitUntil: 'networkidle2',
        timeout: 10000 
      });
      await this.captureScreenshot('landing', 'Frontend landing page');
      console.log('   ✅ Frontend loaded\n');
      return true;
    } catch (error) {
      console.log(`   ❌ Failed to load frontend: ${error.message}\n`);
      this.failures.push('Frontend not accessible');
      return false;
    }
  }

  async lookForOnboardingUI() {
    console.log('🔍 Looking for onboarding UI elements...');
    
    // Wait a bit for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for various possible onboarding entry points
    const selectors = [
      '[data-testid="get-started"]',
      '[data-testid="start-onboarding"]',
      'button:has-text("Get Started")',
      'button:has-text("Sign Up")',
      'a[href*="onboarding"]',
      '.onboarding-button',
      '#start-onboarding'
    ];

    // Also check for text content
    const pageContent = await this.page.content();
    console.log('   Page contains "Welcome to SmallBizAlly":', pageContent.includes('Welcome to SmallBizAlly'));
    console.log('   Page contains "Get Started":', pageContent.includes('Get Started'));

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          console.log(`   ✅ Found onboarding element: ${selector}\n`);
          await this.captureScreenshot('onboarding-found', `Found onboarding UI element: ${selector}`);
          return true;
        }
      } catch (e) {
        // Continue checking other selectors
      }
    }
    
    // Try evaluating for button with text
    const hasGetStartedButton = await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent?.includes('Get Started'));
    });
    
    if (hasGetStartedButton) {
      console.log(`   ✅ Found Get Started button via text search\n`);
      await this.captureScreenshot('onboarding-found', 'Found Get Started button');
      return true;
    }

    // If no onboarding UI found, capture current state
    await this.captureScreenshot('no-onboarding', 'No onboarding UI found - needs implementation');
    console.log('   ❌ No onboarding UI elements found\n');
    this.failures.push('Onboarding UI not implemented');
    return false;
  }

  async checkForDevToolkit() {
    console.log('🔍 Looking for Dev Toolkit...');
    
    // Try to open Dev Toolkit
    const devToolkitSelectors = [
      '[data-testid="dev-toolkit"]',
      '[data-testid="toggle-dev-tools"]',
      '.dev-toolkit-toggle',
      'button:has-text("Dev Tools")',
      'button:has-text("Developer")'
    ];

    for (const selector of devToolkitSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          console.log(`   ✅ Found Dev Toolkit toggle: ${selector}`);
          await element.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.captureScreenshot('dev-toolkit-opened', 'Dev Toolkit panel opened');
          
          // Check if the panel actually opened
          const panelVisible = await this.page.evaluate(() => {
            const panels = document.querySelectorAll('.agent-log-entry, .dev-toolkit, .dev-panel');
            return panels.length > 0;
          });
          
          if (panelVisible) {
            console.log('   ✅ Dev Toolkit panel is visible\n');
          } else {
            console.log('   ⚠️ Dev Toolkit button clicked but panel not visible\n');
          }
          return true;
        }
      } catch (e) {
        // Continue checking
      }
    }

    // Try keyboard shortcut
    try {
      await this.page.keyboard.down('Control');
      await this.page.keyboard.down('Shift');
      await this.page.keyboard.press('D');
      await this.page.keyboard.up('Shift');
      await this.page.keyboard.up('Control');
      await this.page.waitForTimeout(1000);
      
      // Check if dev toolkit appeared
      const devPanel = await this.page.$('.dev-toolkit, .dev-panel, #dev-toolkit');
      if (devPanel) {
        console.log('   ✅ Dev Toolkit opened via keyboard shortcut\n');
        await this.captureScreenshot('dev-toolkit-keyboard', 'Dev Toolkit via Ctrl+Shift+D');
        return true;
      }
    } catch (e) {
      // Keyboard shortcut didn't work
    }

    console.log('   ❌ Dev Toolkit not found\n');
    this.failures.push('Dev Toolkit UI not implemented');
    return false;
  }

  async attemptAuthentication() {
    console.log('🔐 Attempting authentication...');
    
    // Look for login/signup forms
    const emailInput = await this.page.$('input[type="email"], input[name="email"]');
    const passwordInput = await this.page.$('input[type="password"]');
    
    if (emailInput && passwordInput) {
      console.log('   ✅ Found authentication form\n');
      
      // Fill in credentials
      await emailInput.type(CONFIG.testUser.email);
      await passwordInput.type(CONFIG.testUser.password);
      
      await this.captureScreenshot('auth-filled', 'Authentication form filled');
      
      // Look for submit button
      const submitButton = await this.page.$('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
      if (submitButton) {
        await submitButton.click();
        await this.page.waitForTimeout(2000);
        await this.captureScreenshot('auth-submitted', 'Authentication submitted');
        return true;
      }
    }
    
    console.log('   ⚠️  No authentication form found\n');
    return false;
  }

  async checkAgentIntegration() {
    console.log('🤖 Checking for agent integration...');
    
    // Look for any agent-related UI elements
    const agentSelectors = [
      '.agent-status',
      '.agent-log',
      '[data-agent]',
      '.business-discovery',
      '.profile-collection',
      '.compliance-agent'
    ];

    for (const selector of agentSelectors) {
      const element = await this.page.$(selector);
      if (element) {
        console.log(`   ✅ Found agent UI: ${selector}\n`);
        await this.captureScreenshot('agent-ui', `Agent UI element found: ${selector}`);
        return true;
      }
    }

    console.log('   ❌ No agent UI integration found\n');
    this.failures.push('Agent UI not integrated');
    return false;
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEMO-DRIVEN DEVELOPMENT REPORT');
    console.log('='.repeat(60));
    
    const totalSteps = this.stepCounter;
    const failureCount = this.failures.length;
    const successRate = ((totalSteps - failureCount) / totalSteps * 100).toFixed(1);
    
    console.log('\nTest Statistics:');
    console.log(`  Total Steps: ${totalSteps}`);
    console.log(`  Screenshots Captured: ${totalSteps}`);
    console.log(`  Success Rate: ${successRate}%`);
    
    if (this.failures.length > 0) {
      console.log('\n❌ Missing Implementations:');
      this.failures.forEach((failure, index) => {
        console.log(`  ${index + 1}. ${failure}`);
      });
      
      console.log('\n📝 Next Steps (Demo-Driven Development):');
      console.log('  1. Implement the missing UI components listed above');
      console.log('  2. Connect the agents to the frontend');
      console.log('  3. Add Dev Toolkit for agent visibility');
      console.log('  4. Re-run this test to verify implementation');
      console.log('  5. Iterate until all tests pass');
    } else {
      console.log('\n✅ All implementations complete!');
      console.log('  The onboarding flow is fully functional');
    }
    
    console.log('\n📁 Screenshots saved to:');
    console.log(`  ${CONFIG.screenshotDir}\n`);
    
    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      totalSteps,
      screenshotCount: totalSteps,
      successRate: `${successRate}%`,
      failures: this.failures,
      screenshotDir: CONFIG.screenshotDir
    };
    
    const reportPath = path.join(CONFIG.screenshotDir, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    return report;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.setup();
      
      // Run test sequence
      const backendOk = await this.checkBackendHealth();
      if (!backendOk) {
        console.log('⚠️  Backend not available - some tests may fail\n');
      }
      
      const frontendOk = await this.navigateToFrontend();
      if (!frontendOk) {
        throw new Error('Frontend not accessible - cannot continue');
      }
      
      // Try to find and interact with onboarding
      const hasOnboarding = await this.lookForOnboardingUI();
      
      // Try authentication
      const authenticated = await this.attemptAuthentication();
      
      // Check for Dev Toolkit
      const hasDevToolkit = await this.checkForDevToolkit();
      
      // Check for agent integration
      const hasAgents = await this.checkAgentIntegration();
      
      // If we found onboarding UI, try to interact with it
      if (hasOnboarding) {
        console.log('🎯 Attempting full onboarding flow...\n');
        
        // Click Get Started button
        const getStartedButton = await this.page.$('[data-testid="get-started"]');
        if (getStartedButton) {
          console.log('   Clicking Get Started button...');
          await getStartedButton.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          await this.captureScreenshot('onboarding-started', 'Onboarding flow started');
          
          // Check if we see the company search
          const hasCompanySearch = await this.page.evaluate(() => {
            const content = document.body.textContent || '';
            return content.includes('Finding your business') || content.includes('We found your business');
          });
          
          if (hasCompanySearch) {
            console.log('   ✅ Business Discovery Agent activated\n');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.captureScreenshot('business-discovery', 'Business Discovery in progress');
            
            // Look for company selection
            const companyButtons = await this.page.$$('button');
            for (const button of companyButtons) {
              const text = await button.evaluate(el => el.textContent);
              if (text?.includes('TechStartup Inc')) {
                console.log('   ✅ Found business - clicking to confirm');
                await button.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.captureScreenshot('business-confirmed', 'Business confirmed');
                break;
              }
            }
          }
        }
      }
      
      // Generate report
      const report = await this.generateReport();
      
      if (this.failures.length > 0) {
        console.log('⚠️  Demo-Driven Development: Implementation needed!\n');
        console.log('This is expected - now implement the missing pieces.\n');
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Test error:', error.message);
      await this.captureScreenshot('error', `Error: ${error.message}`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Main execution
async function main() {
  console.log('=' .repeat(60));
  console.log('  REAL E2E ONBOARDING TEST');
  console.log('  Demo-Driven Development Approach');
  console.log('=' .repeat(60) + '\n');
  
  const test = new RealOnboardingE2E();
  
  try {
    const report = await test.run();
    
    if (report.failures.length > 0) {
      // Exit with non-zero to indicate work needed
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check if puppeteer is installed
try {
  require.resolve('puppeteer');
  main();
} catch (e) {
  console.log('📦 Installing puppeteer for browser automation...\n');
  require('child_process').execSync('npm install puppeteer', { stdio: 'inherit' });
  console.log('\n✅ Puppeteer installed. Re-running test...\n');
  main();
}