#!/usr/bin/env node
/**
 * Captures exact failing request URLs, methods, statuses per route.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5176';
const ROUTES = [
  '/dashboard',
  '/partners',
  '/partners/P-001',
  '/projects',
  '/workflow',
  '/task-manager',
  '/settings',
  '/audit-log',
];

const failedByRoute = {};

async function ensureLoggedIn(page) {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/partners') || url.includes('/projects')) return true;
  if (!url.includes('/register') && !url.includes('/login')) return true;

  const email = `smoke-${Date.now()}@test.local`;
  const password = 'testpass123';
  const name = 'Smoke Test';
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"]', password);
  const confirmEl = page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]');
  if (await confirmEl.count()) await confirmEl.fill(password);
  const nameEl = page.locator('input[name="name"], input[placeholder*="Name"]');
  if (await nameEl.count()) await nameEl.fill(name);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const after = page.url();
  return after.includes('/dashboard') || after.includes('/partners') || after.includes('/projects') || !after.includes('/login');
}

async function runRoute(context, path) {
  const url = BASE + path;
  const failed = [];
  const page = await context.newPage();

  page.on('response', async (response) => {
    const status = response.status();
    if (status < 400) return;
    const req = response.request();
    let pathname = '';
    try {
      const u = new URL(req.url());
      pathname = u.pathname + (u.search ? u.search : '');
    } catch {
      pathname = req.url();
    }
    failed.push({
      method: req.method(),
      status,
      url: req.url(),
      pathname,
    }); // full url has host - Supabase REST base
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
      await ensureLoggedIn(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
    }
  } finally {
    await page.close();
  }

  // Deduplicate by method+pathname+status
  const seen = new Set();
  const unique = failed.filter((f) => {
    const key = `${f.method} ${f.pathname} ${f.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  failedByRoute[path] = unique;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  for (const path of ROUTES) {
    await runRoute(context, path);
  }
  await context.close();
  await browser.close();

  console.log('\n--- Failed Requests by Route ---\n');
  for (const path of ROUTES) {
    const list = failedByRoute[path] || [];
    console.log(`\n## ${path}`);
    if (!list.length) {
      console.log('  (none)');
      continue;
    }
    for (const f of list) {
      console.log(`  ${f.method} ${f.status} ${f.pathname || f.url}`);
    }
  }
}

main().catch(console.error);
