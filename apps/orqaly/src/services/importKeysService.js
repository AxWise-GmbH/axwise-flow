/**
 * Frontend client for import-keys-{preview,apply,cancel}.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function postJson(path, body) {
  const res = await fetch(`${getBase()}/api/app?path=${path}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Read a File as a base64 string (no data URL prefix).
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const comma = String(result).indexOf(',');
      resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function previewImport({ sourceType, content, filename, format }) {
  const { ok, data, status } = await postJson('import-keys-preview', {
    sourceType,
    content,
    filename,
    format,
  });
  if (!ok) {
    const err = new Error(data.error || `Preview failed (${status})`);
    err.blocked = !!data.blocked || !!data.securityBlocked;
    err.vtStats = data.vtStats || null;
    err.code = data.code;
    err.severity = data.severity || null;
    err.flags = data.flags || null;
    throw err;
  }
  return data;
}

export async function applyImport({ importId, selections }) {
  const { ok, data } = await postJson('import-keys-apply', { importId, selections });
  if (!ok) throw new Error(data.error || 'Apply failed');
  return data;
}

export async function cancelImport(importId) {
  const { ok, data } = await postJson('import-keys-cancel', { importId });
  if (!ok) throw new Error(data.error || 'Cancel failed');
  return data;
}
