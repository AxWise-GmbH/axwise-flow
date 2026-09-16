/**
 * Canonical storage path helper.
 *
 * Layout: {userId}/{goalId}/{kind}/{filename}
 *
 * Why a single canonical layout matters:
 *  - Per-goal delete is one prefix delete instead of a treasure hunt
 *  - Per-goal export is one prefix list
 *  - Storage-quota accounting per user is a single prefix listing
 *  - BYOS users see a clean, predictable layout in their own bucket
 *  - Frontend can synthesize URLs without DB lookups
 *
 * `validatePath()` is the boundary check that StorageWriter.upload() runs
 * before every write. Anything that bypasses this validator (direct
 * `admin.storage.from(...).upload(...)`) is a regression.
 */

const KIND_ALLOWED = new Set([
  'pdf', 'image', 'html', 'deck', 'data', 'report',
  'banner', 'video', 'audio', 'archive', 'other',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Filename rules: printable ASCII, no path separators, no leading dot.
// Allow letters, numbers, dot, dash, underscore, parentheses, square brackets.
const FILENAME_RE = /^(?!\.)[A-Za-z0-9._\-()\[\]]+$/;
const RESERVED_PREFIXES = new Set(['_archive', '_quarantine', '_tmp']);

/**
 * Build a canonical storage path. All inputs are validated and sanitized;
 * throws on bad input rather than silently producing a malformed path.
 *
 * @param {object} parts
 * @param {string} parts.userId   - UUID
 * @param {string} parts.goalId   - UUID
 * @param {string} parts.kind     - one of KIND_ALLOWED
 * @param {string} parts.filename - sanitized to FILENAME_RE
 * @returns {string} canonical path: `${userId}/${goalId}/${kind}/${filename}`
 */
export function pathFor({ userId, goalId, kind, filename }) {
  if (!isValidUuid(userId)) {
    throw new Error(`STORAGE_PATH_INVALID: userId must be a UUID (got "${userId}")`);
  }
  if (!isValidUuid(goalId)) {
    throw new Error(`STORAGE_PATH_INVALID: goalId must be a UUID (got "${goalId}")`);
  }
  if (!KIND_ALLOWED.has(kind)) {
    throw new Error(`STORAGE_PATH_INVALID: kind "${kind}" not in allowed set (${[...KIND_ALLOWED].join(', ')})`);
  }
  const safeFilename = sanitizeFilename(filename);
  return `${userId}/${goalId}/${kind}/${safeFilename}`;
}

/**
 * Validate that a path matches the canonical layout. Used by StorageWriter
 * as a boundary check — anything that fails validation is rejected before
 * the underlying storage backend is called.
 *
 * Reserved prefixes (_archive/, _quarantine/, _tmp/) are accepted because
 * they're managed by the relocation scripts, not by user-facing writes.
 *
 * @param {string} path
 * @returns {{valid: boolean, reason?: string, parsed?: {userId, goalId, kind, filename}}}
 */
export function validatePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    return { valid: false, reason: 'path must be a non-empty string' };
  }
  if (path.includes('..') || path.includes('//')) {
    return { valid: false, reason: 'path traversal sequences not allowed' };
  }
  if (path.startsWith('/') || path.endsWith('/')) {
    return { valid: false, reason: 'path must not start or end with /' };
  }

  const parts = path.split('/');
  // Reserved prefixes bypass canonical validation (relocation scripts only).
  if (RESERVED_PREFIXES.has(parts[0])) {
    return { valid: true };
  }

  if (parts.length !== 4) {
    return { valid: false, reason: `expected 4 segments (userId/goalId/kind/filename), got ${parts.length}` };
  }
  const [userId, goalId, kind, filename] = parts;
  if (!isValidUuid(userId)) return { valid: false, reason: `segment 1 (userId) must be a UUID, got "${userId}"` };
  if (!isValidUuid(goalId)) return { valid: false, reason: `segment 2 (goalId) must be a UUID, got "${goalId}"` };
  if (!KIND_ALLOWED.has(kind)) return { valid: false, reason: `segment 3 (kind) "${kind}" not in allowed set` };
  if (!FILENAME_RE.test(filename)) return { valid: false, reason: `segment 4 (filename) "${filename}" contains disallowed characters` };

  return { valid: true, parsed: { userId, goalId, kind, filename } };
}

/**
 * Throw-on-invalid wrapper for callers that want fail-fast semantics.
 */
export function assertValidPath(path) {
  const r = validatePath(path);
  if (!r.valid) {
    throw new Error(`STORAGE_PATH_INVALID: ${r.reason} (path: "${path}")`);
  }
  return r.parsed;
}

/**
 * Sanitize an arbitrary filename string into something safe for the canonical
 * path. Replaces disallowed characters with `-`, collapses runs of dashes,
 * and strips leading dots (no dotfiles).
 */
export function sanitizeFilename(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('STORAGE_PATH_INVALID: filename must be a non-empty string');
  }
  // Drop directory separators outright — they have no meaning here.
  let s = input.replace(/[\\/]/g, '-');
  // Replace any character outside the allow-list with `-`.
  s = s.replace(/[^A-Za-z0-9._\-()\[\]]/g, '-');
  // Collapse multiple dashes/underscores
  s = s.replace(/-+/g, '-');
  // Strip leading dots (no .env, .htaccess, etc. accidentally landing).
  s = s.replace(/^\.+/, '');
  if (s.length === 0) {
    throw new Error('STORAGE_PATH_INVALID: filename empty after sanitization');
  }
  // Length cap (Supabase Storage object key limit is 1024 bytes, but
  // 200 leaves room for prefixes).
  if (s.length > 200) s = s.slice(0, 200);
  return s;
}

/**
 * Parse a canonical path back into its components. Returns null if invalid.
 */
export function parsePath(path) {
  const r = validatePath(path);
  return r.valid ? r.parsed || null : null;
}

/**
 * Build a prefix used to list/delete all artifacts for a single goal.
 * Useful for per-goal export and per-goal delete endpoints.
 */
export function prefixForGoal({ userId, goalId }) {
  if (!isValidUuid(userId)) throw new Error(`STORAGE_PATH_INVALID: userId must be a UUID`);
  if (!isValidUuid(goalId)) throw new Error(`STORAGE_PATH_INVALID: goalId must be a UUID`);
  return `${userId}/${goalId}/`;
}

/**
 * Build a prefix used to list/delete all artifacts for a user across all goals.
 */
export function prefixForUser({ userId }) {
  if (!isValidUuid(userId)) throw new Error(`STORAGE_PATH_INVALID: userId must be a UUID`);
  return `${userId}/`;
}

function isValidUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

export const _internal = { KIND_ALLOWED, UUID_RE, FILENAME_RE, RESERVED_PREFIXES };
