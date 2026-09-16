/**
 * Scheduled dashboard email export.
 *
 * The pulse handler scans dashboard_schedules for rows where next_due_at has
 * passed and processes each: resolves data via the dashboard-query catalog,
 * renders an HTML email, and sends via the existing Resend pipeline.
 *
 * Trigger model:
 *   - pg_cron ticks every minute → calls /api/ops?path=pulse-tick
 *   - That tick reads agent_pulses, but ALSO drives this handler if the
 *     `enabled` schedules are due.
 *
 * To plug into the existing pulse infra, this exports a generic handler
 * compatible with lib/pulses/actions/index.js. It is registered with the
 * action name "export-dashboard". Until a corresponding agent_pulses row
 * is created (with action="export-dashboard"), the handler is still
 * callable directly by the pulse-tick if it polls dashboard_schedules.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { renderDashboardHtml } from '../../api-handlers/dashboard-html-render.js';
import {
  CATALOG,
  validateAgainstCatalog,
  dimensionField,
} from '../../../src/services/metricCatalog.js';
import { fetchWithJobLease } from '../../../api/_lib/fetch.js';

const log = createLogger('pulse.export-dashboard');

// Inline copy of the simplified resolveBlock from dashboard-query.js so the
// pulse runs server-side without HTTP overhead.
const OWNER_COLUMN = {
  goals: 'user_id',
  businesses: 'user_id',
  agent_jobs: 'user_id',
  financial_events: 'user_id',
  leads: 'user_id',
  deliverables: 'user_id',
  partners: 'user_id',
  concilium_agent_reports: 'user_id',
};

function pickPrimaryTimestamp(dataset) {
  const def = CATALOG[dataset];
  if (!def) return 'created_at';
  const tsDim = def.dimensions.find((d) => /(_at|date)$/i.test(dimensionField(d)));
  return tsDim ? dimensionField(tsDim) : 'created_at';
}

function bucketStart(date, bucket) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  if (bucket === 'day')
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toISOString().slice(0, 10);
  if (bucket === 'week') {
    const dow = (d.getUTCDay() + 6) % 7;
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
      .toISOString()
      .slice(0, 10);
  }
  if (bucket === 'month')
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return d.toISOString().slice(0, 10);
}

function aggregate(rows, measure) {
  if (!rows.length) return 0;
  if (!measure || measure.agg === 'count') return rows.length;
  const values = rows.map((r) => Number(r[measure.field])).filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  switch (measure.agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'p95': {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
    }
    default:
      return values.length;
  }
}

async function resolveBlock(admin, userId, block) {
  if (!block.data?.dataset || !CATALOG[block.data.dataset]) {
    return { error: 'unknown dataset' };
  }
  const v = validateAgainstCatalog({
    dataset: block.data.dataset,
    measure: block.data.measure,
    group_by: block.data.group_by,
    filters: block.filters,
  });
  if (!v.ok) return { error: v.error };

  const cols = new Set(['id']);
  if (block.data?.measure?.field) cols.add(block.data.measure.field);
  if (block.data?.group_by?.field) cols.add(block.data.group_by.field);
  const ts = pickPrimaryTimestamp(block.data.dataset);
  if (ts) cols.add(ts);

  const ownerCol = OWNER_COLUMN[block.data.dataset] || 'user_id';
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data, error } = await admin
    .from(block.data.dataset)
    .select([...cols].join(', '))
    .eq(ownerCol, userId)
    .gte(ts, since)
    .limit(5000);
  if (error) return { error: error.message };
  const rows = data || [];

  // group + aggregate
  const buckets = new Map();
  if (block.data?.group_by?.field) {
    for (const r of rows) {
      let key = r[block.data.group_by.field];
      if (block.data.group_by.time_bucket && key) {
        key = bucketStart(key, block.data.group_by.time_bucket);
      }
      if (key == null) key = 'unknown';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    }
  } else {
    buckets.set(null, rows);
  }
  const groupedRows = [...buckets.entries()].map(([group, items]) => ({
    group,
    value: aggregate(items, block.data?.measure),
    count: items.length,
  }));
  if (block.data?.group_by?.time_bucket) {
    groupedRows.sort((a, b) => String(a.group).localeCompare(String(b.group)));
  } else if (block.data?.group_by) {
    groupedRows.sort((a, b) => Number(b.value) - Number(a.value));
  }
  return {
    rows: groupedRows,
    total: aggregate(rows, block.data?.measure),
    sample_count: rows.length,
  };
}

// Very loose cron "next due" — uses a 1-minute-tick scheduler, so we just
// add ~1 minute to last_run_at for daily-or-finer cadence and round up to
// the cron's smallest period for coarser.
function nextDueFromCron(cron) {
  // Simplified: returns now+1d for daily, now+1h for hourly, now+5m otherwise.
  if (/^0 \d+ \* \* \*/.test(cron)) return new Date(Date.now() + 86400_000).toISOString(); // daily
  if (/^0 \* \* \* \*/.test(cron)) return new Date(Date.now() + 3600_000).toISOString(); // hourly
  return new Date(Date.now() + 300_000).toISOString(); // 5 min default
}

async function sendEmailViaResend(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.warn(null, 'export-dashboard.no-resend-key');
    return { skipped: true, reason: 'RESEND_API_KEY not configured' };
  }
  const from = process.env.RESEND_FROM_EMAIL || 'Orqaly <noreply@orchestratori.com>';
  const res = await fetchWithJobLease('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `resend ${res.status}`);
  return { id: data?.id, sent_to: to.length };
}

/**
 * The pulse-tick wrapper. Iterates dashboard_schedules with next_due_at <= now.
 * `pulse` argument is unused — the function self-scans.
 */
export async function handleExportDashboard(admin, _pulse, { req } = {}) {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from('dashboard_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_due_at', nowIso)
    .limit(20);
  if (error) return { status: 'failed', reason: error.message };
  if (!due?.length) return { status: 'ok', processed: 0 };

  const results = [];
  for (const sched of due) {
    try {
      // Fetch dashboard
      const { data: dashboard } = await admin
        .from('saved_dashboards')
        .select('*')
        .eq('id', sched.dashboard_id)
        .maybeSingle();
      if (!dashboard) {
        results.push({ id: sched.id, status: 'failed', reason: 'dashboard not found' });
        continue;
      }

      // Resolve every block
      const blocks = dashboard.config?.blocks || [];
      const resultsById = {};
      for (const b of blocks) {
        if (b.type === 'markdown') {
          resultsById[b.id] = { rows: [], total: 0, sample_count: 0 };
          continue;
        }
        try {
          resultsById[b.id] = await resolveBlock(admin, sched.owner_user_id, b);
        } catch (err) {
          resultsById[b.id] = { error: err?.message || 'resolve failed' };
        }
      }

      const viewerUrl = `${process.env.APP_BASE_URL || 'https://orchestratori.com'}/dashboards/${dashboard.id}`;
      const html = renderDashboardHtml({ dashboard, resultsById, viewerUrl });
      const sendResult = await sendEmailViaResend(
        sched.recipients,
        `📊 ${dashboard.title} — scheduled snapshot`,
        html
      );

      const nextDue = nextDueFromCron(sched.cron_expr);
      await admin
        .from('dashboard_schedules')
        .update({ last_run_at: nowIso, next_due_at: nextDue })
        .eq('id', sched.id);

      results.push({ id: sched.id, status: 'sent', email: sendResult });
    } catch (err) {
      log.warn(req, 'export-dashboard.failed', { id: sched.id, error: err?.message });
      results.push({ id: sched.id, status: 'failed', reason: err?.message });
    }
  }
  return { status: 'ok', processed: results.length, results };
}
