/**
 * Webhook executor — delivers POST payloads with optional HMAC signing.
 */
import crypto from 'crypto';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { validateToolUrl } from './validate-url.js';

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Execute a webhook-type tool by delivering a signed POST payload.
 * @param {object} tool   — tool record with url, webhookSecret, webhookEvents
 * @param {object} opts   — { event?, payload?, timeoutMs? }
 */
export async function executeWebhookTool(tool, { event, payload, timeoutMs = 7000 } = {}) {
  if (!tool.url) throw new Error('Tool has no callback URL configured');
  validateToolUrl(tool.url);

  const body = JSON.stringify({
    event: event || 'tool.run',
    data: payload || {},
    timestamp: Date.now(),
  });

  const headers = { 'Content-Type': 'application/json' };

  if (tool.webhookSecret) {
    const sig = crypto.createHmac('sha256', tool.webhookSecret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = sig;
  }

  const start = Date.now();
  const res = await fetchWithRetry(
    tool.url,
    { method: 'POST', headers, body },
    { timeoutMs, retries: 1 }
  );
  const resBody = await res.text();

  return {
    status: res.status,
    statusText: res.statusText,
    body: tryParseJson(resBody),
    durationMs: Date.now() - start,
  };
}

/**
 * Test connectivity by sending a ping event.
 */
export async function testWebhookConnection(tool) {
  return executeWebhookTool(tool, {
    event: 'ping',
    payload: { test: true },
    timeoutMs: 6000,
  });
}
