#!/usr/bin/env node
/**
 * Post-migration verification: Notes/Todo should use Supabase DB.
 * Add DB_POST_MIG_NOTE/TODO, reload, verify persistence.
 * Capture profile_notes/profile_todos network statuses.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5176';
const ROUTE = '/settings';
const timestamp = Date.now();
const NOTE_TEXT = `DB_POST_MIG_NOTE_${timestamp}`;
const TODO_TEXT = `DB_POST_MIG_TODO_${timestamp}`;
const TEST_PASSWORD = 'Testpass123!';

const profileRequests = [];

async function ensureLoggedIn(page) {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/partners') || url.includes('/projects') || url.includes('/settings')) return true;
  if (!url.includes('/register') && !url.includes('/login')) return true;

  const email = `postmig-${timestamp}@test.local`;
  const password = TEST_PASSWORD;
  const name = 'Post-Mig Test';
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"]', password);
  const confirmEl = page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]');
  if (await confirmEl.count()) await confirmEl.fill(password);
  const nameEl = page.locator('input[name="name"], input[placeholder*="Name"]');
  if (await nameEl.count()) await nameEl.fill(name);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const after = page.url();
  return after.includes('/dashboard') || after.includes('/partners') || after.includes('/settings') || !after.includes('/login');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async (response) => {
    const req = response.request();
    const url = req.url();
    if (!url.includes('/rest/v1/profile_notes') && !url.includes('/rest/v1/profile_todos')) return;
    const u = new URL(url);
    profileRequests.push({
      method: req.method(),
      status: response.status(),
      path: u.pathname + (u.search || ''),
    });
  });

  try {
    await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/login') || page.url().includes('/register')) {
      const ok = await ensureLoggedIn(page);
      if (!ok) {
        console.log('FAIL: Could not authenticate');
        await browser.close();
        process.exit(1);
      }
      await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
    }

    await page.locator('text=Notes').first().click().catch(() => {});
    await page.waitForTimeout(500);
    // Add note
    const noteInput = page.locator('input[placeholder*="Add a note"]');
    await noteInput.waitFor({ state: 'visible', timeout: 5000 });
    await noteInput.fill(NOTE_TEXT);
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Add")').first().click();
    await page.waitForTimeout(1500);

    // Add todo
    await page.locator('text=Todo list').click();
    await page.waitForTimeout(800);
    const todoInput = page.locator('input[placeholder*="Add a task"]');
    await todoInput.waitFor({ state: 'visible', timeout: 5000 });
    await todoInput.fill(TODO_TEXT);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);

    // Reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.waitForSelector('text=No notes yet, text=Add a note', { timeout: 6000 }).catch(() => {});

    const htmlNotes = await page.content();
    const noteExists = htmlNotes.includes(NOTE_TEXT) || htmlNotes.includes('DB_POST_MIG_NOTE');

    await page.locator('text=Todo list').click();
    await page.waitForTimeout(1500);
    const htmlTodos = await page.content();
    const todoExists = htmlTodos.includes(TODO_TEXT) || htmlTodos.includes('DB_POST_MIG_TODO');

    // Dedupe requests
    const seen = new Set();
    const unique = profileRequests.filter((r) => {
      const k = `${r.method} ${r.status} ${r.path}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    console.log('\n=== Post-Migration Notes/Todo Verification ===\n');
    console.log(`Note: ${NOTE_TEXT}`);
    console.log(`Todo: ${TODO_TEXT}`);
    console.log('\nAfter reload:');
    console.log(`  Note exists: ${noteExists ? 'YES' : 'NO'}`);
    console.log(`  Todo exists: ${todoExists ? 'YES' : 'NO'}`);

    console.log('\n--- profile_notes / profile_todos network ---');
    for (const r of unique) {
      console.log(`  ${r.method} ${r.status} ${r.path.slice(0, 100)}${r.path.length > 100 ? '...' : ''}`);
    }
    if (unique.length === 0) console.log('  (none)');

    const has2xx = unique.some((r) => r.status >= 200 && r.status < 300);
    const has4xx = unique.some((r) => r.status >= 400);
    const hasPost = unique.some((r) => r.method === 'POST' && r.status >= 200 && r.status < 300);

    console.log('\n--- Verdict ---');
    if (has2xx && (hasPost || unique.some((r) => r.method === 'GET' && r.status === 200))) {
      console.log('DB-backed: ACTIVE — Supabase 2xx on profile_notes/profile_todos');
    } else if (has4xx && !has2xx) {
      console.log('DB-backed: INACTIVE — 4xx on Supabase; likely localStorage fallback');
    } else {
      console.log('DB-backed: UNCLEAR — inspect network output above');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
