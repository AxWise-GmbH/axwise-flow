/**
 * Cloud Storage Monitor - real-data view over the KB connections.
 *
 * GET  /api/app?path=storage-monitor                 -> { overview, providers, errors, activity }
 * GET  /api/app?path=storage-monitor&view=history&range=30 -> { series, rows }
 * POST /api/app?path=storage-monitor&action=snapshot -> { snapped }   (record now)
 *
 * All numbers are real: storage from live provider quota probes (fail-soft),
 * sync/health/errors from kb_connections + integration_credentials + audit_log.
 * No live-transfer/speed metrics (unmeasurable on this architecture).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { getConnectionUsage, recordStorageSnapshot } from './_shared/kb-usage.js';

const LABELS = {
  notion: 'Notion',
  obsidian: 'Obsidian',
  'google-drive': 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  mega: 'Mega',
};

function statusFor(conn, usageOk, authStatus) {
  if (conn.enabled === false) return 'offline';
  if (authStatus === 'needs_reauth') return 'needs_attention';
  if (conn.last_sync_ok === false || usageOk === false) return 'needs_attention';
  return 'online';
}

async function loadAuthStatuses(admin, userId) {
  const { data } = await admin
    .from('integration_credentials')
    .select('provider,status')
    .eq('user_id', userId);
  const map = {};
  for (const r of data || []) map[r.provider] = r.status;
  return map;
}

export default async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifySupabaseToken(getBearerToken(req));
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const isWrite = req.method === 'POST';
    const rl = checkRateLimit({
      key: `storage-monitor:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
      limit: isWrite ? 20 : 60,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const loadConns = async () =>
      (
        await admin
          .from('kb_connections')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_current', true)
          .order('created_at', { ascending: true })
      ).data || [];

    // ── record a snapshot now (called once on mount, not on poll) ─────────
    if (req.method === 'POST' && (req.query?.action || req.body?.action) === 'snapshot') {
      const conns = await loadConns();
      let snapped = 0;
      await Promise.all(
        conns.map(async (c) => {
          const usage = await getConnectionUsage({ admin, userId: user.id, conn: c });
          await recordStorageSnapshot({ admin, userId: user.id, conn: c, usage });
          snapped += 1;
        })
      );
      return res.status(200).json({ snapped });
    }

    if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

    // ── history (snapshot time-series) ───────────────────────────────────
    if (req.query?.view === 'history') {
      const range = Math.min(Math.max(parseInt(req.query?.range, 10) || 30, 1), 365);
      const since = new Date(Date.now() - range * 86400_000).toISOString().slice(0, 10);
      const { data: rows } = await admin
        .from('storage_metric_snapshots')
        .select('snapshot_date, source_type, bytes_used, docs_count')
        .eq('user_id', user.id)
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true });
      // Total bytes-used per day across providers (for the storage-growth chart).
      const byDate = new Map();
      for (const r of rows || []) {
        const cur = byDate.get(r.snapshot_date) || { date: r.snapshot_date, bytes_used: 0, docs_count: 0 };
        cur.bytes_used += Number(r.bytes_used || 0);
        cur.docs_count += Number(r.docs_count || 0);
        byDate.set(r.snapshot_date, cur);
      }
      return res.status(200).json({ series: [...byDate.values()], rows: rows || [] });
    }

    // ── current snapshot (live probe, read-only) ─────────────────────────
    const conns = await loadConns();
    const authStatuses = await loadAuthStatuses(admin, user.id);

    const providers = await Promise.all(
      conns.map(async (c) => {
        const usage = await getConnectionUsage({ admin, userId: user.id, conn: c });
        const credProvider = c.credential_ref?.provider || c.source_type;
        const authStatus = c.credential_ref?.kind === 'oauth' ? authStatuses[credProvider] || 'active' : 'connected';
        const quotaPct =
          usage.bytesUsed != null && usage.bytesTotal
            ? Math.round((usage.bytesUsed / usage.bytesTotal) * 1000) / 10
            : null;
        return {
          id: c.id,
          source_type: c.source_type,
          label: LABELS[c.source_type] || c.source_type,
          mode: c.mode,
          status: statusFor(c, usage.ok, authStatus),
          bytesUsed: usage.bytesUsed,
          bytesTotal: usage.bytesTotal,
          quotaPct,
          docsCount: usage.docsCount,
          latencyMs: usage.ok ? usage.latencyMs : null,
          lastSyncedAt: c.last_synced_at,
          lastSyncOk: c.last_sync_ok,
          lastError: c.last_sync_ok === false ? c.last_sync_error : usage.ok ? null : usage.error,
          authStatus,
          syncIntervalSecs: c.sync_interval_secs,
        };
      })
    );

    const overview = {
      connected: providers.length,
      online: providers.filter((p) => p.status === 'online').length,
      offline: providers.filter((p) => p.status === 'offline').length,
      needsAttention: providers.filter((p) => p.status === 'needs_attention').length,
      totalBytesUsed: providers.reduce((s, p) => s + (p.bytesUsed || 0), 0),
      totalBytesTotal: providers.reduce((s, p) => s + (p.bytesTotal || 0), 0),
      totalDocs: providers.reduce((s, p) => s + (p.docsCount || 0), 0),
      activeSyncJobs: providers.filter((p) => p.syncIntervalSecs).length,
    };

    const errors = providers
      .filter((p) => p.lastError)
      .map((p) => ({ source_type: p.source_type, label: p.label, error: p.lastError, at: p.lastSyncedAt }));

    const { data: activity } = await admin
      .from('audit_log')
      .select('action, entity_id, details, created_at')
      .eq('user_id', user.id)
      .eq('entity', 'kb_connections')
      .order('created_at', { ascending: false })
      .limit(30);

    return res.status(200).json({ overview, providers, errors, activity: activity || [] });
  } catch (err) {
    return handleApiError(res, err, 'storage-monitor');
  }
}
