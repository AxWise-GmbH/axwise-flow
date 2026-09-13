#!/usr/bin/env node
/**
 * Smoke test across specified routes.
 * Verifies: page loads (no red error screen), data sections render, visible errors/toasts.
 * Non-destructive. Attempts login via local auth (register) when app uses localStorage auth.
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

const results = [];

/** Try to register and login (works with local auth when Supabase not configured). */
async function ensureLoggedIn(page) {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/partners') || url.includes('/projects')) {
    return true; // already logged in
  }
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

async function runTest(context, path) {
  const url = BASE + path;
  const entry = { path, pass: true, loadOk: false, dataSections: [], errors: [], toasts: [], redirectedToLogin: false };

  const page = await context.newPage();

  // Listen for console errors (non-fatal, capture for reporting)
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' && text && !text.includes('ResizeObserver')) {
      entry.errors.push(`[console] ${text.slice(0, 150)}`);
    }
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!response || response.status() >= 400) {
      entry.errors.push(`HTTP ${response?.status() || 'unknown'}`);
      entry.pass = false;
      await page.close();
      return entry;
    }

    await page.waitForTimeout(2000);

    // If we're on login, try to authenticate (local auth)
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
      entry.redirectedToLogin = true;
      const loggedIn = await ensureLoggedIn(page);
      if (!loggedIn) {
        entry.errors.push('Auth required; could not log in (Supabase likely—no test creds)');
        entry.pass = false;
        entry.loadOk = true; // login page itself loaded
        await page.close();
        return entry;
      }
      // Now navigate to the target route
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
    }

    // Check for red error screens / error boundaries
    const errorIndicators = await page.evaluate(() => {
      const found = [];
      const errText = document.body?.innerText || '';
      if (/something went wrong|failed to fetch|network error|unexpected error|error loading/i.test(errText)) {
        found.push('Error-like text in body');
      }
      const alerts = document.querySelectorAll('[role="alert"], .MuiAlert-root, .toast, [class*="Snackbar"]');
      alerts.forEach((el) => {
        const t = el.textContent?.trim();
        const isError = el.className?.includes('error') || el.getAttribute('severity') === 'error';
        if (t && t.length < 200 && (isError || t.toLowerCase().includes('error') || t.toLowerCase().includes('fail'))) {
          found.push(`Alert/Toast: ${t}`);
        }
      });
      return found;
    });
    entry.errors.push(...errorIndicators);

    // Check for common data container patterns
    const dataMarkers = await page.evaluate(() => {
      const markers = [];
      const tables = document.querySelectorAll('table, [role="grid"], .MuiTable-root');
      if (tables.length) markers.push(`table/grid (${tables.length})`);
      const charts = document.querySelectorAll('[class*="recharts"], svg.recharts');
      if (charts.length) markers.push(`chart (${charts.length})`);
      const cards = document.querySelectorAll('[class*="card"], .MuiCard-root');
      if (cards.length) markers.push(`card (${cards.length})`);
      const lists = document.querySelectorAll('[role="list"], ul, .MuiList-root');
      if (lists.length) markers.push(`list (${lists.length})`);
      return markers;
    });
    entry.dataSections = dataMarkers;

    // Check for error toasts/snackbars
    const toasts = await page.evaluate(() => {
      const els = document.querySelectorAll('.MuiSnackbar-root [class*="Alert"], [role="alert"]');
      return Array.from(els).map((e) => e.textContent?.trim()).filter(Boolean);
    });
    entry.toasts = toasts;

    if (entry.errors.some((e) => e.includes('Error-like text') || e.includes('failed to fetch') || e.includes('Alert/Toast'))) {
      entry.pass = false;
    }
    entry.loadOk = true;
  } catch (e) {
    entry.pass = false;
    entry.errors.push(`Navigation/load error: ${e.message}`);
  } finally {
    await page.close();
  }

  return entry;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); // shared context to persist auth across routes
  for (const path of ROUTES) {
    const r = await runTest(context, path);
    results.push(r);
  }
  await context.close();
  await browser.close();

  // Output checklist
  console.log('\n--- Smoke Test Results ---\n');
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.path}`);
    console.log(`      Load OK: ${r.loadOk}`);
    if (r.dataSections.length) console.log(`      Data sections: ${r.dataSections.join(', ')}`);
    if (r.errors.length) console.log(`      Errors: ${r.errors.join(' | ')}`);
    if (r.toasts.length) console.log(`      Toasts: ${r.toasts.join(' | ')}`);
    console.log('');
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`Summary: ${passed}/${results.length} passed`);
}

main().catch(console.error);
