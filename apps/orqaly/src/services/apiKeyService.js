/**
 * API Key Management Service
 *
 * Generates, lists, revokes, and updates permissions for API access keys.
 * Uses localStorage with Supabase-ready architecture.
 * Each key has: id, label, key (masked after creation), permissions, status, timestamps.
 */
import { maybeNotify } from './emailNotificationDispatcher';

const STORAGE_KEY = 'orch_api_keys_v1';

function generateId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `key_${Date.now()}_${Array.from(bytes, (b) => b.toString(36)).join('')}`;
}

function generateApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `orch_${hex.slice(0, 8)}_${hex.slice(8, 16)}_${hex.slice(16, 24)}_${hex.slice(24)}`;
}

function maskKey(key) {
  if (!key || key.length < 12) return '••••••••';
  return `${key.slice(0, 8)}••••••••${key.slice(-4)}`;
}

function readKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeKeys(keys) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Create a new API key.
 * @param {string} userId - Owner user ID
 * @param {string} label - Human-readable label
 * @param {string[]} permissions - Array of page IDs this key can access
 * @returns {{ record: Object, plainKey: string }} The saved record (masked key) + plain key (shown once)
 */
export function createApiKey(userId, label, permissions = []) {
  if (!userId) throw new Error('User ID required.');
  if (!label?.trim()) throw new Error('Label is required.');

  const plainKey = generateApiKey();
  const now = new Date().toISOString();
  const record = {
    id: generateId(),
    userId,
    label: label.trim().slice(0, 80),
    keyMasked: maskKey(plainKey),
    // keyHash intentionally omitted: never store a recoverable form of a key.
    // The plain key is returned once at creation time and never persisted.
    permissions: Array.isArray(permissions) ? permissions : [],
    status: 'active',
    createdAt: now,
    lastUsedAt: null,
    expiresAt: null,
    usageCount: 0,
  };

  const keys = readKeys();
  keys.unshift(record);
  writeKeys(keys);

  maybeNotify('api_key_created', { label: record.label });
  return { record, plainKey };
}

/**
 * List all API keys for a user.
 */
export function listApiKeys(userId) {
  if (!userId) return [];
  return readKeys().filter((k) => k.userId === userId);
}

/**
 * Get a single key by ID.
 */
export function getApiKey(userId, keyId) {
  return readKeys().find((k) => k.id === keyId && k.userId === userId) || null;
}

/**
 * Update key fields (label, permissions, status).
 */
export function updateApiKey(userId, keyId, updates = {}) {
  const keys = readKeys();
  const idx = keys.findIndex((k) => k.id === keyId && k.userId === userId);
  if (idx < 0) throw new Error('API key not found.');

  const allowed = ['label', 'permissions', 'status', 'expiresAt'];
  for (const field of allowed) {
    if (updates[field] !== undefined) {
      keys[idx][field] = updates[field];
    }
  }
  keys[idx].updatedAt = new Date().toISOString();
  writeKeys(keys);
  return keys[idx];
}

/**
 * Revoke (deactivate) a key.
 */
export function revokeApiKey(userId, keyId) {
  const updated = updateApiKey(userId, keyId, { status: 'revoked' });
  maybeNotify('api_key_revoked', { label: updated?.label || '' });
  return updated;
}

/**
 * Activate a previously revoked key.
 */
export function activateApiKey(userId, keyId) {
  return updateApiKey(userId, keyId, { status: 'active' });
}

/**
 * Permanently delete a key.
 */
export function deleteApiKey(userId, keyId) {
  const keys = readKeys();
  const filtered = keys.filter((k) => !(k.id === keyId && k.userId === userId));
  if (filtered.length === keys.length) throw new Error('API key not found.');
  writeKeys(filtered);
}

/**
 * Update permissions for a key.
 * @param {string[]} permissions - Array of page IDs
 */
export function updateApiKeyPermissions(userId, keyId, permissions) {
  return updateApiKey(userId, keyId, {
    permissions: Array.isArray(permissions) ? permissions : [],
  });
}
