/**
 * Self-Healer — bulletproof recovery layer for the goal pipeline.
 *
 * Runs once per cron tick (wired in lib/agent-handlers/process-next.js).
 * Scans non-terminal goals older than 2 minutes, matches each against
 * ordered strategies, and applies the first that fits.
 *
 * Philosophy: the ONLY acceptable terminal states are:
 *   - 'completed'   — goal succeeded
 *   - 'cancelled'   — user cancelled
 *   - 'needs_human' — healer escalated after all strategies exhausted
 *
 * Everything else is transient. `failed` is NOT terminal — the healer
 * picks it up and decides whether to retry, fall back, or escalate.
 *
 * Adding a new strategy = drop a file in healing-strategies/ + register
 * it in STRATEGIES below + add a test block in self-healer.test.js.
 */
import { createLogger } from '../../api/_lib/logger.js';

import * as h00 from './healing-strategies/h00-terminal-llm-error.js';
import * as h01 from './healing-strategies/h01-transient-error.js';
import * as h02 from './healing-strategies/h02-llm-json-fallback.js';
import * as h03 from './healing-strategies/h03-no-jobs-reform.js';
import * as h04 from './healing-strategies/h04-stuck-no-queue.js';
import * as h45 from './healing-strategies/h45-human-credential.js';
import * as h99 from './healing-strategies/h99-escalate.js';

const log = createLogger('self-healer');

// Ordered by priority ASC. To add a strategy later: import it and splice
// in at the right priority slot — the healer sorts and uses first match.
// h00 runs first so terminal LLM errors (credit-balance, invalid-key,
// 401/403) escalate to needs_human in one cycle instead of looping through
// h01-transient retry 6 times.
export const STRATEGIES = [h00, h01, h02, h03, h04, h45, h99].sort(
  (a, b) => a.priority - b.priority
);

const SACRED_STATUSES = new Set([
  'completed',
  'cancelled',
  'needs_human',
  'pending_validation',
  'needs_review',
]);

/**
 * Run healing on a single goal.
 * @returns {Promise<{strategy: string|null, action: string, details: object}>}
 */
export async function healGoal(admin, goal, { req } = {}) {
  if (typeof goal?.user_id !== 'string' || !goal.user_id.trim()) {
    return { strategy: null, action: 'skipped', details: { reason: 'ownerless goal' } };
  }
  if (SACRED_STATUSES.has(goal.status)) {
    return { strategy: null, action: 'skipped', details: { reason: 'sacred status' } };
  }

  // Backfill failure_reason from goal_log if missing. Old goals failed
  // before the Phase 2.1 fix never got failure_reason written into
  // goals.data — but the real reason is still in goal_log.details.reason.
  // We merge it into a working copy of the goal so matchers can see it.
  if (goal.status === 'failed' && !goal.data?.failure_reason) {
    try {
      const { data: lastFail } = await admin
        .from('goal_log')
        .select('details, created_at')
        .eq('goal_id', goal.id)
        .eq('event_type', 'goal_failed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastFail?.details?.reason) {
        goal = {
          ...goal,
          data: {
            ...(goal.data || {}),
            failure_reason: lastFail.details.reason,
            failure_stage: lastFail.details.action || goal.data?.failure_stage,
            failure_at: lastFail.created_at,
          },
        };
      }
    } catch (err) {
      log.warn(req, 'self-healer.backfill.error', { goalId: goal.id, error: err.message });
    }
  }

  // Build context for matchers: queue state + staleness
  const ageMinutes = Math.floor((Date.now() - new Date(goal.updated_at).getTime()) / 60000);
  let hasQueuedJob = false;
  try {
    const { data: jobs, error: queueError } = await admin
      .from('agent_jobs')
      .select('id')
      .eq('user_id', goal.user_id)
      .in('status', ['queued', 'running'])
      .contains('payload', { goalId: goal.id })
      .limit(1);
    if (queueError) throw queueError;
    hasQueuedJob = (jobs || []).length > 0;
  } catch (error) {
    // h04 is allowed to create replacement work only after proving the active
    // queue is empty. A failed probe must therefore look occupied, otherwise a
    // transient read error can manufacture a duplicate executable job.
    hasQueuedJob = true;
    log.warn(req, 'self-healer.queue-probe-unknown', {
      goalId: goal.id,
      error: error?.message || String(error),
    });
  }

  const ctx = { ageMinutes, hasQueuedJob, req, log };

  // Find first matching strategy (excluding h99 which is the fallback)
  const nonEscalate = STRATEGIES.filter((s) => s.name !== 'h99-escalate');
  const tried = [];
  let picked = null;

  for (const strategy of nonEscalate) {
    try {
      if (strategy.matches(goal, ctx)) {
        picked = strategy;
        break;
      }
      tried.push(strategy.name);
    } catch (err) {
      log.warn(req, 'self-healer.match.error', { strategy: strategy.name, error: err.message });
    }
  }

  // Global cap: if we've been healing this goal too many times, escalate
  const healAttempts = goal.data?.heal_attempts || 0;
  if (healAttempts >= 6) {
    picked = h99;
  }

  // No strategy matched a failed goal -> escalate
  if (!picked && goal.status === 'failed') {
    picked = h99;
  }

  if (!picked) {
    return {
      strategy: null,
      action: 'skipped',
      details: { reason: 'no match', status: goal.status, ageMinutes },
    };
  }

  try {
    const result = await picked.apply(admin, goal, { log, req, otherStrategiesTried: tried });

    // ── Phase 3: push a Telegram heads-up when self-heal does material work ──
    // Skip silent no-ops; escalation (h99) is already user-visible elsewhere.
    if (
      goal.user_id &&
      result.action &&
      result.action !== 'skipped' &&
      picked.name !== 'h99-escalate'
    ) {
      try {
        const { notifyUser } = await import('../utils/notify-user.js');
        const appUrl = process.env.PUBLIC_APP_URL || 'https://orchestratori.vercel.app';
        await notifyUser(admin, goal.user_id, 'goal.self_heal', {
          title: `🔧 Auto-fixing goal: ${(goal.title || 'untitled').slice(0, 60)}`,
          body: `Strategy: ${picked.name}\nAction: ${result.action}${result.details?.reason ? `\nReason: ${result.details.reason}` : ''}`,
          deepLink: `${appUrl}/goals?id=${goal.id}`,
          buttons: [
            { text: 'View goal', url: `${appUrl}/goals?id=${goal.id}` },
            { text: 'Dismiss', callback_data: 'digest:dismiss' },
          ],
        });
      } catch (e) {
        log.warn(req, 'self-healer.push.failed', { error: e.message });
      }
    }

    return { strategy: picked.name, action: result.action, details: result };
  } catch (err) {
    log.error(req, 'self-healer.apply.error', err, { goalId: goal.id, strategy: picked.name });
    return { strategy: picked.name, action: 'error', details: { error: err.message } };
  }
}

/**
 * Scan for stuck goals and heal each one.
 * Candidate query: non-terminal goals older than 2 minutes, limit 20.
 */
export async function healAllStuckGoals(admin, { req, maxGoals = 20 } = {}) {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: rawGoals, error } = await admin
    .from('goals')
    .select('id, user_id, title, status, plan, data, updated_at')
    .not('status', 'in', '(completed,cancelled,needs_human,pending_validation,needs_review)')
    .lt('updated_at', twoMinAgo)
    .order('updated_at', { ascending: true })
    .limit(maxGoals);

  if (error) {
    log.warn(req, 'self-healer.scan.error', { error: error.message });
    return { scanned: 0, applied: 0, results: [] };
  }

  // Skip goals already escalated (h00 or h99) — they're parked in needs_human
  // intentionally and re-running the healer would just write duplicate logs.
  //
  // Previously this also filtered out any goal with heal_attempts >= 6, which
  // looked like a sensible cap but actually stranded goals: after h01 retried
  // 6 transient errors and bumped the counter to 6, the goal was filtered out
  // BEFORE h99 ever got a chance to escalate it — leaving it forever in
  // status='failed'. The Auto Parts (GLM) goal hit this exact path.
  //
  // The orchestration logic in healGoal at line ~110 already picks h99 when
  // heal_attempts >= 6, so removing this filter is safe: an exhausted goal
  // gets one more healer tick → h99 escalates → next tick sees
  // last_heal_strategy='h99-escalate' and skips correctly.
  const goals = (rawGoals || []).filter((g) => {
    if (g.data?.last_heal_strategy === 'h99-escalate') return false;
    if (g.data?.last_heal_strategy === 'h00-terminal-llm-error') return false;
    return true;
  });

  const results = [];
  let applied = 0;

  for (const goal of goals) {
    const result = await healGoal(admin, goal, { req });
    results.push({ goalId: goal.id, title: goal.title, ...result });
    if (result.action === 'resumed' || result.action === 'escalated') applied++;
  }

  return { scanned: goals.length, applied, results };
}
