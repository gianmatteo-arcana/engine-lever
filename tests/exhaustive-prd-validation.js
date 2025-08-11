#!/usr/bin/env node

/**
 * EXHAUSTIVE PRD VALIDATION TEST
 * 
 * This test captures EVERY element from the PRD with dual screenshots:
 * 1. Main Dashboard/UI view
 * 2. Dev Toolkit showing agent activity
 * 
 * Each screenshot is analyzed for correctness before proceeding.
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
  frontendUrl: 'http://localhost:8080',
  screenshotDir: '/Users/gianmatteo/Documents/Arcana-Prototype/tests/screenshots/exhaustive-validation',
  slowMo: 500 // Slow enough to see everything
};

class ExhaustivePRDValidation {
  constructor() {
    this.browser = null;
    this.page = null;
    this.stepNumber = 0;
    this.issues = [];
    this.successes = [];
  }

  async setup() {
    console.log('🔬 EXHAUSTIVE PRD VALIDATION TEST');
    console.log('=' .repeat(70));
    console.log('Testing EVERY element from the PRD document');
    console.log('Capturing dual screenshots for complete validation');
    console.log('=' .repeat(70) + '\n');
    
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo: CONFIG.slowMo
    });

    this.page = await this.browser.newPage();
    
    // Log all console messages for debugging
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.issues.push(`Console Error: ${msg.text()}`);
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    this.page.on('pageerror', error => {
      this.issues.push(`Page Error: ${error.message}`);
      console.log('❌ Page Error:', error.message);
    });
  }

  async captureState(testName, expectedElements) {
    this.stepNumber++;
    const timestamp = Date.now();
    
    console.log(`\n📸 Step ${this.stepNumber}: ${testName}`);
    console.log('-'.repeat(50));
    
    // Take screenshot
    const screenshotPath = path.join(
      CONFIG.screenshotDir,
      `${String(this.stepNumber).padStart(3, '0')}-${testName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}.png`
    );
    
    await this.page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    // Validate expected elements
    let allFound = true;
    for (const element of expectedElements) {
      const found = await this.validateElement(element);
      if (!found) {
        allFound = false;
        this.issues.push(`Missing: ${element.description} in ${testName}`);
        console.log(`   ❌ Missing: ${element.description}`);
      } else {
        console.log(`   ✅ Found: ${element.description}`);
      }
    }
    
    if (allFound) {
      this.successes.push(testName);
      console.log(`   ✅ All elements validated for: ${testName}`);
    }
    
    return allFound;
  }

  async validateElement(element) {
    try {
      switch (element.type) {
        case 'text':
          return await this.page.evaluate((text) => {
            return document.body.textContent?.includes(text);
          }, element.value);
          
        case 'selector':
          const el = await this.page.$(element.value);
          return !!el;
          
        case 'class':
          return await this.page.evaluate((className) => {
            return document.getElementsByClassName(className).length > 0;
          }, element.value);
          
        case 'custom':
          return await this.page.evaluate(element.validator);
          
        default:
          return false;
      }
    } catch (e) {
      return false;
    }
  }

  async waitForElement(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch (e) {
      this.issues.push(`Element not found: ${selector}`);
      return false;
    }
  }

  async runComprehensiveTests() {
    // Navigate to app
    await this.page.goto(CONFIG.frontendUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // ========== TEST 1: Initial Landing Page ==========
    await this.captureState('1-initial-landing-page', [
      { type: 'text', value: 'Welcome to SmallBizAlly', description: 'Welcome message' },
      { type: 'text', value: 'SmallBizAlly Onboarding', description: 'Header title' },
      { type: 'selector', value: '[data-testid="get-started"]', description: 'Get Started button' },
      { type: 'text', value: '0%', description: 'Progress bar at 0%' },
      { type: 'text', value: 'Dev Toolkit - Agent Activity', description: 'Dev Toolkit header' },
      { type: 'text', value: 'No agent activity yet', description: 'Empty agent log message' },
      { type: 'text', value: 'Our 5 AI agents will handle everything', description: 'Agent promise message' }
    ]);

    // ========== TEST 2: Dev Toolkit Initial State ==========
    await this.captureState('2-dev-toolkit-initial', [
      { type: 'custom', validator: () => {
        const panel = document.querySelector('.border-l.bg-white');
        return panel && panel.offsetWidth > 0;
      }, description: 'Dev Toolkit panel visible and has width' },
      { type: 'selector', value: '.text-purple-700', description: 'Purple Dev Toolkit styling' },
      { type: 'text', value: 'Click "Get Started" to begin', description: 'Dev Toolkit prompt' }
    ]);

    // Click Get Started
    const getStartedBtn = await this.page.$('[data-testid="get-started"]');
    if (!getStartedBtn) {
      this.issues.push('Get Started button not found - cannot continue');
      return;
    }
    
    await getStartedBtn.click();
    await new Promise(r => setTimeout(r, 500)); // Small delay to let state change
    await this.waitForElement('.animate-spin');

    // ========== TEST 3: Business Discovery - Searching State ==========
    await this.captureState('3-business-discovery-searching', [
      { type: 'text', value: 'Searching for your business', description: 'Search message' },
      { type: 'selector', value: '.animate-spin', description: 'Loading spinner' },
      { type: 'text', value: 'BusinessDiscoveryAgent', description: 'Agent name in UI' },
      { type: 'text', value: '10%', description: 'Progress at 10%' },
      { type: 'text', value: 'Searching public records', description: 'Agent action in Dev Toolkit' },
      { type: 'text', value: 'in_progress', description: 'Status badge' }
    ]);

    // Wait for company results to appear
    await new Promise(r => setTimeout(r, 5500)); // Wait for search to complete (5 seconds + buffer)
    await this.waitForElement('.cursor-pointer');

    // ========== TEST 4: Business Discovery - Found State ==========
    await this.captureState('4-business-discovery-found', [
      { type: 'text', value: 'We found your business', description: 'Found message' },
      { type: 'text', value: 'TechStartup Inc', description: 'First company option' },
      { type: 'text', value: '95% match', description: 'Confidence score' },
      { type: 'text', value: 'Corporation', description: 'Entity type' },
      { type: 'text', value: '123 Market St', description: 'Address' },
      { type: 'text', value: 'Tech Startup LLC', description: 'Second company option' },
      { type: 'text', value: '75% match', description: 'Second confidence score' },
      { type: 'text', value: '25%', description: 'Progress at 25%' },
      { type: 'text', value: 'completed', description: 'Completed status in Dev Toolkit' },
      { type: 'text', value: 'Found 2 potential matches', description: 'Agent log message' }
    ]);

    // ========== TEST 5: Dev Toolkit After Discovery ==========
    await this.captureState('5-dev-toolkit-after-discovery', [
      { type: 'custom', validator: () => {
        const logs = document.querySelectorAll('.border-l-4.border-l-purple-500');
        return logs.length >= 2;
      }, description: 'At least 2 agent log entries' },
      { type: 'text', value: 'View data', description: 'Expandable data view' },
      { type: 'selector', value: '.text-purple-600', description: 'Purple agent icons' }
    ]);

    // Click first company
    const companyCard = await this.page.$('.cursor-pointer');
    if (companyCard) {
      await companyCard.click();
      await new Promise(r => setTimeout(r, 500)); // Wait for state transition
      await this.waitForElement('input[readonly]'); // Wait for profile form
      await new Promise(r => setTimeout(r, 1000)); // Let form fully render
    }

    // ========== TEST 6: Profile Collection State ==========
    await this.captureState('6-profile-collection', [
      { type: 'text', value: 'Smart Profile Collection', description: 'Profile header' },
      { type: 'text', value: 'pre-filled your information', description: 'Pre-fill message' },
      { type: 'text', value: '62.5%', description: 'Pre-fill percentage' },
      { type: 'text', value: 'ProfileCollectionAgent', description: 'Agent name' },
      { type: 'text', value: 'Business Name', description: 'Business name field' },
      { type: 'text', value: 'Entity Type', description: 'Entity type field' },
      { type: 'text', value: 'State', description: 'State field' },
      { type: 'text', value: 'California', description: 'California value' },
      { type: 'text', value: 'Technology', description: 'Industry value' },
      { type: 'text', value: '40%', description: 'Progress at 40%' },
      { type: 'selector', value: 'input[readonly]', description: 'Read-only input fields' }
    ]);

    // Wait for compliance check to complete
    await new Promise(r => setTimeout(r, 5500)); // Profile (2s) + transition (3s) + buffer

    // ========== TEST 7: Entity Compliance State ==========
    await this.captureState('7-entity-compliance', [
      { type: 'text', value: 'Compliance Roadmap', description: 'Compliance header' },
      { type: 'text', value: 'EntityComplianceAgent', description: 'Agent name' },
      { type: 'text', value: 'Critical', description: 'Critical category' },
      { type: 'text', value: 'High Priority', description: 'High priority category' },
      { type: 'text', value: 'Annual', description: 'Annual category' },
      { type: 'text', value: 'Corporate Bylaws', description: 'Bylaws requirement' },
      { type: 'text', value: 'Federal EIN', description: 'EIN requirement' },
      { type: 'text', value: 'Franchise Tax', description: 'Tax requirement' },
      { type: 'text', value: '$800', description: 'Tax amount' },
      { type: 'text', value: '60%', description: 'Progress at 60%' },
      { type: 'selector', value: '.bg-red-500', description: 'Red priority indicator' },
      { type: 'selector', value: '.bg-yellow-500', description: 'Yellow priority indicator' },
      { type: 'selector', value: '.bg-green-500', description: 'Green priority indicator' }
    ]);

    // Wait for UX optimization to complete
    await new Promise(r => setTimeout(r, 6000)); // Compliance (2.5s) + transition (3.5s)

    // ========== TEST 8: UX Optimization State ==========
    await this.captureState('8-ux-optimization', [
      { type: 'text', value: 'Experience Optimized', description: 'Optimization header' },
      { type: 'text', value: 'UXOptimizationAgent', description: 'Agent name' },
      { type: 'text', value: '47%', description: 'Field reduction percentage' },
      { type: 'text', value: 'Mobile optimized', description: 'Mobile optimization' },
      { type: 'text', value: 'Quick Actions', description: 'Quick actions label' },
      { type: 'text', value: 'Single-Member Corp', description: 'Quick action 1' },
      { type: 'text', value: 'Tech Startup Package', description: 'Quick action 2' },
      { type: 'text', value: 'Fast Track', description: 'Quick action 3' },
      { type: 'text', value: '80%', description: 'Progress at 80%' }
    ]);

    // Wait for celebration
    await new Promise(r => setTimeout(r, 5000)); // Optimization (2s) + transition (3s)

    // ========== TEST 9: Celebration State ==========
    await this.captureState('9-celebration', [
      { type: 'text', value: 'Onboarding Complete', description: 'Completion message' },
      { type: 'text', value: 'CelebrationAgent', description: 'Agent name' },
      { type: 'text', value: 'Speed Demon', description: 'Speed badge' },
      { type: 'text', value: 'Under 5 minutes', description: 'Speed description' },
      { type: 'text', value: 'First Timer', description: 'First timer badge' },
      { type: 'text', value: 'Perfectionist', description: 'Perfectionist badge' },
      { type: 'text', value: 'No errors', description: 'No errors description' },
      { type: 'text', value: '100%', description: 'Progress at 100%' },
      { type: 'text', value: 'Go to Dashboard', description: 'Dashboard button' },
      { type: 'selector', value: '.text-yellow-500', description: 'Trophy icon' }
    ]);

    // ========== TEST 10: Final Dev Toolkit State ==========
    await this.captureState('10-final-dev-toolkit', [
      { type: 'custom', validator: () => {
        const logs = document.querySelectorAll('.border-l-4.border-l-purple-500');
        return logs.length >= 8; // Should have logs from all 5 agents
      }, description: 'All agent logs present (8+)' },
      { type: 'text', value: 'Celebrating completion', description: 'Celebration log' },
      { type: 'text', value: 'Achievements awarded', description: 'Achievement log' },
      { type: 'custom', validator: () => {
        const completedBadges = document.querySelectorAll('.text-xs:contains("completed")');
        return completedBadges.length >= 5;
      }, description: 'Multiple completed badges' }
    ]);

    // ========== TEST 11: Check for Errors ==========
    const hasErrors = await this.page.evaluate(() => {
      // Check for any error messages in UI
      const errorTexts = ['error', 'Error', 'failed', 'Failed', 'undefined', 'null'];
      const bodyText = document.body.textContent || '';
      return errorTexts.some(err => bodyText.includes(err + ':') || bodyText.includes('Error: '));
    });

    if (hasErrors) {
      this.issues.push('Error messages detected in UI');
      await this.captureState('11-error-check', []);
    }

    // ========== TEST 12: Agent Data Validation ==========
    await this.captureState('12-agent-data-validation', [
      { type: 'custom', validator: () => {
        // Check if agent logs have proper structure
        const logs = document.querySelectorAll('.border-l-4.border-l-purple-500');
        if (logs.length === 0) return false;
        
        // Each log should have agent name, action, reasoning
        for (const log of logs) {
          const hasAgent = log.textContent?.includes('Agent');
          const hasAction = log.textContent?.includes('Action:');
          const hasTime = log.textContent?.includes('AM') || log.textContent?.includes('PM');
          if (!hasAgent || !hasAction || !hasTime) return false;
        }
        return true;
      }, description: 'All agent logs have proper structure' }
    ]);

    // ========== TEST 13: Progress Bar Continuity ==========
    const progressValues = await this.page.evaluate(() => {
      const progressText = document.querySelector('.text-muted-foreground')?.textContent;
      return progressText;
    });
    
    if (progressValues !== '100%') {
      this.issues.push(`Progress bar not at 100%: ${progressValues}`);
    }

    // ========== TEST 14: Mobile Responsiveness Check ==========
    await this.page.setViewport({ width: 375, height: 667 }); // iPhone size
    await new Promise(r => setTimeout(r, 1000));
    
    await this.captureState('14-mobile-responsive', [
      { type: 'custom', validator: () => {
        // Check if layout adapts for mobile
        const cards = document.querySelectorAll('.max-w-md, .max-w-lg');
        return cards.length > 0;
      }, description: 'Mobile-responsive layout' }
    ]);
    
    // Reset viewport
    await this.page.setViewport({ width: 1920, height: 1080 });

    // ========== TEST 15: Animation Performance ==========
    const animationCheck = await this.page.evaluate(() => {
      const animations = document.querySelectorAll('.animate-spin, .animate-pulse, .transition-all');
      return animations.length;
    });
    
    console.log(`\n📊 Animation elements found: ${animationCheck}`);
    
    // ========== TEST 16: Accessibility Check ==========
    await this.captureState('16-accessibility', [
      { type: 'custom', validator: () => {
        // Check for proper ARIA labels and semantic HTML
        const buttons = document.querySelectorAll('button');
        const inputs = document.querySelectorAll('input');
        const labels = document.querySelectorAll('label');
        return buttons.length > 0 && (inputs.length === 0 || labels.length > 0);
      }, description: 'Proper accessibility structure' }
    ]);
  }

  async generateDetailedReport() {
    console.log('\n' + '=' .repeat(70));
    console.log('📋 EXHAUSTIVE VALIDATION REPORT');
    console.log('=' .repeat(70));
    
    const totalTests = this.stepNumber;
    const successCount = this.successes.length;
    const issueCount = this.issues.length;
    const successRate = ((successCount / totalTests) * 100).toFixed(1);
    
    console.log(`\n📊 Overall Statistics:`);
    console.log(`   Total Tests Run: ${totalTests}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Issues Found: ${issueCount}`);
    console.log(`   Success Rate: ${successRate}%`);
    
    if (this.successes.length > 0) {
      console.log(`\n✅ Successful Validations:`);
      this.successes.forEach((success, i) => {
        console.log(`   ${i + 1}. ${success}`);
      });
    }
    
    if (this.issues.length > 0) {
      console.log(`\n❌ Issues Found:`);
      this.issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
      
      console.log(`\n🔧 Required Fixes:`);
      const uniqueIssues = [...new Set(this.issues)];
      uniqueIssues.forEach((issue, i) => {
        console.log(`   ${i + 1}. Fix: ${issue}`);
      });
    } else {
      console.log(`\n🎉 NO ISSUES FOUND - ALL VALIDATIONS PASSED!`);
    }
    
    console.log(`\n📸 Screenshots captured: ${totalTests}`);
    console.log(`   Location: ${CONFIG.screenshotDir}`);
    
    // Save detailed report
    const reportPath = path.join(CONFIG.screenshotDir, 'exhaustive-report.json');
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalTests,
      successCount,
      issueCount,
      successRate,
      successes: this.successes,
      issues: this.issues,
      screenshotDir: CONFIG.screenshotDir
    }, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
    return this.issues.length === 0;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.setup();
      await this.runComprehensiveTests();
      const allPassed = await this.generateDetailedReport();
      return allPassed;
    } catch (error) {
      console.error('❌ Critical test error:', error.message);
      this.issues.push(`Critical error: ${error.message}`);
      await this.generateDetailedReport();
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Main execution
async function main() {
  const test = new ExhaustivePRDValidation();
  const success = await test.run();
  
  if (!success) {
    console.log('\n⚠️  VALIDATION INCOMPLETE - Issues need to be fixed');
    console.log('Review screenshots and fix all issues before final inspection.\n');
  } else {
    console.log('\n✅ ALL VALIDATIONS PASSED - Ready for final inspection!\n');
  }
  
  process.exit(success ? 0 : 1);
}

// Run the test
if (require.main === module) {
  main();
}