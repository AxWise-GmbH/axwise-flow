import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { AuthError, fail } from './config.mjs';

const REQUEST_TIMEOUT = 10_000;
const MAX_RESPONSE = 65_536;
const tokenValue = value => typeof value === 'string' && /^[\x21-\x7e]{1,16384}$/.test(value);

async function request(url, init = {}, { empty = false } = {}) {
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    const chunks = []; let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > MAX_RESPONSE) fail('OAUTH_RESPONSE_INVALID', 'OAuth response exceeds its size limit.');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let data;
    try { data = body ? JSON.parse(body) : {}; } catch { fail('OAUTH_RESPONSE_INVALID', 'OAuth returned an invalid response.'); }
    if (!response.ok) {
      if (data?.error === 'invalid_grant') fail('LOGIN_REQUIRED', 'Authorization expired or was revoked; sign in again.');
      fail('OAUTH_REQUEST_FAILED', 'OAuth request failed; retry or sign in again.');
    }
    if (empty) return;
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('OAUTH_RESPONSE_INVALID', 'OAuth returned an invalid response.');
    return data;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    fail('OAUTH_UNAVAILABLE', 'The configured OAuth service could not be reached within its deadline.');
  }
}

export async function discover(config) {
  const metadata = await request(`${config.issuer}/.well-known/oauth-authorization-server`);
  const includes = (field, value) => Array.isArray(metadata[field]) && metadata[field].includes(value);
  if (metadata.issuer !== config.issuer || metadata.authorization_endpoint !== `${config.issuer}/oauth/authorize` ||
      metadata.token_endpoint !== `${config.issuer}/oauth/token` ||
      !includes('code_challenge_methods_supported', 'S256') ||
      !includes('grant_types_supported', 'authorization_code') ||
      !includes('grant_types_supported', 'refresh_token') ||
      !includes('token_endpoint_auth_methods_supported', 'none')) {
    fail('DISCOVERY_REJECTED', 'OAuth discovery does not match the configured issuer and public PKCE flow.');
  }
  if (metadata.revocation_endpoint !== undefined && metadata.revocation_endpoint !== `${config.issuer}/oauth/token/revoke`) {
    fail('DISCOVERY_REJECTED', 'OAuth revocation endpoint does not match the configured issuer.');
  }
  return metadata;
}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), state: randomBytes(32).toString('base64url') };
}

export async function startCallback(state, { timeoutMs = 300_000 } = {}) {
  let settled = false, timer, accept, reject;
  const result = new Promise((resolve, failResult) => { accept = resolve; reject = failResult; });
  // A timeout can occur while the caller is opening the browser.
  result.catch(() => {});
  const server = createServer((req, res) => {
    const reply = (status, text, done) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
      res.end(text, done);
    };
    if (settled) return reply(410, 'Sign-in callback already completed.');
    if (req.method !== 'GET' || !req.url || req.url.length > 8192 || req.url.split('?')[0] !== '/callback' ||
        req.headers.host !== `127.0.0.1:${server.address().port}`) return reply(404, 'Not found.');
    let params;
    try { params = new URL(req.url, 'http://127.0.0.1').searchParams; } catch { return reply(400, 'Invalid callback.'); }
    const actual = params.get('state') ?? '';
    if (params.getAll('state').length !== 1 || Buffer.byteLength(actual) !== Buffer.byteLength(state) ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(state))) return reply(400, 'Invalid sign-in state.');
    const code = params.get('code');
    const denied = params.has('error');
    if ((!denied && (params.getAll('code').length !== 1 || !tokenValue(code))) || (denied && params.has('code'))) {
      return reply(400, 'Invalid callback.');
    }
    settled = true; clearTimeout(timer);
    reply(denied ? 400 : 200, denied ? 'Sign-in was not approved.' : 'Sign-in received. Return to Orqaly.', () => {
      server.close(); server.closeAllConnections();
      if (denied) reject(new AuthError('LOGIN_DENIED', 'Sign-in was not approved.'));
      else accept(code);
    });
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise((resolve, rejectListen) => {
    server.once('error', () => rejectListen(new AuthError('CALLBACK_UNAVAILABLE', 'Cannot start the local sign-in callback.')));
    server.listen(0, '127.0.0.1', resolve);
  });
  const close = () => {
    clearTimeout(timer); server.close(); server.closeAllConnections();
    if (!settled) { settled = true; reject(new AuthError('LOGIN_TIMEOUT', 'Sign-in did not complete before the deadline.')); }
  };
  timer = setTimeout(close, timeoutMs);
  return { redirectUri: `http://127.0.0.1:${server.address().port}/callback`, result, close };
}

export function authorizationUrl(config, metadata, proof, redirectUri) {
  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: redirectUri,
    scope: config.scopes.join(' '), state: proof.state, code_challenge: proof.challenge, code_challenge_method: 'S256' }).toString();
  return url.href;
}

export function validateTokens(data, config, previous = null) {
  const refreshToken = data.refresh_token ?? previous?.refreshToken;
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : previous?.scopes ?? config.scopes;
  if (!tokenValue(data.access_token) || !tokenValue(refreshToken) || data.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isSafeInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 7 * 24 * 3600 ||
      config.scopes.some(scope => !scopes.includes(scope))) {
    fail('OAUTH_RESPONSE_INVALID', 'OAuth did not return the required expiring access token and refresh grant.');
  }
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000, scopes };
}

export async function exchange(config, metadata, proof, redirectUri, code) {
  const data = await request(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code,
      code_verifier: proof.verifier, redirect_uri: redirectUri }) });
  return validateTokens(data, config);
}

export async function refresh(config, metadata, tokens) {
  const data = await request(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId, refresh_token: tokens.refreshToken }) });
  return validateTokens(data, config, tokens);
}

export async function revoke(config, metadata, tokens) {
  if (!metadata.revocation_endpoint) return false;
  await request(metadata.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: tokens.refreshToken, token_type_hint: 'refresh_token', client_id: config.clientId }) }, { empty: true });
  return true;
}
