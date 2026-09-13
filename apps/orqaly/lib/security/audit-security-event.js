/**
 * Write a SECURITY_* row to audit_log. Never throws — audit failures must not
 * break the request path.
 *
 * Action taxonomy:
 *   SECURITY_BLOCKED — user input was rejected (action='block')
 *   SECURITY_WARNED  — input was accepted after sanitization (action='warn')
 *   SECURITY_INFO    — low-severity flag, logged only
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('security-audit');

const MAX_SAMPLE_LEN = 80;

function truncateSample(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (s.length <= MAX_SAMPLE_LEN) return s;
  return `${s.slice(0, MAX_SAMPLE_LEN)}…`;
}

function actionForGuardResult(guardResult) {
  if (guardResult.action === 'block') return 'SECURITY_BLOCKED';
  if (guardResult.action === 'warn') return 'SECURITY_WARNED';
  if (guardResult.severity === 'low') return 'SECURITY_INFO';
  return null;
}

/**
 * @param {object} opts
 * @param {string|null} opts.userId
 * @param {string} opts.context       - e.g. 'import-keys-preview:paste', 'assistant-chat'
 * @param {{severity, action, flags, cleaned?}} opts.guardResult
 * @param {string} [opts.sample]      - representative offending text (truncated to 80 chars)
 */
export async function auditSecurityEvent({ userId, context, guardResult, sample }) {
  const action = actionForGuardResult(guardResult);
  if (!action) return; // 'allow' with no flags — nothing to record

  const admin = buildSupabaseAdminClient();
  if (!admin) return;

  try {
    await admin.from('audit_log').insert({
      action,
      entity: 'security_guard',
      entity_id: context,
      user_id: userId || null,
      details: JSON.stringify({
        context,
        severity: guardResult.severity,
        decision: guardResult.action,
        flags: guardResult.flags,
        sample: truncateSample(sample),
      }),
    });
  } catch (err) {
    log.warn(null, 'audit.insert_failed', { err: err.message });
  }
}
