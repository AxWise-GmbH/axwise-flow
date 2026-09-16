/**
 * Clone real, already-executed "success case" goals from a source account into the
 * demo account. Cloned goals carry the full detail the live pipeline generated
 * (tech_doc / proposal / feasibility_report / retrospective / plan, plus goal_log,
 * goal_messages, tasks, llm_usage and rich KB docs) — which is what the goal popups,
 * Communicator, Tasks, Reports and Knowledge Base read.
 *
 * Everything is re-owned to the demo user, distributed across the 4 subsidiaries, and
 * forced to an INERT status so no background cron ever executes it (zero LLM cost).
 *
 * The row transforms are pure (testable); only buildClonedGoals touches the DB.
 */
import {
  stableUuid,
  subForIndex,
  demoSubOrgId,
  demoSubTeamId,
  demoSubBoardId,
  SAFE_GOAL_STATUSES,
} from './demo-data.js';

/** Real account whose successful goals we clone (misters.builder). Override via env. */
export const DEMO_SOURCE_USER_ID =
  process.env.DEMO_SOURCE_USER_ID || 'e9f4bd22-5f07-4524-9894-8b75af4aaf9d';

export const clonedGoalId = (demoUserId, srcGoalId) =>
  stableUuid(`${demoUserId}:clone:goal:${srcGoalId}`);

/** A source goal is worth cloning if it carries rich detail AND is (or can be) inert. */
export function isRichGoal(g) {
  const hasDetail = (g.plan?.phases?.length || 0) > 0 || !!g.tech_doc || !!g.proposal;
  return hasDetail;
}

function inertStatus(status) {
  return SAFE_GOAL_STATUSES.has(status) ? status : 'completed';
}

/** Reparent a source goal row to a demo subsidiary (pure). */
export function reparentGoal(src, { demoUserId, index }) {
  const sub = subForIndex(index);
  const id = clonedGoalId(demoUserId, src.id);
  return {
    ...src,
    id,
    user_id: demoUserId,
    org_id: demoSubOrgId(demoUserId, sub.key),
    agent_team_id: demoSubTeamId(demoUserId, sub.key, 0),
    concilium_id: demoSubBoardId(demoUserId, sub.key),
    status: inertStatus(src.status),
    // Null source-scoped FKs so we never point at another user's rows.
    team_id: null,
    parent_goal_id: null,
    workflow_id: null,
    project_id: null,
    source_request_id: null,
    is_recurring: false,
    schedule: null,
    next_run_at: null,
    data: { ...(src.data || {}), demo_seed: true, cloned_from: src.id },
  };
}

export function reparentGoalLog(src, { goalIdMap }) {
  return {
    ...src,
    id: stableUuid(`clone:goallog:${src.id}`),
    goal_id: goalIdMap[src.goal_id],
  };
}

export function reparentTask(src, { goalIdMap, demoUserId }) {
  const goalId = goalIdMap[src.goal_id];
  return {
    ...src,
    id: `demo-task-${stableUuid(`clone:task:${src.id}`).slice(0, 12)}`,
    user_id: demoUserId,
    goal_id: goalId,
    prompt_version_id: null,
    job_pool_id: null,
    data: { ...(src.data || {}), goal_id: goalId },
  };
}

export function reparentLlm(src, { goalIdMap, demoUserId }) {
  return {
    ...src,
    id: stableUuid(`clone:llm:${src.id}`),
    user_id: demoUserId,
    goal_id: goalIdMap[src.goal_id],
    job_id: null,
  };
}

export function reparentGoalMsg(src, { goalIdMap }) {
  return {
    ...src,
    id: stableUuid(`clone:gmsg:${src.id}`),
    goal_id: goalIdMap[src.goal_id],
  };
}

export function reparentKb(src, { goalIdMap, demoUserId }) {
  const newGoalId = goalIdMap[src.metadata?.goal_id];
  const sub = subForIndex(Object.values(goalIdMap).indexOf(newGoalId));
  return {
    ...src,
    id: stableUuid(`clone:kb:${src.id}`),
    user_id: demoUserId,
    organization_id: sub ? demoSubOrgId(demoUserId, sub.key) : src.organization_id,
    embedding: null, // drop the source vector; keyword search still works
    metadata: { ...(src.metadata || {}), goal_id: newGoalId, demo_seed: true },
  };
}

/**
 * Read the source account's rich goals + children and return demo-owned, inert,
 * reparented collections. Deterministic given the same source data.
 */
export async function buildClonedGoals(admin, { demoUserId, sourceUserId = DEMO_SOURCE_USER_ID }) {
  const { data: srcGoals, error } = await admin
    .from('goals')
    .select('*')
    .eq('user_id', sourceUserId);
  if (error) throw new Error(`clone: reading source goals failed: ${error.message}`);

  const rich = (srcGoals || [])
    .filter(isRichGoal)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  const goalIdMap = {};
  const goals = rich.map((g, i) => {
    const ng = reparentGoal(g, { demoUserId, index: i });
    goalIdMap[g.id] = ng.id;
    return ng;
  });
  const srcIds = rich.map((g) => g.id);
  if (!srcIds.length) {
    return {
      goals: [],
      goalLogs: [],
      tasks: [],
      llmUsage: [],
      goalMessages: [],
      knowledgeDocs: [],
      deliverables: [],
    };
  }

  const [gl, tt, lu, gm, allKb] = await Promise.all([
    admin.from('goal_log').select('*').in('goal_id', srcIds),
    admin.from('team_tasks').select('*').in('goal_id', srcIds),
    admin.from('llm_usage').select('*').in('goal_id', srcIds),
    admin.from('goal_messages').select('*').in('goal_id', srcIds),
    admin.from('knowledge_documents').select('*').eq('user_id', sourceUserId).limit(400),
  ]);

  const goalLogs = (gl.data || []).map((r) => reparentGoalLog(r, { goalIdMap }));
  const tasks = (tt.data || []).map((r) => reparentTask(r, { goalIdMap, demoUserId }));
  const llmUsage = (lu.data || []).map((r) => reparentLlm(r, { goalIdMap, demoUserId }));
  const goalMessages = (gm.data || []).map((r) => reparentGoalMsg(r, { goalIdMap }));
  const knowledgeDocs = (allKb.data || [])
    .filter((d) => srcIds.includes(d.metadata?.goal_id))
    .map((r) => reparentKb(r, { goalIdMap, demoUserId }));

  // Source has no deliverables for these goals — fabricate one 'deployed' per completed goal.
  const delTypes = ['website', 'report', 'marketing_campaign', 'content_package'];
  const deliverables = goals
    .filter((g) => g.status === 'completed')
    .map((g, i) => ({
      id: stableUuid(`${g.id}:deliv`),
      goal_id: g.id,
      user_id: demoUserId,
      type: delTypes[i % delTypes.length],
      title: `${g.title} — deliverable`.slice(0, 120),
      description: 'Shipped output for this goal.',
      status: 'deployed',
      url: 'https://example.com/demo/' + g.id.slice(0, 8),
      deployment_data: { demo_seed: true },
      assets: [],
      created_at: g.created_at,
    }));

  return { goals, goalLogs, tasks, llmUsage, goalMessages, knowledgeDocs, deliverables };
}
