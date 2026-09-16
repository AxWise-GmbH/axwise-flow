/**
 * Financial handler — ROI dashboard data, revenue tracking, financial events.
 * Routes: summary, events, roi-per-goal, roi-per-agent
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('financial');

async function handleSummary(admin, user) {
  const { data: events } = await admin.from('financial_events')
    .select('event_type, amount_usd, direction')
    .eq('user_id', user.id);

  const summary = { total_revenue: 0, total_spent: 0, token_spend: 0, service_costs: 0, ad_spend: 0, marketplace_sales: 0, marketplace_purchases: 0 };
  for (const e of (events || [])) {
    const amt = Number(e.amount_usd || 0);
    if (e.direction === 'in') summary.total_revenue += amt;
    else summary.total_spent += amt;
    if (e.event_type === 'token_spend') summary.token_spend += amt;
    if (e.event_type === 'service_cost') summary.service_costs += amt;
    if (e.event_type === 'ad_spend') summary.ad_spend += amt;
    if (e.event_type === 'marketplace_sale') summary.marketplace_sales += amt;
    if (e.event_type === 'marketplace_purchase') summary.marketplace_purchases += amt;
  }
  summary.net_profit = summary.total_revenue - summary.total_spent;
  summary.roi = summary.total_spent > 0 ? ((summary.total_revenue - summary.total_spent) / summary.total_spent * 100).toFixed(1) : 0;

  return { status: 200, data: summary };
}

async function handleEvents(admin, user, query) {
  const limit = Math.min(Number(query?.limit) || 50, 200);
  const eventType = query?.event_type || null;

  let q = admin.from('financial_events')
    .select('id, goal_id, event_type, amount_usd, direction, source, description, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (eventType) q = q.eq('event_type', eventType);
  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleRoiPerGoal(admin, user) {
  const { data: goals } = await admin.from('goals')
    .select('id, title, budget_usd, spent_usd, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(50);

  const roiData = [];
  for (const g of (goals || [])) {
    const { data: revenue } = await admin.from('financial_events')
      .select('amount_usd')
      .eq('goal_id', g.id).eq('direction', 'in');
    const totalRevenue = (revenue || []).reduce((s, r) => s + Number(r.amount_usd || 0), 0);
    const spent = Number(g.spent_usd || 0);
    roiData.push({
      goal_id: g.id, title: g.title, spent, revenue: totalRevenue,
      profit: totalRevenue - spent,
      roi: spent > 0 ? ((totalRevenue - spent) / spent * 100).toFixed(1) : 0,
    });
  }
  return { status: 200, data: roiData };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');
  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user), limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');
  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  try {
    let result;
    switch (op) {
      case 'summary': result = await handleSummary(admin, user); break;
      case 'events': result = await handleEvents(admin, user, req.query); break;
      case 'roi-per-goal': result = await handleRoiPerGoal(admin, user); break;
      default: return jsonError(res, 400, 'Invalid op. Use: summary, events, roi-per-goal');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) { return handleApiError(res, err, 'financial'); }
}
