/**
 * Frontend client for the Cloud Storage Monitor (/api/app?path=storage-monitor).
 * Real-data only: current provider storage/health/errors + snapshot history.
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

async function call(method, params = {}) {
  const qs = new URLSearchParams({ path: 'storage-monitor', ...params });
  for (const [k, v] of qs.entries()) if (v === '' || v == null) qs.delete(k);
  const res = await fetch(`${getBase()}/api/app?${qs}`, { method, headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `storage-monitor ${method} failed`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Current per-provider storage/health/errors/activity + overview aggregates. */
export function getMonitor() {
  return call('GET');
}

/** Snapshot time-series for the storage-over-time chart. */
export function getHistory(range = 30) {
  return call('GET', { view: 'history', range });
}

/** Record a snapshot point now (call once on mount; not on every poll). */
export function recordSnapshot() {
  return call('POST', { action: 'snapshot' }).catch(() => ({ snapped: 0 }));
}
