import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const fail = (code, message) => { throw new AuthError(code, message); };
const loopback = (url) => ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);

function origin(value, allowLocalhost) {
  let url;
  try { url = new URL(value); } catch { fail('CONFIG_INVALID', 'Issuer and API URL must be explicit origins.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(allowLocalhost && url.protocol === 'http:' && loopback(url)))) {
    fail('CONFIG_INVALID', 'Issuer and API URL require HTTPS origins; HTTP loopback requires --allow-localhost.');
  }
  return url.origin;
}

export function validateConfig(raw, { allowLocalhost = false, authFile = null } = {}) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object' ||
      Object.keys(raw).some(key => !['issuer', 'clientId', 'apiUrl', 'scopes'].includes(key))) {
    fail('CONFIG_INVALID', 'Configuration accepts only issuer, clientId, apiUrl and scopes.');
  }
  const issuer = origin(raw.issuer, allowLocalhost), apiUrl = origin(raw.apiUrl, allowLocalhost);
  if (typeof raw.clientId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(raw.clientId)) {
    fail('CONFIG_INVALID', 'An explicit OAuth client ID is required.');
  }
  const scopes = raw.scopes ?? ['offline_access', 'profile'];
  if (!Array.isArray(scopes) || !scopes.length || scopes.length > 20 ||
      scopes.some(scope => typeof scope !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(scope)) ||
      !scopes.includes('offline_access') || new Set(scopes).size !== scopes.length) {
    fail('CONFIG_INVALID', 'Use unique OAuth scopes including offline_access.');
  }
  if (authFile && (!isAbsolute(authFile) || !allowLocalhost ||
      ![issuer, apiUrl].every(value => loopback(new URL(value))))) {
    fail('TEST_STORAGE_ONLY', '--auth-file requires an absolute path, --allow-localhost and loopback issuer/API.');
  }
  const config = { issuer, clientId: raw.clientId, apiUrl, scopes: [...scopes].sort() };
  const identity = createHash('sha256').update(JSON.stringify(config)).digest('hex');
  return { ...config, identity, authFile };
}

export async function parseArguments(argv) {
  const [command, ...args] = argv;
  if (!['login', 'token', 'logout'].includes(command)) {
    fail('USAGE', 'Use login, token or logout with --config FILE or --issuer URL --client-id ID --api-url URL.');
  }
  const options = {};
  const flags = new Set(['--no-open', '--allow-localhost', '--refresh']);
  const values = new Set(['--config', '--issuer', '--client-id', '--api-url', '--scopes', '--auth-file']);
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (Object.hasOwn(options, key)) fail('USAGE', 'Duplicate CLI option.');
    if (flags.has(key)) options[key] = true;
    else if (values.has(key) && args[index + 1] && !args[index + 1].startsWith('--')) options[key] = args[++index];
    else fail('USAGE', 'Unknown or incomplete CLI option.');
  }
  if ((options['--no-open'] && command !== 'login') || (options['--refresh'] && command !== 'token')) {
    fail('USAGE', '--no-open is for login; --refresh is for token.');
  }
  let raw = {};
  if (options['--config']) {
    try {
      const bytes = await readFile(options['--config']);
      if (bytes.length > 16_384) throw new Error();
      raw = JSON.parse(bytes.toString('utf8'));
    } catch { fail('CONFIG_INVALID', 'Cannot read the public configuration JSON.'); }
  }
  for (const [key, field] of [['--issuer', 'issuer'], ['--client-id', 'clientId'], ['--api-url', 'apiUrl']]) {
    if (options[key]) raw[field] = options[key];
  }
  if (options['--scopes']) raw.scopes = options['--scopes'].split(/\s+/);
  return { command, noOpen: Boolean(options['--no-open']), forceRefresh: Boolean(options['--refresh']),
    config: validateConfig(raw, { allowLocalhost: Boolean(options['--allow-localhost']), authFile: options['--auth-file'] }) };
}
