/**
 * Frontend client for /api/app?path=provider-catalog.
 * Requests a live external provider catalog (Composio tools, OpenRouter /
 * Hugging Face models) mapped to the Marketplace tab item schema.
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

/**
 * @param {{ provider: string, category: string, q?: string }} params
 * @returns {Promise<Array<object>>} items in the category's tab schema
 */
export async function fetchProviderCatalog({ provider, category, q = '' }) {
  const params = new URLSearchParams({ provider, category });
  if (q && q.trim()) params.set('q', q.trim());
  const res = await fetch(`${getBase()}/api/app?path=provider-catalog&${params.toString()}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to fetch provider catalog');
  return Array.isArray(data.items) ? data.items : [];
}
