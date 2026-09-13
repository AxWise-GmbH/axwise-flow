/**
 * Nightly snapshot of per-user report KPIs.
 *
 * Writes one row per (user, kpi_set, day) into report_kpi_snapshots. The
 * Reports page reads these rows to draw real trend lines instead of the
 * Math.random() trends the page used to fabricate.
 *
 * Scheduled via vercel.json (00:15 UTC daily). Authenticated by CRON_SECRET,
 * mirroring scan-library-endpoints.js. Idempotent for the same calendar day
 * (UNIQUE constraint with ON CONFLICT DO UPDATE).
 */
import { applyRateLimitHeaders, checkRateLimit } from '../../api/_lib/rate-limit.js';
import { jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { serviceRequestAuthError } from '../../api/_lib/service-auth.js';

const log = createLogger('snapshot-report-kpis');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeKpisForUser({
  partners,
  projects,
  pushes,
  goals,
  agentJobs,
  kbDocs,
  deliverableVersions,
}) {
  let revenue = 0;
  let spend = 0;
  let ftd = 0;
  let clicks = 0;

  for (const p of partners) {
    const blob = typeof p.data === 'object' && p.data !== null ? p.data : p;
    revenue += num(blob.revenue || blob.totalRevenue);
    spend += num(blob.spend || blob.totalSpend);
    ftd += num(blob.ftd || blob.totalFTD);
    clicks += num(blob.clicks || blob.totalClicks);
  }
  const profit = revenue - spend;
  const roi = spend > 0 ? (profit / spend) * 100 : 0;

  const completedGoals = goals.filter((g) => g.status === 'completed').length;
  const activeGoals = goals.filter((g) => g.status === 'active').length;
  const blockedGoals = goals.filter((g) => (g.status || '').toLowerCase() === 'blocked').length;

  const jobs = agentJobs || [];
  const jobsDone = jobs.filter((j) => j.status === 'completed' || j.status === 'success').length;
  const jobsFailed = jobs.filter((j) => j.status === 'failed' || j.status === 'error').length;
  const successRate = jobs.length ? (jobsDone / jobs.length) * 100 : 0;

  const docs = kbDocs || [];
  const kbSources = new Set(docs.map((d) => d.source || 'unknown')).size;

  const versions = deliverableVersions || [];
  const approved = versions.filter((v) => v.approved).length;
  const approvalRate = versions.length ? (approved / versions.length) * 100 : 0;

  return {
    finance: { revenue, spend, profit, roi, ftd, partners: partners.length },
    partner_perf: {
      partners: partners.length,
      avg_revenue: partners.length ? revenue / partners.length : 0,
      avg_roi: roi,
      ftd,
      clicks,
      conversion: clicks > 0 ? (ftd / clicks) * 100 : 0,
    },
    operations: {
      projects: projects.length,
      goals_active: activeGoals,
      goals_completed: completedGoals,
      git_pushes: pushes.length,
    },
    executive: {
      revenue,
      profit,
      roi,
      partners: partners.length,
      projects: projects.length,
    },
    agent: {
      jobs: jobs.length,
      completed: jobsDone,
      failed: jobsFailed,
      success_rate: successRate,
    },
    goals: {
      active: activeGoals,
      completed: completedGoals,
      blocked: blockedGoals,
      total: goals.length,
    },
    knowledge: { docs: docs.length, sources: kbSources },
    quality: {
      refinements: versions.length,
      approved,
      approval_rate: approvalRate,
    },
    marketing: { revenue, spend, roi, ftd },
    pulse: {
      agents: jobs.length,
      goals: goals.length,
      knowledge: docs.length,
      partners: partners.length,
      quality: versions.length,
    },
  };
}

async function snapshotUser(admin, userId, today) {
  // Pull this user's slice of the source tables. The "user_id IS NULL" rows
  // are legacy/orphaned data and shouldn't be attributed to anyone.
  // Tables that may not exist in every environment resolve to [] rather than
  // failing the whole snapshot for the user.
  const safe = async (p) => {
    try {
      const res = await p;
      return res?.error ? [] : res?.data || [];
    } catch {
      return [];
    }
  };
  const [partners, projects, pushes, goals, agentJobs, kbDocs, deliverableVersions] =
    await Promise.all([
      safe(
        admin.from('partners').select('id, data, revenue, spend, ftd, clicks').eq('user_id', userId)
      ),
      safe(admin.from('projects').select('id, status, data').eq('user_id', userId)),
      safe(admin.from('github_pushes').select('pushed_at, created_at').eq('user_id', userId)),
      safe(admin.from('goals').select('id, status').eq('user_id', userId)),
      safe(admin.from('agent_jobs').select('id, status').eq('user_id', userId)),
      safe(admin.from('knowledge_base_docs').select('id, source').eq('user_id', userId)),
      safe(admin.from('deliverable_versions').select('id, approved').eq('user_id', userId)),
    ]);

  const kpis = computeKpisForUser({
    partners,
    projects,
    pushes,
    goals,
    agentJobs,
    kbDocs,
    deliverableVersions,
  });

  const rows = Object.entries(kpis).map(([kpi_set, values]) => ({
    user_id: userId,
    snapshot_date: today,
    kpi_set,
    values,
  }));

  const { error } = await admin
    .from('report_kpi_snapshots')
    .upsert(rows, { onConflict: 'user_id,snapshot_date,kpi_set' });

  if (error) throw error;
  return rows.length;
}

export default async function handler(req, res) {
  const authError = serviceRequestAuthError(req);
  if (authError) return jsonError(res, authError.status, authError.message);

  const rl = checkRateLimit({ key: 'snapshot-report-kpis:global', limit: 4, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  // Pick "active" users: anyone who has a partner, project, or goal modified
  // in the last 30 days. We don't want to snapshot for accounts that have
  // never used the platform.
  const userIds = new Set();
  try {
    const [pRes, prRes, gRes] = await Promise.all([
      admin
        .from('partners')
        .select('user_id')
        .gte('updated_at', sinceIso)
        .not('user_id', 'is', null)
        .limit(5000),
      admin
        .from('projects')
        .select('user_id')
        .gte('updated_at', sinceIso)
        .not('user_id', 'is', null)
        .limit(5000),
      admin
        .from('goals')
        .select('user_id')
        .gte('updated_at', sinceIso)
        .not('user_id', 'is', null)
        .limit(5000),
    ]);
    for (const r of pRes.data || []) if (r.user_id) userIds.add(r.user_id);
    for (const r of prRes.data || []) if (r.user_id) userIds.add(r.user_id);
    for (const r of gRes.data || []) if (r.user_id) userIds.add(r.user_id);
  } catch (err) {
    log.warn(req, 'active.users.scan_failed', { error: err.message });
  }

  let snapshotted = 0;
  let errored = 0;
  for (const uid of userIds) {
    try {
      const rows = await snapshotUser(admin, uid, today);
      snapshotted += rows;
    } catch (err) {
      errored += 1;
      log.warn(req, 'user.snapshot.failed', { user_id: uid, error: err.message });
    }
  }

  log.info(req, 'snapshot.complete', { users: userIds.size, rows: snapshotted, errored });
  return res.status(200).json({
    ok: true,
    date: today,
    users: userIds.size,
    rows_written: snapshotted,
    errored,
  });
}
