/**
 * Marketplace service — browse and discover active agents.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function get(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  // Remove empty values
  for (const [k, v] of qs.entries()) {
    if (!v) qs.delete(k);
  }
  const res = await fetch(`${getBase()}/api/app?path=marketplace&${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Marketplace ${op} failed`);
  return data;
}

export function listMarketplaceAgents(filters = {}) {
  return get('list', filters);
}

export function getMarketplaceAgent(id) {
  return get('get', { id });
}
