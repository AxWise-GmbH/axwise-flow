/**
 * Single dispatch point for a server-side KB download sync. Resolves a
 * connection's credential (OAuth / BYOK / Mega creds) then runs the matching
 * ingest core. Shared by the kb-connections "sync now" action and the scheduled
 * sync-kb-sources pulse so both behave identically.
 *
 * @returns {Promise<number>} docs written
 * @throws {Error} with `.status` (400 = import-only / no credential, etc.)
 */
import { resolveConnectionAuth } from './kb-connection-auth.js';
import { syncNotionToKb } from './notion-ingest.js';
import { syncDropboxToKb } from './dropbox-ingest.js';
import { syncOneDriveToKb } from './onedrive-ingest.js';
import { syncGoogleDriveToKb } from './google-drive-ingest.js';
import { syncMegaToKb } from './mega-ingest.js';

// Sources whose "sync" is a client-side file import, never a server pull.
export const IMPORT_ONLY = new Set(['obsidian']);
// Sources that can be pulled server-side (given a credential).
export const SERVER_SYNC_SOURCES = new Set(['notion', 'dropbox', 'onedrive', 'google-drive', 'mega']);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function runConnectionSync({ admin, userId, conn }) {
  const source = conn.source_type;
  if (IMPORT_ONLY.has(source)) throw fail(400, `${source} syncs by importing files.`);

  const auth = await resolveConnectionAuth({ admin, userId, conn });
  if (auth.method === 'none') throw fail(400, `${source} is set to file import - use the Import button.`);

  const connectionId = conn.id;
  const scope = conn.scope && typeof conn.scope === 'object' ? conn.scope : {};

  if (source === 'notion') return (await syncNotionToKb({ admin, userId, apiKey: auth.token, connectionId })).count;
  if (source === 'dropbox') return (await syncDropboxToKb({ admin, userId, token: auth.token, connectionId, scope })).count;
  if (source === 'onedrive') return (await syncOneDriveToKb({ admin, userId, token: auth.token, connectionId, scope })).count;
  if (source === 'google-drive') return (await syncGoogleDriveToKb({ admin, userId, token: auth.token, connectionId, scope })).count;
  if (source === 'mega') return (await syncMegaToKb({ admin, userId, creds: auth.creds, connectionId })).count;
  throw fail(400, `Unsupported source: ${source}`);
}
