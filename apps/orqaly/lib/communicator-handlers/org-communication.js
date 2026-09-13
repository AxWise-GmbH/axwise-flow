/**
 * Org communication — unified timeline for one organization.
 * GET ?op=timeline&orgId=<uuid>
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';

function pushEvent(events, evt) {
  if (evt?.timestamp) events.push(evt);
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

    const op = (req.query?.op || 'timeline').toLowerCase();
    if (op !== 'timeline') return jsonError(res, 400, `Unknown op: ${op}`);

    const orgId = req.query?.orgId;
    if (!orgId) return jsonError(res, 400, 'orgId is required');

    const limit = Math.min(Number(req.query?.limit) || 150, 300);

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, name, consilium_id, slug')
      .eq('id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (orgErr) return handleApiError(res, orgErr, 'org-communication:org');
    if (!org) return jsonError(res, 404, 'Organization not found');

    const { data: orgTeams } = await admin
      .from('org_teams')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId);
    const teamIds = (orgTeams || []).map((t) => t.team_id).filter(Boolean);

    let goalsQuery = admin
      .from('goals')
      .select('id, title, status, created_at, org_id, team_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300);

    if (teamIds.length) {
      goalsQuery = goalsQuery.or(`org_id.eq.${orgId},team_id.in.(${teamIds.join(',')})`);
    } else {
      goalsQuery = goalsQuery.eq('org_id', orgId);
    }

    const { data: goals } = await goalsQuery;

    const goalList = goals || [];
    const goalIds = goalList.map((g) => g.id);
    const goalTitles = Object.fromEntries(goalList.map((g) => [g.id, g.title]));

    const events = [];

    if (goalIds.length) {
      const { data: messages } = await admin
        .from('goal_messages')
        .select('id, goal_id, sender_name, channel, message, message_type, created_at')
        .in('goal_id', goalIds)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      for (const m of messages || []) {
        pushEvent(events, {
          id: `goal_message:${m.id}`,
          timestamp: m.created_at,
          source: 'goal_history',
          severity: m.message_type === 'alert' ? 'error' : 'info',
          title: m.sender_name || 'Agent',
          body: (m.message || '').slice(0, 500),
          subtitle: `${m.channel || 'message'} · ${goalTitles[m.goal_id] || 'Goal'}`,
          goalId: m.goal_id,
          deepLink: { section: 'rooms', goal: m.goal_id },
        });
      }

      const { data: logs } = await admin
        .from('goal_log')
        .select('id, goal_id, event_type, details, created_at')
        .in('goal_id', goalIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      for (const row of logs || []) {
        pushEvent(events, {
          id: `goal_log:${row.id}`,
          timestamp: row.created_at,
          source: 'activity',
          severity: /fail|error/i.test(row.event_type || '')
            ? 'error'
            : /complete|success/i.test(row.event_type || '')
              ? 'success'
              : 'info',
          title: (row.event_type || 'event').replace(/_/g, ' '),
          body: goalTitles[row.goal_id] || '',
          subtitle: row.details || '',
          goalId: row.goal_id,
          deepLink: { section: 'rooms', goal: row.goal_id },
        });
      }

      const goalIdSet = new Set(goalIds);

      const { data: notifications } = await admin
        .from('notification_log')
        .select('id, event_type, subject, body, metadata, sent_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      for (const n of notifications || []) {
        const gid = n.metadata?.goal_id;
        if (!gid || !goalIdSet.has(gid)) continue;
        pushEvent(events, {
          id: `notification:${n.id}`,
          timestamp: n.sent_at || n.created_at,
          source: 'activity',
          severity: /fail|error/i.test(n.event_type || '')
            ? 'error'
            : /warn/i.test(n.event_type || '')
              ? 'warn'
              : 'info',
          title: n.subject || (n.event_type || 'notification').replace(/_/g, ' '),
          body: n.body || '',
          subtitle: goalTitles[gid] || '',
          goalId: gid,
          deepLink: { section: 'activity' },
        });
      }

      const { data: orgAgentRows } = await admin
        .from('org_agents')
        .select('agent_id')
        .eq('user_id', user.id)
        .eq('org_id', orgId);
      const orgAgentIds = (orgAgentRows || []).map((r) => r.agent_id).filter(Boolean);

      if (orgAgentIds.length) {
        const { data: pulses } = await admin
          .from('pulse_cycles')
          .select('id, agent_id, status, summary, created_at, started_at')
          .in('agent_id', orgAgentIds)
          .order('created_at', { ascending: false })
          .limit(limit);

        for (const p of pulses || []) {
          pushEvent(events, {
            id: `pulse:${p.id}`,
            timestamp: p.created_at || p.started_at,
            source: 'activity',
            severity: p.status === 'crash' ? 'error' : p.status === 'keep' ? 'success' : 'info',
            title: `Pulse · ${p.status || 'cycle'}`,
            body: p.summary || '',
            subtitle: 'Org agent',
            deepLink: { section: 'activity' },
          });
        }
      }
    }

    if (org.consilium_id) {
      // Org is already ownership-verified; include all evals for its linked board.
      const { data: evals } = await admin
        .from('concilium_evaluations')
        .select('id, overall_score, approved, summary, feedback, created_at')
        .or(`concilium_id.eq.${org.consilium_id},board_id.eq.${org.consilium_id}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      for (const e of evals || []) {
        pushEvent(events, {
          id: `consilium:${e.id}`,
          timestamp: e.created_at,
          source: 'consilium',
          severity: e.approved ? 'success' : e.approved === false ? 'error' : 'info',
          title: e.approved ? 'Approved' : e.approved === false ? 'Rejected' : 'Evaluation',
          body: e.summary || (e.feedback || '').slice(0, 300),
          subtitle: `Score ${e.overall_score ?? '—'}`,
          deepLink: { section: 'consilium' },
        });
      }
    }

    const { data: commRows } = await admin
      .from('communication_logs')
      .select('id, sender_name, content, context_type, context_id, metadata, created_at')
      .eq('user_id', user.id)
      .eq('context_type', 'organization')
      .eq('context_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    for (const row of commRows || []) {
      pushEvent(events, {
        id: `comm:${row.id}`,
        timestamp: row.created_at,
        source: 'command',
        severity: 'info',
        title: row.sender_name || 'You',
        body: row.content || '',
        subtitle: 'Org command',
        deepLink: { section: 'organizations', org: orgId },
      });
    }

    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      org,
      events: events.slice(0, limit),
      total: events.length,
      scope: { goalCount: goalIds.length, consiliumId: org.consilium_id || null },
    });
  } catch (err) {
    return handleApiError(res, err, 'org-communication');
  }
}
