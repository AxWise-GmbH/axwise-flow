#!/usr/bin/env node
/**
 * Test Notes + Todo persistence on /settings.
 * (1) Authenticate if needed, (2) add unique note, (3) add unique todo,
 * (4) refresh, (5) verify both exist. Capture profile_notes/profile_todos network calls.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5176';
const ROUTE = '/settings';
const timestamp = Date.now();
const NOTE_TEXT = `DB_TEST_NOTE_${timestamp}`;
const TODO_TEXT = `DB_TEST_TODO_${timestamp}`;

const profileRequests = [];
let storageSnapshotBefore = null;
let storageSnapshotAfter = null;
const TEST_PASSWORD = 'Testpass123!';

async function ensureLoggedIn(page) {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/partners') || url.includes('/projects') || url.includes('/settings')) return true;
  if (!url.includes('/register') && !url.includes('/login')) return true;

  const email = `persist-test-${timestamp}@test.local`;
  const password = TEST_PASSWORD;
  const name = 'Persistence Test';
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

  // Capture all profile_notes / profile_todos requests
  page.on('response', async (response) => {
    const req = response.request();
    const url = req.url();
    if (!url.includes('/rest/v1/profile_notes') && !url.includes('/rest/v1/profile_todos')) return;
    const u = new URL(url);
    const path = u.pathname + (u.search || '');
    profileRequests.push({
      url: path,
      method: req.method(),
      status: response.status(),
    });
  });

  try {
    // Navigate to settings
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

    // Get localStorage snapshot BEFORE adding items
    storageSnapshotBefore = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('orch_profile'));
      return keys.map((k) => ({ key: k, len: localStorage.getItem(k)?.length || 0 }));
    });

    await page.locator('text=Notes').first().click().catch(() => {});
    await page.waitForTimeout(500);
    // Add note via TextField placeholder "Add a note…" + Add button
    const noteInput = page.locator('input[placeholder*="Add a note"]');
    await noteInput.waitFor({ state: 'visible', timeout: 5000 });
    await noteInput.fill(NOTE_TEXT);
    await page.waitForTimeout(300);
    const addNoteBtn = page.locator('button:has-text("Add")').first();
    await addNoteBtn.click();
    await page.waitForTimeout(1500);

    // Switch to Todo list tab (tab 1)
    await page.locator('text=Todo list').click();
    await page.waitForTimeout(800);

    // Add todo via TextField placeholder "Add a task…" + Add button
    const todoInput = page.locator('input[placeholder*="Add a task"]');
    await todoInput.waitFor({ state: 'visible', timeout: 5000 });
    await todoInput.fill(TODO_TEXT);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter'); // Add task on Enter (same as Add button)
    await page.waitForTimeout(1500);

    await page.waitForTimeout(2000);

    // Refresh page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.waitForSelector('text=No notes yet, text=Add a note', { timeout: 6000 }).catch(() => {});

    // Verify note (Notes tab is default)
    const htmlNotes = await page.content();
    const noteExists = htmlNotes.includes(NOTE_TEXT) || htmlNotes.includes('DB_TEST_NOTE');

    // Switch to Todo tab and verify todo
    await page.locator('text=Todo list').click();
    await page.waitForTimeout(1500);
    const htmlTodos = await page.content();
    const todoExists = htmlTodos.includes(TODO_TEXT) || htmlTodos.includes('DB_TEST_TODO');

    // Get localStorage snapshot AFTER
    storageSnapshotAfter = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('orch_profile'));
      return keys.map((k) => ({ key: k, sample: (localStorage.getItem(k) || '').slice(0, 120) }));
    });

    // Report
    console.log('\n=== Notes + Todo Persistence Test ===\n');
    console.log(`Note text: ${NOTE_TEXT}`);
    console.log(`Todo text: ${TODO_TEXT}`);
    console.log(`\nStep 4-5: After refresh`);
    console.log(`  Note still exists: ${noteExists ? 'YES' : 'NO'}`);
    console.log(`  Todo still exists: ${todoExists ? 'YES' : 'NO'}`);
    console.log(`\n--- profile_notes / profile_todos network calls ---`);
    const unique = [];
    const seen = new Set();
    for (const r of profileRequests) {
      const k = `${r.method} ${r.status} ${r.url}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(r);
      }
    }
    for (const r of unique) {
      console.log(`  ${r.method} ${r.status} ${r.url}`);
    }
    if (profileRequests.length === 0) console.log('  (none captured)');
    console.log(`\n--- localStorage (orch_profile_*) ---`);
    console.log('Before:', JSON.stringify(storageSnapshotBefore, null, 2));
    console.log('After:', JSON.stringify(storageSnapshotAfter?.map((s) => ({ ...s, sample: s.sample?.slice(0, 80) + '...' })), null, 2));

    const usedSupabase = unique.some((r) => r.status >= 200 && r.status < 300);
    const had4xx = unique.some((r) => r.status >= 400);
    const hasLocalData = storageSnapshotAfter?.some((s) => s.sample && s.sample.length > 20);

    console.log(`\n--- Verdict ---`);
    if (usedSupabase && !had4xx) {
      console.log('Persistence: Supabase DB (2xx responses on profile_notes/profile_todos)');
    } else if (had4xx && hasLocalData) {
      console.log('Persistence: localStorage fallback (4xx on Supabase; orch_profile_* keys present)');
    } else if (hasLocalData) {
      console.log('Persistence: localStorage (orch_profile_* keys with data; no successful Supabase calls)');
    } else {
      console.log('Persistence: unclear or test steps may have failed');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
