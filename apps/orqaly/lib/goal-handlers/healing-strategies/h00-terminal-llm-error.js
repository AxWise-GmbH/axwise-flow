/**
 * h00 — Terminal LLM error escalation
 *
 * Symptom: goal.status='failed' and failure_reason matches a known terminal
 *          LLM provider error — credit balance exhausted, invalid API key,
 *          401/403 from any provider, BYOK_REQUIRED, SYSTEM_API_KEY_MISSING,
 *          or "claude-code failed and CLAUDE_CODE_LOCAL=all forbids paid-API
 *          fallback" (from llm-executor under explicit subscription mode).
 *
 * Recovery: NONE. These errors won't fix themselves between healer cycles —
 *           retrying just burns wall-clock and inflates the goal's budget
 *           timer. Escalate to needs_human immediately so the user can fix
 *           credentials / top up credits / run `claude login` and then click
 *           "Resolve & resume".
 *
 * Priority 0 — runs BEFORE h01-transient-error so credit/auth errors don't
 * get mistakenly retried as transient (the same goal would just hit the
 * same wall five more times before h99 finally escalates after 6 attempts).
 */
import { transitionHealingGoal } from './_exact-recovery.js';

// Patterns that mean "this LLM provider call will never succeed without
// human intervention" — billing, auth, quota. Includes vendor-specific
// wording: Anthropic ("credit balance is too low"), OpenAI ("insufficient_quota",
// "Incorrect API key"), Alibaba/Qwen dashscope ("Arrearage", "Access denied",
// "overdue payment"), generic HTTP 401/403, and our own auth-related throws.
const TERMINAL_LLM_RE =
  /credit balance is too low|insufficient[_ ]quota|invalid[_ ]api[_ ]key|incorrect api key|\b401\b|\b403\b|BYOK_REQUIRED:|SYSTEM_API_KEY_MISSING:|CLAUDE_CODE_LOCAL=all forbids paid-API fallback|authentication[_ ]error|unauthorized|arrearage|access[_ ]denied|overdue[_ ]payment|account[_ ]suspended|quota[_ ]exceeded|permission[_ ]denied|CLAUDE_CODE_STREAM_TIMEOUT_TERMINAL/i;

export const name = 'h00-terminal-llm-error';
export const priority = 0;

export function matches(goal) {
  if (goal.status !== 'failed') return false;
  const reason = goal.data?.failure_reason || '';
  return TERMINAL_LLM_RE.test(reason);
}

export async function apply(admin, goal, { log, otherStrategiesTried = [] }) {
  const nowIso = new Date().toISOString();
  const reason = goal.data?.failure_reason || '(unknown)';

  const healingLog = [
    ...(goal.data?.healing_log || []),
    {
      at: nowIso,
      strategy: name,
      reason: 'Terminal LLM provider error — not retryable',
      last_failure: {
        reason: goal.data?.failure_reason,
        stage: goal.data?.failure_stage,
        at: goal.data?.failure_at,
      },
      strategies_tried: otherStrategiesTried,
    },
  ];

  // Don't increment heal_attempts — this isn't a retry, it's a recognition
  // that nothing the healer could try would help. Cap at 6 so h99 won't
  // re-process the goal on later scans (the >=6 skip filter in
  // healAllStuckGoals deduplicates).
  const mergedData = {
    ...(goal.data || {}),
    healing_log: healingLog,
    last_heal_strategy: name,
    last_heal_at: nowIso,
    heal_attempts: 6,
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
      classification: 'terminal_llm_error',
      reason,
      stage: goal.data?.failure_stage,
      strategies_tried: otherStrategiesTried,
    },
  });

  // Notification — same shape h99 writes so MainLayout's poller picks it up.
  try {
    await admin.from('notification_log').insert({
      user_id: goal.user_id,
      channel: 'in_app',
      event_type: 'goal_needs_human',
      subject: 'Goal needs your attention',
      body: `"${goal.title}" hit a non-retryable LLM error: ${reason.slice(0, 200)}`,
      status: 'sent',
      sent_at: nowIso,
      metadata: {
        priority: 'high',
        goal_id: goal.id,
        classification: 'terminal_llm_error',
        action: { type: 'navigate', label: 'Open goal', target_url: `/goals?id=${goal.id}` },
      },
    });
  } catch {
    // best-effort
  }

  log?.info?.(null, 'self-healer.h00.escalated', { goalId: goal.id, reason });
  return { action: 'escalated', healingLog, classification: 'terminal_llm_error' };
}
