/**
 * Composio connection service — frontend wrapper for composio-connect API.
 *
 * Handles OAuth flow initiation and connection status fetching.
 */
import { getAuthHeaders } from '../lib/supabaseEdge';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

async function fetchJson(url, opts = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${url}`, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all Composio connections for the current user.
 * @returns {Promise<Array<{ id: string, appName: string, status: string, createdAt: string }>>}
 */
export async function fetchComposioConnections() {
  const data = await fetchJson('/api/app?path=composio-connect');
  return data.connections || [];
}

/**
 * Initiate OAuth connection for a Composio app.
 * @param {string} appName - Composio app identifier
 * @returns {Promise<{ success: boolean, appName: string, redirectUrl?: string, connectionId?: string, status?: string }>}
 */
export async function initiateComposioConnection(appName) {
  const redirectUrl = `${globalThis.location.origin}/tools?connected=${appName}`;
  return fetchJson('/api/app?path=composio-connect', {
    method: 'POST',
    body: JSON.stringify({ appName, redirectUrl }),
  });
}
