/**
 * Shared Report Aggregation (pure, dependency-free)
 *
 * Single source of truth for turning raw datasets into a report snapshot payload.
 * Imported by BOTH the client report service (offline/dev fallback) and the
 * server handler (lib/ops-handlers/reports.js) so the two paths never diverge.
 *
 * IMPORTANT: keep this module free of imports (no React, no Supabase, no Node
 * APIs). The server bundles it into a serverless function, so it must be pure JS.
 *
 * datasets shape (all arrays, already RLS-scoped / normalized by the caller):
 *   { partners, projects, pushes, agentJobs, goals, kbDocs,
 *     deliverableVersions, dashboards, strategySnapshots }
 */

// ─── Date helpers ────────────────────────────────────────────────────────────

export function isoDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function buildDailyCounts(items, dateField = 'created_at', days = 14) {
  const map = {};
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    map[d.toISOString().slice(0, 10)] = 0;
  }
  (items || []).forEach((item) => {
    const key = isoDate(item[dateField]);
    if (key && key in map) map[key] += 1;
  });
  return Object.entries(map).map(([date, count]) => ({ date, count }));
}

export function buildGitActivity(pushes = []) {
  if (!pushes || pushes.length === 0) return [];
  const byDay = {};
  pushes.forEach((p) => {
    const day = (p.pushed_at || p.created_at || '').slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, count]) => ({ date: day, commits: count }));
}

// ─── Partner / operations core ───────────────────────────────────────────────

export function aggregatePartnerMetrics({ partners }) {
  const list = partners || [];
  let totalRevenue = 0;
  let totalSpend = 0;
  let totalFTD = 0;
  let totalClicks = 0;
  const geoMap = {};
  const partnerMetrics = [];
  const funnelCounts = {};

  list.forEach((p) => {
    const rev = Number(p.revenue || p.totalRevenue || 0);
    const spend = Number(p.spend || p.totalSpend || 0);
    const ftd = Number(p.ftd || p.totalFTD || 0);
    const clicks = Number(p.clicks || p.totalClicks || 0);
    totalRevenue += rev;
    totalSpend += spend;
    totalFTD += ftd;
    totalClicks += clicks;

    const geos = Array.isArray(p.geos) ? p.geos : p.geo ? [p.geo] : [];
    geos.forEach((g) => {
      if (!geoMap[g]) geoMap[g] = { geo: g, revenue: 0, spend: 0, ftd: 0 };
      geoMap[g].revenue += rev / (geos.length || 1);
      geoMap[g].spend += spend / (geos.length || 1);
      geoMap[g].ftd += ftd / (geos.length || 1);
    });

    partnerMetrics.push({
      name: p.name || p.company || 'Unknown',
      revenue: rev,
      spend,
      ftd,
      roi: spend > 0 ? ((rev - spend) / spend) * 100 : 0,
      status: p.funnelStatus || p.status || 'Active',
    });

    const fs = p.funnelStatus || p.status || 'Active';
    funnelCounts[fs] = (funnelCounts[fs] || 0) + 1;
  });

  const profit = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? (profit / totalSpend) * 100 : 0;
  partnerMetrics.sort((a, b) => b.revenue - a.revenue);

  const alerts = [];
  if (roi < 50 && totalSpend > 0) {
    alerts.push({
      severity: 'warning',
      title: 'ROI below target',
      detail: `Current ROI is ${roi.toFixed(1)}%, below the 50% target.`,
    });
  }
  if (list.length === 0) {
    alerts.push({
      severity: 'info',
      title: 'No partners',
      detail: 'No partner data available for this period.',
    });
  }

  return {
    totalRevenue,
    totalSpend,
    totalFTD,
    totalClicks,
    totalPartners: list.length,
    profit,
    roi,
    geoMap,
    partnerMetrics,
    funnelCounts,
    alerts,
  };
}

export function aggregateOperationsMetrics({ partners }) {
  const teamWorkload = {};
  let totalTasks = 0;
  let completedTasks = 0;
  let overdueCount = 0;
  const now = new Date();

  (partners || []).forEach((p) => {
    const tasks = Array.isArray(p.tasks?.items)
      ? p.tasks.items
      : Array.isArray(p.tasks)
        ? p.tasks
        : [];
    tasks.forEach((t) => {
      const assignee = t.assignedTo || 'Unassigned';
      if (!teamWorkload[assignee])
        teamWorkload[assignee] = { assignee, total: 0, done: 0, overdue: 0 };
      teamWorkload[assignee].total++;
      totalTasks++;
      if (t.status === 'done' || t.status === 'completed') {
        teamWorkload[assignee].done++;
        completedTasks++;
      }
      if (
        t.deadline &&
        new Date(t.deadline) < now &&
        t.status !== 'done' &&
        t.status !== 'completed'
      ) {
        teamWorkload[assignee].overdue++;
        overdueCount++;
      }
    });
  });

  return { teamWorkload, totalTasks, completedTasks, overdueCount };
}

// ─── Module KPI builders ─────────────────────────────────────────────────────

export function buildAgentKpis(agentJobs = []) {
  const total = agentJobs.length;
  const today = new Date().toISOString().slice(0, 10);
  const runToday = agentJobs.filter((j) => isoDate(j.created_at) === today).length;
  const completed = agentJobs.filter(
    (j) => j.status === 'completed' || j.status === 'success'
  ).length;
  const failed = agentJobs.filter((j) => j.status === 'failed' || j.status === 'error').length;
  const successRate = total > 0 ? (completed / total) * 100 : 0;
  const durations = agentJobs.map((j) => Number(j.duration_ms) || 0).filter((d) => d > 0);
  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000 : 0;

  const byAgent = {};
  agentJobs.forEach((j) => {
    const name = j.agent_name || j.agent_id || 'Unknown';
    if (!byAgent[name]) byAgent[name] = { name, jobs: 0, succeeded: 0, failed: 0 };
    byAgent[name].jobs += 1;
    if (j.status === 'completed' || j.status === 'success') byAgent[name].succeeded += 1;
    if (j.status === 'failed' || j.status === 'error') byAgent[name].failed += 1;
  });
  const topAgent = Object.values(byAgent).sort((a, b) => b.jobs - a.jobs)[0];

  return {
    runToday,
    total,
    completed,
    failed,
    successRate,
    avgDuration,
    topAgent: topAgent?.name || '-',
    byAgent: Object.values(byAgent),
  };
}

export function buildGoalStages(goals = []) {
  const stages = ['intake', 'planning', 'execution', 'qa', 'complete'];
  const counts = stages.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
  goals.forEach((g) => {
    const stage = (g.stage || g.status || 'intake').toLowerCase();
    const match = stages.find((s) => stage.includes(s)) || 'intake';
    counts[match] += 1;
  });
  return stages.map((s) => ({ stage: s.charAt(0).toUpperCase() + s.slice(1), count: counts[s] }));
}

export function buildModuleDigest(datasets) {
  return [
    { module: 'Agents', value: (datasets.agentJobs || []).length },
    { module: 'Goals', value: (datasets.goals || []).length },
    { module: 'Knowledge', value: (datasets.kbDocs || []).length },
    { module: 'Partners', value: (datasets.partners || []).length },
    { module: 'Quality', value: (datasets.deliverableVersions || []).length },
    { module: 'Dashboards', value: (datasets.dashboards || []).length },
  ];
}

// ─── Module payload builders ─────────────────────────────────────────────────

function buildAgentPayload(datasets) {
  const jobs = datasets.agentJobs || [];
  const stats = buildAgentKpis(jobs);
  const stageCounts = {};
  jobs.forEach((j) => {
    const stage = j.stage || 'unknown';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });
  const stageBreakdown = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));
  const dailyAgentActivity = buildDailyCounts(jobs, 'created_at', 14);

  const lowPerformers = stats.byAgent.filter((a) => a.jobs >= 3 && a.succeeded / a.jobs < 0.7);
  const alerts = lowPerformers.map((a) => ({
    severity: 'warning',
    title: `${a.name} success below 70%`,
    detail: `${a.succeeded}/${a.jobs} jobs completed successfully.`,
  }));
  if (jobs.length === 0) {
    alerts.push({
      severity: 'info',
      title: 'No agent jobs',
      detail: 'No agent activity recorded yet.',
    });
  }

  return {
    kpis: [
      { label: 'Jobs Today', value: stats.runToday, format: 'number' },
      { label: 'Total Jobs', value: stats.total, format: 'number' },
      {
        label: 'Success Rate',
        value: stats.successRate,
        format: 'percent',
        tooltip: 'Completed / total.',
      },
      {
        label: 'Avg Duration',
        value: stats.avgDuration,
        format: 'number',
        tooltip: 'Seconds per job.',
      },
      { label: 'Failed', value: stats.failed, format: 'number' },
      { label: 'Top Agent', value: 0, format: 'number', tooltip: stats.topAgent },
    ],
    agentLeaderboard: stats.byAgent
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 10)
      .map((a) => ({
        name: a.name,
        jobs: a.jobs,
        succeeded: a.succeeded,
        failed: a.failed,
        successRate: a.jobs > 0 ? Number(((a.succeeded / a.jobs) * 100).toFixed(1)) : 0,
      })),
    agentStageBreakdown: stageBreakdown,
    dailyAgentActivity,
    agentAlerts: alerts,
  };
}

function buildGoalPayload(datasets) {
  const goals = datasets.goals || [];
  const isDone = (g) => ['complete', 'completed', 'done'].includes((g.status || '').toLowerCase());
  const inFlight = goals.filter((g) => !isDone(g));
  const completed = goals.filter((g) => isDone(g));
  const blocked = goals.filter(
    (g) => g.blocked_reason || (g.status || '').toLowerCase() === 'blocked'
  );
  const refinements = (datasets.deliverableVersions || []).length;

  const times = completed
    .map((g) => {
      if (!g.created_at || !g.completed_at) return null;
      const start = new Date(g.created_at).getTime();
      const end = new Date(g.completed_at).getTime();
      return Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 3600000 : null;
    })
    .filter((v) => v != null);
  const avgTimeHours = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  const stageFunnel = buildGoalStages(goals);

  const goalRows = goals.slice(0, 15).map((g) => ({
    title: g.title || g.id || 'Untitled',
    stage: g.stage || g.status || 'intake',
    estimate: Number(g.estimate_hours) || 0,
    elapsed: Number(g.elapsed_hours) || 0,
    status: isDone(g) ? 'Completed' : g.blocked_reason ? 'At Risk' : 'Active',
  }));

  const alerts = [];
  if (blocked.length > 0) {
    alerts.push({
      severity: 'warning',
      title: `${blocked.length} goal${blocked.length === 1 ? '' : 's'} blocked`,
      detail: blocked
        .slice(0, 3)
        .map((g) => g.title || g.id)
        .join(', '),
    });
  }
  if (goals.length === 0) {
    alerts.push({
      severity: 'info',
      title: 'No goals tracked',
      detail: 'Goal data is not yet populated.',
    });
  }

  return {
    kpis: [
      { label: 'In Flight', value: inFlight.length, format: 'number' },
      { label: 'Completed', value: completed.length, format: 'number' },
      { label: 'Avg Time (h)', value: avgTimeHours, format: 'number' },
      { label: 'Blocked', value: blocked.length, format: 'number' },
      { label: 'Quality Refinements', value: refinements, format: 'number' },
      { label: 'Total', value: goals.length, format: 'number' },
    ],
    goalStageFunnel: stageFunnel,
    goalLeaderboard: goalRows,
    goalAlerts: alerts,
  };
}

function buildKnowledgePayload(datasets) {
  const docs = datasets.kbDocs || [];
  const bySource = {};
  docs.forEach((d) => {
    const source = d.source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });
  const sourceBreakdown = Object.entries(bySource).map(([source, count]) => ({ source, count }));
  const dailyKbActivity = buildDailyCounts(docs, 'created_at', 28);
  const lastSync = docs
    .map((d) => d.created_at)
    .filter(Boolean)
    .sort()
    .slice(-1)[0];

  return {
    kpis: [
      { label: 'Docs Ingested', value: docs.length, format: 'number' },
      { label: 'Sources', value: sourceBreakdown.length, format: 'number' },
      {
        label: 'Last Sync',
        value: 0,
        format: 'number',
        tooltip: lastSync ? new Date(lastSync).toLocaleString() : 'Never',
      },
      {
        label: 'Active',
        value: docs.filter((d) => (d.status || 'active') === 'active').length,
        format: 'number',
      },
    ],
    kbSourceBreakdown: sourceBreakdown,
    kbTopQueries: docs.slice(0, 10).map((d) => ({
      title: d.title || d.id,
      source: d.source || 'unknown',
      status: d.status || 'active',
    })),
    dailyKbActivity,
    kbAlerts:
      docs.length === 0
        ? [
            {
              severity: 'info',
              title: 'No documents ingested',
              detail: 'Connect a knowledge source to populate this report.',
            },
          ]
        : [],
  };
}

function buildQualityPayload(datasets) {
  const versions = datasets.deliverableVersions || [];
  const byType = {};
  const byDeliverable = {};
  let approved = 0;

  versions.forEach((v) => {
    const type = v.deliverable_type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    const did = v.deliverable_id || 'unknown';
    if (!byDeliverable[did]) byDeliverable[did] = { deliverable: did, versions: 0, approved: 0 };
    byDeliverable[did].versions += 1;
    if (v.approved) {
      byDeliverable[did].approved += 1;
      approved += 1;
    }
  });

  const approvalRate = versions.length > 0 ? (approved / versions.length) * 100 : 0;
  const avgVersions =
    Object.keys(byDeliverable).length > 0 ? versions.length / Object.keys(byDeliverable).length : 0;
  const topType = Object.entries(byType).sort(([, a], [, b]) => b - a)[0]?.[0] || '-';

  return {
    kpis: [
      { label: 'Refinements', value: versions.length, format: 'number' },
      { label: 'Avg Versions', value: avgVersions, format: 'number' },
      { label: 'Approval Rate', value: approvalRate, format: 'percent' },
      { label: 'Top Type', value: 0, format: 'number', tooltip: topType },
    ],
    qualityTypeBreakdown: Object.entries(byType).map(([type, count]) => ({ type, count })),
    qualityTopDeliverables: Object.values(byDeliverable)
      .sort((a, b) => b.versions - a.versions)
      .slice(0, 10),
    dailyQualityActivity: buildDailyCounts(versions, 'created_at', 14),
    qualityAlerts:
      versions.length === 0
        ? [
            {
              severity: 'info',
              title: 'No refinements logged',
              detail: 'Quality-loop activity will populate here once deliverables are refined.',
            },
          ]
        : [],
  };
}

function buildWorkspacePayload(datasets) {
  const digest = buildModuleDigest(datasets);
  const allActivity = [
    ...buildDailyCounts(datasets.agentJobs, 'created_at', 28),
    ...buildDailyCounts(datasets.goals, 'created_at', 28),
    ...buildDailyCounts(datasets.deliverableVersions, 'created_at', 28),
  ];
  const merged = {};
  allActivity.forEach(({ date, count }) => {
    merged[date] = (merged[date] || 0) + count;
  });
  const platformActivity = Object.entries(merged)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const kpis = digest.map((entry) => ({
    label: entry.module,
    value: entry.value,
    format: 'number',
    drillKey: entry.module,
  }));

  const pulseAlerts = [];
  if ((datasets.agentJobs || []).length === 0 && (datasets.goals || []).length === 0) {
    pulseAlerts.push({
      severity: 'info',
      title: 'Workspace is quiet',
      detail: 'No recent platform activity recorded.',
    });
  }

  return { kpis, moduleDigest: digest, platformActivity, pulseAlerts };
}

/**
 * Marketing & acquisition. No campaigns table exists, so channels are derived
 * strictly from partner `trafficSource` plus their revenue/spend/ftd/clicks.
 */
function buildMarketingPayload(datasets) {
  const partners = datasets.partners || [];
  const byChannel = {};
  let totalRevenue = 0;
  let totalSpend = 0;
  let totalFtd = 0;
  let totalClicks = 0;

  const channelOf = (p) => p.trafficSource || p.traffic_source || 'Direct';

  partners.forEach((p) => {
    const channel = channelOf(p);
    const rev = Number(p.revenue || p.totalRevenue || 0);
    const spend = Number(p.spend || p.totalSpend || 0);
    const ftd = Number(p.ftd || p.totalFTD || 0);
    const clicks = Number(p.clicks || p.totalClicks || 0);
    totalRevenue += rev;
    totalSpend += spend;
    totalFtd += ftd;
    totalClicks += clicks;
    if (!byChannel[channel])
      byChannel[channel] = { channel, revenue: 0, spend: 0, ftd: 0, clicks: 0, partners: 0 };
    const c = byChannel[channel];
    c.revenue += rev;
    c.spend += spend;
    c.ftd += ftd;
    c.clicks += clicks;
    c.partners += 1;
  });

  const channelBreakdown = Object.values(byChannel)
    .map((c) => ({
      ...c,
      roi: c.spend > 0 ? Number((((c.revenue - c.spend) / c.spend) * 100).toFixed(1)) : 0,
      cpa: c.ftd > 0 ? Number((c.spend / c.ftd).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;
  const cpa = totalFtd > 0 ? totalSpend / totalFtd : 0;
  const conversion = totalClicks > 0 ? (totalFtd / totalClicks) * 100 : 0;

  const campaignLeaderboard = partners
    .map((p) => {
      const rev = Number(p.revenue || p.totalRevenue || 0);
      const spend = Number(p.spend || p.totalSpend || 0);
      return {
        name: p.name || p.company || 'Unknown',
        channel: channelOf(p),
        revenue: rev,
        spend,
        ftd: Number(p.ftd || p.totalFTD || 0),
        roi: spend > 0 ? Number((((rev - spend) / spend) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  const alerts = [];
  if (partners.length === 0) {
    alerts.push({
      severity: 'info',
      title: 'No marketing data',
      detail: 'No partner / channel data available for this period.',
    });
  } else {
    const losing = channelBreakdown.filter((c) => c.spend > 0 && c.roi < 0);
    if (losing.length > 0) {
      alerts.push({
        severity: 'warning',
        title: `${losing.length} channel${losing.length === 1 ? '' : 's'} unprofitable`,
        detail: losing
          .slice(0, 3)
          .map((c) => `${c.channel} (${c.roi}%)`)
          .join(', '),
      });
    }
  }

  return {
    kpis: [
      { label: 'Revenue', value: totalRevenue, format: 'currency' },
      { label: 'Spend', value: totalSpend, format: 'currency' },
      { label: 'ROI', value: roi, format: 'percent', tooltip: '(Revenue - Spend) / Spend.' },
      { label: 'FTD', value: totalFtd, format: 'number' },
      { label: 'CPA', value: cpa, format: 'currency', tooltip: 'Spend per FTD.' },
      { label: 'Conversion', value: conversion, format: 'percent', tooltip: 'FTD / clicks.' },
    ],
    channelBreakdown,
    // Honest empty until a marketing KPI history is snapshotted nightly.
    acquisitionTrends: [],
    campaignLeaderboard,
    marketingAlerts: alerts,
    alerts,
  };
}

/**
 * Strategy center. Reads the latest persisted strategy_center_snapshots payload
 * (saved by the Strategy Center page) - never fabricates scenarios.
 * Saved payload shape: { summary, currentMetrics, scenarios, roi }.
 */
function buildStrategyPayload(datasets) {
  const snapshots = datasets.strategySnapshots || [];
  // Caller orders newest-first; pick the most recent that actually has a payload.
  const latest = snapshots.find((s) => s && s.payload) || null;
  const payload = latest?.payload || {};
  const m = payload.currentMetrics || {};
  const roiModel = payload.roi || {};
  const summary = payload.summary || {};
  const scenarioSet = Array.isArray(payload.scenarios?.scenarios)
    ? payload.scenarios.scenarios
    : [];

  const profit =
    m.profit != null ? Number(m.profit) : Number(m.totalRevenue || 0) - Number(m.totalSpend || 0);

  const strategyKpis = [
    { label: 'Revenue', value: Number(m.totalRevenue || 0), format: 'currency' },
    { label: 'Profit', value: profit, format: 'currency' },
    { label: 'ROI', value: Number(m.roi || 0), format: 'percent' },
    { label: 'FTD', value: Number(m.totalFtd || 0), format: 'number' },
    {
      label: 'Payback (mo)',
      value: Number(roiModel.paybackMonths || 0),
      format: 'number',
      tooltip: 'Months to recover the implementation cost.',
    },
    { label: '3y NPV', value: Number(roiModel.npv3y || 0), format: 'currency' },
  ];

  const strategyTrends = scenarioSet.map((s) => ({
    scenario: s.name,
    revenue: Number(s.revenue || 0),
    profit: Number(s.profit || 0),
    ftd: Number(s.ftd || 0),
  }));

  const actionKpiRows = scenarioSet.map((s) => ({
    scenario: s.name,
    revenue: Number(s.revenue || 0),
    profit: Number(s.profit || 0),
    ftd: Number(s.ftd || 0),
    assumptions: s.assumptions || '-',
  }));

  const strategyAlerts = [];
  if (!latest) {
    strategyAlerts.push({
      severity: 'info',
      title: 'No strategy snapshot yet',
      detail: 'Open the Strategy Center to generate a snapshot - it will appear here.',
    });
  } else {
    if (summary.bottleneck) {
      strategyAlerts.push({
        severity: 'warning',
        title: `Primary bottleneck: ${summary.bottleneck}`,
        detail: summary.leverageKpi ? `Highest-leverage KPI: ${summary.leverageKpi}.` : '',
      });
    }
    (roiModel.risks || []).slice(0, 4).forEach((risk) => {
      strategyAlerts.push({ severity: 'info', title: 'Risk', detail: String(risk) });
    });
  }

  return {
    kpis: strategyKpis,
    strategyKpis,
    strategyTrends,
    actionKpiRows,
    strategyAlerts,
    alerts: strategyAlerts,
  };
}

const MODULE_BUILDERS = {
  'tpl-agent-performance': buildAgentPayload,
  'tpl-goal-health': buildGoalPayload,
  'tpl-knowledge-base': buildKnowledgePayload,
  'tpl-quality-loop': buildQualityPayload,
  'tpl-workspace-pulse': buildWorkspacePayload,
  'tpl-marketing-acquisition': buildMarketingPayload,
  'tpl-strategy-center': buildStrategyPayload,
};

/** Templates this aggregator can produce real, template-specific output for. */
export const SUPPORTED_REPORT_TYPES = [
  'tpl-finance-growth',
  'tpl-partner-performance',
  'tpl-operations-tasks',
  'tpl-executive-summary',
  ...Object.keys(MODULE_BUILDERS),
];

function baseKpisFor(reportType, partnerMetrics, operationsMetrics, datasets) {
  const sets = {
    'tpl-finance-growth': [
      {
        label: 'Revenue',
        value: partnerMetrics.totalRevenue,
        format: 'currency',
        tooltip: 'Sum of partner revenue.',
      },
      {
        label: 'Spend',
        value: partnerMetrics.totalSpend,
        format: 'currency',
        tooltip: 'Sum of partner spend.',
      },
      { label: 'Profit', value: partnerMetrics.profit, format: 'currency' },
      {
        label: 'ROI',
        value: partnerMetrics.roi,
        format: 'percent',
        tooltip: '(Revenue - Spend) / Spend.',
      },
      { label: 'Total FTD', value: partnerMetrics.totalFTD, format: 'number' },
      { label: 'Partners', value: partnerMetrics.totalPartners, format: 'number' },
    ],
    'tpl-partner-performance': [
      { label: 'Active Partners', value: partnerMetrics.totalPartners, format: 'number' },
      {
        label: 'Avg Revenue',
        value:
          partnerMetrics.totalPartners > 0
            ? partnerMetrics.totalRevenue / partnerMetrics.totalPartners
            : 0,
        format: 'currency',
      },
      { label: 'Avg ROI', value: partnerMetrics.roi, format: 'percent' },
      { label: 'Total FTD', value: partnerMetrics.totalFTD, format: 'number' },
      { label: 'Total Clicks', value: partnerMetrics.totalClicks, format: 'number' },
      {
        label: 'Conversion',
        value:
          partnerMetrics.totalClicks > 0
            ? (partnerMetrics.totalFTD / partnerMetrics.totalClicks) * 100
            : 0,
        format: 'percent',
      },
    ],
    'tpl-operations-tasks': [
      { label: 'Total Tasks', value: operationsMetrics.totalTasks, format: 'number' },
      { label: 'Completed', value: operationsMetrics.completedTasks, format: 'number' },
      { label: 'Overdue', value: operationsMetrics.overdueCount, format: 'number' },
      { label: 'Projects', value: (datasets.projects || []).length, format: 'number' },
      { label: 'Git Pushes', value: (datasets.pushes || []).length, format: 'number' },
      {
        label: 'Assignees',
        value: Object.keys(operationsMetrics.teamWorkload).length,
        format: 'number',
      },
    ],
    'tpl-executive-summary': [
      { label: 'Revenue', value: partnerMetrics.totalRevenue, format: 'currency' },
      { label: 'Profit', value: partnerMetrics.profit, format: 'currency' },
      { label: 'ROI', value: partnerMetrics.roi, format: 'percent' },
      { label: 'Partners', value: partnerMetrics.totalPartners, format: 'number' },
      { label: 'Projects', value: (datasets.projects || []).length, format: 'number' },
      { label: 'Alerts', value: partnerMetrics.alerts.length, format: 'number' },
    ],
  };
  return sets[reportType] || null;
}

/**
 * Build the full report payload for a template. Trend dataKeys (trends,
 * partnerTrends, performanceTrend) start empty here; the server handler injects
 * real historical snapshots before responding.
 */
export function aggregateReport(reportType, datasets) {
  const ds = datasets || {};
  const partnerMetrics = aggregatePartnerMetrics(ds);
  const operationsMetrics = aggregateOperationsMetrics(ds);
  const gitActivity = buildGitActivity(ds.pushes);
  const baseTrends = [];

  const moduleBuilder = MODULE_BUILDERS[reportType];
  const modulePayload = moduleBuilder ? moduleBuilder(ds) : {};

  const baseKpis = baseKpisFor(reportType, partnerMetrics, operationsMetrics, ds);

  const baseResult = {
    // For core templates use their KPI set; module templates supply their own
    // kpis via the merge below, so a missing core set falls back to executive.
    kpis: baseKpis || baseKpisFor('tpl-executive-summary', partnerMetrics, operationsMetrics, ds),
    trends: baseTrends,
    topPartners: partnerMetrics.partnerMetrics.slice(0, 10),
    geoBreakdown: Object.values(partnerMetrics.geoMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    funnelBreakdown: Object.entries(partnerMetrics.funnelCounts).map(([status, count]) => ({
      status,
      count,
    })),
    partnerLeaderboard: partnerMetrics.partnerMetrics.slice(0, 15),
    partnerTrends: baseTrends,
    workloadByAssignee: Object.values(operationsMetrics.teamWorkload).sort(
      (a, b) => b.total - a.total
    ),
    overdueItems: partnerMetrics.partnerMetrics
      .filter((p) => p.status === 'Overdue' || p.status === 'At Risk')
      .slice(0, 10),
    gitActivity,
    performanceTrend: baseTrends,
    topMovers: partnerMetrics.partnerMetrics.slice(0, 5),
    alerts: partnerMetrics.alerts,
  };

  return { ...baseResult, ...modulePayload };
}
