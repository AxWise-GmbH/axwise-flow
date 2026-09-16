/**
 * Stripe Connect service — onboarding, checkout, payouts.
 * Talks to /api/stripe-connect endpoint.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Create a Stripe Connect account for an agent owner.
 * @param {string} email - Account email
 * @param {string} [agentId] - Agent ID to link
 * @returns {Promise<{ accountId: string }>}
 */
export async function createConnectedAccount(email, agentId) {
  const res = await fetch(`${getBase()}/api/stripe-connect?op=create-account`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ email, agentId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create Stripe account');
  return data;
}

/**
 * Generate a Stripe Connect onboarding link.
 * @param {string} accountId - Stripe connected account ID
 * @returns {Promise<{ url: string }>}
 */
export async function createOnboardingLink(accountId) {
  const res = await fetch(`${getBase()}/api/stripe-connect?op=create-onboarding`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ accountId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create onboarding link');
  return data;
}

/**
 * Create a Stripe Checkout session for a task purchase.
 * @param {object} opts
 * @param {string} [opts.taskId] - Task being purchased
 * @param {string} [opts.agentId] - Agent providing the service
 * @param {number} opts.amount - Amount in dollars (e.g. 10.00)
 * @param {string} [opts.currency='usd']
 * @param {string} [opts.description] - Line item description
 * @returns {Promise<{ sessionId: string, url: string }>}
 */
export async function createCheckoutSession(opts) {
  const res = await fetch(`${getBase()}/api/stripe-connect?op=create-checkout`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(opts),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create checkout session');
  return data;
}

/**
 * Check the status of a connected account.
 * @param {string} accountId
 * @returns {Promise<{ id, chargesEnabled, payoutsEnabled, detailsSubmitted, email }>}
 */
export async function getAccountStatus(accountId) {
  const params = new URLSearchParams({ op: 'account-status', accountId });
  const res = await fetch(`${getBase()}/api/stripe-connect?${params}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to get account status');
  return data;
}

/**
 * Get platform balance summary.
 * @returns {Promise<{ available: Array, pending: Array }>}
 */
export async function getPlatformBalance() {
  const res = await fetch(`${getBase()}/api/stripe-connect?op=balance`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to get balance');
  return data;
}

/**
 * Fetch payout history from Supabase.
 * @param {object} [opts]
 * @param {string} [opts.agentId] - Filter by agent
 * @param {string} [opts.status] - Filter by status
 * @param {number} [opts.limit=50]
 * @returns {Promise<Array>}
 */
export async function getPayoutHistory(opts = {}) {
  if (!hasSupabase()) return [];
  let q = supabase
    .from('payouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit || 50);

  if (opts.agentId) q = q.eq('agent_id', opts.agentId);
  if (opts.status) q = q.eq('status', opts.status);

  const { data, error } = await q;
  if (error) {
    console.warn('[stripeService] Failed to load payouts:', error.message);
    return [];
  }
  return data || [];
}
