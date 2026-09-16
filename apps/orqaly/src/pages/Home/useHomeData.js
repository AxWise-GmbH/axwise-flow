/**
 * useHomeData - single data source for the Home dashboard.
 *
 * Composes the real analytics hooks/services into the per-section shapes the
 * Home page renders, polls them on an interval (paused while the tab is hidden),
 * and fully bypasses the network when `demo` is on (returning a deterministic
 * curated dataset instead). Mirrors the clear-before-start + visibilitychange
 * polling pattern used by useReport.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLlmUsage } from '../../hooks/useLlmUsage';
import { listGoals, getLoops } from '../../services/goalService';
import { loadTeamTasks } from '../../services/teamTaskBackend';
import { getMyAgents } from '../../services/myAgentsService';
import { getActivityFeed, getRecentAgentMessages } from '../../services/communicatorService';
import {
  loadKnowledgeOperations,
  loadActivityOperations,
  loadAgentOperations,
} from '../../services/auditLogBackend';
import { loadConcilium } from '../../services/conciliumBackend';
import { loadMemberCountsByBoard } from '../../services/conciliumMembersBackend';
import { getPerBoardSummary } from '../../services/conciliumAnalyticsService';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/formatters';
import { buildDemoData } from './demoData';

const POLL_MS = 60_000; // live data refreshes once a minute
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DONE_TASK_STATUSES = new Set(['completed', 'evaluated', 'done', 'cancelled']);

/** YYYY-MM-DD relative to today (negative = past). */
function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-06-26" -> "Jun 26" (locale-independent). */
function shortDate(s) {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function relTime(iso) {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '-';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n)}...` : str;
}

/**
 * ISO -> "dd.mm\nhh:mm:ss" (locale-independent). The newline stacks the time under
 * the date (rendered with whiteSpace: pre-line). Shared by the Goals, Activity and
 * Data Operations tables.
 */
function stackedDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}\n${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Bucket a goal_messages channel into one of the source labels. */
function chatCategory(channel) {
  switch (String(channel || '').toLowerCase()) {
    case 'lead-consilium':
      return 'Consilium';
    case 'system':
      return 'System';
    case 'agent-lead':
      return 'Goal';
    default:
      return 'Team Lead'; // team-room
  }
}

/** Deep-link to review an agent message on the Communicator page (goal room). */
function chatReviewHref(m) {
  return m?.goal_id
    ? `/communicator?view=workspace&section=rooms&goal=${encodeURIComponent(m.goal_id)}`
    : '/communicator?view=workspace&section=rooms';
}

function sum(arr, pick) {
  return arr.reduce((s, x) => s + (Number(pick(x)) || 0), 0);
}

/** Percent change from first to last sample, or null when not derivable. */
function deltaFromSeries(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const first = Number(arr[0]);
  const last = Number(arr[arr.length - 1]);
  if (!first) return null;
  return Math.round(((last - first) / Math.abs(first)) * 1000) / 10;
}

// The 4-stage goal lifecycle shown in the goal-detail stepper
// (see GoalDetailDialog STEPS): Pipeline -> Work Log -> Report -> Result.
const GOAL_LIFECYCLE_STEPS = ['Pipeline', 'Work Log', 'Report', 'Result'];
// Raw goal status -> 1-based stage in that lifecycle.
const GOAL_LIFECYCLE_INDEX = {
  // 1 · Pipeline (pre-execution: feasibility -> approval)
  feasibility: 1,
  analyzing: 1,
  researching_customer: 1,
  awaiting_context_approval: 1,
  planning: 1,
  forming_team: 1,
  provisioning_tools: 1,
  estimating: 1,
  awaiting_tools: 1,
  awaiting_approval: 1,
  // 2 · Work Log (executing, or awaiting human mid-run)
  authorizing_execution: 2,
  active: 2,
  executing: 2,
  running: 2,
  paused: 2,
  needs_human: 2,
  // 3 · Report (post-execution review / terminal-but-not-delivered)
  pending_validation: 3,
  evaluating: 3,
  reviewing: 3,
  reporting: 3,
  failed: 3,
  cancelled: 3,
  // 4 · Result (delivered)
  completed: 4,
};

/**
 * The goal's phase for the "Goals in Action" table — the real workflow phase
 * progress (completed / total plan phases), matching the History view. Returns
 * the indicator shape `{ current, total, active, title }` that RankedTable renders
 * as a segmented "N/M" line. Falls back to the 4-stage lifecycle when the goal
 * has no plan yet.
 */
function goalPhase(goal) {
  const phases = goal?.plan?.phases || [];
  const total = phases.length;
  if (total > 0) {
    const completed = phases.filter(
      (p) => String(p?.status || '').toLowerCase() === 'completed'
    ).length;
    const s = String(goal?.status || '').toLowerCase();
    const terminal = s === 'completed' || s === 'cancelled' || s === 'failed';
    return {
      current: completed,
      total,
      active: !terminal && completed < total,
      title: `${completed}/${total}`,
    };
  }
  const idx = GOAL_LIFECYCLE_INDEX[String(goal?.status || '').toLowerCase()] || 1;
  return {
    current: idx,
    total: GOAL_LIFECYCLE_STEPS.length,
    active: idx < GOAL_LIFECYCLE_STEPS.length,
    title: GOAL_LIFECYCLE_STEPS[idx - 1],
  };
}

// Human-readable status labels + chip colors, mirroring the History view so the
// two tabs read identically.
const GOAL_STATUS_LABEL = {
  feasibility: 'Analyzing feasibility',
  analyzing: 'Understanding the problem',
  researching_customer: 'AxWise is proposing scope and capabilities',
  awaiting_context_approval: 'Confirm proposed scope',
  planning: 'Planning the work',
  forming_team: 'Forming team',
  provisioning_tools: 'Setting up tools',
  estimating: 'Estimating',
  awaiting_approval: 'Awaiting your approval',
  authorizing_execution: 'Binding approved execution',
  awaiting_tools: 'Missing tools / API keys',
  awaiting_po_input: 'Needs your input',
  active: 'Executing',
  pending_validation: 'Checking final quality',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  needs_human: 'Needs human attention',
  cancelled: 'Cancelled',
};
function goalStatusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'failed' || s === 'cancelled') return 'error';
  if (s === 'needs_human') return 'warning';
  return 'primary';
}
/** Status cell for the goals table: { label, color } so RankedTable colors the chip. */
function goalStatusCell(status) {
  const s = String(status || '').toLowerCase();
  return {
    label: GOAL_STATUS_LABEL[s] || (s ? s[0].toUpperCase() + s.slice(1) : 'Unknown'),
    color: goalStatusTone(s),
  };
}

function availabilityLabel(av) {
  const s = String(av || '').toLowerCase();
  if (s === 'available' || s === 'busy') return 'Active';
  if (s === 'offline') return 'Offline';
  return 'Idle';
}

/** Count activity events into 12 hourly buckets (oldest first) for the spark. */
function activitySpark(events) {
  const now = Date.now();
  const buckets = new Array(12).fill(0);
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const hoursAgo = Math.floor((now - t) / 3_600_000);
    if (hoursAgo >= 0 && hoursAgo < 12) buckets[11 - hoursAgo] += 1;
  }
  return buckets;
}

export function useHomeData({
  demo = false,
  windowDays = 7,
  from = null,
  to = null,
  orgSeed = 0,
} = {}) {
  // An explicit from/to range (both set) overrides the 7/30/90 preset.
  const range = useMemo(
    () => (from && to ? { from, to } : { from: isoDay(-windowDays), to: isoDay(0) }),
    [windowDays, from, to]
  );

  const llm = useLlmUsage('all', { from: range.from, to: range.to, enabled: !demo });
  const { user } = useAuth();
  const userEmail = user?.email || '';

  const [rawGoals, setRawGoals] = useState([]);
  const [rawLoops, setRawLoops] = useState([]);
  const [rawTasks, setRawTasks] = useState([]);
  const [rawAgents, setRawAgents] = useState([]);
  const [rawActivity, setRawActivity] = useState([]);
  const [rawKbOps, setRawKbOps] = useState([]);
  const [rawActivityOps, setRawActivityOps] = useState([]);
  const [rawAgentOps, setRawAgentOps] = useState([]);
  const [rawAgentMsgs, setRawAgentMsgs] = useState([]);
  const [rawBoards, setRawBoards] = useState([]);
  const [rawMemberCounts, setRawMemberCounts] = useState({});
  const [rawBoardStats, setRawBoardStats] = useState({});
  const [ownLoading, setOwnLoading] = useState(!demo);
  const [ownError, setOwnError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchOwn = useCallback(async () => {
    setOwnLoading(true);
    const [g, lp, t, a, act, kb, ops, agentOps, boards, memberCounts, boardStats, msgs] =
      await Promise.allSettled([
        listGoals(),
        getLoops(),
        loadTeamTasks(),
        getMyAgents(),
        getActivityFeed({ limit: 40 }),
        loadKnowledgeOperations({ limit: 50 }),
        loadActivityOperations({ limit: 50 }),
        loadAgentOperations({ limit: 50 }),
        loadConcilium(),
        loadMemberCountsByBoard(),
        getPerBoardSummary(),
        getRecentAgentMessages(50),
      ]);
    if (g.status === 'fulfilled') {
      const v = g.value;
      setRawGoals(Array.isArray(v) ? v : v?.goals || v?.items || []);
    }
    if (lp.status === 'fulfilled') setRawLoops(Array.isArray(lp.value) ? lp.value : []);
    if (t.status === 'fulfilled') setRawTasks(Array.isArray(t.value) ? t.value : []);
    if (a.status === 'fulfilled') setRawAgents(Array.isArray(a.value) ? a.value : []);
    if (act.status === 'fulfilled') setRawActivity(Array.isArray(act.value) ? act.value : []);
    if (kb.status === 'fulfilled') setRawKbOps(Array.isArray(kb.value) ? kb.value : []);
    if (ops.status === 'fulfilled') setRawActivityOps(Array.isArray(ops.value) ? ops.value : []);
    if (agentOps.status === 'fulfilled')
      setRawAgentOps(Array.isArray(agentOps.value) ? agentOps.value : []);
    if (msgs.status === 'fulfilled') setRawAgentMsgs(Array.isArray(msgs.value) ? msgs.value : []);
    if (boards.status === 'fulfilled')
      setRawBoards(Array.isArray(boards.value) ? boards.value : []);
    if (memberCounts.status === 'fulfilled') setRawMemberCounts(memberCounts.value || {});
    if (boardStats.status === 'fulfilled') setRawBoardStats(boardStats.value || {});
    const anyFailed = [
      g,
      lp,
      t,
      a,
      act,
      kb,
      ops,
      agentOps,
      boards,
      memberCounts,
      boardStats,
      msgs,
    ].some((r) => r.status === 'rejected');
    setOwnError(anyFailed ? new Error('Some Home data sources failed to load') : null);
    setOwnLoading(false);
    setLastUpdated(Date.now());
  }, []);

  // llm.refresh changes identity each render; keep the latest in a ref (updated
  // after render) so the poll effect does not need it as a dependency.
  const llmRefreshRef = useRef(llm.refresh);
  useEffect(() => {
    llmRefreshRef.current = llm.refresh;
  });

  useEffect(() => {
    if (demo) return undefined;
    let intervalId = null;
    const clear = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const tick = () => {
      fetchOwn();
      llmRefreshRef.current?.();
    };
    const start = () => {
      clear();
      if (typeof document !== 'undefined' && document.hidden) return;
      intervalId = setInterval(tick, POLL_MS);
    };
    fetchOwn(); // initial own fetch; llm fetches via its own effect
    start();
    const onVis = () => start();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => {
      clear();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [demo, windowDays, fetchOwn]);

  const demoSnapshot = useMemo(() => buildDemoData(windowDays, orgSeed), [windowDays, orgSeed]);

  const live = useMemo(() => {
    // Window the time-based blocks by the selected range (7/30/90 preset or an
    // explicit From-To). Items outside the range are filtered out; the
    // fixed-height blocks scroll when many remain.
    const fromMs = new Date(`${range.from}T00:00:00`).getTime();
    const toMs = new Date(`${range.to}T23:59:59`).getTime();
    const inWindow = (ts) => {
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return !Number.isNaN(t) && t >= fromMs && t <= toMs;
    };

    const totals = llm.data?.totals || {};
    const timeseries = llm.data?.timeseries || [];
    const byModel = llm.data?.byModel || [];
    const byProvider = llm.data?.byProvider || [];
    const callsSeries = timeseries.map((p) => Number(p.calls) || 0);
    const costSeries = timeseries.map((p) => Number(p.cost) || 0);
    const latencySeries = timeseries.map((p) => (Number(p.avgDurationMs) || 0) / 1000);
    const scoreSeries = timeseries.map((p) => Number(p.avgScore) || 0);
    const costPerMSeries = timeseries.map((p) => {
      const tk = Number(p.tokens) || 0;
      return tk ? (Number(p.cost) || 0) / (tk / 1_000_000) : 0;
    });
    const avgTpcSeries = timeseries.map((p) => {
      const c = Number(p.calls) || 0;
      return c ? (Number(p.tokens) || 0) / c : 0;
    });

    const activeAgents = rawAgents.filter(
      (a) => availabilityLabel(a.availability) !== 'Offline'
    ).length;
    const runningAgents = rawAgents.reduce((s, a) => s + (Number(a.jobsActive) || 0), 0);
    const openTasks = rawTasks.filter(
      (t) => !DONE_TASK_STATUSES.has(String(t.status || '').toLowerCase())
    ).length;
    const costSave = Math.max(
      0,
      sum(rawGoals, (g) => g.budget_usd) - sum(rawGoals, (g) => g.spent_usd)
    );

    const kpis = [
      {
        label: 'Total Revenue',
        value: Number(totals.revenue) || 0,
        format: 'currencyCompact',
        change: deltaFromSeries(costSeries),
        series: costSeries,
        tooltip: 'Revenue attributed to agents.',
      },
      {
        label: 'Active Agents',
        value: activeAgents,
        format: 'number',
        change: null,
        tooltip: 'Agents available or busy now.',
      },
      {
        label: 'Open Tasks',
        value: openTasks,
        format: 'number',
        change: null,
        tooltip: 'Tasks not yet completed.',
      },
      {
        label: 'Cost Save',
        value: costSave,
        format: 'currencyCompact',
        change: null,
        tooltip: 'Budget minus spend across goals.',
      },
      {
        label: 'Error Rate',
        value: Number(totals.errorRate) || 0,
        format: 'percent',
        change: null,
        tooltip: 'Share of LLM calls that errored.',
      },
      {
        label: 'Running Agents',
        value: runningAgents,
        format: 'number',
        change: null,
        tooltip: 'Agents executing work now.',
      },
    ];

    const tokens = Number(totals.tokens) || 0;
    const sparkStats = [
      {
        label: 'Cost (USD)',
        value: Number(totals.cost) || 0,
        format: 'currencyCompact',
        change: deltaFromSeries(costSeries),
        series: costSeries,
      },
      {
        label: 'Total Calls',
        value: Number(totals.calls) || 0,
        format: 'number',
        change: deltaFromSeries(callsSeries),
        series: callsSeries,
      },
      {
        label: 'Avg Tokens / Call',
        value: Number(totals.calls) || 0 ? tokens / Number(totals.calls) : 0,
        format: 'compact',
        change: deltaFromSeries(avgTpcSeries),
        series: avgTpcSeries,
      },
      {
        label: 'Cost / 1M tok',
        value: tokens ? (Number(totals.cost) || 0) / (tokens / 1_000_000) : 0,
        format: 'currencyCompact',
        change: deltaFromSeries(costPerMSeries),
        series: costPerMSeries,
      },
      {
        label: 'Slowest Response (s)',
        value: (Number(totals.p95DurationMs) || 0) / 1000,
        format: 'number',
        change: deltaFromSeries(latencySeries),
        series: latencySeries,
      },
      {
        label: 'Avg Work Quality',
        value: Number(totals.avgScore) || 0,
        format: 'number',
        change: deltaFromSeries(scoreSeries),
        series: scoreSeries,
      },
    ];

    const performance = {
      lines: ['Tokens (k)', 'Calls', 'Activity'],
      data: timeseries.map((p) => ({
        date: shortDate(p.date),
        'Tokens (k)': Math.round((Number(p.tokens) || 0) / 1000),
        Calls: Number(p.calls) || 0,
        Activity: 0,
      })),
    };

    const goalDate = (g) => new Date(g.updated_at || g.created_at || 0).getTime();
    // "Goals in Action" mirrors History: every goal (any status), newest first,
    // with the real status label/color and the real phase progress.
    const sortedGoals = rawGoals.slice().sort((a, b) => goalDate(b) - goalDate(a));
    const goals = {
      rows: sortedGoals.map((g) => ({
        _id: g.id, // hidden — used to open the goal detail dialog on row click
        goal: truncate(g.title || 'Untitled goal', 32),
        status: goalStatusCell(g.status),
        phase: goalPhase(g),
        date: stackedDateTime(g.updated_at || g.created_at),
      })),
      total: sortedGoals.length,
    };

    // Loops come from the dedicated `getLoops()` feed (looped goals + their
    // team-lead agent). Rows are passed through verbatim so the table can wire
    // up clickable Agent (→ agent popup) and Goal (→ goal popup) cells.
    const loopsInWindow = rawLoops.filter((r) => inWindow(r.started_at));
    const loops = {
      rows: loopsInWindow,
      total: loopsInWindow.length,
    };

    // Agent ops (read from source tables) + human ops (audit_log). Agent rows go
    // first so they win the per-(instrument,id) dedup over any audit duplicate.
    const seenOps = new Set();
    const mergedOps = [];
    for (const r of [...rawAgentOps, ...rawActivityOps]) {
      const key = `${r.instrument}:${r.id}`;
      if (seenOps.has(key)) continue;
      seenOps.add(key);
      mergedOps.push(r);
    }
    const activityRows = mergedOps
      .filter((r) => inWindow(r.date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const activity = {
      spark: activitySpark(rawActivity),
      rows: activityRows.map((r) => ({
        id: r.id,
        instrument: r.instrument || '-',
        action: r.action || '-',
        personaName: r.personaName || 'User',
        personaPosition: r.personaPosition || '',
        personaKind: r.personaKind || 'User',
        agentId: r.agentId || '',
        date: stackedDateTime(r.date),
      })),
    };

    // Chat = recent agent-room messages (goal_messages) — the real agent /
    // consilium / system conversations shown on the Communicator page —
    // categorized by channel, with an absolute timestamp and a deep-link to the
    // goal's room.
    const chatMsgsInWindow = rawAgentMsgs.filter((m) => inWindow(m.created_at));
    const chat = {
      messages: chatMsgsInWindow.map((m) => ({
        id: m.id,
        sender: m.sender_name || 'Agent',
        agentId: m.sender_agent_id || null,
        category: chatCategory(m.channel),
        contextLabel: '',
        content: m.message || '',
        time: relTime(m.created_at),
        datetime: formatDateTime(m.created_at),
        reviewHref: chatReviewHref(m),
      })),
      total: chatMsgsInWindow.length,
    };

    const donutSource = byModel.length ? byModel : byProvider;
    const donutRows = donutSource.slice(0, 6).map((r) => ({
      group: r.model || r.provider || 'unknown',
      value: Number(r.tokens) || 0,
      cost: Number(r.cost) || 0,
    }));
    // Roll every model beyond the top 6 into a single "Other" slice so the donut
    // sums to the real total (matches the all-models token count), not just the
    // slices shown.
    const shownTokens = donutRows.reduce((s, r) => s + r.value, 0);
    const otherTokens = tokens - shownTokens;
    const otherCost = (Number(totals.cost) || 0) - donutRows.reduce((s, r) => s + r.cost, 0);
    if (otherTokens > 0) {
      donutRows.push({ group: 'Other', value: otherTokens, cost: Math.max(0, otherCost) });
    }
    const usageDonut = { rows: donutRows };

    const dataOps = {
      rows: rawKbOps
        .filter((r) => inWindow(r.date))
        .map((r) => ({
          _id: r.id, // hidden — opens the KB document dialog on name/type click
          type: r.type || '-',
          name: r.name || '-',
          action: r.action || '-',
          agentName: r.agentName || '',
          agentPosition: r.agentPosition || '',
          agentId: r.agentId || '',
          user: userEmail || r.user || '-',
          date: stackedDateTime(r.date),
        })),
    };

    const agents = {
      rows: rawAgents.slice(0, 50).map((a) => ({
        name: a.agentName || 'Agent',
        type: a.role || 'general',
        status: availabilityLabel(a.availability),
        team: a.category || '-',
        lastActive: relTime(a.lastUsed),
        tasks: Number(a.jobsTotal) || 0,
        successRate: a.jobsTotal ? Math.round((a.jobsCompleted / a.jobsTotal) * 100) : 0,
      })),
    };

    const consiliumBoards = rawBoards.map((b) => {
      const stat = rawBoardStats[b.id] || {};
      const decisions = Number(stat.decisions) || 0;
      const decided = (Number(stat.approvedCount) || 0) + (Number(stat.rejectedCount) || 0);
      return {
        id: b.id,
        name: b.name || 'Untitled board',
        status: b.status || 'active',
        memberCount: Number(rawMemberCounts[b.id]) || 0,
        decisions,
        approvalRate:
          decided > 0 ? Math.round(((Number(stat.approvedCount) || 0) / decided) * 1000) / 10 : 0,
        avgScore: Number(stat.avgScore) || 0,
        costUsd: Number(stat.costUsd) || 0,
      };
    });
    const totalDecisions = consiliumBoards.reduce((s, b) => s + b.decisions, 0);
    const totalApproved = consiliumBoards.reduce(
      (s, b) => s + Math.round((b.approvalRate / 100) * b.decisions),
      0
    );
    const scoredBoards = consiliumBoards.filter((b) => b.decisions > 0);
    const consilium = {
      boards: consiliumBoards,
      totals: {
        boards: consiliumBoards.length,
        members: consiliumBoards.reduce((s, b) => s + b.memberCount, 0),
        decisions: totalDecisions,
        approvalRate:
          totalDecisions > 0 ? Math.round((totalApproved / totalDecisions) * 1000) / 10 : 0,
        avgScore:
          scoredBoards.length > 0
            ? Math.round(
                (scoredBoards.reduce((s, b) => s + b.avgScore * b.decisions, 0) / totalDecisions) *
                  10
              ) / 10
            : 0,
      },
    };

    return {
      kpis,
      sparkStats,
      performance,
      goals,
      loops,
      activity,
      chat,
      usageDonut,
      dataOps,
      agents,
      consilium,
    };
  }, [
    llm.data,
    range,
    userEmail,
    rawGoals,
    rawLoops,
    rawTasks,
    rawAgents,
    rawActivity,
    rawKbOps,
    rawActivityOps,
    rawAgentOps,
    rawAgentMsgs,
    rawBoards,
    rawMemberCounts,
    rawBoardStats,
  ]);

  // Demo: inject the real platform email into the Data Operations User column.
  const out = useMemo(() => {
    if (!demo) return live;
    return {
      ...demoSnapshot,
      dataOps: {
        rows: (demoSnapshot.dataOps?.rows || []).map((r) => ({ ...r, user: userEmail || r.user })),
      },
    };
  }, [demo, demoSnapshot, live, userEmail]);

  return {
    ...out,
    loading: demo ? false : llm.loading || ownLoading,
    error: demo ? null : ownError || llm.error,
    isLive: !demo,
    lastUpdated: demo ? null : lastUpdated,
    refresh: fetchOwn,
  };
}

export default useHomeData;
