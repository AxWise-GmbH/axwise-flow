/**
 * Tool execution service — execute tools, test connections, fetch history.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Execute a tool by ID with optional payload.
 * @param {string} toolId
 * @param {object} [payload]
 * @returns {Promise<{ success, result: { status, statusText, body, durationMs } }>}
 */
export async function executeTool(toolId, payload) {
  const res = await fetch(`${getBase()}/api/execute-tool`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ toolId, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to execute tool');
  return data;
}

/**
 * Test a tool's connection. Can pass toolId (saved tool) or inline connection details.
 * @param {object} params — { toolId } or { connectionType, url, apiKey?, webhookSecret? }
 * @returns {Promise<{ success, reachable, status, statusText, durationMs, message?, error? }>}
 */
export async function testToolConnection(params) {
  const res = await fetch(`${getBase()}/api/test-tool-connection`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to test connection');
  return data;
}

/**
 * Fetch execution history for a tool (direct Supabase query).
 * @param {string} toolId
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
export async function getExecutionHistory(toolId, limit = 20) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('tool_executions')
    .select('*')
    .eq('tool_id', toolId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[toolExecutionService] Failed to load history:', error.message);
    return [];
  }
  return data || [];
}
