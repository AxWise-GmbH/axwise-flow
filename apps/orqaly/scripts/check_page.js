import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`BROWSER CONSOLE [${msg.type()}]: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error('BROWSER ERROR:', err.message, err.stack);
  });

  console.log('Navigating to http://localhost:5176/...');
  try {
    await page.goto('http://localhost:5176/', { waitUntil: 'networkidle', timeout: 10000 });
    console.log('Page loaded successfully!');
    const title = await page.title();
    console.log(`Page title: ${title}`);
    const content = await page.content();
    console.log(`Page content length: ${content.length}`);
  } catch (error) {
    console.error('Navigation error:', error);
  } finally {
    await browser.close();
  }
}

run();
