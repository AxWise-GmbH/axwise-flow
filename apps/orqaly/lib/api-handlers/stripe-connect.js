/**
 * Stripe Connect handler — onboarding, checkout, payouts.
 *
 * Routes (via query param `op`):
 *   POST ?op=create-account    — Create a Stripe Connect account for an agent owner
 *   POST ?op=create-onboarding — Generate an onboarding link for a connected account
 *   POST ?op=create-checkout   — Create a checkout session for a task purchase
 *   POST ?op=process-payout    — Transfer funds to a connected account (admin/worker)
 *   GET  ?op=account-status    — Check connected account status
 *   GET  ?op=balance           — Get platform balance summary
 *
 * Env vars required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (optional for webhook verification)
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('stripe-connect');

/** Verify the Stripe account belongs to an agent owned by this user. */
async function verifyAccountOwnership(admin, accountId, userId) {
  const { data } = await admin
    .from('agents')
    .select('id')
    .eq('metadata->>stripe_account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

let _stripe = null;
async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (_stripe) return _stripe;
  const { default: Stripe } = await import('stripe');
  _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  return _stripe;
}

export function getAppUrl() {
  if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5176';
}

// ── Operations ────────────────────────────────────────────────────

async function handleCreateAccount(stripe, admin, userId, body) {
  const { email, agentId } = body;
  if (!email) return { status: 400, error: 'email is required' };

  const account = await stripe.accounts.create({
    type: 'express',
    email,
    metadata: { user_id: userId, agent_id: agentId || '' },
    capabilities: {
      transfers: { requested: true },
    },
  });

  // Store the connected account ID in the agents table metadata
  if (agentId) {
    const { data: agent } = await admin
      .from('agents')
      .select('metadata')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (agent) {
      await admin
        .from('agents')
        .update({
          metadata: { ...(agent.metadata || {}), stripe_account_id: account.id },
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentId);
    }
  }

  log.info(null, 'account.created', { stripe_account: account.id, user_id: userId });
  return { status: 200, data: { accountId: account.id } };
}

async function handleCreateOnboarding(stripe, admin, userId, body) {
  const { accountId } = body;
  if (!accountId) return { status: 400, error: 'accountId is required' };

  if (!(await verifyAccountOwnership(admin, accountId, userId))) {
    return { status: 403, error: 'Account not owned by this user' };
  }

  const appUrl = getAppUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/settings?stripe=refresh`,
    return_url: `${appUrl}/settings?stripe=complete`,
    type: 'account_onboarding',
  });

  return { status: 200, data: { url: link.url } };
}

async function handleCreateCheckout(stripe, admin, userId, body) {
  const { taskId, agentId, amount, currency = 'usd', description } = body;
  if (!amount || amount <= 0) return { status: 400, error: 'amount must be positive' };

  // Look up the agent's connected account
  let connectedAccountId = null;
  if (agentId) {
    const { data: agent } = await admin
      .from('agents')
      .select('metadata')
      .eq('id', agentId)
      .maybeSingle();
    connectedAccountId = agent?.metadata?.stripe_account_id;
  }

  const appUrl = getAppUrl();
  const amountCents = Math.round(amount * 100);
  const platformFeeCents = Math.round(amountCents * 0.15); // 15% platform fee

  const sessionParams = {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: description || 'Agent Task' },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/job-pool?payment=success&task=${taskId || ''}`,
    cancel_url: `${appUrl}/job-pool?payment=cancelled`,
    metadata: { task_id: taskId || '', agent_id: agentId || '', user_id: userId },
  };

  // If we have a connected account, use destination charges (85/15 split)
  if (connectedAccountId) {
    sessionParams.payment_intent_data = {
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: connectedAccountId },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  // Create a pending payout record
  await admin
    .from('payouts')
    .insert({
      user_id: userId,
      agent_id: agentId || null,
      task_id: taskId || null,
      gross_amount: amount,
      currency: currency.toUpperCase(),
      status: 'pending',
    })
    .catch((err) => {
      log.warn(null, 'payout.record.failed', { error: err.message });
    });

  log.info(null, 'checkout.created', { session_id: session.id });
  return { status: 200, data: { sessionId: session.id, url: session.url } };
}

async function handleAccountStatus(stripe, admin, userId, body) {
  const accountId = body?.accountId || '';
  if (!accountId) return { status: 400, error: 'accountId is required' };

  if (!(await verifyAccountOwnership(admin, accountId, userId))) {
    return { status: 403, error: 'Account not owned by this user' };
  }

  const account = await stripe.accounts.retrieve(accountId);
  return {
    status: 200,
    data: {
      id: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      email: account.email,
    },
  };
}

async function handleBalance(stripe) {
  const balance = await stripe.balance.retrieve();
  const available = balance.available.map((b) => ({
    amount: b.amount / 100,
    currency: b.currency,
  }));
  const pending = balance.pending.map((b) => ({
    amount: b.amount / 100,
    currency: b.currency,
  }));
  return { status: 200, data: { available, pending } };
}

async function handleProcessPayout(stripe, admin, userId, body) {
  const { payoutId, accountId } = body;
  if (!payoutId) return { status: 400, error: 'payoutId is required' };
  if (!accountId) return { status: 400, error: 'accountId is required' };

  // Fetch the payout record (scoped to requesting user)
  const { data: payout, error: fetchErr } = await admin
    .from('payouts')
    .select('*')
    .eq('id', payoutId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !payout) return { status: 404, error: 'Payout not found' };
  if (payout.status === 'paid') return { status: 400, error: 'Payout already processed' };

  const amountCents = Math.round(Number(payout.agent_share || 0) * 100);
  if (amountCents <= 0) return { status: 400, error: 'Agent share must be positive' };

  // Create a Stripe transfer to the connected account
  const transfer = await stripe.transfers.create({
    amount: amountCents,
    currency: (payout.currency || 'USD').toLowerCase(),
    destination: accountId,
    metadata: {
      payout_id: payoutId,
      agent_id: payout.agent_id || '',
      user_id: userId,
    },
  });

  // Update payout status
  await admin
    .from('payouts')
    .update({
      status: 'paid',
      stripe_transfer_id: transfer.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payoutId);

  log.info(null, 'payout.processed', { payout_id: payoutId, transfer_id: transfer.id });
  return { status: 200, data: { transferId: transfer.id, status: 'paid' } };
}

// ── Payment Methods (cards) ──────────────────────────────────────

async function handleSaveCard(admin, userId, body) {
  const { card_brand, card_last4, card_exp, label } = body;
  if (!card_last4) return { status: 400, error: 'card_last4 is required' };

  // If setting as default, unset other defaults first
  await admin.from('payment_methods').update({ is_default: false }).eq('user_id', userId).eq('type', 'card');

  const { data, error } = await admin.from('payment_methods').insert({
    user_id: userId, type: 'card',
    card_brand: card_brand || 'visa', card_last4, card_exp: card_exp || '',
    label: label || `${(card_brand || 'Card').toUpperCase()} •••• ${card_last4}`,
    is_default: true,
  }).select().single();

  if (error) return { status: 500, error: error.message };
  return { status: 201, data };
}

async function handleRemoveCard(admin, userId, body) {
  const { id } = body;
  if (!id) return { status: 400, error: 'id is required' };

  const { error } = await admin.from('payment_methods')
    .update({ status: 'removed' }).eq('id', id).eq('user_id', userId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { removed: true } };
}

async function handleListCards(admin, userId) {
  const { data, error } = await admin.from('payment_methods')
    .select('*').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false });
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: data || [] };
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const stripe = await getStripe();
  if (!stripe) return jsonError(res, 503, 'Stripe not configured. Set STRIPE_SECRET_KEY.');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  // ── Rate limit ────────────────────────────────────────────────
  const rlKey = getRateLimitIdentifier(req);
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();

  // ── Super Admin guard for sensitive financial operations ─────
  const ADMIN_OPS = new Set(['process-payout', 'balance']);
  if (ADMIN_OPS.has(op)) {
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleRow?.role_id !== 'role-super-admin') {
      return jsonError(res, 403, 'Only Super Admin can perform this operation.');
    }
  }

  try {
    let result;
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    if (req.method === 'POST') {
      if (op === 'create-account') {
        result = await handleCreateAccount(stripe, admin, user.id, body);
      } else if (op === 'create-onboarding') {
        result = await handleCreateOnboarding(stripe, admin, user.id, body);
      } else if (op === 'create-checkout') {
        result = await handleCreateCheckout(stripe, admin, user.id, body);
      } else if (op === 'process-payout') {
        result = await handleProcessPayout(stripe, admin, user.id, body);
      } else if (op === 'save-card') {
        result = await handleSaveCard(admin, user.id, body);
      } else if (op === 'remove-card') {
        result = await handleRemoveCard(admin, user.id, body);
      }
    } else if (req.method === 'GET') {
      if (op === 'account-status') {
        result = await handleAccountStatus(stripe, admin, user.id, req.query);
      } else if (op === 'balance') {
        result = await handleBalance(stripe);
      } else if (op === 'list-cards') {
        result = await handleListCards(admin, user.id);
      }
    }

    if (!result) {
      return jsonError(res, 400, 'Invalid op. Use: create-account, create-onboarding, create-checkout, process-payout, account-status, balance');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'stripe-connect');
  }
}
