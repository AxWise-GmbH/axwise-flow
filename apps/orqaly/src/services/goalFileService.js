/**
 * [module: frontend]
 * Goal File Service — upload/download materials and attachments for goals.
 * Reuses Supabase Storage (task-attachments bucket) with goal-scoped paths.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const BUCKET = 'task-attachments';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export function validateFile(file) {
  if (!file) return 'No file selected';
  if (file.size > MAX_SIZE) return `File too large (max ${MAX_SIZE / 1024 / 1024} MB)`;
  if (
    !ALLOWED_TYPES.has(file.type) &&
    !file.name.match(/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|json|png|jpe?g|gif|webp|svg)$/i)
  ) {
    return 'Unsupported file type';
  }
  return null;
}

export async function uploadGoalFile(goalId, file) {
  const err = validateFile(file);
  if (err) throw new Error(err);

  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `goal-${goalId}/${ts}-${safeName}`;

  if (hasSupabase()) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
  }

  return {
    id: `att-${ts}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    ext: file.name.split('.').pop()?.toLowerCase() || '',
    uploadedAt: new Date().toISOString(),
    storagePath: path,
    storage: 'supabase',
  };
}

export async function getGoalFileUrl(attachment) {
  if (!attachment?.storagePath || !hasSupabase()) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storagePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteGoalFile(attachment) {
  if (!attachment?.storagePath || !hasSupabase()) return;
  await supabase.storage.from(BUCKET).remove([attachment.storagePath]);
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
