/**
 * Consilium topology service - frontend client for
 * /api/concilium?path=consilium-topology.
 *
 * Backs the editable org-graph ("Graph") view on the Consilium Boards tab.
 * This is NOT a workflow and never appears in the /workflow library.
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

async function request(op, method = 'GET', params = {}, body = null) {
  const qs = new URLSearchParams({ op, ...params });
  for (const [k, v] of qs.entries()) if (v === '' || v == null) qs.delete(k);
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/concilium?path=consilium-topology&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Topology ${op} failed`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Load the user's diagram, seeding it from the org hierarchy on first open. */
export function getTopology() {
  return request('get', 'GET');
}

/** Persist the current canvas. Sends full nodes/edges plus batched per-action activity. */
export function saveTopology({ nodes, edges, expectedVersion, activities } = {}) {
  return request('save', 'POST', {}, { nodes, edges, expectedVersion, activities });
}

/** Rebuild nodes/edges from the DB as a new version. */
export function reseedTopology() {
  return request('reseed', 'POST');
}

/** List restorable version snapshots (newest first, metadata only). */
export function listVersions() {
  return request('list-versions', 'GET');
}

/** Fetch a single version's full nodes/edges. */
export function getVersion(version) {
  return request('get-version', 'GET', { version: String(version) });
}

/** Apply a snapshot as a new version. */
export function restoreVersion(version) {
  return request('restore-version', 'POST', { version: String(version) });
}

/** Read the per-action activity feed (newest first). */
export function listActivity(limit = 100) {
  return request('list-activity', 'GET', { limit: String(limit) });
}
