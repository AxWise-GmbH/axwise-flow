/**
 * Webhook node executor — receives or sends webhook data.
 * In execution context, this sends a POST to the configured URL.
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';

/**
 * @param {object} config - { url: string }
 * @param {object} inputData - Data from upstream nodes
 */
export async function executeWebhookNode(config, inputData) {
  const url = config.url;
  if (!url) throw new Error('Webhook node: url is required');

  const body = JSON.stringify(inputData || {});
  const start = Date.now();

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
    { timeoutMs: 10000, retries: 1 },
  );

  const resText = await res.text();
  let resBody;
  try {
    resBody = JSON.parse(resText);
  } catch {
    resBody = resText;
  }

  return {
    output: {
      status: res.status,
      body: resBody,
      durationMs: Date.now() - start,
    },
    outputPort: 'out',
  };
}
