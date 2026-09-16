/**
 * Enrich goal report data from team_tasks when API aggregates are empty
 * (legacy goals, prod API not yet deployed, or missing financial_events).
 */
import {
  isLikelyDurationAsTokens,
  resolveAgentMetricMeta,
  resolvePhaseMetricMeta,
} from './reportMetricMeta';

function phaseKeyFromIndex(phaseIndex) {
  if (phaseIndex == null || phaseIndex === -1) return 'planning';
  return String(phaseIndex);
}

function tasksForPhase(tasks, phaseIndex) {
  if (phaseIndex === -1) {
    return tasks.filter((t) => t.data?.phase_index == null || t.data?.phase_index === -1);
  }
  return tasks.filter((t) => Number(t.data?.phase_index) === phaseIndex);
}

function aggregateTasks(tasks = []) {
  const byPhase = {};
  const byAgent = {};
  let totalTaskCost = 0;
  let totalTokens = 0;
  let totalTokenCostUsd = 0;
  let orphanTokens = 0;

  for (const task of tasks) {
    const cost = Number(task.data?.llmCost || 0);
    const tokens = Number(task.data?.llmTotalTokens || 0);
    const tokenCost = Number(task.data?.llmEstimatedCostUsd || task.data?.llmCost || 0);
    const phaseIndex = task.data?.phase_index;
    const hasPhaseIndex = phaseIndex != null && phaseIndex !== -1;
    const phaseKey = phaseKeyFromIndex(phaseIndex);
    const agentName = task.assigned_to || task.data?.assigned_to || 'Unassigned';
    const provider = task.data?.llmProvider || 'unknown';
    const model = task.data?.llmModel || 'unknown';

    totalTaskCost += cost;
    totalTokens += tokens;
    totalTokenCostUsd += tokenCost;
    if (tokens > 0 && !hasPhaseIndex) orphanTokens += tokens;

    if (!byPhase[phaseKey]) {
      byPhase[phaseKey] = { cost: 0, tokens: 0, tokenCostUsd: 0, byModel: new Map() };
    }
    byPhase[phaseKey].cost += cost;
    byPhase[phaseKey].tokens += tokens;
    byPhase[phaseKey].tokenCostUsd += tokenCost;

    if (tokens > 0) {
      const mk = `${provider}/${model}`;
      const prev = byPhase[phaseKey].byModel.get(mk) || { provider, model, tokens: 0, costUsd: 0 };
      prev.tokens += tokens;
      prev.costUsd += tokenCost;
      byPhase[phaseKey].byModel.set(mk, prev);
    }

    if (!byAgent[agentName]) {
      byAgent[agentName] = {
        name: agentName,
        agentId: task.agent_id || null,
        tasks: 0,
        completed: 0,
        failed: 0,
        spent: 0,
        tokens: 0,
        tokenCostUsd: 0,
        models: new Set(),
        quality: [],
        taskRows: [],
      };
    }
    const agent = byAgent[agentName];
    agent.tasks += 1;
    agent.taskRows.push(task);
    if (task.status === 'done') agent.completed += 1;
    if (task.status === 'failed') agent.failed += 1;
    agent.spent += cost;
    agent.tokens += tokens;
    agent.tokenCostUsd += tokenCost;
    if (model && model !== 'unknown') agent.models.add(`${provider}/${model}`);
    if (task.data?.quality_score) agent.quality.push(task.data.quality_score);
  }

  return {
    byPhase,
    byAgent,
    totalTaskCost,
    totalTokens,
    totalTokenCostUsd,
    orphanTokens,
  };
}

function modelMapToBreakdown(map) {
  return [...map.values()].map((m) => ({
    provider: m.provider,
    model: m.model,
    tokens: m.tokens,
    costUsd: m.costUsd,
  }));
}

function sanitizeAgentTokens(agent, agentTasks) {
  const meta = resolveAgentMetricMeta({
    agentTasks,
    tokens: agent.tokens,
    cost: agent.spent,
    isLegacyGoal: true,
  });
  if (meta.durationMislabeled) {
    return {
      tokens: 0,
      tokenCostUsd: 0,
      metricMeta: { tokenReason: 'tokens_legacy', costReason: meta.costReason },
    };
  }
  return {
    tokens: Number(agent.tokens || 0),
    tokenCostUsd: Number(agent.tokenCostUsd || 0),
    metricMeta: { tokenReason: meta.tokenReason, costReason: meta.costReason },
  };
}

/**
 * @returns enriched goal slice for Report tab display
 */
export function enrichGoalReportData(goal, tasks = []) {
  if (!goal) return goal;
  const taskAgg = aggregateTasks(tasks);
  const hasTaskTokens = taskAgg.totalTokens > 0;
  const hasTaskCost = taskAgg.totalTaskCost > 0;
  const apiHasTokens = Boolean(goal.tokenSummary?.hasTokenData);
  const spentUsd = Number(goal.spent_usd || 0);
  const financialTotal = Number(goal.financialSummary?.totalSpent || 0);
  const displaySpent = Math.max(spentUsd, financialTotal, taskAgg.totalTaskCost);
  const goalHasOrphanTokens = taskAgg.orphanTokens > 0;
  const isLegacyGoal = !apiHasTokens && !hasTaskTokens;

  const hasLlmModels = tasks.some((t) => t.data?.llmModel);
  const tokenSummary = {
    hasTokenData: apiHasTokens || hasTaskTokens,
    hasLlmInfo: apiHasTokens || hasTaskTokens || hasLlmModels,
    totalTokens: apiHasTokens ? Number(goal.tokenSummary?.totalTokens || 0) : taskAgg.totalTokens,
    totalTokenCostUsd: apiHasTokens
      ? Number(goal.tokenSummary?.totalTokenCostUsd || 0)
      : taskAgg.totalTokenCostUsd,
    metricMeta: resolvePhaseMetricMeta({
      phaseIndex: -2,
      cost: displaySpent,
      tokens: taskAgg.totalTokens,
      phaseTasks: tasks,
      goalHasOrphanTokens,
      isLegacyGoal,
    }),
  };

  const phaseBudget = (goal.phaseBudget || []).map((phase) => {
    const phaseKey = phaseKeyFromIndex(phase.phaseIndex);
    const fromTasks = taskAgg.byPhase[phaseKey];
    const phaseTasks = tasksForPhase(tasks, phase.phaseIndex);
    const persistedPhaseCost = Number(goal.data?.phase_costs?.[phase.phaseIndex]?.total || 0);
    const cost = Math.max(Number(phase.cost || 0), persistedPhaseCost, fromTasks?.cost || 0);
    const tokens = Math.max(Number(phase.tokens || 0), fromTasks?.tokens || 0);
    const tokenCostUsd = Math.max(Number(phase.tokenCostUsd || 0), fromTasks?.tokenCostUsd || 0);
    const tokenBreakdown = phase.tokenBreakdown?.length
      ? phase.tokenBreakdown
      : fromTasks?.byModel?.size
        ? modelMapToBreakdown(fromTasks.byModel)
        : null;

    const metricMeta = resolvePhaseMetricMeta({
      phaseIndex: phase.phaseIndex,
      cost,
      tokens,
      phaseTasks,
      goalHasOrphanTokens,
      isLegacyGoal,
    });

    return {
      ...phase,
      cost,
      tokens,
      tokenCostUsd,
      tokenBreakdown,
      metricMeta,
    };
  });

  if (phaseBudget.length && displaySpent > taskAgg.totalTaskCost) {
    const planning = phaseBudget.find((p) => p.phaseIndex === -1);
    if (planning && planning.cost <= 0) {
      planning.cost = Math.max(0, displaySpent - taskAgg.totalTaskCost);
    }
  }

  const agentBudget = (goal.agentBudget?.length ? goal.agentBudget : []).map((agent) => {
    const fromTasks = taskAgg.byAgent[agent.name];
    const agentTasks =
      fromTasks?.taskRows ||
      tasks.filter((t) => (t.assigned_to || t.data?.assigned_to) === agent.name);
    const spent = Math.max(Number(agent.spent || 0), fromTasks?.spent || 0);
    const rawTokens = Math.max(Number(agent.tokens || 0), fromTasks?.tokens || 0);
    const rawTokenCost = Math.max(Number(agent.tokenCostUsd || 0), fromTasks?.tokenCostUsd || 0);
    const sanitized = sanitizeAgentTokens(
      { tokens: rawTokens, tokenCostUsd: rawTokenCost, spent },
      agentTasks
    );

    return {
      ...agent,
      spent,
      tokens: sanitized.tokens,
      tokenCostUsd: sanitized.tokenCostUsd,
      metricMeta: sanitized.metricMeta,
      llmModels: fromTasks?.models?.size ? [...fromTasks.models] : agent.llmModels,
      avgQuality:
        agent.avgQuality ??
        (fromTasks?.quality?.length
          ? Math.round(fromTasks.quality.reduce((s, v) => s + v, 0) / fromTasks.quality.length)
          : null),
    };
  });

  if (!agentBudget.length && Object.keys(taskAgg.byAgent).length) {
    for (const agent of Object.values(taskAgg.byAgent)) {
      const sanitized = sanitizeAgentTokens(agent, agent.taskRows);
      agentBudget.push({
        name: agent.name,
        agentId: agent.agentId,
        tasks: agent.tasks,
        completed: agent.completed,
        failed: agent.failed,
        spent: agent.spent,
        tokens: sanitized.tokens,
        tokenCostUsd: sanitized.tokenCostUsd,
        metricMeta: sanitized.metricMeta,
        llmModels: agent.models.size ? [...agent.models] : undefined,
        avgQuality: agent.quality.length
          ? Math.round(agent.quality.reduce((s, v) => s + v, 0) / agent.quality.length)
          : null,
      });
    }
  }

  return {
    ...goal,
    spent_usd: displaySpent,
    phaseBudget,
    agentBudget,
    tokenSummary,
    _reportEnriched: hasTaskCost || hasTaskTokens,
  };
}
