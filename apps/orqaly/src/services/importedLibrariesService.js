/**
 * Frontend client for /api/app?path=marketplace-imports.
 * Per-user imported Marketplace libraries (curated picks or user-defined).
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

export async function listImportedLibraries(category) {
  const qs = category ? `&category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`${getBase()}/api/app?path=marketplace-imports${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load imported libraries');
  return Array.isArray(data.libraries) ? data.libraries : [];
}

/**
 * Fetch one page of a library's live items from its public source.
 * Returns { items, total, hasMore, live }. `live: false` means no live source
 * exists (or it failed) and the caller should use the library's bundled items.
 */
export async function fetchLibraryItems({ category, sourceId, offset = 0, limit = 50, q = '' }) {
  const params = new URLSearchParams({
    category,
    sourceId,
    offset: String(offset),
    limit: String(limit),
  });
  if (q) params.set('q', q);
  const res = await fetch(
    `${getBase()}/api/app?path=marketplace-library-items&${params.toString()}`,
    { headers: await getHeaders() }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load library items');
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: Number.isFinite(data.total) ? data.total : 0,
    hasMore: !!data.hasMore,
    live: !!data.live,
  };
}

export async function importLibrary(payload) {
  const res = await fetch(`${getBase()}/api/app?path=marketplace-imports`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to import library');
  return data.library || null;
}

export async function removeImportedLibrary(id) {
  const res = await fetch(
    `${getBase()}/api/app?path=marketplace-imports&id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: await getHeaders(),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to remove imported library');
  return true;
}
