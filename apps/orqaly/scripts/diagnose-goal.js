#!/usr/bin/env node
/**
 * One-page diagnostic dump for a stuck/completed/failed goal.
 *
 * Usage:
 *   node scripts/diagnose-goal.js <goal_id>
 *
 * Prints: goal status, failure_reason, iteration state, plan phase status,
 * all agent_jobs (status/action/error/retry), all team_tasks (status/agent/
 * deliverable_type/first 200 chars of output/validation_reason), and the
 * tail of goal_log. Loads .env.local so SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * are available regardless of where you invoke it from.
 *
 * Dev-only: reads secrets through buildSupabaseAdminClient — do not deploy.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const goalId = process.argv[2];
if (!goalId) {
  console.error('usage: node scripts/diagnose-goal.js <goal_id>');
  process.exit(1);
}

const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const admin = buildSupabaseAdminClient();
if (!admin) {
  console.error('no admin client — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const fmt = (obj, max = 220) => {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

const { data: goal, error: gErr } = await admin
  .from('goals')
  .select('*')
  .eq('id', goalId)
  .maybeSingle();
if (gErr || !goal) {
  console.error('goal not found:', gErr?.message || 'no row');
  process.exit(1);
}

console.log('─'.repeat(70));
console.log('GOAL', goal.id);
console.log('─'.repeat(70));
console.log('title           :', goal.title);
console.log('status          :', goal.status);
console.log('mode            :', goal.mode, '| complexity:', goal.complexity);
console.log('iteration       :', `${goal.iteration || 0}/${goal.max_iterations ?? '?'}`);
console.log('budget          :', `$${Number(goal.spent_usd || 0).toFixed(4)} / $${Number(goal.budget_usd || 0).toFixed(2)}`);
console.log('test_model      :', goal.data?.test_model ? `${goal.data.test_model.provider}/${goal.data.test_model.model}` : '(none)');
console.log('local_only      :', goal.data?.local_only === true);
console.log('failure_stage   :', goal.data?.failure_stage || '(n/a)');
console.log('failure_reason  :', fmt(goal.data?.failure_reason) || '(n/a)');
const iterHist = goal.data?.iteration_failures;
if (Array.isArray(iterHist) && iterHist.length) {
  console.log('iteration_hist  :');
  iterHist.forEach((r, i) => console.log(`  [${i}]`, fmt(r, 180)));
}
console.log('created_at      :', goal.created_at);
console.log('updated_at      :', goal.updated_at);

const phases = goal.plan?.phases || [];
console.log();
console.log('PHASES', `(${phases.length})`);
phases.forEach((p, i) => {
  const statusMark = p.status === 'completed' ? '✓' : p.status === 'failed' ? '✗' : '•';
  console.log(` ${statusMark} [${i}] ${p.status?.padEnd(10) || 'pending'} ${p.name} — ${(p.jobs || []).length} job(s)`);
});

const { data: jobs } = await admin
  .from('agent_jobs')
  .select('id, status, payload, error, retry_count, created_at, updated_at')
  .or(`payload->>goalId.eq.${goalId},payload->>goal_id.eq.${goalId}`)
  .order('created_at', { ascending: true });

console.log();
console.log('JOBS', `(${jobs?.length || 0})`);
for (const j of jobs || []) {
  const type = j.payload?.type || '?';
  const action = j.payload?.action || '';
  console.log(
    ' ',
    j.status.padEnd(9),
    `r=${j.retry_count || 0}`,
    type.padEnd(16),
    action.padEnd(22),
    j.error ? `err=${fmt(j.error, 140)}` : '',
  );
}

const { data: tasks } = await admin
  .from('team_tasks')
  .select('id, title, status, assigned_to, sequence_order, data, updated_at')
  .eq('data->>goal_id', goalId)
  .order('sequence_order', { ascending: true });

console.log();
console.log('TEAM TASKS', `(${tasks?.length || 0})`);
for (const t of tasks || []) {
  const dtype = t.data?.deliverable_type || '?';
  const out = String(t.data?.output || '').trim();
  const vr = t.data?.validation_reason || '';
  console.log(
    ' ',
    t.status.padEnd(12),
    `p${t.data?.phase_index ?? '?'}`,
    dtype.padEnd(12),
    (t.assigned_to || '-').slice(0, 20).padEnd(20),
    t.title?.slice(0, 50) || '',
  );
  if (out) console.log('       output:', fmt(out, 200));
  if (vr) console.log('       rejected:', fmt(vr, 200));
}

const { data: logs } = await admin
  .from('goal_log')
  .select('event_type, details, created_at')
  .eq('goal_id', goalId)
  .order('created_at', { ascending: false })
  .limit(15);

console.log();
console.log('LAST 15 LOG EVENTS');
for (const l of (logs || []).reverse()) {
  console.log(' ', l.created_at.slice(11, 19), l.event_type.padEnd(24), fmt(l.details, 180));
}

console.log();
console.log('─'.repeat(70));
process.exit(0);
