/**
 * API executor — makes real HTTP requests using the tool's stored credentials.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { validateToolUrl } from './validate-url.js';

/**
 * Parse "Key: Value\nKey2: Value2" header string into an object.
 */
function parseHeaders(raw) {
  const headers = {};
  if (!raw) return headers;
  const lines = String(raw).split('\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) headers[key] = val;
    }
  }
  return headers;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Execute an API-type tool.
 * @param {object} tool   — tool record with url, apiMethod, apiKey, apiHeaders
 * @param {object} opts   — { payload?, timeoutMs? }
 * @returns {{ status, statusText, headers, body, durationMs }}
 */
export async function executeApiTool(tool, { payload, timeoutMs = 7000 } = {}) {
  if (!tool.url) throw new Error('Tool has no endpoint URL configured');
  validateToolUrl(tool.url);

  const headers = parseHeaders(tool.apiHeaders);
  if (tool.apiKey) headers['Authorization'] = `Bearer ${tool.apiKey}`;
  if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const method = (tool.apiMethod || 'POST').toUpperCase();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  const start = Date.now();
  const res = await fetchWithRetry(
    tool.url,
    {
      method,
      headers,
      body: hasBody ? JSON.stringify(payload || {}) : undefined,
    },
    { timeoutMs, retries: 1 }
  );

  const bodyText = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    body: tryParseJson(bodyText),
    durationMs: Date.now() - start,
  };
}

/**
 * Test connectivity for an API-type tool (lightweight GET with short timeout).
 */
export async function testApiConnection(tool) {
  if (!tool.url) throw new Error('Tool has no endpoint URL configured');
  validateToolUrl(tool.url);

  const headers = {};
  if (tool.apiKey) headers['Authorization'] = `Bearer ${tool.apiKey}`;

  const start = Date.now();
  const res = await fetchWithRetry(
    tool.url,
    { method: 'GET', headers },
    { timeoutMs: 6000, retries: 0 }
  );

  return {
    reachable: res.ok,
    status: res.status,
    statusText: res.statusText,
    durationMs: Date.now() - start,
  };
}
