/**
 * h99 — Escalate to human
 *
 * Symptom: goal has exhausted heal_attempts (>=6) OR no other strategy
 *          matches a failed/stuck goal. This is the honest fail-safe:
 *          instead of marking 'failed' silently, we flip to 'needs_human'
 *          with a full healing_log trail so the user knows exactly what
 *          was tried.
 *
 * This is the ONLY path (besides user-initiated cancel or successful
 * completion) through which a goal reaches a terminal-like state.
 */
import { transitionHealingGoal } from './_exact-recovery.js';

const MAX_HEAL_ATTEMPTS = 6;

export const name = 'h99-escalate';
export const priority = 99;

export function matches(goal) {
  // Escalate when we've tried too many times, or when we see a failed/stuck
  // goal that no earlier strategy claimed.
  if ((goal.data?.heal_attempts || 0) >= MAX_HEAL_ATTEMPTS) return true;
  if (goal.status === 'failed') return true; // last-resort catch
  return false;
}

export async function apply(admin, goal, { log, otherStrategiesTried = [] }) {
  const nowIso = new Date().toISOString();
  const healingLog = [
    ...(goal.data?.healing_log || []),
    {
      at: nowIso,
      strategy: name,
      reason:
        (goal.data?.heal_attempts || 0) >= MAX_HEAL_ATTEMPTS
          ? `Exhausted heal attempts (${goal.data?.heal_attempts})`
          : 'No strategy matched',
      last_failure: {
        reason: goal.data?.failure_reason,
        stage: goal.data?.failure_stage,
        at: goal.data?.failure_at,
      },
      strategies_tried: otherStrategiesTried,
    },
  ];

  const mergedData = {
    ...(goal.data || {}),
    healing_log: healingLog,
    last_heal_strategy: name,
    last_heal_at: nowIso,
    heal_attempts: Math.max(6, (goal.data?.heal_attempts || 0) + 1),
  };

  const transition = await transitionHealingGoal(
    admin,
    goal,
    {
      status: 'needs_human',
      data: mergedData,
      updated_at: nowIso,
    },
    { strategy: name, log }
  );
  if (!transition.ok) return { action: 'skipped', reason: transition.reason };

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'goal_needs_human',
    details: {
      strategy: name,
      heal_attempts: goal.data?.heal_attempts || 0,
      last_failure: goal.data?.failure_reason,
      strategies_tried: otherStrategiesTried,
    },
  });

  // Best-effort notification — write to notification_log (what MainLayout polls).
  // The old code wrote to `notifications` with a legacy schema that silently
  // failed NOT NULL constraints — see migration 008_ai_notifications.sql.
  try {
    await admin.from('notification_log').insert({
      user_id: goal.user_id,
      channel: 'in_app',
      event_type: 'goal_needs_human',
      subject: 'Goal needs your attention',
      body: `"${goal.title}" couldn't be recovered automatically. ${goal.data?.failure_reason || 'See details.'}`,
      status: 'sent',
      sent_at: nowIso,
      metadata: {
        priority: 'high',
        goal_id: goal.id,
        action: { type: 'navigate', label: 'Open goal', target_url: `/goals?id=${goal.id}` },
      },
    });
  } catch {
    // non-critical — don't fail the healer if notify breaks
  }

  log?.info?.(null, 'self-healer.h99.escalated', {
    goalId: goal.id,
    healAttempts: goal.data?.heal_attempts,
  });
  return { action: 'escalated', healingLog };
}
