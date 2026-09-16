/**
 * [module: connection-hub]
 * Activity Feed handler — unifies four event streams into a single timeline
 * so users no longer have to check Goals, Pulse, Tools, and the bell icon
 * to understand what the platform is doing.
 *
 * Sources unioned (all scoped to the authenticated user):
 *   - goal_log          pipeline stage transitions (scoped via goals.user_id)
 *   - notification_log  in-app notifications (direct user_id)
 *   - pulse_cycles      autonomous cycle outcomes (scoped via agents.user_id)
 *   - communication_logs agent chat entries (direct user_id)
 *
 * GET ?op=list
 *   Query: source, severity, goal_id, limit (default 100, max 200)
 *   Returns { events: NormalizedEvent[], total }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('communicator-activity-feed');

const VALID_SOURCES = new Set(['goal_log', 'notification_log', 'pulse_cycle', 'communication_log']);
const VALID_SEVERITIES = new Set(['info', 'success', 'warn', 'error', 'needs_action']);

/**
 * Classify a goal_log event into a severity bucket.
 */
function goalLogSeverity(eventType) {
  if (!eventType) return 'info';
  if (/fail|error|exhausted/i.test(eventType)) return 'error';
  if (/warn/i.test(eventType)) return 'warn';
  if (/awaiting|needs/i.test(eventType)) return 'needs_action';
  if (/complete|success|provisioned|ready/i.test(eventType)) return 'success';
  return 'info';
}

function notificationSeverity(row) {
  const action = row.metadata?.action;
  if (action && action.type && action.type !== 'view_goal' && action.type !== 'view_tool') {
    return 'needs_action';
  }
  const et = row.event_type || '';
  if (/fail|error/i.test(et)) return 'error';
  if (/warn/i.test(et)) return 'warn';
  if (/provisioned|complete|ready/i.test(et)) return 'success';
  return 'info';
}

function pulseSeverity(status) {
  if (status === 'keep') return 'success';
  if (status === 'crash') return 'error';
  if (status === 'discard') return 'info';
  return 'info';
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const op = (req.query?.op || 'list').toLowerCase();
    if (op !== 'list') return jsonError(res, 400, `Unknown op: ${op}`);

    const sourceFilter = (req.query?.source || '').toLowerCase();
    const severityFilter = (req.query?.severity || '').toLowerCase();
    const goalIdFilter = req.query?.goal_id || null;
    const limit = Math.min(Number(req.query?.limit) || 100, 200);

    const includeSource = (s) => !sourceFilter || sourceFilter === 'all' || s === sourceFilter;

    // Load the user's goal IDs up front so we can scope goal_log + pulse_cycles
    // without a join. This keeps the union simple and avoids N+1 lookups.
    const { data: userGoals } = await admin
      .from('goals')
      .select('id, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);
    const goalIds = (userGoals || []).map((g) => g.id);
    const goalTitles = Object.fromEntries((userGoals || []).map((g) => [g.id, g.title]));

    const { data: userAgents } = await admin
      .from('agents')
      .select('id, name')
      .eq('user_id', user.id);
    const agentIds = (userAgents || []).map((a) => a.id);
    const agentNames = Object.fromEntries((userAgents || []).map((a) => [a.id, a.name]));

    // Fan out four independent queries in parallel. Each is limited; the
    // union is then sorted and trimmed to the requested limit.
    const queries = [];

    if (includeSource('goal_log') && goalIds.length) {
      queries.push(admin
        .from('goal_log')
        .select('id, goal_id, event_type, details, created_at')
        .in('goal_id', goalIds)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ source: 'goal_log', rows: r.data || [] })));
    } else {
      queries.push(Promise.resolve({ source: 'goal_log', rows: [] }));
    }

    if (includeSource('notification_log')) {
      queries.push(admin
        .from('notification_log')
        .select('id, event_type, subject, body, metadata, sent_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ source: 'notification_log', rows: r.data || [] })));
    } else {
      queries.push(Promise.resolve({ source: 'notification_log', rows: [] }));
    }

    if (includeSource('pulse_cycle') && agentIds.length) {
      queries.push(admin
        .from('pulse_cycles')
        .select('id, agent_id, status, started_at, ended_at, cost_usd, summary, created_at')
        .in('agent_id', agentIds)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ source: 'pulse_cycle', rows: r.data || [] })));
    } else {
      queries.push(Promise.resolve({ source: 'pulse_cycle', rows: [] }));
    }

    if (includeSource('communication_log')) {
      queries.push(admin
        .from('communication_logs')
        .select('id, sender_id, sender_name, sender_type, content, context_type, context_id, context_label, platform, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ source: 'communication_log', rows: r.data || [] })));
    } else {
      queries.push(Promise.resolve({ source: 'communication_log', rows: [] }));
    }

    const results = await Promise.all(queries);

    const events = [];
    for (const { source, rows } of results) {
      for (const row of rows) {
        const evt = normalize(source, row, { goalTitles, agentNames });
        if (!evt) continue;
        if (goalIdFilter && evt.goalId !== goalIdFilter) continue;
        if (severityFilter && severityFilter !== 'all' && evt.severity !== severityFilter) continue;
        events.push(evt);
      }
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // M8: collapse same-signature needs_action events within 24h so the user
    // sees one actionable row ("5 goals blocked on Stripe key") instead of
    // five identical alerts. Non-action events pass through untouched.
    const grouped = groupByActionSignature(events);
    const trimmed = grouped.slice(0, limit);

    return res.status(200).json({ events: trimmed, total: trimmed.length });
  } catch (err) {
    return handleApiError(res, err, 'activity-feed');
  }
}

function normalize(source, row, ctx) {
  const title = (raw) => String(raw || '').replaceAll('_', ' ');
  switch (source) {
    case 'goal_log':
      return {
        id: `goal_log:${row.id}`,
        timestamp: row.created_at,
        source,
        severity: goalLogSeverity(row.event_type),
        title: title(row.event_type),
        body: ctx.goalTitles[row.goal_id] || '',
        goalId: row.goal_id,
        details: row.details,
      };
    case 'notification_log':
      return {
        id: `notification_log:${row.id}`,
        timestamp: row.sent_at || row.created_at,
        source,
        severity: notificationSeverity(row),
        title: row.subject || title(row.event_type),
        body: row.body || '',
        goalId: row.metadata?.goal_id || null,
        action: row.metadata?.action || null,
      };
    case 'pulse_cycle':
      return {
        id: `pulse_cycle:${row.id}`,
        timestamp: row.created_at || row.started_at,
        source,
        severity: pulseSeverity(row.status),
        title: `Pulse cycle · ${row.status}`,
        body: row.summary || '',
        actor: ctx.agentNames[row.agent_id] || null,
        details: { cost_usd: row.cost_usd, started_at: row.started_at, ended_at: row.ended_at },
      };
    case 'communication_log':
      return {
        id: `communication_log:${row.id}`,
        timestamp: row.created_at,
        source,
        severity: 'info',
        title: `${row.sender_type || 'agent'} message`,
        body: (row.content || '').slice(0, 280),
        goalId: row.context_type === 'goal' ? row.context_id : null,
        actor: row.sender_id,
        // Comm-specific fields for the Home "Communicator Live Chat" block
        // (category + sender + context). Other consumers ignore these.
        senderName: row.sender_name,
        senderType: row.sender_type,
        contextType: row.context_type,
        contextId: row.context_id,
        contextLabel: row.context_label,
        platform: row.platform,
      };
    default:
      return null;
  }
}

const GROUPING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Collapse same-signature `needs_action` events within a 24-hour window
 * into a single representative event (the newest). The collapsed row
 * carries `occurrences` (count) and `goalIds` (affected goals) so the UI
 * can render "N goals blocked on X · Resolve all" instead of N rows.
 *
 * Pure function — exported for unit tests. Events without an `action`
 * payload, or with non-needs_action severity, pass through unchanged.
 *
 * @param {Array<object>} events — already sorted by timestamp desc
 * @returns {Array<object>}
 */
export function groupByActionSignature(events) {
  if (!Array.isArray(events) || events.length === 0) return events || [];
  const now = Date.now();
  const groups = new Map();
  const out = [];

  for (const evt of events) {
    const isCandidate =
      evt.severity === 'needs_action' &&
      evt.action &&
      evt.action.type &&
      (now - new Date(evt.timestamp).getTime()) <= GROUPING_WINDOW_MS;

    if (!isCandidate) {
      out.push(evt);
      continue;
    }

    const sig = `${evt.action.type}:${evt.action.target_url || evt.action.tool || evt.action.target || ''}`;
    const existing = groups.get(sig);
    if (existing) {
      existing.entry.occurrences += 1;
      if (evt.goalId && !existing.entry.goalIds.includes(evt.goalId)) {
        existing.entry.goalIds.push(evt.goalId);
      }
      // If this event is newer than the current representative, swap the
      // user-visible fields (id, title, body, timestamp, action) onto the
      // group entry so the feed row points at the freshest occurrence.
      if (new Date(evt.timestamp).getTime() > new Date(existing.entry.timestamp).getTime()) {
        existing.entry.id = evt.id;
        existing.entry.title = evt.title;
        existing.entry.body = evt.body;
        existing.entry.timestamp = evt.timestamp;
        existing.entry.action = evt.action;
      }
    } else {
      const entry = { ...evt, occurrences: 1, goalIds: evt.goalId ? [evt.goalId] : [] };
      groups.set(sig, { entry });
      out.push(entry);
    }
  }

  // Strip occurrences=1 rows (nothing to group) so they don't show a
  // misleading "1 similar" chip in the UI.
  return out.map((e) => {
    if (e.occurrences === 1) {
      const { occurrences: _o, goalIds: _g, ...rest } = e;
      return rest;
    }
    return e;
  });
}

export const __testing = { VALID_SOURCES, VALID_SEVERITIES, goalLogSeverity, pulseSeverity, normalize };
