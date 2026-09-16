/**
 * KB File Service — file storage for knowledge base documents.
 * Pattern from taskFileService.js — Supabase Storage with signed URLs.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const BUCKET = 'kb-files';
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

function sanitiseName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function getExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx) : '';
}

export function validateKBFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size > MAX_SIZE_BYTES) return { ok: false, error: 'File exceeds 25 MB limit.' };
  if (ALLOWED_TYPES.length && !ALLOWED_TYPES.includes(file.type) && file.type !== '') {
    return { ok: false, error: `Unsupported file type: ${file.type || 'unknown'}` };
  }
  return { ok: true };
}

async function ensureBucket() {
  if (!hasSupabase()) return false;
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return true;
  } catch {
    /* bucket doesn't exist */
  }
  try {
    await supabase.storage.createBucket(BUCKET, { public: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload a file for a KB document.
 * @param {string} userId - Owner user ID
 * @param {File} file - Browser File object
 * @returns {Promise<{ file_path, file_name, file_size, file_mime }>}
 */
export async function uploadKBFile(userId, file) {
  const check = validateKBFile(file);
  if (!check.ok) throw new Error(check.error);

  if (!hasSupabase()) throw new Error('Supabase required for file upload');

  await ensureBucket();
  const path = `${userId}/${Date.now()}-${sanitiseName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Upload failed');

  return {
    file_path: path,
    file_name: file.name,
    file_size: file.size,
    file_mime: file.type,
    ext: getExtension(file.name),
  };
}

/** Get a 1-hour signed download URL. */
export async function getKBFileUrl(filePath) {
  if (!hasSupabase() || !filePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Delete a file from storage. */
export async function deleteKBFile(filePath) {
  if (!hasSupabase() || !filePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (error) throw new Error(error.message);
}

/** Format bytes for display. */
export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
