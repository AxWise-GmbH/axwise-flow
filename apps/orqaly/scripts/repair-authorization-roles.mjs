#!/usr/bin/env node
/**
 * Recover goals blocked by a structurally invalid execution-authorization
 * manifest, typically task_agent_role_mismatch.
 *
 * The self-healer cannot reach these: healAllStuckGoals excludes needs_human,
 * and additionally skips anything already escalated by h99. The reconciler
 * excludes awaiting_approval as user-action state. So they sit forever.
 *
 * This applies the same patch as the rebuild_team resolution: drop the team,
 * invalidate the execution approval, and re-enqueue team-formation. Since
 * team-formation now refuses to persist a task it cannot authorize, the goal
 * either re-forms cleanly or stops with a readable reason. It cannot loop.
 *
 * Dry run by default. Nothing is written without --apply.
 *
 *   node --env-file=.env.local scripts/repair-authorization-roles.mjs
 *   node --env-file=.env.local scripts/repair-authorization-roles.mjs --apply
 *   node --env-file=.env.local scripts/repair-authorization-roles.mjs --goal <id> --apply
 */
import { createClient } from '@supabase/supabase-js';
import {
  authorizationFailureReason,
  classifyAuthorizationIssues,
} from '../lib/_shared/authorization-issues.js';
import { enqueueAgentJob } from '../lib/goal-handlers/_helpers.js';

const APPLY = process.argv.includes('--apply');
const goalFlag = process.argv.indexOf('--goal');
const ONLY_GOAL = goalFlag > -1 ? process.argv[goalFlag + 1] : null;

/** Statuses a stuck goal can be parked in. Both are resolvable. */
const STUCK_STATUSES = ['needs_human', 'awaiting_approval', 'awaiting_tools'];

export function planRepair(goal) {
  const manifest = goal?.data?.execution_authorization?.manifest;
  if (!manifest || manifest.valid !== false) {
    return { repairable: false, reason: 'manifest is not invalid' };
  }
  const classified = classifyAuthorizationIssues(manifest.issues);
  if (classified.kind !== 'structural') {
    return { repairable: false, reason: `issues are ${classified.kind}, not structural` };
  }
  return {
    repairable: true,
    issueCount: classified.structural.length,
    reason: authorizationFailureReason(manifest.issues, {
      assignments: goal.proposal?.assignments || [],
    }),
  };
}

/** The same patch rebuild_team applies, kept in one place so they cannot drift. */
export function buildRepairPatch(goal) {
  return {
    status: 'forming_team',
    agent_team_id: null,
    team_id: null,
    updated_at: new Date().toISOString(),
    data: {
      ...(goal.data || {}),
      failure_reason: null,
      failed_at: null,
      execution_authorization: null,
      team_coverage: null,
      goal_approvals: {
        ...(goal.data?.goal_approvals || {}),
        execution: goal.data?.goal_approvals?.execution
          ? {
              ...goal.data.goal_approvals.execution,
              status: 'invalidated',
              invalidated_at: new Date().toISOString(),
              invalidation_reason: 'team_rebuild_requested',
            }
          : null,
      },
      hitl_auto_approvals: { ...(goal.data?.hitl_auto_approvals || {}), execution: 0 },
      heal_attempts: 0,
      last_heal_strategy: null,
    },
  };
}

async function main() {
  const admin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  let query = admin
    .from('goals')
    .select('id, title, status, user_id, hitl_mode, proposal, data')
    .in('status', STUCK_STATUSES);
  if (ONLY_GOAL) query = query.eq('id', ONLY_GOAL);

  const { data: goals, error } = await query;
  if (error) throw error;

  const repairable = [];
  const skipped = [];
  for (const goal of goals || []) {
    const plan = planRepair(goal);
    (plan.repairable ? repairable : skipped).push({ goal, plan });
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}`);
  console.log(
    `scanned ${goals?.length || 0} parked goal(s) | repairable ${repairable.length} | skipped ${skipped.length}\n`
  );

  for (const { goal, plan } of repairable) {
    console.log(`${goal.id}  [${goal.status}]  ${String(goal.title).slice(0, 60)}`);
    console.log(`  ${plan.issueCount} structural issue(s)`);
    console.log(`  ${plan.reason}\n`);
  }

  if (skipped.length) {
    console.log('Skipped:');
    for (const { goal, plan } of skipped) {
      console.log(`  ${goal.id}  ${plan.reason}`);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log('Nothing changed. Re-run with --apply to repair.');
    return;
  }

  let repaired = 0;
  for (const { goal } of repairable) {
    const ownerId = typeof goal.user_id === 'string' ? goal.user_id.trim() : '';
    if (!ownerId) {
      console.error(`  FAILED ${goal.id}: goal has no durable owner`);
      continue;
    }
    const { error: updateError } = await admin
      .from('goals')
      .update(buildRepairPatch(goal))
      .eq('id', goal.id)
      .eq('user_id', ownerId);
    if (updateError) {
      console.error(`  FAILED ${goal.id}: ${updateError.message}`);
      continue;
    }
    try {
      await enqueueAgentJob(admin, {
        user_id: ownerId,
        payload: {
          type: 'orchestrate-goal',
          action: 'team-formation',
          goalId: goal.id,
          _userId: ownerId,
          userId: ownerId,
          user_id: ownerId,
        },
      });
    } catch (jobError) {
      console.error(`  QUEUED FAILED ${goal.id}: ${jobError.message}`);
      continue;
    }
    repaired += 1;
  }
  console.log(`Repaired ${repaired} of ${repairable.length}. team-formation queued for each.`);
}

// Only run when invoked directly, so the pure helpers stay unit-testable.
if (process.argv[1] && process.argv[1].endsWith('repair-authorization-roles.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
