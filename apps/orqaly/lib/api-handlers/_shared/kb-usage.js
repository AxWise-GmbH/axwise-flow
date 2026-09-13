/**
 * Real per-provider storage usage for the Cloud Storage Monitor. One quota API
 * call per provider (Dropbox / OneDrive / Google Drive / Mega); Notion/Obsidian
 * have no quota API so they report document counts only. Fail-soft: never throws,
 * returns { ok:false, error } so a down provider never breaks the monitor.
 *
 * Returns normalized: { bytesUsed:number|null, bytesTotal:number|null,
 *                       docsCount:number, latencyMs:number, ok:boolean, error? }
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { resolveConnectionAuth } from './kb-connection-auth.js';

const QUOTA_SOURCES = new Set(['dropbox', 'onedrive', 'google-drive', 'mega']);

async function dropboxUsage(token) {
  // get_space_usage takes no args and rejects a JSON content-type with a body.
  const res = await fetchWithRetry(
    'https://api.dropboxapi.com/2/users/get_space_usage',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: 8000, retries: 0 }
  );
  if (!res.ok) throw new Error(`Dropbox usage ${res.status}`);
  const d = await res.json();
  return { bytesUsed: d.used ?? null, bytesTotal: d.allocation?.allocated ?? null };
}

async function onedriveUsage(token) {
  const res = await fetchWithRetry(
    'https://graph.microsoft.com/v1.0/me/drive?$select=quota',
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: 8000, retries: 0 }
  );
  if (!res.ok) throw new Error(`OneDrive usage ${res.status}`);
  const d = await res.json();
  return { bytesUsed: d.quota?.used ?? null, bytesTotal: d.quota?.total ?? null };
}

async function googleDriveUsage(token) {
  const res = await fetchWithRetry(
    'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: 8000, retries: 0 }
  );
  if (!res.ok) throw new Error(`Google Drive usage ${res.status}`);
  const q = (await res.json()).storageQuota || {};
  return {
    bytesUsed: q.usage != null ? Number(q.usage) : null,
    bytesTotal: q.limit != null ? Number(q.limit) : null, // unlimited accounts omit limit
  };
}

async function megaUsage(creds) {
  let Storage;
  try {
    ({ Storage } = await import('megajs'));
  } catch {
    throw new Error('megajs not installed');
  }
  const storage = await new Storage({ email: creds.email, password: creds.password }).ready;
  let used = storage.spaceUsed;
  let total = storage.spaceTotal;
  if ((used == null || total == null) && typeof storage.getAccountInfo === 'function') {
    const info = await storage.getAccountInfo();
    used = info?.spaceUsed ?? used;
    total = info?.spaceTotal ?? total;
  }
  try {
    storage.close?.();
  } catch {
    /* best-effort */
  }
  return { bytesUsed: used ?? null, bytesTotal: total ?? null };
}

/**
 * Upsert today's snapshot row for a connection (idempotent per UTC day). Called
 * by the daily pulse and by the monitor's live probe, so history accumulates as
 * the dashboard is used. Best-effort - never throws.
 */
export async function recordStorageSnapshot({ admin, userId, conn, usage }) {
  const snapshot_date = new Date().toISOString().slice(0, 10); // UTC day
  const row = {
    user_id: conn.user_id || userId,
    kb_connection_id: conn.id,
    source_type: conn.source_type,
    bytes_used: usage.bytesUsed ?? null,
    bytes_total: usage.bytesTotal ?? null,
    docs_count: usage.docsCount ?? conn.docs_synced_count ?? 0,
    last_sync_ok: conn.last_sync_ok ?? null,
    latency_ms: usage.latencyMs ?? null,
    snapshot_date,
  };
  await admin
    .from('storage_metric_snapshots')
    .upsert(row, { onConflict: 'user_id,kb_connection_id,snapshot_date' })
    .then(null, () => {});
}

export async function getConnectionUsage({ admin, userId, conn }) {
  const docsCount = conn.docs_synced_count || 0;
  if (!QUOTA_SOURCES.has(conn.source_type)) {
    return { bytesUsed: null, bytesTotal: null, docsCount, latencyMs: 0, ok: true };
  }
  const started = Date.now();
  try {
    const auth = await resolveConnectionAuth({ admin, userId, conn });
    if (auth.method === 'none') {
      return { bytesUsed: null, bytesTotal: null, docsCount, latencyMs: Date.now() - started, ok: true };
    }
    let usage;
    if (conn.source_type === 'dropbox') usage = await dropboxUsage(auth.token);
    else if (conn.source_type === 'onedrive') usage = await onedriveUsage(auth.token);
    else if (conn.source_type === 'google-drive') usage = await googleDriveUsage(auth.token);
    else usage = await megaUsage(auth.creds);
    return { ...usage, docsCount, latencyMs: Date.now() - started, ok: true };
  } catch (err) {
    return {
      bytesUsed: null,
      bytesTotal: null,
      docsCount,
      latencyMs: Date.now() - started,
      ok: false,
      error: String(err?.message || err).slice(0, 200),
    };
  }
}
