/**
 * Replicator service — frontend wrapper for /api/app?path=replicators.
 */
import { getAuthHeaders } from '../lib/supabaseEdge';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

async function post(sub, body, { signal } = {}) {
  // getAuthHeaders() already sets Content-Type; do NOT re-add it here.
  // Setting both 'content-type' and 'Content-Type' in the same object sends
  // a comma-joined header value that Express rejects as "invalid media type".
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/app?path=replicators&sub=${encodeURIComponent(sub)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed: ${res.status}`);
  }
  return payload;
}

export function discoverEndpoints(args) {
  if (typeof args === 'string') return post('discover', { toolId: args });
  return post('discover', args || {});
}

export function createReplicator(blueprint) {
  return post('create', { blueprint });
}

export function runReplicatorAction(phaseId, input, opts = {}) {
  return post('run-action', { phaseId, input }, opts);
}
