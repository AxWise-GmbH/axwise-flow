import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArguments, validateConfig } from '../src/config.mjs';
import { authorizationUrl, discover, pkce, startCallback } from '../src/oauth.mjs';
import { createStore, withStoreLock } from '../src/store.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const httpsConfig = { issuer: 'https://issuer.example', clientId: 'publicClient', apiUrl: 'https://api.example' };
const shutdown = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });

function run(args) {
  const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', firstLine;
  const line = new Promise(resolve => { firstLine = resolve; });
  child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('\n')) firstLine(stdout.split('\n')[0]); });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  return { child, line, done };
}

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orqaly-auth-test.')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observed = { exchanges: 0, refreshes: 0, revocations: [], bodies: [] };
  const settings = { metadata: {}, tokenError: null, revokeError: false };
  let authRequest, issuer;
  const metadata = () => ({ issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`,
    revocation_endpoint: `${issuer}/oauth/token/revoke`, code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], ...settings.metadata });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, issuer);
      const json = value => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (url.pathname === '/.well-known/oauth-authorization-server') return json(metadata());
      let body = ''; for await (const chunk of req) body += chunk;
      const fields = new URLSearchParams(body); observed.bodies.push(fields);
      assert.equal(fields.get('client_id'), 'publicClient');
      assert.equal(fields.has('client_secret'), false);
      if (url.pathname === '/oauth/token/revoke') {
        observed.revocations.push(fields.get('token'));
        if (settings.revokeError) { res.writeHead(503); return res.end('unavailable'); }
        return json({});
      }
      assert.equal(url.pathname, '/oauth/token');
      if (settings.tokenError) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: settings.tokenError, error_description: 'synthetic-private-detail' }));
      }
      if (fields.get('grant_type') === 'authorization_code') {
        observed.exchanges++;
        assert.equal(fields.get('code'), 'synthetic-code');
        assert.equal(fields.get('redirect_uri'), authRequest.searchParams.get('redirect_uri'));
        assert.equal(createHash('sha256').update(fields.get('code_verifier')).digest('base64url'), authRequest.searchParams.get('code_challenge'));
        return json({ access_token: 'synthetic-initial-access', refresh_token: 'synthetic-refresh-1', token_type: 'Bearer', expires_in: 3600, scope: 'offline_access profile' });
      }
      observed.refreshes++;
      assert.equal(fields.get('refresh_token'), 'synthetic-refresh-1');
      await delay(100);
      return json({ access_token: 'synthetic-refreshed-access', refresh_token: 'synthetic-refresh-2', token_type: 'Bearer', expires_in: 3600, scope: 'offline_access profile' });
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_request', error_description: 'synthetic-private-detail' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => shutdown(server));
  issuer = `http://127.0.0.1:${server.address().port}`;
  const config = validateConfig({ issuer, clientId: 'publicClient', apiUrl: issuer }, { allowLocalhost: true, authFile: join(root, 'auth.json') });
  const args = ['--issuer', issuer, '--client-id', config.clientId, '--api-url', issuer, '--allow-localhost', '--auth-file', config.authFile];
  return { root, config, args, observed, metadata, settings, setAuthorization(value) { authRequest = value; } };
}

test('configuration rejects unsafe origins, implicit plaintext and unknown options', async () => {
  assert.equal(validateConfig(httpsConfig).issuer, httpsConfig.issuer);
  for (const issuer of ['http://issuer.example', 'https://user:password@issuer.example', 'https://issuer.example/path', 'https://issuer.example?secret=value']) {
    assert.throws(() => validateConfig({ ...httpsConfig, issuer }), /HTTPS origins/);
  }
  assert.throws(() => validateConfig(httpsConfig, { allowLocalhost: true, authFile: '/private/tmp/auth.json' }), /loopback issuer/);
  assert.throws(() => validateConfig({ ...httpsConfig, clientSecret: 'never-allowed' }), /only issuer/);
  await assert.rejects(parseArguments(['token', '--unknown', 'sensitive']), /Unknown/);
  assert.notEqual(validateConfig(httpsConfig).identity, validateConfig({ ...httpsConfig, apiUrl: 'https://other.example' }).identity);
});

test('callback requires exact path, unique matching state, and a valid single code', async t => {
  const proof = pkce(), callback = await startCallback(proof.state, { timeoutMs: 5000 });
  t.after(callback.close);
  for (const [path, status] of [['/other', 404], ['/callback?code=one&state=wrong', 400],
    [`/callback?code=one&state=${proof.state}&state=${proof.state}`, 400],
    [`/callback?code=one&code=two&state=${proof.state}`, 400]]) {
    assert.equal((await fetch(new URL(path, callback.redirectUri))).status, status);
  }
  const success = new URL(callback.redirectUri); success.search = new URLSearchParams({ code: 'synthetic-code', state: proof.state });
  assert.equal((await fetch(success)).status, 200);
  assert.equal(await callback.result, 'synthetic-code');
});

test('callback expires and matching-state denial never becomes a code', async () => {
  const timed = await startCallback('expected-state', { timeoutMs: 10 });
  await assert.rejects(timed.result, /deadline/);
  const denied = await startCallback('expected-state');
  const url = `${denied.redirectUri}?state=expected-state&error=access_denied&error_description=secret`;
  assert.equal((await fetch(url)).status, 400);
  await assert.rejects(denied.result, error => error.code === 'LOGIN_DENIED' && !error.message.includes('secret'));
});

test('discovery refuses a different issuer and credential endpoints', async t => {
  const f = await fixture(t);
  assert.equal((await discover(f.config)).issuer, f.config.issuer);
  // A configured issuer mismatch is rejected before any authorization code/token is sent.
  const server = createServer((_req, res) => res.end(JSON.stringify({ ...f.metadata(), issuer: 'https://other.example' })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => shutdown(server));
  await assert.rejects(discover({ ...f.config, issuer: `http://127.0.0.1:${server.address().port}` }), /does not match/);
  f.settings.metadata.token_endpoint = 'https://untrusted.example/oauth/token';
  await assert.rejects(discover(f.config), /does not match/);
  delete f.settings.metadata.token_endpoint;
  f.settings.metadata.revocation_endpoint = 'https://untrusted.example/oauth/token/revoke';
  await assert.rejects(discover(f.config), /does not match/);
});

test('local login, concurrent refresh, token stdout and logout keep exact OAuth boundaries', async t => {
  const f = await fixture(t);
  const login = run(['login', '--no-open', ...f.args]);
  t.after(() => login.child.kill());
  const auth = new URL(await login.line); f.setAuthorization(auth);
  assert.equal(auth.origin, f.config.issuer);
  assert.equal(auth.pathname, '/oauth/authorize');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  const callback = new URL(auth.searchParams.get('redirect_uri'));
  assert.equal(callback.hostname, '127.0.0.1'); assert.equal(callback.pathname, '/callback');
  callback.search = new URLSearchParams({ state: auth.searchParams.get('state'), code: 'synthetic-code' });
  await fetch(callback);
  const loggedIn = await login.done;
  assert.equal(loggedIn.code, 0, loggedIn.stderr);
  assert.equal(loggedIn.stdout.includes('synthetic-initial-access'), false);
  assert.equal((await lstat(f.config.authFile)).mode & 0o777, 0o600);
  const first = await run(['token', ...f.args]).done;
  assert.deepEqual(first, { code: 0, stdout: 'synthetic-initial-access\n', stderr: '' });
  const record = JSON.parse(await readFile(f.config.authFile, 'utf8'));
  record.tokens.expiresAt = Date.now() - 1000;
  await writeFile(f.config.authFile, JSON.stringify(record), { mode: 0o600 });
  const refreshed = await Promise.all([run(['token', ...f.args]).done, run(['token', ...f.args]).done]);
  for (const result of refreshed) assert.deepEqual(result, { code: 0, stdout: 'synthetic-refreshed-access\n', stderr: '' });
  assert.equal(f.observed.exchanges, 1); assert.equal(f.observed.refreshes, 1);
  assert.equal(JSON.parse(await readFile(f.config.authFile, 'utf8')).tokens.refreshToken, 'synthetic-refresh-2');
  const logout = await run(['logout', ...f.args]).done;
  assert.equal(logout.code, 0, logout.stderr); assert.equal(logout.stdout, '');
  assert.deepEqual(f.observed.revocations, ['synthetic-refresh-2']);
  await assert.rejects(lstat(f.config.authFile), { code: 'ENOENT' });
  const empty = await run(['token', ...f.args]).done;
  assert.equal(empty.code, 1); assert.equal(empty.stdout, ''); assert.match(empty.stderr, /LOGIN_REQUIRED/);
});

test('file storage rejects permissive files and symlinks; connection identities do not mix', async t => {
  const f = await fixture(t), store = await createStore(f.config);
  await writeFile(f.config.authFile, '{}', { mode: 0o644 });
  await assert.rejects(store.get(), /0600/);
  await chmod(f.config.authFile, 0o600);
  await assert.rejects(store.get(), /different connection/);
  await rm(f.config.authFile);
  const target = join(f.root, 'target'); await writeFile(target, 'not-a-token', { mode: 0o600 });
  await symlink(target, f.config.authFile);
  await assert.rejects(store.get(), /0600/);
  await assert.rejects(store.set({}), /0600/);
  assert.equal(await readFile(target, 'utf8'), 'not-a-token');
});

test('refresh lock never bypasses an existing holder', async t => {
  const f = await fixture(t), store = await createStore(f.config);
  await mkdir(store.lockRoot, { mode: 0o700 });
  await mkdir(join(store.lockRoot, `${f.config.identity}.lock`), { mode: 0o700 });
  let entered = false;
  await assert.rejects(withStoreLock(store, f.config, () => { entered = true; }, { timeoutMs: 5 }), /refresh lock/);
  assert.equal(entered, false);
});

test('refresh errors never print credentials and revoked grants are cleared', async t => {
  const f = await fixture(t), store = await createStore(f.config);
  await store.set({ accessToken: 'synthetic-expired', refreshToken: 'synthetic-refresh-1', expiresAt: Date.now() - 1, scopes: f.config.scopes });
  f.settings.tokenError = 'invalid_grant';
  const result = await run(['token', ...f.args]).done;
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /LOGIN_REQUIRED/);
  assert.equal(result.stderr.includes('synthetic-'), false);
  assert.equal(await store.get(), null);
});

test('logout reports absent or failed remote revocation and still clears local tokens', async t => {
  const f = await fixture(t), store = await createStore(f.config);
  const tokens = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh-1', expiresAt: Date.now() + 3600000, scopes: f.config.scopes };
  await store.set(tokens);
  f.settings.metadata.revocation_endpoint = undefined;
  const local = await run(['logout', ...f.args]).done;
  assert.equal(local.code, 0); assert.equal(local.stdout, ''); assert.match(local.stderr, /remote grant was not revoked/);
  assert.equal(await store.get(), null); assert.deepEqual(f.observed.revocations, []);
  await store.set(tokens); delete f.settings.metadata.revocation_endpoint;
  f.settings.revokeError = true;
  const failed = await run(['logout', ...f.args]).done;
  assert.equal(failed.code, 1); assert.equal(failed.stdout, ''); assert.match(failed.stderr, /LOGOUT_REMOTE_UNCONFIRMED/);
  assert.equal(await store.get(), null);
});

test('keyring initialization fails closed without a plaintext fallback', async () => {
  await assert.rejects(createStore(validateConfig(httpsConfig), {
    loadKeyring: async () => { throw new Error('native-secret-error'); },
  }), error => error.code === 'KEYRING_UNAVAILABLE' && !error.message.includes('native-secret'));
});

test('authorization URL carries only public client metadata and ephemeral PKCE values', () => {
  const config = validateConfig(httpsConfig), proof = pkce();
  const url = new URL(authorizationUrl(config, { authorization_endpoint: `${config.issuer}/oauth/authorize` }, proof, 'http://127.0.0.1:12345/callback'));
  assert.equal(url.searchParams.get('client_id'), config.clientId);
  assert.equal(url.searchParams.has('code_verifier'), false);
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(url.searchParams.get('state').length, 43);
});
