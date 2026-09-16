/**
 * GET /api/human-tasks-escalate
 *
 * Safety reconciler for legacy credential checkpoints. Automatic paid-human
 * dispatch is intentionally disabled: credential tasks always remain with the
 * authenticated account owner. Each unsafe legacy row is downgraded with an
 * exact-snapshot CAS so a concurrent claim/completion/cancel wins cleanly.
 */
import { cors } from '../../api/_lib/cors.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('human-tasks-escalate');

const CRON_SECRET = process.env.CRON_SECRET || '';
const MAX_PER_TICK = 100;
const ACTIVE_TASK_STATUSES = ['pending', 'claimed'];
const CREDENTIAL_TASK_TYPES = ['provide_credential', 'provide_key', 'manual_signup'];
const RELEASED_LEGACY_OUTCOMES = new Set([
  'no_rentahuman_key',
  'budget_exceeded',
  'origin_not_allowlisted',
  'submit_failed',
  'policy_rejected',
]);

function verifyCron(req) {
  const auth = req.headers?.authorization || '';
  const bearer = auth.replace(/^Bearer\s+/i, '');
  return CRON_SECRET && bearer === CRON_SECRET;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }
  if (!verifyCron(req)) return jsonError(res, 401, 'Unauthorized');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const done = log.startTimer(req, 'tick');
  try {
    const selectFields =
      'id, user_id, type, status, claimed_at, escalated_at, escalation_allowed, escalate_after_seconds, escalation_result, updated_at';
    const [unsafeTimers, legacySentinels] = await Promise.all([
      admin
        .from('human_tasks')
        .select(selectFields)
        .in('type', CREDENTIAL_TASK_TYPES)
        .in('status', ACTIVE_TASK_STATUSES)
        .or('escalation_allowed.eq.true,escalate_after_seconds.not.is.null')
        .order('created_at', { ascending: true })
        .limit(MAX_PER_TICK),
      admin
        .from('human_tasks')
        .select(selectFields)
        .in('type', CREDENTIAL_TASK_TYPES)
        .in('status', ACTIVE_TASK_STATUSES)
        .not('escalated_at', 'is', null)
        .order('created_at', { ascending: true })
        .limit(MAX_PER_TICK),
    ]);
    if (unsafeTimers.error) throw unsafeTimers.error;
    if (legacySentinels.error) throw legacySentinels.error;
    const candidates = [
      ...new Map(
        [...(unsafeTimers.data || []), ...(legacySentinels.data || [])].map((task) => [
          task.id,
          task,
        ])
      ).values(),
    ];

    const downgraded = [];
    for (const task of candidates || []) {
      const releaseLegacySentinel =
        Boolean(task.escalated_at) && RELEASED_LEGACY_OUTCOMES.has(task.escalation_result?.status);
      const hasUnsafeTimer = task.escalation_allowed || task.escalate_after_seconds !== null;
      if (!hasUnsafeTimer && !releaseLegacySentinel) continue;

      const patch = {
        escalation_allowed: false,
        escalate_after_seconds: null,
        ...(releaseLegacySentinel ? { escalated_at: null } : {}),
      };
      let update = admin
        .from('human_tasks')
        .update(patch)
        .eq('id', task.id)
        .eq('user_id', task.user_id)
        .eq('type', task.type)
        .eq('status', task.status)
        .eq('updated_at', task.updated_at);

      update = task.claimed_at
        ? update.eq('claimed_at', task.claimed_at)
        : update.is('claimed_at', null);
      update = task.escalated_at
        ? update.eq('escalated_at', task.escalated_at)
        : update.is('escalated_at', null);

      const { data: ownerTask, error: updateError } = await update.select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!ownerTask) continue;
      downgraded.push({
        id: task.id,
        status:
          task.escalated_at && !releaseLegacySentinel ? 'legacy_dispatch_locked' : 'owner_only',
      });
    }

    done({ status: 200, candidates: candidates?.length || 0, downgraded: downgraded.length });
    return res.status(200).json({
      ok: true,
      scanned: candidates?.length || 0,
      downgraded,
    });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'human-tasks-escalate');
  }
}
