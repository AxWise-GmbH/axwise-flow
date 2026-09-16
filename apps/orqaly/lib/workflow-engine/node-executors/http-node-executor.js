/**
 * HTTP node executor — makes HTTP requests using the same pattern as api-executor.
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';

/**
 * @param {object} config - { url, method, headers, body }
 * @param {object} inputData - Data from upstream nodes
 * @param {import('../execution-context.js').ExecutionContext} ctx
 */
export async function executeHttpNode(config, inputData, ctx) {
  let url = resolveTemplate(config.url || '', inputData);
  if (!url) throw new Error('HTTP node: url is required');

  const method = (config.method || 'GET').toUpperCase();
  const headers = {};

  // Parse headers from config
  if (config.headers) {
    if (typeof config.headers === 'string') {
      for (const line of config.headers.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    } else if (typeof config.headers === 'object') {
      Object.assign(headers, config.headers);
    }
  }

  if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';

  // Build body
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  let body = undefined;

  if (hasBody) {
    if (config.body) {
      body = typeof config.body === 'string'
        ? resolveTemplate(config.body, inputData)
        : JSON.stringify(config.body);
    } else {
      body = JSON.stringify(inputData || {});
    }
  }

  const start = Date.now();
  const res = await fetchWithRetry(
    url,
    { method, headers, body },
    { timeoutMs: config.timeoutMs || 10000, retries: 1 },
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
      statusText: res.statusText,
      body: resBody,
      headers: Object.fromEntries(res.headers.entries()),
      durationMs: Date.now() - start,
    },
    outputPort: 'out',
  };
}

function resolveTemplate(str, data) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let val = parts[0] === 'input' ? data : data;
    const keys = parts[0] === 'input' ? parts.slice(1) : parts;
    for (const k of keys) {
      if (val == null) return match;
      val = val[k];
    }
    return val === undefined ? match : String(val);
  });
}
