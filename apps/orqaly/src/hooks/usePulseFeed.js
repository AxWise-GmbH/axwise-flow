import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, hasSupabase } from '../lib/supabase';
import { useAxwiseGoalScope } from './useAxwiseGoalScope';
import { currentGoalTaskAttempt } from '../components/Goals/currentGoalTaskAttempt';

// Live feed powering the PulseBar. Reads recent AxWise cognition calls straight
// from llm_usage (RLS already scopes to auth.uid() = user_id, same as AuditLog),
// and, when the user is on a goal detail route (/goals/:id), folds in that goal's
// pipeline status + failed-task count. Polls on an interval; exposes refresh().
//
// v1 is polling, not Realtime - llm_usage isn't in the supabase_realtime
// publication yet (deferred). Interval is deliberately gentle.
const POLL_MS = 12_000;
const MAX_ROWS = 20;

// Map a raw signal to a coarse severity so the bar can pick one status color.
// ok (green) < warn (amber) < error (red).
function severityOf(event) {
  if (event.severity) return event.severity;
  if (
    event.status === 'required_research_blocked' ||
    event.status === 'failed' ||
    event.status === 'cancelled' ||
    event.status === 'blocked'
  )
    return 'error';
  if (event.status === 'degraded' || event.status === 'timeout') return 'warn';
  if (event.status === 'error') return 'error';
  return 'ok';
}

const RANK = { ok: 0, warn: 1, error: 2 };

// A "block"-shaped decision, normalized across the two integration points:
// copilot.chat logs guard.action ('block'/'allow'), agent.generate logs a
// scopeDecision ('denied'/'allowed'). Compare block-ness, not raw strings, so
// 'allowed' vs 'allow' is not a false divergence.
const BLOCK_DECISIONS = new Set(['denied', 'block', 'blocked']);
function isBlockDecision(d) {
  return typeof d === 'string' && BLOCK_DECISIONS.has(d.toLowerCase());
}

function goalIdFromPath(pathname) {
  const m = /^\/goals\/([\w-]{1,64})$/.exec(pathname || '');
  return m ? m[1] : null;
}

// A goal status is a "problem" when the pipeline failed or is stuck awaiting a human.
function goalSeverity(status) {
  if (status === 'failed' || status === 'cancelled') return 'error';
  if (
    status === 'needs_human' ||
    status === 'paused' ||
    status === 'awaiting_po_input' ||
    status === 'awaiting_context_approval' ||
    status === 'awaiting_approval'
  )
    return 'warn';
  return 'ok';
}

function mapAxwiseRow(row) {
  const meta = row.metadata || {};
  return {
    id: `ax:${row.id}`,
    kind: 'axwise',
    // who / what / where / when
    who: row.agent_name || row.consilium_id || 'you',
    what: meta.ax_decision
      ? `${row.operation} -> ${meta.ax_decision}`
      : row.operation || 'evaluate',
    where: row.operation || 'axwise', // single endpoint, dispatched by integration point
    when: row.created_at,
    status: row.status || 'ok',
    severity: severityOf({ status: row.status }),
    durationMs: row.duration_ms ?? null,
    cost: row.estimated_cost_usd ?? null,
    axDecision: meta.ax_decision ?? null,
    localDecision: meta.local_decision ?? null,
    diverged:
      meta.ax_decision != null &&
      meta.local_decision != null &&
      isBlockDecision(meta.ax_decision) !== isBlockDecision(meta.local_decision),
    traceId: meta.trace_id ?? null,
    goalId: row.goal_id ?? null,
    skipped: meta.skipped === true,
    appliedOutcome: meta.applied_outcome || null,
    consiliumId: row.consilium_id ?? null,
    href: '/axwise-analytics',
  };
}

function mapGoalAxwiseState(goal, integrationPoint, state, timestampField) {
  if (!state || typeof state !== 'object') return null;
  const researchBlocked = state.status === 'required_research_blocked';
  const degraded =
    !researchBlocked &&
    (state.degraded === true || state.status === 'degraded' || Boolean(state.error));
  const status = researchBlocked
    ? 'required_research_blocked'
    : degraded
      ? 'degraded'
      : state.status || 'ok';
  const reason = state.error || state.reason || null;
  const stage = String(state.current_stage || '')
    .trim()
    .replaceAll('_', ' ');
  const boundedReason = researchBlocked
    ? `Research stopped${stage ? ` during ${stage}` : ''}; no customer context was accepted`
    : reason;
  return {
    id: `ax:goal:${goal.id}:${integrationPoint}:${state.request_id || state.decision_id || 'latest'}`,
    kind: 'axwise',
    who: 'goal orchestration',
    what: boundedReason
      ? `${integrationPoint} -> ${status}: ${boundedReason}`
      : `${integrationPoint} -> ${status}`,
    where: `goal.${integrationPoint}`,
    when: state[timestampField] || goal.updated_at,
    status,
    severity: severityOf({ status }),
    durationMs: null,
    axDecision: state.status || null,
    localDecision: degraded
      ? 'fallback:local'
      : researchBlocked
        ? 'blocked:no-context'
        : state.applied
          ? 'applied'
          : 'shadow',
    diverged: false,
    traceId: state.request_id || null,
    goalId: goal.id,
    skipped: state.skipped === true,
    appliedOutcome: researchBlocked
      ? 'blocked'
      : degraded
        ? 'fallback'
        : state.skipped
          ? 'skipped'
          : state.applied
            ? 'applied'
            : 'shadow',
    href: `/goals/${goal.id}`,
    routingMode: state.routing_mode || null,
    stage: stage || null,
    progress: Number.isFinite(Number(state.progress_percentage))
      ? Math.max(0, Math.min(100, Number(state.progress_percentage)))
      : null,
  };
}

export function usePulseFeed({ enabled = true } = {}) {
  const location = useLocation();
  const selectedGoalId = useAxwiseGoalScope();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  // Direct goal routes are authoritative. Goal detail dialogs opened over
  // /job-pool publish their selected goal through useAxwiseGoalScope so the
  // global status bar does not keep showing an unrelated workspace event.
  const goalId = goalIdFromPath(location.pathname) || selectedGoalId;

  const load = useCallback(async () => {
    if (!enabled || !hasSupabase()) return;
    setLoading(true);
    setError(null);
    try {
      const collected = [];

      // AxWise calls (the core feed).
      let usageQuery = supabase
        .from('llm_usage')
        .select(
          'id, created_at, operation, status, model, duration_ms, estimated_cost_usd, agent_name, consilium_id, goal_id, metadata'
        )
        .eq('source', 'axwise');
      if (goalId) usageQuery = usageQuery.eq('goal_id', goalId);
      const { data: rows, error: axErr } = await usageQuery
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS);
      if (axErr) throw axErr;
      for (const r of rows || []) collected.push(mapAxwiseRow(r));

      // Goal signal, only when viewing a goal.
      if (goalId) {
        const { data: goal } = await supabase
          .from('goals')
          .select('id, title, status, updated_at, plan, data')
          .eq('id', goalId)
          .maybeSingle();
        if (goal) {
          const customerIntelligence = mapGoalAxwiseState(
            goal,
            'customer-intelligence',
            goal.data?.axwise_customer_intelligence,
            'updated_at'
          );
          if (customerIntelligence) collected.push(customerIntelligence);
          const orchestration = mapGoalAxwiseState(
            goal,
            'orchestrate',
            goal.data?.axwise_orchestration,
            'created_at'
          );
          if (orchestration) collected.push(orchestration);
          collected.push({
            id: `goal:${goal.id}`,
            kind: 'goal',
            who: 'goal pipeline',
            what: goal.status,
            where: goal.title || `goal ${goal.id.slice(0, 8)}`,
            when: goal.updated_at,
            status: goal.status,
            severity: goalSeverity(goal.status),
            href: `/goals/${goal.id}`,
          });
        }
        const { data: failedTaskRows } = await supabase
          .from('team_tasks')
          .select('id, status, materialization_attempt, data')
          .eq('goal_id', goalId)
          .eq('status', 'failed');
        const failedTasks = currentGoalTaskAttempt(goal, failedTaskRows || []).length;
        if (failedTasks > 0) {
          collected.push({
            id: `tasks:${goalId}`,
            kind: 'task',
            who: 'agent team',
            what: `${failedTasks} failed task${failedTasks === 1 ? '' : 's'}`,
            where: `goal ${goalId.slice(0, 8)}`,
            when: new Date().toISOString(),
            status: 'error',
            severity: 'error',
            href: `/goals/${goalId}`,
          });
        }
      }

      collected.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
      setEvents(collected);
    } catch (err) {
      setError(err?.message || 'failed to load pulse feed');
    } finally {
      setLoading(false);
    }
  }, [enabled, goalId]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, load]);

  // Rollup for the collapsed bar: worst severity + a few counts.
  const worst = events.reduce(
    (acc, e) => (RANK[severityOf(e)] > RANK[acc] ? severityOf(e) : acc),
    'ok'
  );
  const summary = {
    total: events.length,
    axwise: events.filter((e) => e.kind === 'axwise').length,
    degraded: events.filter(
      (e) =>
        e.kind === 'axwise' &&
        (e.status === 'degraded' || e.status === 'error' || e.status === 'timeout')
    ).length,
    blocked: events.filter(
      (e) =>
        e.kind === 'axwise' &&
        (e.status === 'required_research_blocked' ||
          e.status === 'failed' ||
          e.status === 'cancelled' ||
          e.status === 'blocked')
    ).length,
    diverged: events.filter((e) => e.diverged).length,
    problems: events.filter((e) => severityOf(e) !== 'ok').length,
    worst,
  };

  return { events, summary, loading, error, refresh: load, scope: goalId ? 'goal' : 'workspace' };
}
