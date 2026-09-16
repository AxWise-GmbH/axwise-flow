/**
 * Frontend client for /api/app?path=storage-connections.
 *
 * Like userKeysService, this never caches credentials — they're typed in the
 * wizard and POSTed once. The list endpoint returns metadata only (no creds).
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

export async function listStorageConnections() {
  const res = await fetch(`${getBase()}/api/app?path=storage-connections`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load connections');
  return data.connections || [];
}

/**
 * Create a new storage connection. The backend probes the credentials before
 * committing — wrong service-role keys are rejected up front.
 *
 * @param {object} input
 * @param {'supabase'|'s3'|'r2'|'gcs'} input.kind
 * @param {string} [input.label]
 * @param {string} [input.slot='primary']
 * @param {object} [input.metadata] - e.g. { bucket: 'goal-deliverables' }
 * @param {string} input.credential - JSON-stringified backend creds
 *                                    For supabase: {"url":"https://x.supabase.co","serviceRoleKey":"eyJ..."}
 */
export async function createStorageConnection(input) {
  const res = await fetch(`${getBase()}/api/app?path=storage-connections`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Failed to save connection');
  return data;
}

/**
 * Run a probe upload+delete against an existing saved connection. Updates
 * last_test_ok / last_test_error on the row.
 */
export async function testStorageConnection(id) {
  const url = `${getBase()}/api/app?path=storage-connections&action=test&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'POST', headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || data.message || 'test failed' };
  return data;
}

export async function deleteStorageConnection(id) {
  const url = `${getBase()}/api/app?path=storage-connections&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'DELETE', headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete connection');
  return data;
}
