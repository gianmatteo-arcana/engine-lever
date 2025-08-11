#!/usr/bin/env node

/**
 * Onboarding Demo Runner
 * Run with: node demos/run-onboarding-demo.js
 * 
 * This demo simulates the complete onboarding flow showing all 5 agents in action
 */

const chalk = require('chalk');

class OnboardingDemo {
  constructor() {
    this.context = {
      user: {
        email: 'sarah@techstartup.com',
        name: 'Sarah Chen',
        location: 'San Francisco, CA'
      },
      business: {},
      progress: 0,
      phase: 'discovery'
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printHeader(title) {
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold(`  ${title}`));
    console.log(chalk.cyan('═'.repeat(60)));
  }

  printAgent(name, action) {
    console.log(chalk.yellow(`\n🤖 ${name}:`) + ` ${action}`);
  }

  printUI(title, content) {
    console.log(chalk.magenta('\n📱 UI Display:'));
    console.log(chalk.magenta(`   ${title}`));
    if (content) {
      console.log(`   ${content}`);
    }
  }

  printProgress() {
    const filled = Math.floor(this.context.progress / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    console.log(chalk.green(`\n📊 Progress: [${bar}] ${this.context.progress}%`));
  }

  async typeWriter(text, delay = 30) {
    for (const char of text) {
      process.stdout.write(char);
      await this.sleep(delay);
    }
    console.log();
  }

  async runPhase1_Discovery() {
    this.printHeader('PHASE 1: BUSINESS DISCOVERY');
    this.printAgent('Business Discovery Agent', 'Initializing search...');
    await this.sleep(500);

    console.log('\n🔍 ' + chalk.gray('Extracting search clues from email...'));
    await this.sleep(300);
    console.log('   Email domain: techstartup.com');
    console.log('   Possible names: TechStartup, Tech Startup Inc');
    
    console.log('\n🔍 ' + chalk.gray('Searching public records...'));
    await this.sleep(500);
    
    const states = ['California', 'Delaware', 'Washington'];
    for (const state of states) {
      console.log(`   Searching ${state}...`);
      await this.sleep(300);
      if (state === 'California') {
        console.log(chalk.green(`   ✅ Found in ${state}!`));
        break;
      } else {
        console.log(chalk.gray(`   ❌ Not found in ${state}`));
      }
    }

    await this.sleep(500);
    console.log('\n' + chalk.green.bold('🎯 Business Found!'));
    console.log(chalk.white.bgGreen.bold('\n TechStartup Inc. - Corporation - California - Active \n'));

    this.printUI('Found You Card', 
      'Is this your business?\n' +
      '   • TechStartup Inc.\n' +
      '   • Corporation in California\n' +
      '   • Registered 2024-01-15\n' +
      '   [Yes, that\'s me!] [No, search again]'
    );

    await this.sleep(1000);
    console.log(chalk.blue('\n👤 User: "Yes, that\'s my business!"'));

    this.context.business = {
      name: 'TechStartup Inc.',
      entityType: 'Corporation',
      state: 'CA',
      formationDate: '2024-01-15'
    };
    
    this.context.progress = 25;
    this.printProgress();
  }

  async runPhase2_ProfileCollection() {
    this.printHeader('PHASE 2: PROFILE COLLECTION');
    this.printAgent('Profile Collection Agent', 'Analyzing business data...');
    await this.sleep(500);

    console.log('\n📝 ' + chalk.gray('Generating smart defaults...'));
    await this.sleep(300);

    const defaults = [
      { field: 'Business Name', value: 'TechStartup Inc.', source: 'Public Records' },
      { field: 'Entity Type', value: 'Corporation', source: 'Public Records' },
      { field: 'State', value: 'California', source: 'Public Records' },
      { field: 'Industry', value: 'Technology', source: 'Name Analysis' },
      { field: 'Employee Count', value: '1-10', source: 'New Business Default' }
    ];

    for (const item of defaults) {
      await this.sleep(200);
      console.log(`   ✅ ${item.field}: ${chalk.green(item.value)} (${chalk.gray(item.source)})`);
    }

    this.printUI('Smart Profile Form',
      'We\'ve pre-filled your profile!\n' +
      '   Just need a few more details:\n' +
      '   • EIN (optional): [___________]\n' +
      '   • Website (optional): [___________]\n' +
      '   • Phone (optional): [___________]'
    );

    await this.sleep(1000);
    console.log(chalk.blue('\n👤 User: Skips optional fields and continues'));
    
    this.context.progress = 50;
    this.printProgress();
  }

  async runPhase3_Compliance() {
    this.printHeader('PHASE 3: ENTITY COMPLIANCE ANALYSIS');
    this.printAgent('Entity Compliance Agent', 'Analyzing regulatory requirements...');
    await this.sleep(500);

    console.log('\n📋 ' + chalk.gray('Checking federal requirements...'));
    await this.sleep(300);
    console.log('\n📋 ' + chalk.gray('Checking California state requirements...'));
    await this.sleep(300);
    console.log('\n📋 ' + chalk.gray('Checking San Francisco local requirements...'));
    await this.sleep(300);

    console.log('\n' + chalk.yellow.bold('📊 Compliance Calendar Generated:'));
    
    console.log('\n' + chalk.red.bold('🔴 Critical (Immediate):'));
    console.log('   1. Corporate Bylaws - Required for operations');
    console.log('   2. Initial Board Meeting - Within 30 days');
    console.log('   3. Federal EIN - Required for banking');

    console.log('\n' + chalk.yellow.bold('🟡 High Priority (30 days):'));
    console.log('   1. San Francisco Business License - $150');
    console.log('   2. Workers\' Comp Insurance - Required with employees');

    console.log('\n' + chalk.green.bold('🟢 Annual Requirements:'));
    console.log('   1. Statement of Information - Due 3/31/2025 ($25)');
    console.log('   2. Corporate Tax Return - Due 4/15/2025');
    console.log('   3. Franchise Tax - $800 minimum');

    console.log('\n💰 ' + chalk.bold('Total First Year Cost: $2,450'));

    this.printUI('Compliance Roadmap',
      'Your personalized compliance checklist is ready!\n' +
      '   📅 Next deadline: 30 days\n' +
      '   💰 Estimated cost: $2,450\n' +
      '   [View Full Roadmap] [Download PDF]'
    );

    this.context.progress = 75;
    this.printProgress();
  }

  async runPhase4_UXOptimization() {
    this.printHeader('PHASE 4: UX OPTIMIZATION');
    this.printAgent('UX Optimization Agent', 'Optimizing for mobile experience...');
    await this.sleep(500);

    console.log('\n📱 ' + chalk.gray('Detecting device: Mobile (iOS)'));
    await this.sleep(300);
    console.log('📱 ' + chalk.gray('Analyzing form complexity...'));
    await this.sleep(300);
    console.log('📱 ' + chalk.gray('Applying optimizations...'));
    await this.sleep(300);

    console.log('\n' + chalk.green.bold('✨ Optimizations Applied:'));
    
    const optimizations = [
      '✅ Reduced fields from 15 to 8 (47% reduction)',
      '✅ Single-column mobile layout',
      '✅ Large touch targets (48px minimum)',
      '✅ Smart keyboard types for each field',
      '✅ Progressive disclosure enabled'
    ];

    for (const opt of optimizations) {
      await this.sleep(200);
      console.log('   ' + opt);
    }

    console.log('\n⚡ ' + chalk.bold('Quick Actions Available:'));
    console.log('   🏢 "Single-Member Corp" - Most common setup');
    console.log('   💻 "Tech Startup" - Industry defaults');
    console.log('   🚀 "Fast Track" - Skip all optional fields');

    console.log('\n⏱️  Estimated completion: ' + chalk.green.bold('3 minutes'));

    this.context.progress = 95;
    this.printProgress();
  }

  async runPhase5_Celebration() {
    this.printHeader('PHASE 5: CELEBRATION & COMPLETION');
    this.printAgent('Celebration Agent', 'You did it!');
    await this.sleep(500);

    console.log('\n' + chalk.yellow('🎊 🎊 🎊 🎊 🎊 🎊 🎊 🎊 🎊 🎊'));
    await this.typeWriter(chalk.green.bold('ONBOARDING COMPLETE!'), 50);
    console.log(chalk.yellow('🎊 🎊 🎊 🎊 🎊 🎊 🎊 🎊 🎊 🎊'));

    console.log('\n🏆 ' + chalk.bold('Achievements Unlocked:'));
    await this.sleep(300);
    console.log('   ⚡ ' + chalk.yellow('Speed Demon') + ' - Completed in under 5 minutes');
    await this.sleep(300);
    console.log('   🌟 ' + chalk.yellow('First Timer') + ' - Your first successful onboarding');
    await this.sleep(300);
    console.log('   💎 ' + chalk.yellow('Perfectionist') + ' - No errors or corrections');

    this.printUI('Success Celebration',
      '🎉 Welcome to TechStartup Inc.!\n' +
      '   Your business is ready to go.\n' +
      '   Next: Review your compliance roadmap\n' +
      '   [Go to Dashboard] [Share Achievement]'
    );

    this.context.progress = 100;
    this.printProgress();
  }

  async run() {
    console.clear();
    console.log(chalk.cyan.bold('\n🚀 UNIFIED ONBOARDING DEMO'));
    console.log(chalk.gray('Demonstrating 5-agent orchestration system\n'));
    
    await this.sleep(1000);
    
    console.log(chalk.bold('User Profile:'));
    console.log(`  Name: ${this.context.user.name}`);
    console.log(`  Email: ${this.context.user.email}`);
    console.log(`  Location: ${this.context.user.location}`);
    
    await this.sleep(1500);

    // Run all phases
    await this.runPhase1_Discovery();
    await this.sleep(1000);
    
    await this.runPhase2_ProfileCollection();
    await this.sleep(1000);
    
    await this.runPhase3_Compliance();
    await this.sleep(1000);
    
    await this.runPhase4_UXOptimization();
    await this.sleep(1000);
    
    await this.runPhase5_Celebration();

    // Final summary
    this.printHeader('DEMO COMPLETE');
    console.log('\n' + chalk.green.bold('✅ All 5 Agents Successfully Demonstrated:'));
    console.log('   1. Business Discovery Agent - Found business in public records');
    console.log('   2. Profile Collection Agent - Applied smart defaults');
    console.log('   3. Entity Compliance Agent - Generated compliance roadmap');
    console.log('   4. UX Optimization Agent - Optimized for mobile');
    console.log('   5. Celebration Agent - Celebrated achievements');
    
    console.log('\n' + chalk.bold('Final State:'));
    console.log(`   Business: ${this.context.business.name}`);
    console.log(`   Type: ${this.context.business.entityType}`);
    console.log(`   State: ${this.context.business.state}`);
    console.log(`   Progress: ${this.context.progress}%`);
    
    console.log('\n' + chalk.cyan('Thank you for watching the Unified Onboarding Demo!'));
    console.log(chalk.gray('Implementation follows PRD specifications exactly.\n'));
  }
}

// Check if chalk is installed
try {
  require.resolve('chalk');
} catch(e) {
  console.log('Installing chalk for colored output...');
  require('child_process').execSync('npm install chalk', { stdio: 'inherit' });
}

// Run the demo
const demo = new OnboardingDemo();
demo.run().catch(error => {
  console.error('Demo error:', error);
  process.exit(1);
});