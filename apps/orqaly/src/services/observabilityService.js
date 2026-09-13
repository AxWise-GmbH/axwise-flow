/**
 * Observability console read layer. Per-source loaders for the Audit Log tabs,
 * each a direct Supabase read scoped by RLS (auth.uid() = user_id), mirroring
 * src/hooks/usePulseFeed.js. Best-effort: returns [] on error/no-client so a tab
 * renders an empty state instead of crashing. No new API endpoints.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const DEFAULT_LIMIT = 200;

async function readRows(table, columns, { limit = DEFAULT_LIMIT } = {}) {
  if (!hasSupabase()) return [];
  try {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(`[observability] ${table} read failed:`, err?.message);
    }
    return [];
  }
}

/** AxWise conditions calls - full request/response/applied (richest source). */
export function loadAxwiseCalls(opts) {
  return readRows('axwise_calls', '*', opts);
}

/** LLM spend ledger - per-call metadata (no prompt/response text stored). */
export function loadLlmCalls(opts) {
  return readRows(
    'llm_usage',
    'id, created_at, provider, model, total_tokens, prompt_tokens, completion_tokens, cached_tokens, estimated_cost_usd, duration_ms, status, error_type, operation, source, agent_name, goal_id, consilium_id, metadata',
    opts
  );
}

/** Goal pipeline events (event_type + free-form details), with goal title/status. */
export function loadGoalEvents(opts) {
  return readRows(
    'goal_log',
    'id, created_at, event_type, details, cost_usd, goal_id, goals(title, status)',
    opts
  );
}

/** Consilium evaluations - consensus + per-member votes (member_responses). */
export function loadConsiliumEvals(opts) {
  return readRows(
    'concilium_evaluations',
    'id, created_at, approved, consensus_type, overall_score, decision_level, human_review_required, human_review_status, member_responses, summary, concilium_id',
    opts
  );
}

/** Registry the Audit Log tabs use to pick a loader by source key. */
export const OBSERVABILITY_LOADERS = {
  axwise: loadAxwiseCalls,
  llm: loadLlmCalls,
  goals: loadGoalEvents,
  consilium: loadConsiliumEvals,
};
