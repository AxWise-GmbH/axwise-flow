/**
 * Remove credential-shaped fields from browser/database persistence payloads
 * while preserving ordinary public configuration.
 */
const SECRET_FIELD_NAMES = new Set([
  'apikey',
  'apisecret',
  'webhooksecret',
  'signingsecret',
  'clientsecret',
  'secretkey',
  'bearertoken',
  'bottoken',
  'secrettoken',
  'accesstoken',
  'refreshtoken',
]);
const EXACT_SECRET_FIELD_NAMES = new Set(['secret', 'token']);

function normalizedFieldName(name) {
  return String(name || '')
    .toLowerCase()
    .replaceAll('_', '')
    .replaceAll('-', '');
}

export function isPersistedCredentialField(name) {
  const normalized = normalizedFieldName(name);
  if (EXACT_SECRET_FIELD_NAMES.has(normalized)) return true;
  if (SECRET_FIELD_NAMES.has(normalized)) return true;
  return [...SECRET_FIELD_NAMES].some((secretName) => normalized.endsWith(secretName));
}

export function stripPersistedCredentials(value) {
  if (Array.isArray(value)) return value.map(stripPersistedCredentials);
  if (!value || typeof value !== 'object') return value;

  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (isPersistedCredentialField(key)) continue;
    clean[key] = stripPersistedCredentials(child);
  }
  return clean;
}

export const _internal = { SECRET_FIELD_NAMES, EXACT_SECRET_FIELD_NAMES, normalizedFieldName };
