/**
 * Per-user quota enforcement.
 *
 * Reads from public.user_quotas (defaults are conservative: 50 goals/day,
 * 200 jobs/hour, 10 concurrent goals, 500 MB platform-default storage).
 * Counters come from real DB tables — no in-memory state — so quotas survive
 * deploys, are accurate across multiple worker processes, and can be audited.
 *
 * Called from lib/agent-handlers/enqueue.js BEFORE the job row is inserted.
 * If a quota is exceeded, returns { allowed: false, code, message } and the
 * caller surfaces an HTTP 429.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('user-quotas');

const HARD_DEFAULTS = {
  max_storage_mb: 500,
  max_goals_per_day: 50,
  max_jobs_per_hour: 200,
  max_concurrent_goals: 10,
  tier: 'free',
};

/**
 * Load the user's quota row, returning HARD_DEFAULTS if no row exists yet
 * (the auth.users INSERT trigger should have created one, but defend against
 * race conditions where the trigger hasn't fired yet).
 */
export async function getUserQuotas(admin, userId) {
  if (!admin || !userId) return { ...HARD_DEFAULTS };
  const { data, error } = await admin
    .from('user_quotas')
    .select('max_storage_mb, max_goals_per_day, max_jobs_per_hour, max_concurrent_goals, tier')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    log.warn(null, 'quota.read_failed', { userId, err: error.message });
    return { ...HARD_DEFAULTS };
  }
  return data || { ...HARD_DEFAULTS };
}

/**
 * Check if the user is within all relevant quotas to enqueue a new job.
 *
 * @param {object} admin - Supabase service-role client
 * @param {string} userId
 * @param {object} opts
 * @param {string} [opts.jobType] - The job type being enqueued. Goal-creating
 *                                  jobs ('orchestrate-goal') count toward goals/day,
 *                                  others toward jobs/hour.
 * @returns {Promise<{allowed: boolean, code?: string, message?: string, quotas?: object, usage?: object}>}
 */
export async function checkQuotas(admin, userId, { jobType } = {}) {
  if (!admin || !userId) return { allowed: true }; // can't enforce without context
  const quotas = await getUserQuotas(admin, userId);

  const isGoalCreating = jobType === 'orchestrate-goal';
  const usage = {};

  // Goals per day (only for goal-creating jobs)
  if (isGoalCreating) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: goalsToday, error: goalsErr } = await admin
      .from('goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayAgo);
    if (!goalsErr) {
      usage.goals_today = goalsToday || 0;
      if (usage.goals_today >= quotas.max_goals_per_day) {
        return {
          allowed: false,
          code: 'QUOTA_GOALS_PER_DAY',
          message: `Daily goal limit reached (${quotas.max_goals_per_day}). Resets in 24h.`,
          quotas,
          usage,
        };
      }
    }

    // Concurrent active goals
    const { count: activeGoals, error: activeErr } = await admin
      .from('goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['planning', 'active', 'pending_validation', 'paused']);
    if (!activeErr) {
      usage.active_goals = activeGoals || 0;
      if (usage.active_goals >= quotas.max_concurrent_goals) {
        return {
          allowed: false,
          code: 'QUOTA_CONCURRENT_GOALS',
          message: `Concurrent active goals limit reached (${quotas.max_concurrent_goals}). Complete or cancel an existing goal first.`,
          quotas,
          usage,
        };
      }
    }
  }

  // Jobs per hour (all job types — protects Vercel function invocations).
  // The agent_jobs table doesn't carry user_id directly; payload.._userId is
  // the canonical owner field set by enqueue.js. Postgres jsonb access lets
  // us count without a separate column.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: jobsThisHour, error: jobsErr } = await admin
    .from('agent_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('payload->>_userId', userId)
    .gte('created_at', hourAgo);
  if (!jobsErr) {
    usage.jobs_this_hour = jobsThisHour || 0;
    if (usage.jobs_this_hour >= quotas.max_jobs_per_hour) {
      return {
        allowed: false,
        code: 'QUOTA_JOBS_PER_HOUR',
        message: `Hourly job limit reached (${quotas.max_jobs_per_hour}). Wait a few minutes before queuing more.`,
        quotas,
        usage,
      };
    }
  }

  return { allowed: true, quotas, usage };
}

/**
 * Storage quota check — separate from job-quota path because storage writes
 * happen in StorageWriter (BYOS), not in the enqueue path. Returns bytes
 * remaining or 0 if at/over cap. BYOS-connected users are not bound by this
 * (their quota lives in their own bucket).
 */
export async function getStorageQuotaRemaining(admin, userId, currentBytesUsed = null) {
  if (!admin || !userId) return Number.MAX_SAFE_INTEGER;
  const quotas = await getUserQuotas(admin, userId);
  const capBytes = quotas.max_storage_mb * 1024 * 1024;

  if (currentBytesUsed === null) {
    // Caller didn't pre-compute usage; query goal_artifacts for total bytes.
    const { data, error } = await admin
      .from('goal_artifacts')
      .select('bytes')
      .eq('user_id', userId)
      .is('storage_connection_id', null) // platform-default only
      .is('deleted_at', null);
    if (error) {
      log.warn(null, 'quota.storage_read_failed', { userId, err: error.message });
      return capBytes; // optimistic on error
    }
    currentBytesUsed = (data || []).reduce((acc, row) => acc + (row.bytes || 0), 0);
  }

  return Math.max(0, capBytes - currentBytesUsed);
}
