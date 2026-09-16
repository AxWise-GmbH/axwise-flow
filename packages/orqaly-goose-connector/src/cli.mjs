#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { AuthError, parseArguments, fail } from './config.mjs';
import { createStore, withStoreLock, safeError } from './store.mjs';
import { authorizationUrl, discover, exchange, pkce, refresh, revoke, startCallback } from './oauth.mjs';

function openBrowser(url) {
  const executable = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise(resolve => execFile(executable, args, { timeout: 5000, windowsHide: true }, error => resolve(!error)));
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const { command, config, noOpen, forceRefresh } = await parseArguments(argv);
  const store = await createStore(config);
  if (command === 'login') {
    const metadata = await discover(config), proof = pkce();
    const callback = await startCallback(proof.state);
    const interrupt = () => callback.close();
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
    try {
      const url = authorizationUrl(config, metadata, proof, callback.redirectUri);
      stdout.write(`${url}\n`);
      if (!noOpen && !await openBrowser(url)) stderr.write('Open the printed sign-in URL in your browser.\n');
      const code = await callback.result;
      const tokens = await exchange(config, metadata, proof, callback.redirectUri, code);
      await withStoreLock(store, config, () => store.set(tokens));
      stderr.write('Signed in. Authorization is stored in the selected credential store.\n');
    } finally {
      callback.close(); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    }
    return;
  }
  if (command === 'token') {
    const accessToken = await withStoreLock(store, config, async () => {
      let tokens = await store.get();
      if (!tokens) fail('LOGIN_REQUIRED', 'Sign in before requesting an access token.');
      if (forceRefresh || tokens.expiresAt - Date.now() <= 60_000) {
        try {
          tokens = await refresh(config, await discover(config), tokens);
          await store.set(tokens);
        } catch (error) {
          if (error instanceof AuthError && error.code === 'LOGIN_REQUIRED') await store.delete();
          throw error;
        }
      }
      return tokens.accessToken;
    });
    // This is the executable-token contract: no status text on stdout.
    stdout.write(`${accessToken}\n`);
    return;
  }
  await withStoreLock(store, config, async () => {
    const tokens = await store.get();
    if (!tokens) { stderr.write('Already signed out locally.\n'); return; }
    let revoked = false, remoteError;
    try { revoked = await revoke(config, await discover(config), tokens); }
    catch (error) { remoteError = error; }
    finally { await store.delete(); }
    if (remoteError) fail('LOGOUT_REMOTE_UNCONFIRMED', 'Local authorization was cleared; remote revocation could not be confirmed.');
    stderr.write(revoked ? 'Signed out; refresh grant revoked and local authorization cleared.\n' :
      'Signed out locally. Issuer advertises no revocation endpoint; the remote grant was not revoked.\n');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${safeError(error)}\n`); process.exitCode = 1; });
}
