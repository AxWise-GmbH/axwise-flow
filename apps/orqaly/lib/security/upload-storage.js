/**
 * Thin wrappers around Supabase Storage for the `user-key-imports` bucket.
 *
 * Path convention: `{user_id}/{uuid}.{ext}` — enforced by caller.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'user-key-imports';

function adminOrThrow() {
  const admin = buildSupabaseAdminClient();
  if (!admin) throw new Error('STORAGE_ADMIN_UNAVAILABLE');
  return admin;
}

export function buildImportPath(userId, filename) {
  const ext = pickExtension(filename) || 'txt';
  return `${userId}/${randomUUID()}.${ext}`;
}

function pickExtension(filename) {
  if (!filename) return null;
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(filename);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Upload a buffer. Returns the storage path on success.
 * Content-Type is deliberately text/plain — nothing in this bucket is executable.
 */
export async function putImportFile(path, buf, contentType = 'text/plain') {
  const admin = adminOrThrow();
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`STORAGE_PUT_FAILED: ${error.message || error}`);
  return path;
}

export async function deleteImportFile(path) {
  const admin = adminOrThrow();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`STORAGE_DELETE_FAILED: ${error.message || error}`);
}

export async function downloadImportFile(path) {
  const admin = adminOrThrow();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error) throw new Error(`STORAGE_GET_FAILED: ${error.message || error}`);
  return Buffer.from(await data.arrayBuffer());
}
