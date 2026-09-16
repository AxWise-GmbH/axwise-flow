#!/usr/bin/env node
/**
 * Smoke test routes: capture all /rest/v1/* requests per route.
 * PASS = no 4xx/5xx; FAIL = any 4xx/5xx. Minimal non-destructive interaction.
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
const TEST_PASSWORD = 'Testpass123!';

async function ensureLoggedIn(page) {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/partners') || url.includes('/projects') || url.includes('/settings')) return true;
  if (!url.includes('/register') && !url.includes('/login')) return true;

  const email = `smoke-${Date.now()}@test.local`;
  const password = TEST_PASSWORD;
  const name = 'Smoke Test';
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"]', password);
  const confirmEl = page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]');
  if (await confirmEl.count()) await confirmEl.fill(password);
  const nameEl = page.locator('input[name="name"], input[placeholder*="Name"]');
  if (await nameEl.count()) await nameEl.fill(name);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const after = page.url();
  return after.includes('/dashboard') || after.includes('/partners') || after.includes('/projects') || !after.includes('/login');
}

async function runRoute(context, path) {
  const supabaseRequests = [];
  const page = await context.newPage();

  page.on('response', async (response) => {
    const req = response.request();
    const url = req.url();
    if (!url.includes('/rest/v1/')) return;
    const u = new URL(url);
    const table = (u.pathname.match(/\/rest\/v1\/([^?]+)/) || [])[1] || u.pathname;
    supabaseRequests.push({
      method: req.method(),
      status: response.status(),
      table,
      path: u.pathname + (u.search || ''),
    });
  });

  try {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/login') || page.url().includes('/register')) {
      const ok = await ensureLoggedIn(page);
      if (!ok) {
        await page.close();
        return { path, pass: false, requests: [], errors: ['Auth failed'] };
      }
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
    }

    // Settings: switch to Notes tab to trigger profile_notes/profile_todos load
    if (path === '/settings') {
      await page.locator('text=Todo list').click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    await page.waitForTimeout(1000);
  } finally {
    await page.close();
  }

  const unique = [];
  const seen = new Set();
  for (const r of supabaseRequests) {
    const k = `${r.method} ${r.status} ${r.path}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(r);
    }
  }

  const grouped = new Map();
  for (const r of unique) {
    const key = `${r.method}:${r.table}`;
    const item = grouped.get(key) || [];
    item.push(r.status);
    grouped.set(key, item);
  }
  const endpointFailures = [];
  for (const [key, statuses] of grouped.entries()) {
    const hasSuccess = statuses.some((s) => s >= 200 && s < 300);
    const hasError = statuses.some((s) => s >= 400);
    const hasServerError = statuses.some((s) => s >= 500);
    if (hasServerError || (hasError && !hasSuccess)) {
      endpointFailures.push(`${key.replace(':', ' ')} (${statuses.join(',')})`);
    }
  }
  const has4xx5xx = endpointFailures.length > 0;
  const errors = endpointFailures;

  return {
    path,
    pass: !has4xx5xx,
    requests: unique,
    errors,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const results = [];
  for (const path of ROUTES) {
    const r = await runRoute(context, path);
    results.push(r);
  }

  await context.close();
  await browser.close();

  // Output matrix
  console.log('\n--- Supabase REST Smoke Test Matrix ---\n');

  const rows = [];
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    const summary = r.requests.length === 0 ? '—' : r.requests.map((x) => `${x.method} ${x.status} ${x.table}`).join('; ');
    const errStr = r.errors.length ? ` | ${r.errors.join(', ')}` : '';
    rows.push({ path: r.path, status, summary: summary + errStr, requests: r.requests });
  }

  console.log('Route              | Status | Endpoint (method status)');
  console.log('-------------------|--------|--------------------------------------------------');
  for (const { path, status, requests } of rows) {
    const short = path.padEnd(18);
    const reqStr = requests.length === 0 ? '—' : requests.map((x) => `${x.table} (${x.method} ${x.status})`).join('; ');
    const err = status === 'FAIL' ? ' << 4xx/5xx' : '';
    console.log(`${short} | ${status.padEnd(6)} | ${reqStr}${err}`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nSummary: ${passed}/${results.length} routes PASS`);
}

main().catch(console.error);
