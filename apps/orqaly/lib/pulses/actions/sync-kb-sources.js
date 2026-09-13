/**
 * Scheduled re-sync of "download" KB connections that opted into an interval.
 * Works for every server-syncable source (Notion / Dropbox / OneDrive / Google
 * Drive / Mega) by delegating to the shared runConnectionSync dispatcher, which
 * resolves the connection's credential (OAuth / BYOK) and runs its ingest core.
 * Import-only or credential-less connections are skipped (not failed).
 *
 * Registered in actions/index.js; driven by a system pulse row (e.g. daily).
 */
import { runConnectionSync } from '../../api-handlers/_shared/kb-sync-dispatch.js';

function isDue(conn) {
  if (!conn.sync_interval_secs) return false;
  if (!conn.last_synced_at) return true;
  return Date.now() - new Date(conn.last_synced_at).getTime() >= conn.sync_interval_secs * 1000;
}

export async function handleSyncKbSources(admin) {
  const { data: conns } = await admin
    .from('kb_connections')
    .select('*')
    .eq('is_current', true)
    .eq('enabled', true)
    .eq('mode', 'sync');

  const due = (conns || []).filter(isDue);
  let ran = 0;
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const c of due) {
    try {
      const count = await runConnectionSync({ admin, userId: c.user_id, conn: c });
      await admin
        .from('kb_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_ok: true,
          last_sync_error: null,
          docs_synced_count: count,
        })
        .eq('id', c.id);
      ran += 1;
      synced += count;
    } catch (err) {
      // 4xx = import-only / missing credential: a config state, not a failed pull.
      if ((err?.status || 500) < 500) {
        skipped += 1;
        continue;
      }
      failed += 1;
      await admin
        .from('kb_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_ok: false,
          last_sync_error: String(err?.message || err).slice(0, 500),
        })
        .eq('id', c.id);
    }
  }

  return { status: 'done', due: due.length, ran, synced, failed, skipped };
}
