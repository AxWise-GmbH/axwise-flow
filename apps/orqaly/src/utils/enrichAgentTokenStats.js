/**
 * Aggregate LLM token/cost stats for agents from team_tasks (flattened or nested shape).
 */
import { resolveAgentMetricMeta } from './reportMetricMeta';

const LLM_FIELDS = ['llmTotalTokens', 'llmCost', 'llmEstimatedCostUsd', 'llmDurationMs'];

export function getTaskLlmField(task, field) {
  if (!task || !field) return 0;
  const top = task[field];
  if (top != null && top !== '') return Number(top) || 0;
  return Number(task.data?.[field] || 0);
}

export function normalizeTaskForMetric(task) {
  if (!task) return { data: {} };
  if (task.data && typeof task.data === 'object') return task;
  const data = {};
  for (const field of LLM_FIELDS) {
    if (task[field] != null) data[field] = task[field];
  }
  if (task.goal_id != null) data.goal_id = task.goal_id;
  if (task.goalId != null) data.goal_id = task.goalId;
  if (task.assigned_to != null) data.assigned_to = task.assigned_to;
  return { ...task, data: { ...(task.data || {}), ...data } };
}

function matchesAgentIds(task, agentIds) {
  const ids = (Array.isArray(agentIds) ? agentIds : [agentIds]).filter(Boolean);
  if (!ids.length) return false;
  const taskIds = [task.agent_id, task.agentId].filter(Boolean);
  return taskIds.some((id) => ids.includes(id));
}

function matchesAgentName(task, agentName) {
  if (!agentName) return false;
  const name = task.assigned_to || task.assignedTo || task.data?.assigned_to;
  return name === agentName;
}

function tasksForAgent(teamTasks, agentIds, agentName) {
  return (teamTasks || []).filter(
    (t) => matchesAgentIds(t, agentIds) || matchesAgentName(t, agentName)
  );
}

function tasksForGoalAgent(teamTasks, goalId, agentIds, agentName) {
  return (teamTasks || []).filter((t) => {
    const gid = t.goal_id || t.goalId || t.data?.goal_id;
    if (goalId && gid !== goalId) return false;
    return matchesAgentIds(t, agentIds) || matchesAgentName(t, agentName);
  });
}

/**
 * @param {string|string[]} agentIds
 * @param {object[]} teamTasks
 * @param {{ agentName?: string, taskCount?: number }} [opts]
 */
export function aggregateAgentTokenStats(agentIds, teamTasks = [], opts = {}) {
  const agentTasks = tasksForAgent(teamTasks, agentIds, opts.agentName);
  const normalized = agentTasks.map(normalizeTaskForMetric);
  const taskCount = opts.taskCount ?? agentTasks.length;

  let totalTokens = 0;
  let totalLlmCost = 0;
  for (const task of agentTasks) {
    totalTokens += getTaskLlmField(task, 'llmTotalTokens');
    totalLlmCost +=
      getTaskLlmField(task, 'llmCost') || getTaskLlmField(task, 'llmEstimatedCostUsd');
  }

  const hasStoredTokens = normalized.some((t) => Number(t.data?.llmTotalTokens || 0) > 0);
  const isLegacyGoal = !hasStoredTokens && totalTokens <= 0;

  const meta = resolveAgentMetricMeta({
    agentTasks: normalized,
    tokens: totalTokens,
    cost: totalLlmCost,
    isLegacyGoal,
  });

  const displayTokens = meta.durationMislabeled ? 0 : totalTokens;

  return {
    totalTokens: displayTokens,
    totalLlmCost,
    tokensPerTask: taskCount > 0 ? Math.round(displayTokens / taskCount) : 0,
    metricMeta: {
      costReason: meta.costReason,
      tokenReason: meta.tokenReason,
    },
  };
}

/**
 * Enrich a knowledge_documents agent-report row with tokens + metricMeta.
 */
export function enrichAgentReportMeta(report, teamTasks = []) {
  const base = report?.metadata || {};
  const goalId = base.goal_id;
  const agentIds = [base.agent_id].filter(Boolean);
  const agentName = base.agent_name;

  let tokens = Number(base.tokens || 0);
  let cost = Number(base.cost || 0);

  const matching = goalId
    ? tasksForGoalAgent(teamTasks, goalId, agentIds, agentName)
    : tasksForAgent(teamTasks, agentIds, agentName);

  if (tokens <= 0 && matching.length) {
    tokens = matching.reduce((s, t) => s + getTaskLlmField(t, 'llmTotalTokens'), 0);
  }
  if (cost <= 0 && matching.length) {
    cost = matching.reduce(
      (s, t) => s + (getTaskLlmField(t, 'llmCost') || getTaskLlmField(t, 'llmEstimatedCostUsd')),
      0
    );
  }

  const normalized = matching.map(normalizeTaskForMetric);
  const hasStoredTokens =
    Number(base.tokens || 0) > 0 || normalized.some((t) => Number(t.data?.llmTotalTokens || 0) > 0);
  const meta = resolveAgentMetricMeta({
    agentTasks: normalized,
    tokens,
    cost,
    isLegacyGoal: !hasStoredTokens && tokens <= 0,
  });

  const displayTokens = meta.durationMislabeled ? 0 : tokens;

  return {
    ...base,
    cost,
    tokens: displayTokens,
    metricMeta: {
      costReason: meta.costReason,
      tokenReason: meta.tokenReason,
    },
  };
}
