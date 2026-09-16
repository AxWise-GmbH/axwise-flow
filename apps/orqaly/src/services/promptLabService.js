/**
 * Prompt Lab service — frontend API calls for prompt optimization data.
 */
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 20;

// ── Optimization Runs ────────────────────────────────────────────────────────

export async function listOptimizationRuns(page = 0) {
  const { data, error, count } = await supabase
    .from('optimization_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) throw new Error(error.message);
  return { runs: data || [], total: count || 0 };
}

// ── Active Experiments ───────────────────────────────────────────────────────

export async function listActiveExperiments() {
  const { data, error } = await supabase
    .from('prompt_versions')
    .select(
      'id, agent_id, blueprint_id, version, variant_label, optimization_strategy, change_summary, status, test_task_count, baseline_metrics, test_metrics, created_at'
    )
    .eq('status', 'testing')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Group by agent_id
  const byAgent = {};
  for (const v of data || []) {
    if (!byAgent[v.agent_id])
      byAgent[v.agent_id] = { agent_id: v.agent_id, blueprint_id: v.blueprint_id, variants: [] };
    byAgent[v.agent_id].variants.push(v);
  }

  // Fetch agent names
  const agentIds = Object.keys(byAgent);
  if (agentIds.length) {
    const { data: blueprints } = await supabase
      .from('agent_blueprints')
      .select('id, name, category')
      .in('id', agentIds);

    for (const bp of blueprints || []) {
      if (byAgent[bp.id]) {
        byAgent[bp.id].agent_name = bp.name;
        byAgent[bp.id].agent_category = bp.category;
      }
    }
  }

  return Object.values(byAgent);
}

// ── Strategy Insights ────────────────────────────────────────────────────────

export async function getStrategyInsights() {
  const { data, error } = await supabase
    .from('optimization_runs')
    .select('strategy_outcomes')
    .eq('run_type', 'evaluation')
    .eq('status', 'completed')
    .not('strategy_outcomes', 'is', null)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  // Aggregate strategy outcomes
  const strategies = {};
  for (const run of data || []) {
    const outcomes = Array.isArray(run.strategy_outcomes)
      ? run.strategy_outcomes
      : [run.strategy_outcomes];
    for (const outcome of outcomes) {
      if (!outcome?.strategy) continue;
      const key = outcome.strategy;
      if (!strategies[key])
        strategies[key] = {
          strategy: key,
          used: 0,
          promoted: 0,
          totalQualityDelta: 0,
          totalSuccessDelta: 0,
        };
      strategies[key].used += 1;
      if (outcome.promoted) strategies[key].promoted += 1;
      strategies[key].totalQualityDelta += outcome.quality_delta || 0;
      strategies[key].totalSuccessDelta += outcome.success_rate_delta || 0;
    }
  }

  return Object.values(strategies).map((s) => ({
    strategy: s.strategy,
    timesUsed: s.used,
    winRate: s.used > 0 ? Math.round((s.promoted / s.used) * 100) : 0,
    avgQualityDelta: s.used > 0 ? +(s.totalQualityDelta / s.used).toFixed(1) : 0,
    avgSuccessDelta: s.used > 0 ? +(s.totalSuccessDelta / s.used).toFixed(1) : 0,
  }));
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function promoteVariant(variantId) {
  const { data: variant, error: fetchErr } = await supabase
    .from('prompt_versions')
    .select('id, agent_id, blueprint_id, system_prompt, version')
    .eq('id', variantId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const now = new Date().toISOString();

  // Promote this variant
  await supabase
    .from('prompt_versions')
    .update({ status: 'active', promoted_at: now })
    .eq('id', variantId);

  // Archive old active + reject other testing for this agent
  await supabase
    .from('prompt_versions')
    .update({ status: 'archived', archived_at: now })
    .eq('agent_id', variant.agent_id)
    .eq('status', 'active')
    .neq('id', variantId);

  await supabase
    .from('prompt_versions')
    .update({ status: 'rejected', archived_at: now })
    .eq('agent_id', variant.agent_id)
    .eq('status', 'testing')
    .neq('id', variantId);

  // Update blueprint
  if (variant.blueprint_id) {
    await supabase
      .from('agent_blueprints')
      .update({ system_prompt: variant.system_prompt, version: variant.version, updated_at: now })
      .eq('id', variant.blueprint_id);
  }
}

export async function cancelExperiment(agentId) {
  const now = new Date().toISOString();
  await supabase
    .from('prompt_versions')
    .update({ status: 'rejected', archived_at: now })
    .eq('agent_id', agentId)
    .eq('status', 'testing');
}
