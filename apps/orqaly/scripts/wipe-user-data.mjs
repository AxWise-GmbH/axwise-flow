#!/usr/bin/env node
/**
 * wipe-user-data.mjs
 *
 * Personal-data wipe for a single Supabase auth user across the six product
 * surfaces (Knowledge, Workflow, Tasks, Projects, Requests, Communicator)
 * plus adjacent tables (meetings, goals, goal_log/messages/artifacts,
 * audit_log, command_history, jobs, communication_channels).
 *
 * Preserves:
 *   - knowledge_documents WHERE category = 'library_example' (product content)
 *   - all `agents` and agent_* child tables (so AI dispatch keeps working)
 *   - every row owned by a different user
 *
 * Usage:
 *   node scripts/wipe-user-data.mjs --user-email user@example.com
 *     → PREVIEW only. Counts rows per table. No writes.
 *
 *   node scripts/wipe-user-data.mjs --user-email user@example.com --commit
 *     → Performs deletes. Prints before/after counts.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const { values } = parseArgs({
  options: {
    'user-email': { type: 'string' },
    'user-id': { type: 'string' },
    commit: { type: 'boolean', default: false },
  },
});

if (!values['user-email'] && !values['user-id']) {
  console.error('✗ Provide --user-email or --user-id');
  process.exit(2);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✗ Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveUserId() {
  if (values['user-id']) return values['user-id'];
  const { data, error } = await db.auth.admin.listUsers();
  if (error) throw error;
  const u = data.users.find((u) => u.email === values['user-email']);
  if (!u) throw new Error(`user not found for email ${values['user-email']}`);
  return u.id;
}

/**
 * Each target describes one table delete operation.
 * `where`: a function (queryBuilder, uid) -> queryBuilder. Used identically
 * for count and delete so previews never diverge from the actual delete.
 */
async function fetchUserGoalIds(uid) {
  const { data, error } = await db.from('goals').select('id').eq('user_id', uid);
  if (error) return [];
  return (data || []).map((r) => r.id);
}

async function buildTargets(uid) {
  const goalIds = await fetchUserGoalIds(uid);
  // PostgREST .in() with an empty array returns "in.()" which is invalid.
  // Use a stable placeholder UUID so the filter resolves to zero rows.
  const goalIdsForFilter = goalIds.length ? goalIds : ['00000000-0000-0000-0000-000000000000'];

  return [
    // Largest first so progress is visible.
    { table: 'audit_log', where: (q) => q.eq('user_id', uid) },
    { table: 'communication_logs', where: (q) => q.eq('user_id', uid), note: 'owned by user' },
    { table: 'command_history', where: (q) => q.eq('user_id', uid) },

    // Leaves of the task/job graph
    { table: 'team_tasks', where: (q) => q.eq('created_by', uid), note: 'owned by user' },
    { table: 'team_tasks', where: (q) => q.is('created_by', null), note: 'orphans' },
    { table: 'job_requests', where: (q) => q.eq('user_id', uid) },
    { table: 'jobs', where: (q) => q.eq('user_id', uid), note: 'owned by user' },
    { table: 'jobs', where: (q) => q.is('user_id', null), note: 'orphans (preserves other users)' },

    // KB — preserve library_example product content.
    { table: 'knowledge_documents', where: (q) => q.eq('user_id', uid), note: 'owned by user' },
    {
      table: 'knowledge_documents',
      where: (q) => q.is('user_id', null).neq('category', 'library_example'),
      note: 'orphans (not library)',
    },

    // Meetings (referenced by some task IDs but no FK)
    { table: 'meetings', where: (q) => q.eq('user_id', uid), note: 'owned by user' },
    { table: 'meetings', where: (q) => q.is('user_id', null), note: 'orphans' },

    // Goal children — scoped via parent goal_id list (no direct user_id column)
    {
      table: 'goal_log',
      where: (q) => q.in('goal_id', goalIdsForFilter),
      note: `via ${goalIds.length} goals`,
    },
    {
      table: 'goal_messages',
      where: (q) => q.in('goal_id', goalIdsForFilter),
      note: `via ${goalIds.length} goals`,
    },
    {
      table: 'goal_artifacts',
      where: (q) => q.in('goal_id', goalIdsForFilter),
      note: `via ${goalIds.length} goals`,
    },
    { table: 'goals', where: (q) => q.eq('user_id', uid) },

    // Projects, workflows — orphan rows survive RLS as visible to everyone
    { table: 'projects', where: (q) => q.eq('user_id', uid), note: 'owned by user' },
    { table: 'projects', where: (q) => q.is('user_id', null), note: 'orphans' },
    { table: 'workflows', where: (q) => q.eq('user_id', uid), note: 'owned by user' },
    {
      table: 'workflows',
      where: (q) => q.is('user_id', null),
      note: 'orphans (loose RLS exposes them)',
    },

    // Communicator channels
    { table: 'communication_channels', where: (q) => q.eq('connected_by', uid) },
  ];
}

async function countTarget(t) {
  const q = t.where(db.from(t.table).select('id', { count: 'exact', head: true }));
  const { count, error } = await q;
  return { count: count || 0, error };
}

async function deleteTarget(t) {
  // For DELETE, supabase-js requires .select() to return affected rows. We
  // don't need the rows themselves — just trigger the delete.
  const q = t.where(db.from(t.table).delete({ count: 'exact' }));
  const { count, error } = await q;
  return { count: count || 0, error };
}

function describe(t) {
  return t.note ? `${t.table.padEnd(26)} (${t.note})` : t.table.padEnd(26);
}

(async () => {
  const uid = await resolveUserId();
  console.log(`→ Target: ${values['user-email'] || values['user-id']}`);
  console.log(`  user_id: ${uid}`);
  console.log(`  mode:    ${values.commit ? 'COMMIT (will delete)' : 'PREVIEW only'}\n`);

  const targets = await buildTargets(uid);

  console.log('PREVIEW — rows that match each target:');
  let total = 0;
  let unreachable = 0;
  for (const t of targets) {
    const { count, error } = await countTarget(t);
    if (error) {
      console.log(`  ?  ${describe(t)} skipped: ${error.message || 'unknown'}`);
      unreachable += 1;
      continue;
    }
    total += count;
    const flag = count > 0 ? '!' : '·';
    console.log(`  ${flag}  ${describe(t)} ${count}`);
  }
  console.log(
    `\n  total rows to delete: ${total}${unreachable ? ` (${unreachable} targets skipped — table missing)` : ''}`
  );

  if (!values.commit) {
    console.log('\nNo writes performed. Re-run with --commit to delete.');
    process.exit(0);
  }

  console.log('\nCOMMIT — deleting…');
  let deleted = 0;
  let failed = 0;
  for (const t of targets) {
    const { count, error } = await deleteTarget(t);
    if (error) {
      console.log(`  ✗  ${describe(t)} ${error.message || JSON.stringify(error)}`);
      failed += 1;
      continue;
    }
    deleted += count;
    console.log(`  ✓  ${describe(t)} deleted ${count}`);
  }

  console.log('\nPOST-WIPE verification — every target should now be 0:');
  let leftover = 0;
  for (const t of targets) {
    const { count, error } = await countTarget(t);
    if (error) continue;
    if (count > 0) {
      leftover += count;
      console.log(`  ✗  ${describe(t)} still has ${count}`);
    }
  }

  // Sanity: library_example must still exist.
  const libCount =
    (
      await db
        .from('knowledge_documents')
        .select('id', { count: 'exact', head: true })
        .eq('category', 'library_example')
    ).count || 0;
  console.log(`\n  library_example preserved: ${libCount} rows (expected 30)`);

  console.log(`\nsummary: deleted=${deleted}, failed_targets=${failed}, leftover=${leftover}`);
  process.exit(leftover === 0 && failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('✗ fatal:', err);
  process.exit(2);
});
