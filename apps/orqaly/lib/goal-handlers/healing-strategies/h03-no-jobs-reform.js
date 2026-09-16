/**
 * h03 — No-jobs team reform
 *
 * Symptom: evaluate-phase threw "no jobs found" (from our Phase 2.2 fix),
 *          meaning team-formation silently produced zero tasks.
 * Recovery: delete any orphan tasks for the current phase, reset phase to
 *           'pending', re-enqueue team-formation so a fresh team/tasks get
 *           created.
 */
import { enqueueHealingContinuation, transitionHealingGoal } from './_exact-recovery.js';

const NO_JOBS_RE = /no jobs found/i;

export const name = 'h03-no-jobs-reform';
export const priority = 20;

export function matches(goal) {
  if (goal.status !== 'failed') return false;
  const reason = goal.data?.failure_reason || '';
  return NO_JOBS_RE.test(reason);
}

export async function apply(admin, goal, { log, triggerProcessNextImpl } = {}) {
  const phases = goal.plan?.phases || [];
  const phaseIndex = Math.max(
    0,
    phases.findIndex((p) => p.status === 'executing' || p.status === 'pending')
  );
  const healAttempts = (goal.data?.heal_attempts || 0) + 1;
  const nowIso = new Date().toISOString();

  // Reset phase status
  const newPhases = phases.map((p, i) => (i === phaseIndex ? { ...p, status: 'pending' } : p));

  const mergedData = {
    ...(goal.data || {}),
    heal_attempts: healAttempts,
    last_heal_strategy: name,
    last_heal_at: nowIso,
    failure_reason: null,
    failure_stack: null,
    previous_failure: {
      reason: goal.data?.failure_reason,
      stage: goal.data?.failure_stage,
      at: goal.data?.failure_at,
    },
  };

  const transition = await transitionHealingGoal(
    admin,
    goal,
    {
      status: 'forming_team',
      plan: { ...(goal.plan || {}), phases: newPhases },
      data: mergedData,
      updated_at: nowIso,
    },
    { strategy: name, log }
  );
  if (!transition.ok) return { action: 'skipped', reason: transition.reason };

  const continuation = await enqueueHealingContinuation(admin, goal, transition, {
    action: 'team-formation',
    strategy: name,
    log,
    triggerProcessNextImpl,
    beforeEnqueue: async () => {
      const { error } = await admin.from('team_tasks').delete().eq('goal_id', goal.id);
      if (error) throw error;
    },
  });
  if (!continuation.ok) return { action: 'skipped', reason: continuation.reason };

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'goal_healed',
    details: { strategy: name, phaseIndex, heal_attempts: healAttempts },
  });

  log?.info?.(null, 'self-healer.h03.applied', { goalId: goal.id, phaseIndex, healAttempts });
  return { action: 'resumed', phaseIndex, healAttempts, jobId: continuation.jobId };
}
