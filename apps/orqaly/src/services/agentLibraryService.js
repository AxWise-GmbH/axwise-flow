/**
 * Agent Library service — per-agent connected MCP/Composio bindings.
 * Talks to /api/app?path=agent-libraries.
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
  for (const [k, v] of qs.entries()) {
    if (!v) qs.delete(k);
  }
  const res = await fetch(`${getBase()}/api/app?path=agent-libraries&${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Agent libraries ${op} failed`);
  return data;
}

async function post(op, body = {}) {
  const res = await fetch(`${getBase()}/api/app?path=agent-libraries&op=${op}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Agent libraries ${op} failed`);
  return data;
}

/** List connected libraries for an agent (enriched with catalog metadata). */
export function listConnectedLibraries(agentId) {
  return get('list', { agent_id: agentId });
}

/** Catalog (lightweight, frontend-safe view of MCP_CATALOG). */
export function getLibraryCatalog() {
  return get('catalog');
}

/**
 * Connect a catalog library to an agent.
 * @param {string} agentId
 * @param {string} toolId  — catalog id e.g. 'mcp-github'
 * @param {string[]} optedInSensitive  — subset of catalog.actionsSensitive the user opted into
 * @param {string} [redirectUrl]  — OAuth callback URL
 * @returns {Promise<object>}  { id, tool_id, status, enabled_actions, composio:{redirectUrl,connectionId,status}, catalog }
 */
export function connectLibrary(agentId, toolId, optedInSensitive = [], redirectUrl) {
  return post('connect', {
    agent_id: agentId,
    tool_id: toolId,
    opted_in_sensitive: optedInSensitive,
    redirect_url: redirectUrl,
  });
}

/** Toggle a single action on/off for a connected library. */
export function toggleAction(rowId, action, enabled) {
  return post('actions', { id: rowId, action, enabled: !!enabled });
}

/** Soft-disconnect (status='revoked'). Service exists for future UI; not yet wired into the section. */
export function disconnectLibrary(rowId) {
  return post('disconnect', { id: rowId });
}
