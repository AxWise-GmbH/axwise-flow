/**
 * Marketplace handler — list, purchase, and manage workflow listings.
 * Routes: browse, my-listings, my-purchases, list, purchase, review, update
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('marketplace');

async function handleBrowse(admin, query) {
  const category = query?.category || null;
  const sort = query?.sort || 'newest';
  let q = admin.from('marketplace_listings')
    .select('id, title, description, category, deliverable_type, price_usd, pricing_model, avg_rating, total_purchases, tags, creator_id, created_at')
    .eq('status', 'active').limit(50);
  if (category) q = q.eq('category', category);
  if (sort === 'rating') q = q.order('avg_rating', { ascending: false });
  else if (sort === 'popular') q = q.order('total_purchases', { ascending: false });
  else q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleMyListings(admin, user) {
  const { data, error } = await admin.from('marketplace_listings').select('*').eq('creator_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleMyPurchases(admin, user) {
  const { data, error } = await admin.from('marketplace_purchases')
    .select('id, listing_id, price_paid, payment_status, created_at').eq('buyer_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleList(admin, user, body) {
  const { goal_id, title, description, category, price_usd, tags } = body;
  if (!goal_id) return { status: 400, error: 'goal_id is required' };
  if (!price_usd || price_usd <= 0) return { status: 400, error: 'price_usd must be positive' };
  const { data: goal } = await admin.from('goals').select('id, title, plan, tech_doc, status').eq('id', goal_id).eq('user_id', user.id).single();
  if (!goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'completed') return { status: 400, error: 'Only completed goals can be listed' };
  const { data: listing, error } = await admin.from('marketplace_listings').insert({
    goal_id, creator_id: user.id, title: title || goal.title, description: description || '',
    category: category || 'general', deliverable_type: 'workflow_template', price_usd: Number(price_usd),
    plan_snapshot: goal.plan || {}, tech_doc_snapshot: goal.tech_doc || {}, tags: tags || [], status: 'active',
  }).select('id, title, price_usd, status').single();
  if (error) throw error;
  return { status: 201, data: listing };
}

async function handlePurchase(admin, user, body) {
  const { listing_id } = body;
  if (!listing_id) return { status: 400, error: 'listing_id is required' };
  const { data: listing } = await admin.from('marketplace_listings').select('id, creator_id, price_usd, plan_snapshot, tech_doc_snapshot, title, total_purchases, total_revenue').eq('id', listing_id).eq('status', 'active').single();
  if (!listing) return { status: 404, error: 'Listing not found' };
  if (listing.creator_id === user.id) return { status: 400, error: 'Cannot purchase your own listing' };
  const price = Number(listing.price_usd);
  const creatorPayout = price * 0.85;
  const platformFee = price * 0.15;
  const { data: purchase, error } = await admin.from('marketplace_purchases').insert({
    listing_id, buyer_id: user.id, price_paid: price, creator_payout: creatorPayout, platform_fee: platformFee, payment_status: 'paid',
  }).select('id').single();
  if (error) throw error;
  await admin.from('marketplace_listings').update({ total_purchases: (listing.total_purchases || 0) + 1, total_revenue: (listing.total_revenue || 0) + price, updated_at: new Date().toISOString() }).eq('id', listing_id);
  await admin.from('financial_events').insert([
    { user_id: listing.creator_id, event_type: 'marketplace_sale', amount_usd: creatorPayout, direction: 'in', source: 'marketplace', description: 'Sale: ' + listing.title, metadata: { listing_id, purchase_id: purchase.id } },
    { user_id: user.id, event_type: 'marketplace_purchase', amount_usd: price, direction: 'out', source: 'marketplace', description: 'Purchase: ' + listing.title, metadata: { listing_id, purchase_id: purchase.id } },
  ]);
  return { status: 201, data: { purchase_id: purchase.id, price_paid: price } };
}

async function handleReview(admin, user, body) {
  const { listing_id, rating, review_text } = body;
  if (!listing_id || !rating) return { status: 400, error: 'listing_id and rating required' };
  if (rating < 1 || rating > 5) return { status: 400, error: 'rating must be 1-5' };
  const { data: purchase } = await admin.from('marketplace_purchases').select('id').eq('listing_id', listing_id).eq('buyer_id', user.id).limit(1).maybeSingle();
  if (!purchase) return { status: 403, error: 'Must purchase before reviewing' };
  const { error } = await admin.from('marketplace_reviews').insert({ listing_id, buyer_id: user.id, rating, review_text: review_text || '' });
  if (error) throw error;
  const { data: reviews } = await admin.from('marketplace_reviews').select('rating').eq('listing_id', listing_id);
  const avg = (reviews || []).reduce((s, r) => s + r.rating, 0) / (reviews?.length || 1);
  await admin.from('marketplace_listings').update({ avg_rating: avg, updated_at: new Date().toISOString() }).eq('id', listing_id);
  return { status: 201, data: { success: true } };
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
  const body = req.body || {};
  try {
    let result;
    switch (op) {
      case 'browse': result = await handleBrowse(admin, req.query); break;
      case 'my-listings': result = await handleMyListings(admin, user); break;
      case 'my-purchases': result = await handleMyPurchases(admin, user); break;
      case 'list': if (req.method !== 'POST') return jsonError(res, 405, 'POST only'); result = await handleList(admin, user, body); break;
      case 'purchase': if (req.method !== 'POST') return jsonError(res, 405, 'POST only'); result = await handlePurchase(admin, user, body); break;
      case 'review': if (req.method !== 'POST') return jsonError(res, 405, 'POST only'); result = await handleReview(admin, user, body); break;
      default: return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) { return handleApiError(res, err, 'marketplace'); }
}
