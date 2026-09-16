import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthError, fail } from './config.mjs';

const MAX_RECORD = 65_536;
const uid = () => process.getuid?.();
function owned(stat, mode, directory = false) {
  return (directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1) &&
    (uid() === undefined || stat.uid === uid()) && (stat.mode & 0o777) === mode;
}
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!owned(stat, 0o700, true)) fail('STORAGE_UNSAFE', 'Credential and lock directories must be private and owned by the current user.');
  return realpath(path);
}

function decode(value, config) {
  if (value == null) return null;
  let record;
  try { if (value.length > MAX_RECORD) throw new Error(); record = JSON.parse(value); }
  catch { fail('STORAGE_INVALID', 'Stored authorization is invalid; sign in again.'); }
  if (record?.identity !== config.identity || record?.version !== 1) {
    fail('STORAGE_INVALID', 'Stored authorization belongs to a different connection.');
  }
  const t = record.tokens;
  if (!t || !/^[\x21-\x7e]{1,16384}$/.test(t.accessToken ?? '') ||
      !/^[\x21-\x7e]{1,16384}$/.test(t.refreshToken ?? '') || !Number.isSafeInteger(t.expiresAt) ||
      !Array.isArray(t.scopes) || config.scopes.some(scope => !t.scopes.includes(scope))) {
    fail('STORAGE_INVALID', 'Stored authorization is invalid; sign in again.');
  }
  return t;
}
const encode = (tokens, config) => JSON.stringify({ version: 1, identity: config.identity, tokens });

export async function createStore(config, { loadKeyring = () => import('@napi-rs/keyring') } = {}) {
  if (config.authFile) {
    const parent = await realpath(dirname(config.authFile));
    if (!owned(await lstat(parent), 0o700, true)) fail('STORAGE_UNSAFE', 'Test authorization files require an existing private directory.');
    const path = join(parent, basename(config.authFile));
    const safeExisting = async () => {
      try {
        const stat = await lstat(path);
        if (!owned(stat, 0o600)) fail('STORAGE_UNSAFE', 'Test authorization file must be a private regular 0600 file.');
        return true;
      } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    };
    return {
      lockRoot: join(parent, '.orqaly-auth-locks'),
      async get() {
        if (!await safeExisting()) return null;
        const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if (!owned(await handle.stat(), 0o600) || (await handle.stat()).size > MAX_RECORD) fail('STORAGE_UNSAFE', 'Test authorization file is unsafe.');
          return decode(await handle.readFile('utf8'), config);
        } finally { await handle.close(); }
      },
      async set(tokens) {
        await safeExisting();
        const temporary = join(parent, `.orqaly-token-${randomUUID()}.tmp`);
        const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(encode(tokens, config)); await handle.sync(); }
        finally { await handle.close(); }
        try { await safeExisting(); await rename(temporary, path); }
        finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      },
      async delete() { if (await safeExisting()) await unlink(path); },
    };
  }
  let entry;
  try {
    const { AsyncEntry } = await loadKeyring();
    entry = new AsyncEntry('com.orqaly.goose.oauth', config.identity);
  } catch { fail('KEYRING_UNAVAILABLE', 'OS credential storage is unavailable; no plaintext fallback was used.'); }
  async function keyring(method, ...args) {
    try { return await entry[method](...args, AbortSignal.timeout(10_000)); }
    catch { fail('KEYRING_UNAVAILABLE', 'OS credential storage could not complete the operation; no plaintext fallback was used.'); }
  }
  return {
    lockRoot: join(homedir(), '.config', 'orqaly-goose-connector', 'locks'),
    async get() { return decode(await keyring('getPassword'), config); },
    async set(tokens) { await keyring('setPassword', encode(tokens, config)); },
    async delete() { await keyring('deletePassword'); },
  };
}

export async function withStoreLock(store, config, action, { timeoutMs = 30_000 } = {}) {
  const root = await privateDirectory(store.lockRoot);
  const lock = join(root, `${config.identity}.lock`);
  const owner = join(lock, 'owner.json');
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try { await mkdir(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) fail('AUTH_LOCK_BUSY', 'Another authorization command holds the refresh lock. Retry after it exits; see README for crash recovery.');
      await delay(100);
    }
  }
  try {
    const file = await open(owner, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); }
    finally { await file.close(); }
    return await action();
  } finally {
    await unlink(owner).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(lock);
  }
}

export function safeError(error) {
  if (error instanceof AuthError) return `${error.code}: ${error.message}`;
  return 'AUTH_FAILED: Authorization could not complete. No credentials were printed.';
}
