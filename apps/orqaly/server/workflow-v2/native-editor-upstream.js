import { randomUUID } from 'node:crypto';

// This reader is deliberately not an n8n API proxy. The only upstream mutation
// is standard password login. Workflow reads/writes, execution, credentials,
// invitations, API keys and administrative actions belong to the scoped gateway.
const METADATA_PATHS = new Set([
  '/rest/login',
  '/rest/settings',
  '/rest/license',
  '/rest/module-settings',
  '/rest/projects/personal',
  '/rest/projects/my-projects',
  '/rest/projects/count',
  '/rest/community-node-types',
  '/rest/data-tables-global/limits',
  '/healthz',
]);
const TYPE_PATHS = new Set([
  '/types/nodes.json',
  '/types/credentials.json',
  '/types/node-versions.json',
]);

export function isNativeN8nReadPath(path) {
  if (typeof path !== 'string' || path.length > 1024 || /[%?#\\\s]/.test(path)) return false;
  if (path.includes('//') || path.split('/').some((part) => part === '.' || part === '..'))
    return false;
  return (
    METADATA_PATHS.has(path) ||
    TYPE_PATHS.has(path) ||
    path === '/favicon.ico' ||
    path === '/workflows/demo' ||
    /^\/workflow\/[A-Za-z0-9_-]{1,128}$/.test(path) ||
    /^\/(?:assets|static)\/[A-Za-z0-9_./@-]+\.(?:js|css|woff2?|ttf|svg|png|webp|ico|json)$/.test(
      path
    ) ||
    /^\/icons\/n8n-nodes-base\/dist\/[A-Za-z0-9_./@-]+\.(?:svg|png|webp)$/.test(path)
  );
}

async function boundedBody(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('native_editor_upstream_response_too_large');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('native_editor_upstream_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    reader.releaseLock();
  }
}

export function createNativeN8nUpstream({
  origin,
  email,
  password,
  identityHeaders = async () => ({}),
  fetchImpl = fetch,
  allowLocalHttp = false,
  now = Date.now,
  maxAssetBytes = 20 * 1024 * 1024,
} = {}) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('invalid_native_editor_origin');
  }
  const local =
    allowLocalHttp && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    (!local && url.protocol !== 'https:') ||
    url.origin !== origin ||
    url.username ||
    url.password
  )
    throw new Error('invalid_native_editor_origin');
  if (
    typeof email !== 'string' ||
    !email.includes('@') ||
    typeof password !== 'string' ||
    password.length < 8
  )
    throw new Error('native_editor_auth_not_configured');
  // The backend is the n8n client. Its genuine cookie stays bound to this ID;
  // no browser-supplied cookie/header can substitute for upstream credentials.
  const browserId = randomUUID();
  let cookie = '';
  let expiresAt = 0;
  let loginPending;

  async function request(
    path,
    { method = 'GET', body, withCookie = true, timeoutMs = 30000 } = {}
  ) {
    const headers = new Headers(await identityHeaders(origin));
    headers.delete('cookie');
    headers.delete('x-n8n-api-key');
    headers.set('browser-id', browserId);
    headers.set('accept', path.startsWith('/rest/') ? 'application/json' : '*/*');
    if (withCookie && cookie) headers.set('cookie', cookie);
    if (body) headers.set('content-type', 'application/json');
    try {
      return await fetchImpl(`${origin}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Never bubble fetch errors containing URLs, identity headers or a login
      // response. Callers receive only a stable, non-sensitive failure code.
      throw new Error('native_editor_upstream_unavailable');
    }
  }

  async function authenticate() {
    if (cookie && expiresAt > now()) return;
    if (!loginPending) {
      loginPending = (async () => {
        const response = await request('/rest/login', {
          method: 'POST',
          withCookie: false,
          body: { emailOrLdapLoginId: email, password },
          // A scale-to-zero editor can take over 30s to start and authenticate.
          // Bound this initial wait separately; ordinary reads keep 30s limits.
          timeoutMs: 60000,
        });
        const setCookies = response.headers.getSetCookie();
        const authCookie = setCookies.find((value) => /^n8n-auth=/.test(value));
        await response.body?.cancel();
        if (!response.ok || !authCookie || authCookie.startsWith('n8n-auth=;'))
          throw new Error('native_editor_upstream_auth_failed');
        cookie = authCookie.split(';')[0];
        const maxAge = authCookie.match(/;\s*Max-Age=(\d+)/i)?.[1];
        expiresAt = now() + Math.min(maxAge ? Number(maxAge) * 1000 : 300000, 300000);
      })().finally(() => {
        loginPending = undefined;
      });
    }
    await loginPending;
  }

  return Object.freeze({
    async read(path) {
      if (!isNativeN8nReadPath(path)) throw new Error('native_editor_upstream_path_denied');
      await authenticate();
      let response = await request(path);
      if (response.status === 401) {
        await response.body?.cancel();
        cookie = '';
        expiresAt = 0;
        await authenticate();
        response = await request(path);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          response.status === 401
            ? 'native_editor_upstream_auth_failed'
            : 'native_editor_upstream_unavailable'
        );
      }
      const maxBytes = path.startsWith('/rest/') ? 2 * 1024 * 1024 : maxAssetBytes;
      const body = await boundedBody(response, maxBytes);
      // Set-Cookie, CSP, cross-origin policy and transport encodings must never
      // be copied out of the upstream. Gateway sets its own security headers.
      const headers = new Headers();
      headers.set(
        'content-type',
        response.headers.get('content-type') || 'application/octet-stream'
      );
      headers.set('cache-control', 'private, no-store');
      return { status: response.status, headers, body };
    },
  });
}
