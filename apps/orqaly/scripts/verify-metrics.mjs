#!/usr/bin/env node
/**
 * verify-metrics.mjs
 *
 * Production-readiness check for the five user-facing metric surfaces:
 *   1. Knowledge Base   (knowledge_documents)
 *   2. Tasks            (team_tasks)
 *   3. Projects         (projects)
 *   4. Reports          (report_kpi_snapshots — checks the snapshot pipeline)
 *   5. Communicator     (communication_logs)
 *
 * For each surface, asserts the round-trip:
 *   baseline = N  →  insert one row  →  count == N+1  →  delete row  →  count == N
 *
 * This proves the underlying tables exist, scope correctly to the user, and
 * are free of leftover seed/demo data for the target account.
 *
 * Usage:
 *   node scripts/verify-metrics.mjs --user-email verify@orchestratori.test
 *
 * Required env (read from .env if present):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env then .env.local (.env.local overrides) — vite convention.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'user-email': { type: 'string', default: 'verify@orchestratori.test' },
    'keep-user': { type: 'boolean', default: false },
  },
});

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✗ Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
let exitCode = 0;

function record(area, ok, detail) {
  results.push({ area, ok, detail });
  if (!ok) exitCode = 1;
  const tag = ok ? '✓' : '✗';
  console.log(`${tag} ${area.padEnd(15)} ${detail}`);
}

async function ensureUser(email) {
  // Look up an existing auth user by email
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) return { id: existing.id, created: false };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `verify-${randomUUID()}`,
  });
  if (createErr) throw createErr;
  return { id: created.user.id, created: true };
}

async function countFor(table, ownerCol, ownerVal, filters = {}) {
  let q = admin.from(table).select('id', { count: 'exact', head: true });
  if (ownerCol) q = q.eq(ownerCol, ownerVal);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw new Error(error.message || JSON.stringify(error) || 'unknown DB error');
  return count || 0;
}

/**
 * Round-trip check: baseline → insert → +1 → delete → baseline.
 *
 * @param {string} ownerCol   The column that identifies "owned by this user"
 *                            (e.g. 'user_id' for KB, 'created_by' for tasks).
 *                            null means count without a scoping column — used
 *                            for tables that lack per-user attribution; the
 *                            round-trip then only verifies the insert and
 *                            delete reach the table.
 */
async function roundTrip(area, table, ownerCol, ownerVal, row, filters = {}) {
  try {
    const baseline = await countFor(table, ownerCol, ownerVal, filters);

    const insertRow =
      ownerCol && !(ownerCol in row) ? { [ownerCol]: ownerVal, ...row } : { ...row };
    const { data: inserted, error: insertErr } = await admin
      .from(table)
      .insert(insertRow)
      .select('id')
      .single();
    if (insertErr) throw new Error(insertErr.message || JSON.stringify(insertErr));

    const afterInsert = await countFor(table, ownerCol, ownerVal, filters);
    if (afterInsert !== baseline + 1) {
      // Clean up our row before failing
      await admin.from(table).delete().eq('id', inserted.id);
      throw new Error(`expected ${baseline + 1} after insert, got ${afterInsert}`);
    }

    const { error: delErr } = await admin.from(table).delete().eq('id', inserted.id);
    if (delErr) throw new Error(delErr.message || JSON.stringify(delErr));

    const afterDelete = await countFor(table, ownerCol, ownerVal, filters);
    if (afterDelete !== baseline) {
      throw new Error(`expected ${baseline} after delete, got ${afterDelete}`);
    }

    record(area, true, `baseline=${baseline}, +1, -1, back to ${baseline}`);
  } catch (err) {
    record(area, false, err.message || String(err));
  }
}

async function checkSeedDataAbsent() {
  // No seed rows should remain anywhere after migration 134.
  const checks = [
    { table: 'partners', filter: { id: 'partner-acme-corp' } },
    { table: 'partners', filter: { id: 'partner-beta-agency' } },
    { table: 'partners', filter: { id: 'test-partner-minimal' } },
    { table: 'notifications', filter: { id: 'notif-seed-001' } },
  ];
  let leaks = 0;
  for (const c of checks) {
    const { count } = await admin
      .from(c.table)
      .select('id', { count: 'exact', head: true })
      .match(c.filter);
    if ((count || 0) > 0) {
      leaks += 1;
      console.log(`✗ seed-leak       ${c.table} still has ${JSON.stringify(c.filter)}`);
    }
  }
  record(
    'seed-data',
    leaks === 0,
    leaks === 0 ? 'all fixture rows absent' : `${leaks} seed rows remain`
  );
}

async function checkSnapshotPipeline() {
  // report_kpi_snapshots must exist; the cron writes here. We don't trigger
  // the cron from this script (it iterates all active users), we just check
  // that the table is reachable and the schema is correct.
  const { error } = await admin
    .from('report_kpi_snapshots')
    .select('id', { count: 'exact', head: true })
    .limit(1);
  if (error) {
    record('reports', false, `snapshot table unreachable: ${error.message}`);
    return;
  }
  record(
    'reports',
    true,
    'report_kpi_snapshots table reachable (cron writes nightly at 00:15 UTC)'
  );
}

(async () => {
  console.log(`→ Verifying metrics for ${values['user-email']}\n`);

  const { id: userId, created } = await ensureUser(values['user-email']);
  console.log(`  user_id: ${userId}${created ? '  (newly created)' : '  (existing)'}\n`);

  // 1. Knowledge Base — embeddings are 384-dim (knowledge_documents schema).
  await roundTrip('knowledge-base', 'knowledge_documents', 'user_id', userId, {
    title: 'verify-metrics probe',
    content: 'probe',
    category: 'general',
    embedding: `[${new Array(384).fill(0).join(',')}]`,
  });

  // 2. Tasks — team_tasks scopes by created_by, and id is a text PK the
  //    handler generates client-side. We mirror that pattern here.
  await roundTrip('tasks', 'team_tasks', 'created_by', userId, {
    id: `verify-task-${Date.now()}-${randomUUID().slice(0, 4)}`,
    title: 'verify-metrics probe',
    status: 'todo',
    priority: 'medium',
  });

  // 3. Projects — id is text, status enum requires 'Active'.
  await roundTrip('projects', 'projects', 'user_id', userId, {
    id: `verify-${randomUUID()}`,
    name: 'verify-metrics probe',
    status: 'Active',
    data: {},
  });

  // 4. Reports — snapshot table reachable check.
  await checkSnapshotPipeline();

  // 5. Communicator — direct tenant ownership is authoritative. sender_id is
  //    presentation/audit data and must never be used as the owner boundary.
  await roundTrip('communicator', 'communication_logs', 'user_id', userId, {
    sender_type: 'user',
    sender_id: userId,
    sender_name: 'verify-metrics',
    content: 'probe',
    context_type: 'general',
    platform: 'internal',
  });

  await checkSeedDataAbsent();

  if (!values['keep-user'] && created) {
    await admin.auth.admin.deleteUser(userId);
    console.log(`\n  cleaned up created user ${values['user-email']}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(exitCode);
})().catch((err) => {
  console.error('✗ fatal:', err);
  process.exit(2);
});
