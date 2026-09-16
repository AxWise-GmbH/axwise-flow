/**
 * Daily archival sweep: prune hot tables so the database stays within
 * Supabase free-tier limits indefinitely. Called from Phase 3 pulses.
 *
 * Strategy per table (see plan §2.4):
 *   goal_memory       — keep 90d hot; summarise older to a single row per chain
 *   agent_decisions   — keep 180d hot; export+delete
 *   pulse_runs        — keep 30d hot; hard delete
 *   goal_log          — keep 180d hot; hard delete
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('archival.sweep');

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400 * 1000).toISOString();
}

export async function runArchivalSweep(admin, { req } = {}) {
  const stats = { goal_memory_pruned: 0, agent_decisions_pruned: 0, pulse_runs_pruned: 0, goal_log_pruned: 0 };

  // goal_memory: hard prune oldest rows past 90 days (summarisation deferred —
  // doing it inline would cost LLM tokens on every sweep; future phase).
  try {
    const { count } = await admin.from('goal_memory')
      .delete({ count: 'exact' })
      .lt('created_at', isoDaysAgo(90));
    stats.goal_memory_pruned = count || 0;
  } catch (err) {
    log.warn(req, 'sweep.goal_memory.failed', { error: err.message });
  }

  try {
    const { count } = await admin.from('agent_decisions')
      .delete({ count: 'exact' })
      .lt('created_at', isoDaysAgo(180));
    stats.agent_decisions_pruned = count || 0;
  } catch (err) {
    log.warn(req, 'sweep.agent_decisions.failed', { error: err.message });
  }

  try {
    const { count } = await admin.from('pulse_runs')
      .delete({ count: 'exact' })
      .lt('fired_at', isoDaysAgo(30));
    stats.pulse_runs_pruned = count || 0;
  } catch (err) {
    log.warn(req, 'sweep.pulse_runs.failed', { error: err.message });
  }

  try {
    const { count } = await admin.from('goal_log')
      .delete({ count: 'exact' })
      .lt('created_at', isoDaysAgo(180));
    stats.goal_log_pruned = count || 0;
  } catch (err) {
    log.warn(req, 'sweep.goal_log.failed', { error: err.message });
  }

  log.info(req, 'sweep.done', stats);
  return stats;
}
