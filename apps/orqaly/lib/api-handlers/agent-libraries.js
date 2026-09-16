/**
 * Agent Libraries handler — per-agent connected MCP/Composio bindings.
 *
 * Routes (op):
 *   list          GET  ?agent_id=…
 *   connect       POST { agent_id, tool_id, opted_in_sensitive?: string[], redirect_url? }
 *   actions       POST { id, action, enabled }
 *   disconnect    POST { id }
 *
 * Catalog allowlist (L1 of the safety model) is enforced here — only entries
 * present in src/config/mcpToolCatalog.js can be connected.
 *
 * VirusTotal scanning is intentionally NOT performed at connect time; see plan.
 * The cron lib/cron/scan-library-endpoints.js refreshes vt_last_scan weekly.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { initiateComposioConnection } from '../composio/executor.js';
import { isComposioConfigured } from '../composio/client.js';
import { MCP_CATALOG, getMcpAppById } from '../../src/config/mcpToolCatalog.js';

const log = createLogger('agent-libraries');

/* ── List connected libraries for an agent (joined with catalog metadata) ─── */
async function handleList(admin, user, query) {
  const { agent_id } = query;
  if (!agent_id) return { status: 400, error: 'agent_id is required' };

  const { data, error } = await admin
    .from('agent_connected_libraries')
    .select('id, tool_id, composio_app, status, enabled_actions, vt_last_scan, invocation_count, last_used_at, created_at')
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const enriched = (data || []).map((row) => {
    const entry = getMcpAppById(row.tool_id);
    return {
      ...row,
      catalog: entry ? {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        subcategory: entry.subcategory,
        riskTier: entry.riskTier,
        endpointUrl: entry.endpointUrl,
        actionsSafe: entry.actionsSafe || [],
        actionsSensitive: entry.actionsSensitive || [],
      } : null,
    };
  });

  return { status: 200, data: enriched };
}

/* ── Connect a catalog library to an agent ────────────────────────────────── */
async function handleConnect(admin, user, body) {
  const { agent_id, tool_id, opted_in_sensitive = [], redirect_url } = body || {};
  if (!agent_id || !tool_id) {
    return { status: 400, error: 'agent_id and tool_id are required' };
  }

  // L1 — Catalog allowlist
  const entry = getMcpAppById(tool_id);
  if (!entry) {
    return { status: 400, error: `Unknown library tool_id: ${tool_id}. Only catalog entries can be connected.` };
  }

  // Normalize opted-in sensitive actions: must be a subset of the entry's actionsSensitive
  const sensitiveAllowed = new Set(entry.actionsSensitive || []);
  const optedIn = Array.isArray(opted_in_sensitive)
    ? opted_in_sensitive.filter((a) => sensitiveAllowed.has(a))
    : [];

  const enabledActions = [...(entry.actionsSafe || []), ...optedIn];

  // Initiate Composio OAuth (returns redirectUrl for the frontend popup)
  if (!isComposioConfigured()) {
    return { status: 503, error: 'Composio is not configured. Add COMPOSIO_API_KEY to environment.' };
  }

  let composioResult;
  try {
    composioResult = await initiateComposioConnection(entry.composioApp, user.id, redirect_url);
  } catch (err) {
    log.warn(null, 'composio.initiate.threw', { tool_id, error: err.message });
    return { status: 502, error: `Composio initiation failed: ${err.message}` };
  }
  if (composioResult?.error) {
    return { status: 502, error: `Composio: ${composioResult.error}` };
  }

  // Insert (or revive) the binding. Status='active' optimistically — if the user
  // never completes the OAuth popup, runtime calls will surface a Composio
  // auth error and we can flip to 'error' from the cron / a future reconciler.
  const { data, error } = await admin
    .from('agent_connected_libraries')
    .upsert(
      {
        user_id: user.id,
        agent_id,
        tool_id: entry.id,
        composio_app: entry.composioApp,
        status: 'active',
        enabled_actions: enabledActions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,agent_id,tool_id' },
    )
    .select('id, tool_id, status, enabled_actions, created_at')
    .single();

  if (error) throw error;

  log.info(null, 'library.connect', { agent_id, tool_id, opted_in_count: optedIn.length });

  return {
    status: 201,
    data: {
      ...data,
      composio: {
        redirectUrl: composioResult.redirectUrl,
        connectionId: composioResult.connectionId,
        status: composioResult.status,
      },
      catalog: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        subcategory: entry.subcategory,
        riskTier: entry.riskTier,
        endpointUrl: entry.endpointUrl,
        actionsSafe: entry.actionsSafe || [],
        actionsSensitive: entry.actionsSensitive || [],
      },
    },
  };
}

/* ── Toggle a single action (per-action allowlist, L6) ────────────────────── */
async function handleActionsToggle(admin, user, body) {
  const { id, action, enabled } = body || {};
  if (!id || !action || typeof enabled !== 'boolean') {
    return { status: 400, error: 'id, action, and enabled (boolean) are required' };
  }

  // Load current row to validate the action belongs to this library's catalog entry
  const { data: row, error: readErr } = await admin
    .from('agent_connected_libraries')
    .select('id, tool_id, enabled_actions, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!row) return { status: 404, error: 'Connected library not found' };

  const entry = getMcpAppById(row.tool_id);
  if (!entry) return { status: 400, error: `Library catalog entry missing: ${row.tool_id}` };

  const allKnown = new Set([...(entry.actionsSafe || []), ...(entry.actionsSensitive || [])]);
  if (!allKnown.has(action)) {
    return { status: 400, error: `Action ${action} is not in the catalog for ${row.tool_id}` };
  }

  const current = new Set(Array.isArray(row.enabled_actions) ? row.enabled_actions : []);
  if (enabled) current.add(action); else current.delete(action);

  const { error: updateErr } = await admin
    .from('agent_connected_libraries')
    .update({ enabled_actions: [...current], updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (updateErr) throw updateErr;

  return { status: 200, data: { id, enabled_actions: [...current] } };
}

/* ── Disconnect (soft — keep row for usage history) ───────────────────────── */
async function handleDisconnect(admin, user, body) {
  const { id } = body || {};
  if (!id) return { status: 400, error: 'id is required' };

  const { error } = await admin
    .from('agent_connected_libraries')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
  return { status: 200, data: { id, disconnected: true } };
}

/* ── Catalog (read-only convenience for the Connect dialog) ──────────────── */
function handleCatalog() {
  // Return the lightweight, frontend-safe view of the catalog.
  const items = MCP_CATALOG.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    subcategory: e.subcategory,
    popular: !!e.popular,
    riskTier: e.riskTier,
    actionsSafe: e.actionsSafe || [],
    actionsSensitive: e.actionsSensitive || [],
    endpointUrl: e.endpointUrl,
  }));
  return { status: 200, data: items };
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user), limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user, req.query);
        break;
      case 'catalog':
        result = handleCatalog();
        break;
      case 'connect':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleConnect(admin, user, body);
        break;
      case 'actions':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleActionsToggle(admin, user, body);
        break;
      case 'disconnect':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleDisconnect(admin, user, body);
        break;
      default:
        return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'agent-libraries');
  }
}
