/**
 * Weekly background re-scan of every distinct endpointUrl across
 * agent_connected_libraries. Updates vt_last_scan and degrades status to
 * 'vt_warn' when the verdict worsens.
 *
 * Scheduled via vercel.json crons. Authenticated by the shared fail-closed
 * service Bearer boundary.
 *
 * Free-tier-safe: caches verdicts per URL within a single run so we hit VT
 * once per distinct endpoint, not once per row.
 */
import { applyRateLimitHeaders, checkRateLimit } from '../../api/_lib/rate-limit.js';
import { jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { serviceRequestAuthError } from '../../api/_lib/service-auth.js';
import { scanUrl } from '../integrations/virustotal.js';
import { getMcpAppById } from '../../src/config/mcpToolCatalog.js';

const log = createLogger('scan-library-endpoints');

export default async function handler(req, res) {
  const authError = serviceRequestAuthError(req);
  if (authError) return jsonError(res, authError.status, authError.message);

  // Light rate-limit so a stuck cron doesn't hammer VT
  const rl = checkRateLimit({ key: 'scan-library-endpoints:global', limit: 4, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  if (!process.env.VIRUSTOTAL_API_KEY) {
    log.warn(req, 'no-vt-key');
    return res.status(200).json({ scanned: 0, skipped: 'no VIRUSTOTAL_API_KEY' });
  }

  const admin = buildSupabaseAdminClient();
  return runScan(admin, req, res);
}

/**
 * Scan loop — exported for testing.
 *
 * @param {object} admin           Supabase admin client
 * @param {object} req
 * @param {object} res
 * @param {object} [deps]          Test seam: override scanUrl + catalog lookup
 * @param {(url: string) => Promise<object>} [deps.scan]
 * @param {(toolId: string) => object|null} [deps.lookup]
 */
export async function runScan(admin, req, res, deps = {}) {
  const scan = deps.scan || scanUrl;
  const lookup = deps.lookup || getMcpAppById;

  // Pull distinct tool_ids that have any non-revoked rows
  const { data: rows, error: readErr } = await admin
    .from('agent_connected_libraries')
    .select('id, tool_id, status, vt_last_scan')
    .neq('status', 'revoked');

  if (readErr) {
    log.warn(req, 'read-failed', { error: readErr.message });
    return res.status(500).json({ error: readErr.message });
  }

  const toolIds = [...new Set((rows || []).map((r) => r.tool_id))];
  const verdictByToolId = {};
  let scannedUrls = 0;
  let failedUrls = 0;

  for (const toolId of toolIds) {
    const entry = lookup(toolId);
    const url = entry?.endpointUrl;
    if (!url) {
      log.warn(req, 'no-endpoint-url', { toolId });
      continue;
    }
    try {
      verdictByToolId[toolId] = await scan(url);
      scannedUrls += 1;
    } catch (err) {
      log.warn(req, 'vt-scan-failed', { toolId, url, error: err.message });
      failedUrls += 1;
    }
  }

  // Update each row with the verdict for its tool_id
  let updated = 0;
  let degraded = 0;
  for (const row of rows || []) {
    const verdict = verdictByToolId[row.tool_id];
    if (!verdict) continue;

    const nextStatus =
      verdict.verdict === 'block' || verdict.verdict === 'warn'
        ? 'vt_warn'
        : row.status === 'vt_warn'
          ? 'active'
          : row.status;

    if (nextStatus !== row.status) degraded += 1;

    const { error } = await admin
      .from('agent_connected_libraries')
      .update({ vt_last_scan: verdict, status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!error) updated += 1;
  }

  log.info(req, 'scan-complete', {
    scannedUrls,
    failedUrls,
    updated,
    degraded,
    toolIds: toolIds.length,
  });
  return res.status(200).json({
    scanned: scannedUrls,
    failed: failedUrls,
    rowsUpdated: updated,
    rowsDegraded: degraded,
    toolIds: toolIds.length,
  });
}
