/**
 * Daily retention sweeper for key_imports.
 *
 * Dispatched via Vercel Cron: `/api/app?path=cleanup-imports` (03:00 UTC).
 * Gated by the shared worker/cron/recovery service Bearer boundary. A
 * caller-supplied cron marker is never sufficient authorization.
 *
 * Actions:
 *   1. For rows where expires_at < now() AND deleted_at IS NULL:
 *      delete storage object, set deleted_at.
 *   2. Hard-delete rows where deleted_at < now() - 1 year (GDPR default).
 */
import { createLogger } from '../../api/_lib/logger.js';
import { jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { serviceRequestAuthError } from '../../api/_lib/service-auth.js';
import { deleteImportFile } from '../security/upload-storage.js';

const log = createLogger('cleanup-imports');

export default async function handler(req, res) {
  const authError = serviceRequestAuthError(req);
  if (authError) return jsonError(res, authError.status, authError.message);

  const done = log.startTimer(req, 'request');
  const admin = buildSupabaseAdminClient();
  if (!admin) {
    done({ status: 500 });
    return jsonError(res, 500, 'Admin client unavailable');
  }

  let softDeleted = 0;
  let hardDeleted = 0;
  let storageErrors = 0;

  // Soft-delete expired rows + remove their storage objects.
  const { data: expired, error: expErr } = await admin
    .from('key_imports')
    .select('id, storage_path')
    .lt('expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .limit(500);

  if (expErr) {
    log.warn(req, 'cleanup.select_expired_failed', { err: expErr.message });
  } else {
    for (const row of expired || []) {
      if (row.storage_path) {
        try {
          await deleteImportFile(row.storage_path);
        } catch (err) {
          storageErrors++;
          log.warn(req, 'cleanup.storage_delete_failed', { id: row.id, err: err.message });
        }
      }
      const { error: updErr } = await admin
        .from('key_imports')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id);
      if (!updErr) softDeleted++;
    }
  }

  // Hard-delete rows soft-deleted more than 1 year ago.
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: delErr, count } = await admin
    .from('key_imports')
    .delete({ count: 'exact' })
    .lt('deleted_at', cutoff);
  if (!delErr) hardDeleted = count || 0;

  done({ status: 200, softDeleted, hardDeleted, storageErrors });
  return res.status(200).json({ success: true, softDeleted, hardDeleted, storageErrors });
}
