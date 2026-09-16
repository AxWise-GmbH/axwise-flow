/**
 * [module: connection-hub]
 * Agent Room handler: rooms list, messages, agent activity.
 * GET ?op=rooms       — goals that have goal_messages
 * GET ?op=messages    — messages for a specific goal room
 * GET ?op=agent-activity — communication_logs from agents
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
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('communicator-agent-room');

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

    const op = (req.query?.op || '').toLowerCase();

    // ── Rooms: list goals with messages ──
    if (op === 'rooms') {
      const { status, search } = req.query || {};

      // Get distinct goal_ids from goal_messages
      const { data: messages, error: msgErr } = await admin
        .from('goal_messages')
        .select('goal_id, channel, created_at')
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (msgErr) return handleApiError(res, msgErr, 'agent-room:rooms:messages');

      // Group by goal_id
      const goalMap = {};
      for (const m of messages || []) {
        if (!goalMap[m.goal_id]) {
          goalMap[m.goal_id] = {
            messageCount: 0,
            lastMessageAt: m.created_at,
            channels: new Set(),
          };
        }
        goalMap[m.goal_id].messageCount++;
        goalMap[m.goal_id].channels.add(m.channel);
      }

      const goalIds = Object.keys(goalMap);
      if (goalIds.length === 0) return res.status(200).json({ rooms: [] });

      // Fetch goal details
      let goalQ = admin
        .from('goals')
        .select('id, title, status, created_at')
        .in('id', goalIds)
        .eq('user_id', user.id);

      if (status && status !== 'all') goalQ = goalQ.eq('status', status);
      if (search) goalQ = goalQ.ilike('title', `%${search}%`);

      const { data: goals, error: goalErr } = await goalQ;
      if (goalErr) return handleApiError(res, goalErr, 'agent-room:rooms:goals');

      const rooms = (goals || []).map((g) => ({
        goalId: g.id,
        title: g.title || 'Untitled Goal',
        status: g.status || 'unknown',
        messageCount: goalMap[g.id]?.messageCount || 0,
        lastMessageAt: goalMap[g.id]?.lastMessageAt || null,
        channels: [...(goalMap[g.id]?.channels || [])],
        createdAt: g.created_at,
      }));

      rooms.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      return res.status(200).json({ rooms });
    }

    // ── Messages: get messages for a goal room ──
    if (op === 'messages') {
      const { goalId, channel, limit: lim } = req.query || {};
      if (!goalId) return jsonError(res, 400, 'goalId required');

      // Verify user owns this goal
      const { data: goal } = await admin
        .from('goals')
        .select('id')
        .eq('id', goalId)
        .eq('user_id', user.id)
        .single();
      if (!goal) return jsonError(res, 404, 'Goal not found');

      let q = admin
        .from('goal_messages')
        .select(
          'id, sender_name, sender_agent_id, channel, message, message_type, metadata, created_at'
        )
        .eq('goal_id', goalId)
        .eq('is_archived', false)
        .order('created_at', { ascending: true })
        .limit(Number(lim) || 200);

      if (channel && channel !== 'all') q = q.eq('channel', channel);

      const { data, error } = await q;
      if (error) return handleApiError(res, error, 'agent-room:messages');
      return res.status(200).json({ messages: data || [] });
    }

    // ── Agent activity: communication_logs from agents ──
    if (op === 'agent-activity') {
      const { context_type, date_from, date_to, search: srch, limit: lim } = req.query || {};

      let q = admin
        .from('communication_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('sender_type', 'agent')
        .order('created_at', { ascending: false })
        .limit(Number(lim) || 200);

      if (context_type && context_type !== 'all') q = q.eq('context_type', context_type);
      if (date_from) q = q.gte('created_at', date_from);
      if (date_to) q = q.lte('created_at', date_to);
      if (srch) q = q.ilike('content', `%${srch}%`);

      const { data, error } = await q;
      if (error) return handleApiError(res, error, 'agent-room:agent-activity');
      return res.status(200).json({ logs: data || [] });
    }

    return jsonError(res, 400, `Unknown op: ${op}`);
  } catch (err) {
    return handleApiError(res, err, 'agent-room');
  }
}
