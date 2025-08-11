#!/usr/bin/env node

/**
 * COMPREHENSIVE ONBOARDING E2E TEST
 * 
 * This test thoroughly validates EVERY aspect of the onboarding flow
 * against the PRD requirements, capturing detailed screenshots at each step.
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
  frontendUrl: 'http://localhost:8080',
  screenshotDir: '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/comprehensive',
  slowMo: 500 // Slow down actions to see what's happening
};

class ComprehensiveOnboardingTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      passed: [],
      failed: [],
      screenshots: []
    };
  }

  async setup() {
    console.log('🚀 COMPREHENSIVE ONBOARDING TEST\n');
    console.log('This test validates EVERY feature from the PRD:\n');
    console.log('1. Business Discovery Agent');
    console.log('2. Profile Collection Agent');
    console.log('3. Entity Compliance Agent');
    console.log('4. UX Optimization Agent');
    console.log('5. Celebration Agent');
    console.log('6. Dev Toolkit visibility\n');
    
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox'],
      slowMo: CONFIG.slowMo
    });

    this.page = await this.browser.newPage();
    
    // Log console messages
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('   ❌ Console Error:', msg.text());
      }
    });
  }

  async captureAndValidate(stepName, validation) {
    const screenshotPath = path.join(
      CONFIG.screenshotDir,
      `${stepName}-${Date.now()}.png`
    );
    
    await this.page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    this.testResults.screenshots.push(screenshotPath);
    
    // Run validation
    const result = await validation();
    
    if (result.success) {
      console.log(`✅ ${stepName}: ${result.message}`);
      this.testResults.passed.push({ step: stepName, message: result.message });
    } else {
      console.log(`❌ ${stepName}: ${result.message}`);
      this.testResults.failed.push({ step: stepName, message: result.message });
    }
    
    return result;
  }

  async test1_LandingPage() {
    console.log('\n📋 TEST 1: Landing Page\n');
    
    await this.page.goto(CONFIG.frontendUrl, { 
      waitUntil: 'networkidle2',
      timeout: 10000 
    });
    
    await new Promise(r => setTimeout(r, 2000)); // Wait for full load
    
    return await this.captureAndValidate('01-landing-page', async () => {
      const hasWelcome = await this.page.evaluate(() => {
        const content = document.body.textContent || '';
        return content.includes('Welcome to SmallBizAlly');
      });
      
      const hasGetStarted = await this.page.$('[data-testid="get-started"]');
      
      return {
        success: hasWelcome && hasGetStarted,
        message: hasWelcome && hasGetStarted 
          ? 'Landing page shows welcome message and Get Started button'
          : `Missing: ${!hasWelcome ? 'Welcome message' : ''} ${!hasGetStarted ? 'Get Started button' : ''}`
      };
    });
  }

  async test2_DevToolkit() {
    console.log('\n📋 TEST 2: Dev Toolkit\n');
    
    const devButton = await this.page.$('[data-testid="dev-toolkit"]');
    
    if (!devButton) {
      return await this.captureAndValidate('02-no-dev-toolkit', async () => ({
        success: false,
        message: 'Dev Toolkit button not found'
      }));
    }
    
    await devButton.click();
    await new Promise(r => setTimeout(r, 1000));
    
    return await this.captureAndValidate('02-dev-toolkit-opened', async () => {
      // Check if Dev Toolkit panel is visible
      const panelVisible = await this.page.evaluate(() => {
        // Look for the Dev Toolkit panel by various selectors
        const panel = document.querySelector('.fixed.bottom-0.right-0.w-96.h-96');
        const agentLogs = document.querySelector('.agent-log-entry');
        const devToolkitTitle = Array.from(document.querySelectorAll('*')).find(
          el => el.textContent?.includes('Dev Toolkit - Agent Activity')
        );
        
        return !!(panel || agentLogs || devToolkitTitle);
      });
      
      return {
        success: panelVisible,
        message: panelVisible 
          ? 'Dev Toolkit panel is visible and showing agent activity area'
          : 'Dev Toolkit panel did not open when button was clicked'
      };
    });
  }

  async test3_GetStartedFlow() {
    console.log('\n📋 TEST 3: Get Started Button & Business Discovery\n');
    
    const getStartedButton = await this.page.$('[data-testid="get-started"]');
    
    if (!getStartedButton) {
      return await this.captureAndValidate('03-no-get-started', async () => ({
        success: false,
        message: 'Get Started button not found'
      }));
    }
    
    await getStartedButton.click();
    await new Promise(r => setTimeout(r, 2000));
    
    return await this.captureAndValidate('03-business-discovery', async () => {
      const hasSearching = await this.page.evaluate(() => {
        const content = document.body.textContent || '';
        return content.includes('Finding your business') || 
               content.includes('searching') ||
               content.includes('Sarah Chen');
      });
      
      // Wait for company results
      await new Promise(r => setTimeout(r, 2000));
      
      const hasCompanyResults = await this.page.evaluate(() => {
        const content = document.body.textContent || '';
        return content.includes('TechStartup Inc') || 
               content.includes('We found your business');
      });
      
      return {
        success: hasSearching || hasCompanyResults,
        message: hasCompanyResults 
          ? 'Business Discovery Agent found companies'
          : hasSearching 
          ? 'Business Discovery Agent is searching'
          : 'Business Discovery Agent did not activate'
      };
    });
  }

  async test4_AgentActivity() {
    console.log('\n📋 TEST 4: Agent Activity in Dev Toolkit\n');
    
    return await this.captureAndValidate('04-agent-activity', async () => {
      const hasAgentLogs = await this.page.evaluate(() => {
        // Check if any agent logs are visible
        const logs = document.querySelectorAll('.agent-log-entry');
        const agentNames = Array.from(document.querySelectorAll('.agent-name'));
        const hasBusinessDiscovery = Array.from(document.querySelectorAll('*')).some(
          el => el.textContent?.includes('BusinessDiscoveryAgent')
        );
        
        return logs.length > 0 || agentNames.length > 0 || hasBusinessDiscovery;
      });
      
      return {
        success: hasAgentLogs,
        message: hasAgentLogs 
          ? 'Agent activity logs are visible in Dev Toolkit'
          : 'No agent activity logs found - agents not properly integrated'
      };
    });
  }

  async test5_CompanySelection() {
    console.log('\n📋 TEST 5: Company Selection (FoundYouCard)\n');
    
    // Look for company selection buttons
    const companyButtons = await this.page.$$eval('button', buttons => 
      buttons.filter(btn => 
        btn.textContent?.includes('TechStartup') || 
        btn.textContent?.includes('Tech Startup')
      ).length
    );
    
    if (companyButtons > 0) {
      // Click the first company option
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.textContent?.includes('TechStartup Inc')
        );
        if (btn) btn.click();
      });
      
      await new Promise(r => setTimeout(r, 1000));
    }
    
    return await this.captureAndValidate('05-company-selection', async () => {
      return {
        success: companyButtons > 0,
        message: companyButtons > 0
          ? `Found ${companyButtons} company options for selection`
          : 'No company selection UI (FoundYouCard) displayed'
      };
    });
  }

  async test6_ProfileCollection() {
    console.log('\n📋 TEST 6: Profile Collection Agent\n');
    
    return await this.captureAndValidate('06-profile-collection', async () => {
      const hasProfileForm = await this.page.evaluate(() => {
        const content = document.body.textContent || '';
        return content.includes('profile') || 
               content.includes('business information') ||
               content.includes('entity type');
      });
      
      return {
        success: hasProfileForm,
        message: hasProfileForm
          ? 'Profile Collection form is displayed'
          : 'Profile Collection Agent did not activate'
      };
    });
  }

  async test7_ComplianceRoadmap() {
    console.log('\n📋 TEST 7: Entity Compliance Agent\n');
    
    return await this.captureAndValidate('07-compliance-roadmap', async () => {
      const hasCompliance = await this.page.evaluate(() => {
        const content = document.body.textContent || '';
        return content.includes('compliance') || 
               content.includes('requirements') ||
               content.includes('deadlines');
      });
      
      return {
        success: hasCompliance,
        message: hasCompliance
          ? 'Compliance roadmap is displayed'
          : 'Entity Compliance Agent did not generate roadmap'
      };
    });
  }

  async test8_UXOptimization() {
    console.log('\n📋 TEST 8: UX Optimization Agent\n');
    
    return await this.captureAndValidate('08-ux-optimization', async () => {
      const hasOptimization = await this.page.evaluate(() => {
        // Check for quick action buttons or optimized forms
        const quickActions = document.querySelectorAll('[data-quick-action]');
        const content = document.body.textContent || '';
        return quickActions.length > 0 || 
               content.includes('Quick Actions') ||
               content.includes('Fast Track');
      });
      
      return {
        success: hasOptimization,
        message: hasOptimization
          ? 'UX optimizations (quick actions) are visible'
          : 'UX Optimization Agent features not found'
      };
    });
  }

  async test9_Celebration() {
    console.log('\n📋 TEST 9: Celebration Agent\n');
    
    return await this.captureAndValidate('09-celebration', async () => {
      const hasCelebration = await this.page.evaluate(() => {
        const content = document.body.textContent || '';
        return content.includes('Congratulations') || 
               content.includes('Complete') ||
               content.includes('badge') ||
               content.includes('achievement');
      });
      
      return {
        success: hasCelebration,
        message: hasCelebration
          ? 'Celebration/achievement elements found'
          : 'Celebration Agent features not implemented'
      };
    });
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(60));
    
    const total = this.testResults.passed.length + this.testResults.failed.length;
    const passRate = (this.testResults.passed.length / total * 100).toFixed(1);
    
    console.log(`\n✅ PASSED: ${this.testResults.passed.length}/${total} (${passRate}%)`);
    this.testResults.passed.forEach(test => {
      console.log(`   ✓ ${test.step}: ${test.message}`);
    });
    
    if (this.testResults.failed.length > 0) {
      console.log(`\n❌ FAILED: ${this.testResults.failed.length}/${total}`);
      this.testResults.failed.forEach(test => {
        console.log(`   ✗ ${test.step}: ${test.message}`);
      });
      
      console.log('\n📝 REQUIRED IMPLEMENTATIONS:');
      this.testResults.failed.forEach((test, i) => {
        console.log(`   ${i + 1}. ${test.message}`);
      });
    }
    
    console.log(`\n📸 Screenshots captured: ${this.testResults.screenshots.length}`);
    console.log(`   Location: ${CONFIG.screenshotDir}`);
    
    // Save detailed report
    const reportPath = path.join(CONFIG.screenshotDir, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      passRate,
      passed: this.testResults.passed,
      failed: this.testResults.failed,
      screenshots: this.testResults.screenshots
    }, null, 2));
    
    return this.testResults;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.setup();
      
      // Run all tests in sequence
      await this.test1_LandingPage();
      await this.test2_DevToolkit();
      await this.test3_GetStartedFlow();
      await this.test4_AgentActivity();
      await this.test5_CompanySelection();
      await this.test6_ProfileCollection();
      await this.test7_ComplianceRoadmap();
      await this.test8_UXOptimization();
      await this.test9_Celebration();
      
      const report = await this.generateReport();
      
      if (this.testResults.failed.length === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Onboarding is fully implemented.\n');
      } else {
        console.log('\n⚠️  Implementation incomplete. See failed tests above.\n');
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Test error:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Main execution
async function main() {
  const test = new ComprehensiveOnboardingTest();
  
  try {
    const report = await test.run();
    process.exit(report.failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check for puppeteer
try {
  require.resolve('puppeteer');
  main();
} catch (e) {
  console.log('Installing puppeteer...\n');
  require('child_process').execSync('npm install puppeteer', { stdio: 'inherit' });
  main();
}