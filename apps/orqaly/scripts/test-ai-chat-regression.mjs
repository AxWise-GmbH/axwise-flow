#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5176';

async function ensureLoggedIn(page) {
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const url = page.url();
  if (url.includes('/dashboard')) return;

  const email = `chat-regression-${Date.now()}@test.local`;
  const password = 'Testpass123!';
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[name="password"], input[type="password"]').first().fill(password);
  const confirm = page.locator('input[name="confirmPassword"]');
  if (await confirm.count()) await confirm.fill(password);
  const name = page.locator('input[name="name"]');
  if (await name.count()) await name.fill('Regression User');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(1800);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const checks = [];

  try {
    await ensureLoggedIn(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    console.log(`Current URL: ${page.url()}`);

    const entryByText = page.locator('button').filter({ hasText: "Let's talk" }).first();
    const entryByAria = page.locator('[aria-label="Ask or type command"]').first();
    if (await entryByText.count()) {
      await entryByText.click();
    } else {
      await entryByAria.click();
    }
    await page.getByText("Let's talk").first().waitFor({ state: 'visible', timeout: 5000 });
    checks.push('Open AI Chat dialog');

    await page.locator('button[aria-label="New conversation"]').first().click();
    checks.push('Create conversation');

    page.once('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept('Regression thread');
      else await dialog.accept();
    });
    await page.locator('button[aria-label="Rename conversation"]').first().click();
    checks.push('Rename conversation');

    await page.getByLabel('Your request').fill('Give me JSON output for risk summary');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    await page.getByText('Give me JSON output for risk summary').first().waitFor({ state: 'visible', timeout: 5000 });
    checks.push('Send user message');

    await page.getByText('Information').first().waitFor({ state: 'visible', timeout: 5000 });
    checks.push('Right panel information visible');

    page.once('dialog', async (dialog) => {
      if (dialog.type() === 'confirm') await dialog.accept();
      else await dialog.dismiss();
    });
    await page.locator('button[aria-label="Delete conversation"]').first().click();
    checks.push('Delete conversation');

    console.log('AI Chat regression checks passed:');
    checks.forEach((c) => console.log(`- ${c}`));
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

run().catch((err) => {
  console.error('AI Chat regression failed:', err?.message || err);
  process.exit(1);
});

