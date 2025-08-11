#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function validate() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="dev-toolkit"]', { timeout: 5000 });
  
  // Click Dev Toolkit
  await page.click('[data-testid="dev-toolkit"]');
  await new Promise(r => setTimeout(r, 1000));
  
  // Check if panel is visible
  const panelVisible = await page.evaluate(() => {
    const panel = document.querySelector('.fixed.bottom-0.right-0.w-96.h-96');
    const title = Array.from(document.querySelectorAll('*')).some(
      el => el.textContent?.includes('Dev Toolkit - Agent Activity')
    );
    return panel || title;
  });
  
  console.log(panelVisible ? '✅ Dev Toolkit WORKING!' : '❌ Dev Toolkit NOT visible');
  
  await browser.close();
}

validate().catch(console.error);