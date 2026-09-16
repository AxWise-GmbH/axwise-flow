/** Shared report metric reason codes (backend + frontend). */
export const METRIC_REASONS = {
  cost_legacy: {
    title: 'Cost not recorded',
    body: 'This goal ran before per-phase cost tracking was enabled. Dollar amounts were not saved to the ledger for this phase. Total budget may still reflect planning estimates. New goals record LLM cost on every call.',
  },
  cost_no_llm: {
    title: 'No LLM cost in this phase',
    body: 'This phase completed without LLM spend recorded on its tasks. Orchestration or manual steps may have run without a billable model call.',
  },
  tokens_legacy: {
    title: 'Tokens not tracked',
    body: 'Token counts were not stored when this goal executed. The system now records prompt and completion tokens on every LLM call. This phase shows 0 because no historical token data exists — not because usage was free.',
  },
  tokens_orphan: {
    title: 'Tokens not assigned to phase',
    body: 'Tasks in this goal have token usage at the agent level, but were not tagged with a phase index when they ran. Re-run goals created after the latest update to get per-phase token breakdown.',
  },
};

export function getMetricInfo(reasonCode) {
  if (!reasonCode) return null;
  return METRIC_REASONS[reasonCode] || null;
}

export function isLikelyDurationAsTokens(tasks = []) {
  if (!tasks.length) return false;
  let hasDuration = false;
  let hasRealTokens = false;
  for (const task of tasks) {
    const tokens = Number(task.data?.llmTotalTokens || 0);
    const duration = Number(task.data?.llmDurationMs || 0);
    if (tokens > 0) hasRealTokens = true;
    if (duration > 10_000 && tokens <= 0) hasDuration = true;
  }
  return hasDuration && !hasRealTokens;
}

export function resolvePhaseMetricMeta({
  phaseIndex,
  cost,
  tokens,
  phaseTasks = [],
  goalHasOrphanTokens = false,
  isLegacyGoal = false,
}) {
  const costNum = Number(cost || 0);
  const tokenNum = Number(tokens || 0);
  const hasTasks = phaseTasks.length > 0;
  const hasTaskCost = phaseTasks.some((t) => Number(t.data?.llmCost || 0) > 0);
  const hasTaskTokens = phaseTasks.some((t) => Number(t.data?.llmTotalTokens || 0) > 0);

  let costReason = null;
  let tokenReason = null;

  if (costNum <= 0) {
    if (hasTasks && !hasTaskCost) costReason = 'cost_no_llm';
    else if (isLegacyGoal || !hasTaskCost) costReason = 'cost_legacy';
  }

  if (tokenNum <= 0) {
    if (goalHasOrphanTokens && phaseIndex >= 0) tokenReason = 'tokens_orphan';
    else if (!hasTaskTokens) tokenReason = 'tokens_legacy';
  }

  return { costReason, tokenReason };
}

export function resolveAgentMetricMeta({ agentTasks = [], tokens, cost, isLegacyGoal = false }) {
  const costNum = Number(cost || 0);
  const durationMislabeled = isLikelyDurationAsTokens(agentTasks);

  let costReason = null;
  let tokenReason = null;

  if (costNum <= 0 && (isLegacyGoal || !agentTasks.some((t) => Number(t.data?.llmCost || 0) > 0))) {
    costReason = agentTasks.length ? 'cost_no_llm' : 'cost_legacy';
  }

  if (Number(tokens || 0) <= 0 || durationMislabeled) {
    tokenReason = 'tokens_legacy';
  } else if (!agentTasks.some((t) => Number(t.data?.llmTotalTokens || 0) > 0) && Number(tokens || 0) > 0) {
    tokenReason = 'tokens_legacy';
  }

  return { costReason, tokenReason, durationMislabeled };
}
