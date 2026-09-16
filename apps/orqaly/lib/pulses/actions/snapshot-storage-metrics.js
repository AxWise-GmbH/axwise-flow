/**
 * Daily storage snapshot for the Cloud Storage Monitor. For every enabled KB
 * connection, probe real usage and upsert today's row into
 * storage_metric_snapshots (idempotent per day), then fire a "storage almost
 * full" alert when a provider crosses the quota threshold.
 *
 * Registered in actions/index.js; driven by a system pulse (e.g. daily).
 */
import { getConnectionUsage, recordStorageSnapshot } from '../../api-handlers/_shared/kb-usage.js';
import { notifyUser } from '../../notifications/dispatch.js';

const QUOTA_ALERT_PCT = 90;

export async function handleSnapshotStorageMetrics(admin) {
  const { data: conns } = await admin
    .from('kb_connections')
    .select('*')
    .eq('is_current', true)
    .eq('enabled', true);

  let snapped = 0;
  let alerts = 0;
  for (const c of conns || []) {
    const usage = await getConnectionUsage({ admin, userId: c.user_id, conn: c });
    await recordStorageSnapshot({ admin, userId: c.user_id, conn: c, usage });
    snapped += 1;

    if (usage.ok && usage.bytesUsed != null && usage.bytesTotal) {
      const pct = (usage.bytesUsed / usage.bytesTotal) * 100;
      if (pct >= QUOTA_ALERT_PCT) {
        await notifyUser(admin, c.user_id, {
          event_type: 'loop_kpi_alert',
          priority: 'high',
          payload: { kpi_name: `${c.source_type} storage`, detail: `${c.source_type} is ${pct.toFixed(0)}% full` },
        }).catch(() => {});
        alerts += 1;
      }
    }
  }

  return { status: 'done', snapped, alerts };
}
