/**
 * Budget Requests handler — agents request operational funds during goal execution.
 *
 * Routes (via query param `op`):
 *   POST ?op=create           — Create budget request
 *   GET  ?op=list&goal_id=    — List requests (optional status filter)
 *   POST ?op=review           — Approve/reject a request
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('budget-requests');

async function handleCreate(admin, user, body) {
  const { goal_id, task_id, agent_name, amount_usd, purpose, category } = body;
  if (!goal_id) return { status: 400, error: 'goal_id is required' };
  if (!amount_usd || Number(amount_usd) <= 0) return { status: 400, error: 'amount_usd must be positive' };
  if (!purpose) return { status: 400, error: 'purpose is required' };

  // Verify goal belongs to user
  const { data: goal } = await admin.from('goals').select('id, title, user_id').eq('id', goal_id).eq('user_id', user.id).single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const { data: request, error } = await admin.from('budget_requests').insert({
    user_id: user.id,
    goal_id,
    task_id: task_id || null,
    agent_name: agent_name || '',
    amount_usd: Number(amount_usd),
    purpose,
    category: category || 'operational',
  }).select().single();

  if (error) return { status: 500, error: error.message };

  // Log event
  await admin.from('goal_log').insert({
    goal_id, event_type: 'budget_request_created',
    details: { request_id: request.id, amount: Number(amount_usd), purpose, agent_name, category },
    cost_usd: 0,
  }).catch(() => {});

  // Post goal message
  await admin.from('goal_messages').insert({
    goal_id, sender_name: agent_name || 'System', channel: 'system',
    message: `Budget request: $${Number(amount_usd).toFixed(2)} for "${purpose}"`,
    message_type: 'alert',
  }).catch(() => {});

  log.info(null, 'budget-request.created', { goalId: goal_id, amount: amount_usd, purpose });
  return { status: 201, data: request };
}

async function handleList(admin, user, query) {
  const goalId = query?.goal_id;
  const status = query?.status;

  let q = admin.from('budget_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (goalId) q = q.eq('goal_id', goalId);
  if (status) q = q.eq('status', status);

  const { data, error } = await q.limit(50);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: data || [] };
}

async function handleReview(admin, user, body) {
  const { id, action, notes } = body;
  if (!id) return { status: 400, error: 'id is required' };
  if (!['approve', 'reject'].includes(action)) return { status: 400, error: 'action must be approve or reject' };

  // Load request
  const { data: request } = await admin.from('budget_requests')
    .select('*').eq('id', id).eq('user_id', user.id).eq('status', 'pending').single();
  if (!request) return { status: 404, error: 'Pending request not found' };

  const now = new Date().toISOString();

  if (action === 'approve') {
    // Update request
    await admin.from('budget_requests').update({
      status: 'approved', reviewed_at: now, reviewer_notes: notes || '', updated_at: now,
    }).eq('id', id);

    // Increase goal budget
    const { data: goal } = await admin.from('goals').select('budget_usd').eq('id', request.goal_id).single();
    if (goal) {
      await admin.from('goals').update({
        budget_usd: Number(goal.budget_usd || 0) + request.amount_usd,
        updated_at: now,
      }).eq('id', request.goal_id);
    }

    // Financial event
    await admin.from('financial_events').insert({
      user_id: user.id, goal_id: request.goal_id,
      event_type: 'service_cost', amount_usd: request.amount_usd, direction: 'out',
      source: 'budget-request', description: `Approved: ${request.purpose}`,
      metadata: { request_id: id, agent_name: request.agent_name, category: request.category },
    }).catch(() => {});

    // Goal log
    await admin.from('goal_log').insert({
      goal_id: request.goal_id, event_type: 'budget_request_approved',
      details: { request_id: id, amount: request.amount_usd, purpose: request.purpose, notes },
      cost_usd: 0,
    }).catch(() => {});

    // Goal message
    await admin.from('goal_messages').insert({
      goal_id: request.goal_id, sender_name: 'System', channel: 'system',
      message: `Budget approved: $${request.amount_usd.toFixed(2)} for "${request.purpose}"`,
      message_type: 'report',
    }).catch(() => {});

    log.info(null, 'budget-request.approved', { id, amount: request.amount_usd });
    return { status: 200, data: { ...request, status: 'approved', reviewed_at: now } };
  }

  // Reject
  await admin.from('budget_requests').update({
    status: 'rejected', reviewed_at: now, reviewer_notes: notes || '', updated_at: now,
  }).eq('id', id);

  await admin.from('goal_log').insert({
    goal_id: request.goal_id, event_type: 'budget_request_rejected',
    details: { request_id: id, amount: request.amount_usd, purpose: request.purpose, notes },
    cost_usd: 0,
  }).catch(() => {});

  await admin.from('goal_messages').insert({
    goal_id: request.goal_id, sender_name: 'System', channel: 'system',
    message: `Budget rejected: $${request.amount_usd.toFixed(2)} for "${request.purpose}"${notes ? ` — ${notes}` : ''}`,
    message_type: 'feedback',
  }).catch(() => {});

  log.info(null, 'budget-request.rejected', { id });
  return { status: 200, data: { ...request, status: 'rejected', reviewed_at: now } };
}

export default async function handler(req, res) {
  if (cors(res, req)) return;
  try {
    const rl = checkRateLimit(getRateLimitIdentifier(req, 'budget-requests'), 60, 60);
    applyRateLimitHeaders(res, rl);
    if (!rl.ok) return jsonError(res, 429, 'Too many requests');

    const token = getBearerToken(req);
    if (!token) return jsonError(res, 401, 'Missing auth token');
    const user = await verifySupabaseToken(token);
    if (!user?.id) return jsonError(res, 401, 'Invalid token');

    const admin = buildSupabaseAdminClient();
    const op = (req.query?.op || '').toLowerCase();
    const body = req.body || {};
    let result;

    switch (op) {
      case 'create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreate(admin, user, body);
        break;
      case 'list':
        result = await handleList(admin, user, req.query);
        break;
      case 'review':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleReview(admin, user, body);
        break;
      default:
        return jsonError(res, 400, 'Invalid op. Use: create, list, review');
    }

    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'budget-requests');
  }
}
