import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hash, LocalAxwiseError, object } from './runtime.mjs';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;
const ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const CONFIG_FIELDS = new Set(['version', 'provider', 'model', 'baseUrl', 'apiKeyEnv', 'allowLoopback',
  'stateDir', 'profileId', 'workspaceId', 'sessionId', 'providerTimeoutMs']);
const invalid = () => { throw new LocalAxwiseError('CONFIG_INVALID', 'Invalid standalone Axwise configuration. Use explicit provider, model, environment-key name, endpoint and local scope.'); };

export function validateBaseUrl(value, { allowLoopback = false } = {}) {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value || /[\\\s?#]/.test(value)) invalid();
  let url;
  try { url = new URL(value); } catch { invalid(); }
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  // A path prefix such as /v1 or /v1beta/openai is allowed. Credentials,
  // redirects, URL parameters, encoded path tricks and parent segments are not.
  if (url.username || url.password || !url.hostname || url.search || url.hash
    || !/^https?:\/\//.test(value) || value.includes('%')
    || value.split('/').some((part) => part === '.' || part === '..')
    || !/^\/(?:[A-Za-z0-9._~-]+\/?)*$/.test(url.pathname)
    || (url.protocol !== 'https:' && !(allowLoopback === true && url.protocol === 'http:' && loopback))) invalid();
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

export function validateStandaloneConfig(value) {
  if (!object(value) || Object.keys(value).some((key) => !CONFIG_FIELDS.has(key))
    || value.version !== 1 || !['gemini', 'openai-compatible'].includes(value.provider)
    || !MODEL.test(value.model || '') || !ENV.test(value.apiKeyEnv || '')
    || (value.allowLoopback !== undefined && typeof value.allowLoopback !== 'boolean')
    || !isAbsolute(value.stateDir || '') || value.stateDir.includes('\0')
    || !ID.test(value.profileId || '') || !ID.test(value.workspaceId || '') || !ID.test(value.sessionId || '')
    || (value.providerTimeoutMs !== undefined && (!Number.isSafeInteger(value.providerTimeoutMs)
      || value.providerTimeoutMs < 1 || value.providerTimeoutMs > 180_000))) invalid();
  return Object.freeze({ ...value, baseUrl: validateBaseUrl(value.baseUrl, value),
    allowLoopback: value.allowLoopback ?? false, providerTimeoutMs: value.providerTimeoutMs ?? 90_000 });
}

/** No key is read here: discovery must work before inference is configured. */
export async function readStandaloneConfig(path) {
  if (!isAbsolute(path || '')) invalid();
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > 16_384) invalid();
    const buffer = Buffer.alloc(16_385); let count = 0;
    while (count < buffer.length) {
      const read = await file.read(buffer, count, buffer.length - count, null);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    if (count > 16_384) invalid();
    return validateStandaloneConfig(JSON.parse(buffer.subarray(0, count).toString('utf8')));
  } catch { invalid(); }
  finally { await file?.close().catch(() => {}); }
}

/** Legacy state field names remain compatible; neither namespace uses a key. */
export function standaloneScope(config) {
  const validated = validateStandaloneConfig(config);
  return { stateDir: validated.stateDir,
    accountHash: hash(['axwise.standalone-scope.v1', validated.profileId, validated.workspaceId]),
    conversationId: validated.sessionId };
}

export function parseStandaloneArguments(argv) {
  const values = new Map(), accepted = new Set(['--config', '--python', '--kernel-root']);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!accepted.has(flag) || values.has(flag) || typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) invalid();
    values.set(flag, value);
  }
  if (values.size !== accepted.size) invalid();
  return { configPath: values.get('--config'), python: values.get('--python'), kernelRoot: values.get('--kernel-root') };
}
