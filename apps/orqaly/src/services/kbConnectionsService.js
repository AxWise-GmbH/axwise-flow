/**
 * KB connections service - frontend client for /api/app?path=kb-connections and
 * the OAuth authorize step at /api/app?path=kb-oauth. Manages Knowledge Base
 * source connections (Notion / Obsidian / Google Drive / Dropbox / OneDrive /
 * Mega), their connect method (OAuth / BYOK / import) and Download vs Live mode.
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

async function call(path, method, params = {}, body = null) {
  const qs = new URLSearchParams({ path, ...params });
  for (const [k, v] of qs.entries()) if (v === '' || v == null) qs.delete(k);
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `${path} ${method} failed`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const request = (method, params = {}, body = null) => call('kb-connections', method, params, body);

/** List connections + per-source capabilities { connections, capabilities }. */
export function listConnections() {
  return request('GET').then((d) => ({
    connections: d.connections || [],
    capabilities: d.capabilities || {},
  }));
}

/** Create or update a connection (upsert by source_type + slot). */
export function saveConnection(conn) {
  return request('POST', {}, conn).then((d) => d.connection);
}

/** Run a download sync now for a connection. */
export function syncConnection(id) {
  return request('POST', { action: 'sync', id });
}

/** Test a connection's credentials/reachability. */
export function testConnection(id) {
  return request('POST', { action: 'test', id });
}

/** Remove a connection (does not delete already-synced KB docs). */
export function deleteConnection(id) {
  return request('DELETE', { id }).then((d) => d.deleted);
}

/** Get the provider consent URL for an OAuth source (Dropbox / OneDrive). */
export function authorizeOAuth(sourceType) {
  return call('kb-oauth', 'POST', { action: 'authorize', provider: sourceType }).then((d) => d.url);
}
