/**
 * Daily database backup pulse — gzipped pg_dump → Cloudflare R2 (free 10
 * GB tier, zero egress fee, S3-compatible).
 *
 * Env required:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   DATABASE_URL (or SUPABASE_DB_URL)  — for pg_dump
 *
 * Strategy is GFS (Grandfather-Father-Son): keep 7 daily + 4 weekly + 12
 * monthly snapshots, older deleted automatically.
 *
 * Note: pg_dump as a child process isn't viable on Vercel serverless
 * (no executable). This handler is designed to call out to a Supabase
 * Edge Function or a small worker on Cloudflare/Fly that does the dump.
 * The endpoint URL is read from BACKUP_RUNNER_URL. If not set, the pulse
 * logs a skipped status (no crash) so the system stays healthy.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { notifyUser } from '../../notifications/dispatch.js';
import { fetchWithJobLease } from '../../../api/_lib/fetch.js';

const log = createLogger('pulse.backup-database');

export async function handleBackupDatabase(admin, pulse, { req } = {}) {
  const runnerUrl = process.env.BACKUP_RUNNER_URL;
  if (!runnerUrl) {
    log.warn(req, 'backup.no-runner-configured');
    return { status: 'skipped', reason: 'BACKUP_RUNNER_URL not set' };
  }

  try {
    const res = await fetchWithJobLease(runnerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.BACKUP_RUNNER_SECRET || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucket: process.env.R2_BUCKET || 'orchestratori-backups',
        retention: { daily: 7, weekly: 4, monthly: 12 },
        triggered_by_pulse: pulse.id,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      // Backup failure is a high-priority operational event — notify owner.
      if (pulse.user_id) {
        await notifyUser(admin, pulse.user_id, {
          event_type: 'loop_chain_paused', // re-using the high-priority channel; future phase can add a dedicated event
          priority: 'high',
          payload: { reason: 'database_backup_failed', detail: body.slice(0, 400) },
        });
      }
      return { status: 'failed', http: res.status, detail: body.slice(0, 200) };
    }
    return { status: 'done', detail: body.slice(0, 200) };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}
