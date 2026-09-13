/**
 * Frontend client for /api/app?path=github-agents-import.
 * Discovers agents published in a public GitHub repo, one page at a time.
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

export async function fetchGithubAgents({ url, offset = 0, limit = 30, q = '' }) {
  const params = new URLSearchParams({ url, offset: String(offset), limit: String(limit) });
  if (q) params.set('q', q);
  const res = await fetch(`${getBase()}/api/app?path=github-agents-import&${params.toString()}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to fetch agents from GitHub');
  return {
    repo: data.repo || null,
    items: Array.isArray(data.items) ? data.items : [],
    total: Number.isFinite(data.total) ? data.total : 0,
    offset: Number.isFinite(data.offset) ? data.offset : offset,
    limit: Number.isFinite(data.limit) ? data.limit : limit,
    hasMore: !!data.hasMore,
    rejected: Number.isFinite(data.rejected) ? data.rejected : 0,
    truncated: !!data.truncated,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}
