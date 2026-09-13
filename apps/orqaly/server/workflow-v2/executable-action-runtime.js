import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { N8nExecutor } from '../../services/agentic-control-plane/src/executors/n8n-executor.js';
import { loadN8nBindingManifest } from '../../services/agentic-control-plane/src/executors/n8n-binding-manifest.js';

function positiveInteger(value, fallback, name) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be positive`);
  return parsed;
}

function gatewayKeyResolver(rawKeys) {
  let values;
  try {
    values = JSON.parse(rawKeys);
  } catch (error) {
    throw new Error('ORQALY_GATEWAY_PUBLIC_KEYS_JSON must be valid JSON', { cause: error });
  }
  if (!values || Array.isArray(values) || typeof values !== 'object') {
    throw new Error('ORQALY_GATEWAY_PUBLIC_KEYS_JSON must be an object');
  }
  const keys = new Map();
  for (const [keyId, encodedKey] of Object.entries(values)) {
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(keyId)) {
      throw new Error('Gateway signing key ID is invalid');
    }
    if (typeof encodedKey !== 'string' || encodedKey.length > 8_192) {
      throw new Error('Gateway public key is invalid');
    }
    const material = encodedKey.includes('BEGIN PUBLIC KEY')
      ? encodedKey
      : Buffer.from(encodedKey, 'base64').toString('utf8');
    const key = crypto.createPublicKey(material);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('Gateway public keys must use Ed25519');
    }
    keys.set(keyId, key);
  }
  if (!keys.size) throw new Error('at least one Gateway public key is required');
  return async (keyId) => keys.get(keyId) || null;
}

function identityTokenProvider() {
  const auth = new GoogleAuth();
  const clients = new Map();
  return async (audience) => {
    let client = clients.get(audience);
    if (!client) {
      client = await auth.getIdTokenClient(audience);
      clients.set(audience, client);
    }
    const headers = await client.getRequestHeaders();
    const authorization = headers.get
      ? headers.get('authorization')
      : headers.authorization || headers.Authorization;
    const match = /^Bearer (.+)$/.exec(String(authorization || ''));
    if (!match) throw new Error('Google identity token was not returned');
    return match[1];
  };
}

export async function createExecutableActionRuntimeFromEnvironment(environment = process.env) {
  const configuredValues = [
    environment.ORQALY_N8N_BASE_URL,
    environment.ORQALY_N8N_BINDING_MANIFEST_PATH,
    environment.ORQALY_GATEWAY_PUBLIC_KEYS_JSON,
  ].filter(Boolean);
  if (!configuredValues.length) {
    return { configured: false, bindingManifest: null, n8nExecutor: null };
  }
  if (
    !environment.ORQALY_N8N_BASE_URL ||
    !environment.ORQALY_N8N_BINDING_MANIFEST_PATH ||
    !environment.ORQALY_GATEWAY_PUBLIC_KEYS_JSON
  ) {
    throw new Error(
      'execution requires ORQALY_N8N_BASE_URL, ORQALY_N8N_BINDING_MANIFEST_PATH, and ORQALY_GATEWAY_PUBLIC_KEYS_JSON'
    );
  }
  const bindingManifest = await loadN8nBindingManifest(
    environment.ORQALY_N8N_BINDING_MANIFEST_PATH
  );
  const baseUrl = new URL(environment.ORQALY_N8N_BASE_URL);
  const local = ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname);
  const n8nExecutor = new N8nExecutor({
    baseUrl: baseUrl.toString(),
    bindingManifest,
    bindingKey: environment.ORQALY_N8N_BINDING_KEY || 'tool_gateway_connector_v1',
    bindingVersion: environment.ORQALY_N8N_BINDING_VERSION || '1.0',
    timeoutMs: positiveInteger(environment.ORQALY_N8N_TIMEOUT_MS, 90_000, 'ORQALY_N8N_TIMEOUT_MS'),
    identityTokenProvider: local ? async () => null : identityTokenProvider(),
    gatewayPublicKeyResolver: gatewayKeyResolver(environment.ORQALY_GATEWAY_PUBLIC_KEYS_JSON),
  });
  return { configured: true, bindingManifest, n8nExecutor };
}
