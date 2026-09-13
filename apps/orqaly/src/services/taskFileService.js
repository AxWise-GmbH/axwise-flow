/**
 * Task File Service — isolated file storage for task attachments.
 *
 * Uses Supabase Storage with a dedicated `task-attachments` bucket.
 * Files are stored at: task-attachments/{taskId}/{timestamp}-{filename}
 *
 * Falls back to localStorage (metadata-only, base64 data-urls) when
 * Supabase is not configured, keeping the feature functional offline.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const BUCKET = 'task-attachments';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const LS_KEY = 'orchestratori-task-files';

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

function getExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx) : '';
}

function sanitiseName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function storagePath(taskId, fileName) {
  return `${taskId}/${Date.now()}-${sanitiseName(fileName)}`;
}

/* ---------- validation ---------- */

export function validateFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (file.size > MAX_SIZE_BYTES) return { ok: false, error: 'File exceeds 10 MB limit.' };
  if (ALLOWED_TYPES.length && !ALLOWED_TYPES.includes(file.type) && file.type !== '') {
    return { ok: false, error: `Unsupported file type: ${file.type || 'unknown'}` };
  }
  return { ok: true };
}

/* ---------- localStorage fallback helpers ---------- */

function loadLS() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveLS(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (_) {}
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Supabase helpers ---------- */

async function ensureBucket() {
  if (!hasSupabase()) return false;
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return true;
  } catch {
    /* bucket doesn't exist yet */
  }
  try {
    await supabase.storage.createBucket(BUCKET, { public: false });
    return true;
  } catch {
    return false;
  }
}

/* ---------- public API ---------- */

/**
 * Upload a file for a given task.
 * Returns an attachment metadata object to store on the task.
 */
export async function uploadFile(taskId, file) {
  const check = validateFile(file);
  if (!check.ok) throw new Error(check.error);

  const meta = {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    ext: getExtension(file.name),
    uploadedAt: new Date().toISOString(),
  };

  if (hasSupabase()) {
    await ensureBucket();
    const path = storagePath(taskId, file.name);
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(error.message || 'Upload failed');
    meta.storagePath = path;
    meta.storage = 'supabase';
  } else {
    const dataUrl = await readFileAsDataURL(file);
    const store = loadLS();
    if (!store[taskId]) store[taskId] = [];
    store[taskId].push({ ...meta, dataUrl });
    saveLS(store);
    meta.storage = 'local';
  }

  return meta;
}

/**
 * Get a temporary download URL for an attachment.
 */
export async function getFileUrl(attachment) {
  if (attachment.storage === 'supabase' && hasSupabase() && attachment.storagePath) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storagePath, 3600); // 1-hour URL
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }
  // localStorage fallback
  const store = loadLS();
  for (const files of Object.values(store)) {
    const match = files.find((f) => f.id === attachment.id);
    if (match?.dataUrl) return match.dataUrl;
  }
  return null;
}

/**
 * Delete a single attachment from storage.
 */
export async function deleteFile(attachment) {
  if (attachment.storage === 'supabase' && hasSupabase() && attachment.storagePath) {
    const { error } = await supabase.storage.from(BUCKET).remove([attachment.storagePath]);
    if (error) throw new Error(error.message);
    return;
  }
  // localStorage fallback
  const store = loadLS();
  for (const [taskId, files] of Object.entries(store)) {
    const idx = files.findIndex((f) => f.id === attachment.id);
    if (idx !== -1) {
      files.splice(idx, 1);
      if (files.length === 0) delete store[taskId];
      saveLS(store);
      return;
    }
  }
}

/**
 * Delete all attachments for a task (used when deleting a task).
 */
export async function deleteAllTaskFiles(taskId, attachments = []) {
  if (hasSupabase()) {
    const paths = attachments
      .filter((a) => a.storage === 'supabase' && a.storagePath)
      .map((a) => a.storagePath);
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths);
    }
  }
  // localStorage cleanup
  const store = loadLS();
  if (store[taskId]) {
    delete store[taskId];
    saveLS(store);
  }
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
