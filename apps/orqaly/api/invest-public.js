/**
 * Public investor profile — no auth required.
 * Access is controlled by UUID unguessability.
 * Returns sanitized investor data + portfolio overview.
 */
import { jsonError, handleApiError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { buildSupabaseAdminClient } from './_lib/supabase-server.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from './_lib/rate-limit.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, null), limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const id = req.query?.id;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return jsonError(res, 400, 'Invalid investor id');

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Not configured');

    // Fetch investor (no user_id filter — public)
    const { data: investor, error: invErr } = await admin
      .from('investment_investors')
      .select('id, name, bio, investor_type, risk_profile, trust_score, preferred_industries, investment_capacity, total_invested, total_returns, is_active, created_at')
      .eq('id', id)
      .eq('is_active', true)
      .single();
    if (invErr || !investor) return jsonError(res, 404, 'Investor not found');

    // Fetch active commitments with deal title + status
    const { data: commitments } = await admin
      .from('investment_commitments')
      .select('id, amount, commitment_type, status, returns_received, committed_at, investment_deals(title, status, industry, risk_level, roi_projections)')
      .eq('investor_id', id)
      .eq('status', 'active')
      .order('committed_at', { ascending: false })
      .limit(20);

    // Fetch last 20 transactions (sanitized — no internal IDs)
    const { data: transactions } = await admin
      .from('investment_transactions')
      .select('id, transaction_type, amount, description, created_at')
      .eq('investor_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({
      investor,
      commitments: commitments || [],
      transactions: transactions || [],
    });
  } catch (err) {
    return handleApiError(res, err, 'invest-public');
  }
}
