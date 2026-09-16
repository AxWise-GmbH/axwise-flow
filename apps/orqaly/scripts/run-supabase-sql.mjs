#!/usr/bin/env node
/**
 * Open Supabase SQL editor and run profile_notes/profile_todos migration.
 * Reports success message or login requirement.
 */
import { chromium } from 'playwright';

const URL = 'https://supabase.com/dashboard/project/zwzopaedmhwnndymitbs/sql/new';
const SQL = `create extension if not exists "uuid-ossp";
create table if not exists public.profile_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  created_at timestamptz default now()
);
create index if not exists idx_profile_notes_user_id on public.profile_notes(user_id);
create index if not exists idx_profile_notes_created_at on public.profile_notes(created_at desc);
create table if not exists public.profile_todos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  done boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists idx_profile_todos_user_id on public.profile_todos(user_id);
create index if not exists idx_profile_todos_created_at on public.profile_todos(created_at desc);
alter table public.profile_notes enable row level security;
alter table public.profile_todos enable row level security;
drop policy if exists "Users can manage own profile_notes" on public.profile_notes;
create policy "Users can manage own profile_notes" on public.profile_notes for all using (user_id = auth.uid());
drop policy if exists "Users can manage own profile_todos" on public.profile_todos;
create policy "Users can manage own profile_todos" on public.profile_todos for all using (user_id = auth.uid());`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const body = (await page.content()).toLowerCase();

    // Check if we're on a login/sign-in page
    const loginIndicators = [
      'supabase.com/login',
      'supabase.com/sign-in',
      'accounts.google.com',
      'signin',
      'log in',
      'sign in',
    ];
    const isLoginPage = loginIndicators.some((s) => currentUrl.toLowerCase().includes(s) || body.includes(s));
    const hasLoginPrompt = await page.locator('text=Log in, text=Sign in, text=Log in with').first().isVisible().catch(() => false);

    if (isLoginPage || hasLoginPrompt) {
      console.log('Login required: Supabase dashboard requires authentication. Cannot proceed without credentials.');
      await browser.close();
      process.exit(1);
    }

    // Look for SQL editor
    const editor = page.locator('[contenteditable="true"], .cm-editor, [data-testid="sql-editor"], textarea, .monaco-editor');
    await page.waitForTimeout(2000);

    const editorCount = await editor.count();
    if (editorCount === 0) {
      if (body.includes('log in') || body.includes('sign in')) {
        console.log('Login required: Page shows sign-in prompt. Cannot proceed without Supabase account credentials.');
      } else {
        console.log('Could not find SQL editor. Page may require login or has different structure.');
      }
      await browser.close();
      process.exit(1);
    }

    // Try to focus and paste SQL
    await editor.first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(SQL);
    await page.waitForTimeout(1000);

    // Find and click Run button
    const runBtn = page.locator('button:has-text("Run"), button:has-text("Run query"), [data-testid="run-query"]').first();
    if (await runBtn.count() > 0) {
      await runBtn.click();
      await page.waitForTimeout(5000);
    } else {
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(5000);
    }

    // Look for success message
    const successSelectors = [
      'text=Success',
      'text=Query executed',
      'text=successfully',
      '[data-state="success"]',
      '.text-green-600',
      '.text-emerald-600',
    ];
    let successText = null;
    for (const sel of successSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && (await el.isVisible())) {
        successText = await el.textContent();
        break;
      }
    }

    const fullContent = await page.content();
    if (successText || fullContent.toLowerCase().includes('success') || fullContent.includes('0 rows')) {
      console.log('Success: SQL executed. Message or indication of successful execution observed.');
    } else if (fullContent.toLowerCase().includes('error') || fullContent.toLowerCase().includes('failed')) {
      const errEl = page.locator('.text-red-600, [role="alert"], .error-message').first();
      const errText = await errEl.textContent().catch(() => '');
      console.log('Error reported:', errText || '(see page for details)');
    } else {
      console.log('Result: SQL editor action completed. Check dashboard for execution result.');
    }
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
