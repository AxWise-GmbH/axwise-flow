/**
 * [module: shared]
 * Platform insights aggregator — one batched read that powers the copilot's
 * "Today's overview" / weekly / monthly answers and the insights.* tools.
 *
 * Pure data: takes a Supabase admin client + userId, returns a structured
 * counts object. Every query is user-scoped (the admin client bypasses RLS,
 * so `.eq('user_id', userId)` is mandatory on every table touched here).
 */

const DONE_TASK_STATUSES = '("done","completed","cancelled")';
const DONE_GOAL_STATUSES = '("completed","cancelled","failed")';

function rangeDays(range) {
  if (range === 'monthly') return 30;
  if (range === 'weekly') return 7;
  return 1; // overview / today
}

/** Count helper that never throws — returns 0 on error so one bad table cannot break the overview. */
async function safeCount(builder) {
  try {
    const { count } = await builder;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * @param {object} admin Supabase admin client
 * @param {string} userId Authenticated user id
 * @param {'overview'|'today'|'weekly'|'monthly'} range
 */
export async function buildInsights(admin, userId, range = 'overview') {
  const days = rangeDays(range);
  const now = new Date();
  const nowIso = now.toISOString();
  const sinceIso = new Date(now.getTime() - days * 86_400_000).toISOString();
  const soonIso = new Date(now.getTime() + days * 86_400_000).toISOString();

  const headCount = (table) => admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);

  const [
    tasksDueSoon,
    tasksOverdue,
    tasksBlocked,
    workflowsRunning,
    workflowsFailed,
    goalsActive,
    goalsAtRisk,
    goalsLooping,
    consiliumDecisions,
    newDocs,
    pulsesEnabled,
    pulsesTotal,
    spendRows,
  ] = await Promise.all([
    safeCount(headCount('team_tasks').not('status', 'in', DONE_TASK_STATUSES).gte('deadline', nowIso).lte('deadline', soonIso)),
    safeCount(headCount('team_tasks').not('status', 'in', DONE_TASK_STATUSES).lt('deadline', nowIso).not('deadline', 'is', null)),
    safeCount(headCount('team_tasks').eq('status', 'blocked')),
    safeCount(admin.from('workflow_executions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'running')),
    safeCount(admin.from('workflow_executions').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['failed', 'error']).gte('started_at', sinceIso)),
    safeCount(headCount('goals').not('status', 'in', DONE_GOAL_STATUSES)),
    safeCount(headCount('goals').eq('status', 'failed')),
    safeCount(headCount('goals').eq('loop_enabled', true)),
    safeCount(headCount('concilium_evaluations').gte('created_at', sinceIso)),
    safeCount(headCount('knowledge_documents').gte('created_at', sinceIso)),
    safeCount(admin.from('agent_pulses').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('enabled', true)),
    safeCount(admin.from('agent_pulses').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
    admin
      .from('llm_usage')
      .select('estimated_cost_usd')
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .limit(5000)
      .then((r) => r.data || [], () => []),
  ]);

  const spendUsd = (spendRows || []).reduce((sum, r) => sum + (Number(r.estimated_cost_usd) || 0), 0);

  return {
    range,
    sinceIso,
    generatedAt: nowIso,
    tasks: { dueSoon: tasksDueSoon, overdue: tasksOverdue, blocked: tasksBlocked },
    workflows: { running: workflowsRunning, failed: workflowsFailed },
    goals: { active: goalsActive, atRisk: goalsAtRisk, looping: goalsLooping },
    consilium: { decisions: consiliumDecisions },
    knowledge: { newDocs },
    pulses: { enabled: pulsesEnabled, total: pulsesTotal },
    spend: { usd: Math.round(spendUsd * 10000) / 10000 },
  };
}

export default buildInsights;
