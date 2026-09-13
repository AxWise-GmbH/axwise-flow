#!/usr/bin/env node
/**
 * wipe-partners.mjs
 *
 * Deletes every row from the partners table and its FK children
 * (partner_history, partner_ai_recommendations). The partners table holds
 * the legacy embedded-task data model — tasks are stored inside
 * partners.data.tasks.items rather than the standalone team_tasks table.
 * The Task Manager page surfaces those embedded tasks, so wiping partners
 * is how we empty /task-manager for environments still on the old model.
 *
 * The partners table has no `user_id` column. It is project-wide via RLS,
 * so this script affects every authenticated account on the project.
 *
 * Usage:
 *   node scripts/wipe-partners.mjs            → PREVIEW only, no writes
 *   node scripts/wipe-partners.mjs --commit   → DELETE (165 rows expected)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const { values } = parseArgs({
  options: { commit: { type: 'boolean', default: false } },
});

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('✗ Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const db = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TARGETS = [
  { table: 'partner_ai_recommendations', label: 'partner_ai_recommendations (FK child)' },
  { table: 'partner_history',            label: 'partner_history (FK child)' },
  { table: 'partners',                   label: 'partners (parent — drops embedded tasks)' },
];

async function countRows(table) {
  const { count, error } = await db.from(table).select('id', { count: 'exact', head: true });
  if (error) return { count: 0, error };
  return { count: count || 0, error: null };
}

async function deleteAllRows(table) {
  // PostgREST requires a predicate. `id is not null` matches every row.
  const { count, error } = await db.from(table).delete({ count: 'exact' }).not('id', 'is', null);
  return { count: count || 0, error };
}

async function previewPartners() {
  const { data, error } = await db.from('partners').select('id, data').limit(30);
  if (error) return;
  const totalEmbedded = data.reduce((sum, r) => {
    const t = r.data?.tasks;
    const items = Array.isArray(t?.items) ? t.items : Array.isArray(t) ? t : [];
    return sum + items.length;
  }, 0);
  console.log(`  embedded tasks across these partners: ${totalEmbedded}`);
  console.log('  partner IDs sample:');
  for (const r of data.slice(0, 10)) {
    const name = r.data?.name || r.data?.company || '(unnamed)';
    const items = Array.isArray(r.data?.tasks?.items) ? r.data.tasks.items
                  : Array.isArray(r.data?.tasks) ? r.data.tasks : [];
    console.log(`    - ${r.id.padEnd(8)} ${name}  (tasks: ${items.length})`);
  }
}

(async () => {
  console.log(`→ wipe-partners.mjs`);
  console.log(`  target: ${SUPABASE_URL}`);
  console.log(`  mode:   ${values.commit ? 'COMMIT (will delete)' : 'PREVIEW only'}\n`);

  console.log('PREVIEW — rows that would be deleted:');
  let total = 0;
  for (const t of TARGETS) {
    const { count, error } = await countRows(t.table);
    if (error) {
      console.log(`  ?  ${t.label.padEnd(46)} ${error.message || 'unknown error'}`);
      continue;
    }
    total += count;
    const flag = count > 0 ? '!' : '·';
    console.log(`  ${flag}  ${t.label.padEnd(46)} ${count}`);
  }
  console.log(`\n  TOTAL: ${total} rows\n`);

  await previewPartners();

  if (!values.commit) {
    console.log('\n────────────────────────────────────────────────────────');
    console.log('Preview only. Re-run with --commit to perform deletes.');
    console.log('Reminder: this is destructive and not reversible without a');
    console.log('Supabase backup (Dashboard → Database → Backups).');
    console.log('────────────────────────────────────────────────────────');
    process.exit(0);
  }

  console.log('\nCOMMIT — deleting in order (children → parent)…');
  let deleted = 0;
  let failures = 0;
  for (const t of TARGETS) {
    const { count, error } = await deleteAllRows(t.table);
    if (error) {
      console.log(`  ✗  ${t.label.padEnd(46)} ${error.message || JSON.stringify(error)}`);
      failures += 1;
      continue;
    }
    deleted += count;
    console.log(`  ✓  ${t.label.padEnd(46)} deleted ${count}`);
  }

  console.log('\nPOST-WIPE counts (expect 0 for each):');
  let leftover = 0;
  for (const t of TARGETS) {
    const { count } = await countRows(t.table);
    if ((count || 0) > 0) leftover += count;
    console.log(`  - ${t.table.padEnd(34)} ${count}`);
  }

  console.log(`\nsummary: deleted=${deleted}, failed_targets=${failures}, leftover=${leftover}`);
  process.exit(leftover === 0 && failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('✗ fatal:', err);
  process.exit(2);
});
