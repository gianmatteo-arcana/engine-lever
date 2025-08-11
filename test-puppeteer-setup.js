const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Simple test to verify Puppeteer setup and screenshot capability
 */

async function testPuppeteerSetup() {
  console.log('🧪 Testing Puppeteer setup...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1200, height: 800 }
    });
    
    const page = await browser.newPage();
    console.log('✅ Browser launched successfully');
    
    // Navigate to a simple page
    await page.goto('data:text/html,<h1>Puppeteer Test</h1><p>Browser automation is working!</p>');
    console.log('✅ Page navigation working');
    
    // Take a screenshot
    const screenshotPath = path.join(__dirname, 'test-results', 'puppeteer-test.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    
    // Test element interaction
    await page.evaluate(() => {
      document.body.innerHTML += '<button id="test-btn">Test Button</button>';
    });
    
    await page.click('#test-btn');
    console.log('✅ Element interaction working');
    
    console.log('🎉 Puppeteer setup test completed successfully!');
    
  } catch (error) {
    console.error('❌ Puppeteer setup test failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// Run the test
if (require.main === module) {
  testPuppeteerSetup()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testPuppeteerSetup };