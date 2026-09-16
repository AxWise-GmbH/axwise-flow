#!/usr/bin/env node
/**
 * Cancel a stuck goal and create a fresh clone of its inputs.
 * Usage: node scripts/cancel-and-clone-goal.js <old_goal_id>
 *
 * Mirrors handleCreate in lib/api-handlers/goals.js (insert + enqueue first
 * pipeline action + self-root loop_chain_root_id). Uses admin client so it
 * does not need the dev server up or a JWT.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const oldId = process.argv[2];
if (!oldId) {
  console.error('usage: cancel-and-clone-goal.js <old_goal_id>');
  process.exit(1);
}

const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const { enqueueAgentJob } = await import('../lib/goal-handlers/_helpers.js');
const admin = buildSupabaseAdminClient();
if (!admin) {
  console.error('no admin client');
  process.exit(1);
}

// 1. Fetch old goal
const { data: old, error: gErr } = await admin
  .from('goals')
  .select('*')
  .eq('id', oldId)
  .maybeSingle();
if (gErr || !old) {
  console.error('old goal not found:', gErr?.message);
  process.exit(1);
}
const ownerId = typeof old.user_id === 'string' ? old.user_id.trim() : '';
if (!ownerId) {
  console.error('old goal has no durable owner');
  process.exit(1);
}
console.log(`old goal: ${old.title} (status=${old.status})`);

// 2. Cancel old goal
const { error: cErr } = await admin
  .from('goals')
  .update({
    status: 'cancelled',
    data: {
      ...(old.data || {}),
      cancelled_by: 'manual-recovery',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'iterate-stage stuck at needs_human; cloning fresh',
    },
  })
  .eq('id', oldId);
if (cErr) {
  console.error('cancel failed:', cErr.message);
  process.exit(1);
}
console.log(`old goal cancelled: ${oldId}`);

// 3. Clone inputs into new goal (mirror handleCreate)
const newData = {};
if (old.data?.test_model) newData.test_model = old.data.test_model;
if (old.data?.local_only) newData.local_only = true;
if (old.data?.pm_strategy) newData.pm_strategy = old.data.pm_strategy;

const { data: fresh, error: iErr } = await admin
  .from('goals')
  .insert({
    user_id: ownerId,
    title: old.title,
    description: old.description || '',
    target_value: old.target_value || null,
    target_unit: old.target_unit || 'usd',
    budget_usd: old.budget_usd || 10,
    status: 'feasibility',
    max_iterations: 3,
    parsed_category: old.parsed_category || null,
    parsed_priority: old.parsed_priority || 'medium',
    parsed_requirements: old.parsed_requirements || '',
    complexity: old.complexity || 'simple',
    execution_mode: old.execution_mode || 'auto',
    source_request_id: null,
    mode: old.mode || 'simple',
    po_depth: old.po_depth || 'standard',
    executor_type: old.executor_type || 'organization',
    org_id: old.org_id || null,
    executor_id: old.executor_id || null,
    concilium_id: old.concilium_id || null,
    workflow_id: old.workflow_id || null,
    theory_mode: old.theory_mode === true,
    loop_enabled: old.loop_enabled === true,
    ...(Object.keys(newData).length ? { data: newData } : {}),
  })
  .select('*')
  .single();
if (iErr || !fresh) {
  console.error('insert failed:', iErr?.message);
  process.exit(1);
}
const freshOwnerId = typeof fresh.user_id === 'string' ? fresh.user_id.trim() : '';
if (!freshOwnerId || freshOwnerId !== ownerId) {
  console.error('insert returned an invalid or mismatched durable owner');
  process.exit(1);
}
console.log(`new goal created: ${fresh.id}`);

// 4. Self-root loop chain
await admin.from('goals').update({ loop_chain_root_id: fresh.id }).eq('id', fresh.id);

// 5. Enqueue feasibility-analysis job
try {
  await enqueueAgentJob(admin, {
    user_id: freshOwnerId,
    payload: {
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: fresh.id,
      _userId: freshOwnerId,
      userId: freshOwnerId,
      user_id: freshOwnerId,
      context: {
        parsed_category: old.parsed_category || null,
        parsed_priority: old.parsed_priority || 'medium',
        parsed_requirements: old.parsed_requirements || '',
        executor_type: old.executor_type || 'organization',
        org_id: old.org_id || null,
        executor_id: old.executor_id || null,
        concilium_id: old.concilium_id || null,
      },
    },
  });
} catch (enqueueError) {
  console.error('enqueue failed (goal exists but is stuck):', enqueueError.message);
  process.exit(1);
}

// 6. Log creation
await admin.from('goal_log').insert({
  goal_id: fresh.id,
  event_type: 'goal_created',
  details: { title: fresh.title, budget_usd: fresh.budget_usd, cloned_from: oldId },
});

console.log();
console.log('====================================');
console.log('OLD CANCELLED:', oldId);
console.log('NEW GOAL ID  :', fresh.id);
console.log('TITLE        :', fresh.title);
console.log('BUDGET       : $' + fresh.budget_usd);
console.log(
  'MODEL        :',
  fresh.data?.test_model?.provider + '/' + fresh.data?.test_model?.model
);
console.log('LOCAL_ONLY   :', fresh.data?.local_only === true);
console.log('====================================');
console.log('Next: localhost worker picks up the queued feasibility-analysis job within ~15s.');
