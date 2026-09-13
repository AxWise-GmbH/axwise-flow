/**
 * Supabase Edge Function: automated database backup.
 * Replaces the former Vercel serverless function + Vercel Cron.
 *
 * Trigger via pg_cron (daily 03:00 UTC) or manual HTTP call.
 * Exports all tables as JSON, compresses with gzip, uploads to
 * the `db-backups` Storage bucket, deletes backups older than 30 days.
 */
import { corsResponse, jsonResponse, jsonError } from '../_shared/cors.ts';
import { getSupabaseUrl, getServiceRoleKey, supabaseHeaders } from '../_shared/supabase.ts';
import { compress } from 'https://deno.land/x/zip@v1.2.5/mod.ts';

const TABLES = [
  'partners', 'meetings', 'workflows', 'partner_history', 'projects',
  'profile_notes', 'profile_todos', 'audit_log', 'notifications',
  'action_options', 'notification_interactions', 'action_executions',
  'notification_outcomes', 'notification_learning',
  'email_notification_preferences', 'partner_ai_recommendations',
];

const BUCKET = 'db-backups';
const RETENTION_DAYS = 30;
const PAGE_SIZE = 1000;

async function fetchAllRows(baseUrl: string, table: string, headers: Record<string, string>) {
  const rows: unknown[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}/rest/v1/${table}?select=*&order=id&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch ${table} (${res.status}): ${text}`);
    }
    const data = await res.json();
    rows.push(...data);
    hasMore = data.length >= PAGE_SIZE;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function uploadToStorage(baseUrl: string, headers: Record<string, string>, fileName: string, buffer: Uint8Array) {
  const url = `${baseUrl}/storage/v1/object/${BUCKET}/${fileName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/gzip', 'x-upsert': 'true' },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Storage upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function listBackups(baseUrl: string, headers: Record<string, string>) {
  const url = `${baseUrl}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prefix: '', limit: 5000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

async function deleteFiles(baseUrl: string, headers: Record<string, string>, fileNames: string[]) {
  if (!fileNames.length) return;
  const url = `${baseUrl}/storage/v1/object/${BUCKET}`;
  await fetch(url, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: fileNames }) });
}

function parseBackupDate(fileName: string): Date | null {
  const match = fileName.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)/);
  if (!match) return null;
  const iso = match[1].replace(/(\d{2})-(\d{2})-(\d{2}Z)$/, '$1:$2:$3');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

async function gzipData(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const backupSecret = Deno.env.get('BACKUP_SECRET');
  const authHeader = req.headers.get('authorization');

  // Auth: check BACKUP_SECRET or pg_cron internal call
  const isPgCron = req.headers.get('x-pg-cron') === 'true';
  if (!isPgCron) {
    if (!backupSecret) return jsonError('BACKUP_SECRET not configured', 500);
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token !== backupSecret) return jsonError('Unauthorized', 401);
  }

  const supabaseUrl = getSupabaseUrl().replace(/\/$/, '');
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 500);
  }

  const headers = supabaseHeaders(serviceRoleKey);
  const startTime = Date.now();

  try {
    const backup: Record<string, unknown> = {
      version: 1,
      createdAt: new Date().toISOString(),
      supabaseProject: supabaseUrl,
      tables: {} as Record<string, unknown>,
      meta: { tableCount: 0, totalRows: 0 },
    };

    const tables = backup.tables as Record<string, unknown>;
    const meta = backup.meta as { tableCount: number; totalRows: number };

    for (const table of TABLES) {
      try {
        const rows = await fetchAllRows(supabaseUrl, table, headers);
        tables[table] = rows;
        meta.totalRows += rows.length;
        meta.tableCount += 1;
      } catch (err) {
        tables[table] = { error: (err as Error).message, rows: [] };
        console.warn(`[backup] Skipped ${table}: ${(err as Error).message}`);
      }
    }

    const jsonStr = JSON.stringify(backup);
    const compressed = await gzipData(new TextEncoder().encode(jsonStr));

    const now = new Date();
    const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
    const fileName = `backup-${ts}.json.gz`;

    await uploadToStorage(supabaseUrl, headers, fileName, compressed);

    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const existingFiles = await listBackups(supabaseUrl, headers);
    const toDelete: string[] = [];

    for (const file of existingFiles) {
      if (!file.name || !file.name.startsWith('backup-')) continue;
      const fileDate = parseBackupDate(file.name);
      if (fileDate && fileDate < cutoff) toDelete.push(file.name);
    }

    if (toDelete.length > 0) await deleteFiles(supabaseUrl, headers, toDelete);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return jsonResponse({
      success: true,
      fileName,
      sizeBytes: compressed.length,
      sizeKB: (compressed.length / 1024).toFixed(1),
      tables: meta.tableCount,
      totalRows: meta.totalRows,
      oldBackupsDeleted: toDelete.length,
      durationSeconds: elapsed,
      retentionDays: RETENTION_DAYS,
    });
  } catch (err) {
    console.error('[backup] Fatal error:', err);
    return jsonError('Backup failed', 500, (err as Error).message);
  }
});
