/**
 * [module: agent-core + connection-hub]
 * Pulse action: scheduled-report
 *
 * Fired by lib/pulses/tick.js on a cron schedule. Generates a chat-friendly
 * report summary and delivers it to one or more communication_channels via
 * the Phase 3 notifyUser helper.
 *
 * Pulse row shape:
 *   user_id      = goal owner (also the channel owner)
 *   trigger_type = 'time'
 *   cron_expr    = '0 8 * * *'                          // daily at 08:00 UTC
 *   action       = 'scheduled-report'
 *   metadata     = {
 *     report_type:  'executive' | 'finance' | 'partner_perf' | 'operations',
 *     channel_ids:  [<uuid>, ...]   // optional — defaults to all active Telegram channels for user
 *     label:        'Morning briefing'   // optional cosmetic title
 *   }
 *
 * Manual test (after Phase 1 is live):
 *   insert into agent_pulses (user_id, agent_role, trigger_type, cron_expr, action, metadata)
 *   values (
 *     '<your-user-uuid>', 'reporting', 'time', '0 8 * * *', 'scheduled-report',
 *     '{"report_type":"executive","label":"Morning briefing"}'
 *   );
 *   -- then force-fire:
 *   update agent_pulses set next_due_at = now() where action = 'scheduled-report';
 *   -- pulse-tick will pick it up on next minute.
 */
import { notifyUser } from '../../utils/notify-user.js';

export async function handleScheduledReport(admin, pulse, { req } = {}) {
  const meta = pulse?.metadata || {};
  const userId = pulse?.user_id;
  if (!userId) return { status: 'failed', error: 'missing user_id' };

  const reportType = String(meta.report_type || 'executive');
  const label = meta.label || `${humanLabel(reportType)} — ${new Date().toISOString().slice(0, 10)}`;

  // 1. Pull the same data + aggregation the assistant-bridge uses for chat
  //    summaries. Reuses the helpers added in Phase 2 (assistant-bridge).
  const { loadFreshReportDataForPulse, aggregateForPulse } = await loadHelpers();
  const data = await loadFreshReportDataForPulse(admin, userId);
  const summary = aggregateForPulse(reportType, data);

  // 2. Pick destination channel(s).
  let channelIds = Array.isArray(meta.channel_ids) ? meta.channel_ids.filter(Boolean) : [];
  if (channelIds.length === 0) {
    // No explicit channels → default to all the user's active Telegram channels.
    const { data: chans } = await admin
      .from('communication_channels')
      .select('id')
      .eq('connected_by', userId)
      .eq('platform', 'telegram')
      .eq('status', 'active');
    channelIds = (chans || []).map((c) => c.id);
  }

  if (channelIds.length === 0) {
    return { status: 'skipped', reason: 'no active telegram channels for user' };
  }

  // 3. Deliver via notifyUser. notifyUser already iterates over the user's
  //    active channels — passing a specific subset is currently not supported
  //    by that helper, so we send once per user. If multiple channel_ids were
  //    requested we still rely on notifyUser to fan out to each.
  const appUrl = process.env.PUBLIC_APP_URL || 'https://orchestratori.vercel.app';
  const deepLink = `${appUrl}/reports?type=${encodeURIComponent(uiTemplateForKpiSet(reportType))}`;

  const result = await notifyUser(admin, userId, 'daily.digest', {
    title: `📊 ${label}`,
    body: summary.text,
    deepLink,
    buttons: [
      { text: 'Open in app', url: deepLink },
      { text: 'Snooze 1h',   callback_data: 'digest:snooze:1h' },
      { text: 'Dismiss',     callback_data: 'digest:dismiss' },
    ],
  });

  return {
    status: 'done',
    report_type: reportType,
    sent: result.sent || 0,
    failed: result.failed || 0,
    skipped: result.skipped || false,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function humanLabel(kpiSet) {
  return ({
    finance: 'Finance & growth',
    partner_perf: 'Partner performance',
    operations: 'Operations & tasks',
    executive: 'Executive summary',
  })[kpiSet] || kpiSet;
}

function uiTemplateForKpiSet(kpi) {
  return ({
    finance: 'tpl-finance-growth',
    partner_perf: 'tpl-partner-performance',
    operations: 'tpl-operations-tasks',
    executive: 'tpl-executive-summary',
  })[kpi] || 'tpl-executive-summary';
}

// Reuses the aggregation already in assistant-bridge so chat summaries and
// scheduled reports look identical (single source of truth).
// We do a lightweight redefinition here to keep import surface minimal; if
// the bridge ones drift we want this file to flag it via test, not break.
async function loadHelpers() {
  // The bridge keeps these as internal (non-exported) functions. We replicate
  // the small data-loader + aggregator inline. Kept in sync intentionally
  // (~50 lines) rather than refactoring the bridge to export, because pulse
  // actions are server-only and the bridge is a hot path that imports a lot.
  return {
    loadFreshReportDataForPulse: async (admin, userId) => {
      const [partnersR, projectsR, goalsR, tasksR] = await Promise.all([
        admin.from('partners').select('id, name, team, revenue, spend, ftd, clicks, status, funnelStatus, geos, geo').eq('user_id', userId).limit(500),
        admin.from('projects').select('id, name, status, created_at').eq('user_id', userId).limit(500),
        admin.from('goals').select('id, title, status, budget_usd, created_at, updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
        admin.from('team_tasks').select('id, status, priority, created_at').eq('user_id', userId).limit(500),
      ]);
      return {
        partners: partnersR.data || [], projects: projectsR.data || [],
        goals: goalsR.data || [], tasks: tasksR.data || [],
      };
    },
    aggregateForPulse: (kpiSet, data) => {
      const { partners, projects, goals, tasks } = data;
      const sum = (arr, fn) => (arr || []).reduce((a, x) => a + (fn(x) || 0), 0);
      const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
      const bucket = (arr, fn) => {
        const m = {};
        for (const x of arr || []) { const k = fn(x); m[k] = (m[k] || 0) + 1; }
        return m;
      };

      const totalRevenue = sum(partners, (p) => Number(p.revenue || 0));
      const totalSpend   = sum(partners, (p) => Number(p.spend   || 0));
      const totalFtd     = sum(partners, (p) => Number(p.ftd     || 0));
      const totalClicks  = sum(partners, (p) => Number(p.clicks  || 0));
      const profit       = totalRevenue - totalSpend;
      const roi          = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;
      const activeProjects = projects.filter((p) => /active/i.test(p.status || '')).length;
      const goalsByStatus = bucket(goals, (g) => g.status || 'unknown');
      const tasksByStatus = bucket(tasks, (t) => t.status || 'unknown');
      const topPartners = [...partners]
        .map((p) => ({ name: p.name || 'Unknown', revenue: Number(p.revenue || 0), spend: Number(p.spend || 0) }))
        .filter((p) => p.revenue > 0 || p.spend > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      const lines = [];
      if (kpiSet === 'finance' || kpiSet === 'executive') {
        lines.push(`Revenue: $${fmt(totalRevenue)}   Spend: $${fmt(totalSpend)}   Profit: $${fmt(profit)}`);
        lines.push(`ROI: ${roi.toFixed(1)}%   FTDs: ${totalFtd}   Clicks: ${totalClicks}`);
      }
      if (kpiSet === 'partner_perf' || kpiSet === 'executive') {
        lines.push('');
        lines.push('Top partners by revenue:');
        if (!topPartners.length) lines.push('  (no partner revenue data yet)');
        else for (const p of topPartners) lines.push(`  • ${p.name} — $${fmt(p.revenue)} rev`);
      }
      if (kpiSet === 'operations' || kpiSet === 'executive') {
        lines.push('');
        lines.push(`Active projects: ${activeProjects}   Goals: ${goals.length}   Tasks: ${tasks.length}`);
        const gs = Object.entries(goalsByStatus).map(([k, v]) => `${k}: ${v}`).join(' · ');
        const ts = Object.entries(tasksByStatus).map(([k, v]) => `${k}: ${v}`).join(' · ');
        if (gs) lines.push(`Goals → ${gs}`);
        if (ts) lines.push(`Tasks → ${ts}`);
      }
      return { text: lines.join('\n') };
    },
  };
}
