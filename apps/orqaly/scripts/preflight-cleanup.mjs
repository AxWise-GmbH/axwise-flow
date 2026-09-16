#!/usr/bin/env node
/**
 * Read-only preflight for the database cleanup.
 *
 * Counts how many seed-pattern rows exist in the live Supabase project
 * before migration 134 runs. Touches nothing — just reports.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env then .env.local (.env.local overrides) — vite convention.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const db = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function count(label, table, build) {
  try {
    let q = db.from(table).select('id', { count: 'exact', head: true });
    q = build(q);
    const { count, error } = await q;
    if (error) {
      console.log(`?  ${label.padEnd(28)} table missing or denied: ${error.message}`);
      return;
    }
    const flag = (count || 0) > 0 ? '!' : '·';
    console.log(`${flag}  ${label.padEnd(28)} ${count || 0}`);
  } catch (err) {
    console.log(`?  ${label.padEnd(28)} ${err.message}`);
  }
}

(async () => {
  console.log(`Preflight cleanup scan — ${SUPABASE_URL}\n`);

  console.log('— Seed rows targeted by migration 134 —');
  await count('partners (acme/beta/test)',  'partners',          (q) => q.in('id', ['partner-acme-corp', 'partner-beta-agency', 'test-partner-minimal']));
  await count('agent_hub_agents (b0/b9)',   'agent_hub_agents',  (q) => q.or('id.like.b0000000-0000-0000-0000-%,id.like.b9000000-0000-0000-0000-%'));
  await count('agent_hub_projects (c0/c9)', 'agent_hub_projects',(q) => q.or('id.like.c0000000-0000-0000-0000-%,id.like.c9000000-0000-0000-0000-%'));
  await count('agent_hub_tasks (d0/d9)',    'agent_hub_tasks',   (q) => q.or('id.like.d0000000-0000-0000-0000-%,id.like.d9000000-0000-0000-0000-%'));
  await count('payouts (f0)',               'payouts',           (q) => q.like('id', 'f0000000-0000-0000-0000-%'));
  await count('audit_log (e0/e9)',          'audit_log',         (q) => q.or('id.like.e0000000-0000-0000-0000-%,id.like.e9000000-0000-0000-0000-%'));
  await count('notifications (notif-seed)', 'notifications',     (q) => q.in('id', ['notif-seed-001', 'notif-seed-002', 'notif-seed-003']));
  await count('meetings (MTG-*-0[1-4])',    'meetings',          (q) => q.like('id', 'MTG-%'));

  console.log('\n— Tables migration 133 adds —');
  await count('report_kpi_snapshots (any)', 'report_kpi_snapshots', (q) => q);
})();
