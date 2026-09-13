/**
 * [module: agent-core]
 * Shared goal-clone logic for pulse repeat_goal entries (same_team / consilium).
 */
import { generateId } from '../goal-handlers/_helpers.js';
import { normalizeGoalHitlMode } from '../goal-handlers/hitl-policy.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';

const BLOCKED_STATUSES = new Set(['cancelled', 'failed']);

export async function resolveSourceTeamId(admin, src) {
  if (src.agent_team_id) return src.agent_team_id;
  if (src.executor_type === 'team' && src.executor_id) return src.executor_id;
  if (src.team_id) return src.team_id;

  const { data: tasks } = await admin
    .from('team_tasks')
    .select('agent_id')
    .eq('goal_id', src.id)
    .not('agent_id', 'is', null);
  const agentIds = [...new Set((tasks || []).map((t) => t.agent_id).filter(Boolean))];
  if (!agentIds.length) return null;

  const newTeamId = generateId('team');
  await admin.from('agent_teams').insert({
    id: newTeamId,
    user_id: src.user_id,
    name: `Pulse · ${(src.title || 'goal').slice(0, 40)}`,
    description: `Re-run team cloned from goal ${src.id}`,
    leader_id: agentIds[0],
    goal_id: null,
    is_active: true,
  });
  await admin.from('agent_team_members').insert(
    agentIds.map((memberId, i) => ({
      team_id: newTeamId,
      member_id: memberId,
      user_id: src.user_id,
      role: i === 0 ? 'lead' : 'member',
    }))
  );
  return newTeamId;
}

export async function resolveConciliumBoardId(admin, src, conciliumId) {
  let boardId = conciliumId || src.concilium_id || null;
  if (!boardId && src.org_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('consilium_id')
      .eq('id', src.org_id)
      .single();
    boardId = org?.concilium_id || null;
  }
  return boardId;
}

export function buildFeasibilityJobPayload(goalId, userId, insert, src, mode) {
  return {
    type: 'orchestrate-goal',
    action: 'feasibility-analysis',
    goalId,
    _userId: userId,
    context: {
      parsed_category: insert.parsed_category,
      parsed_priority: insert.parsed_priority,
      parsed_requirements: insert.parsed_requirements,
      executor_type: insert.executor_type,
      org_id: insert.org_id,
      executor_id: insert.executor_id,
      concilium_id: insert.concilium_id,
      pulse_of: src.id,
      pulse_mode: mode,
    },
  };
}

/**
 * Build a goal insert row for same_team / consilium pulse modes.
 * @returns {Promise<{ goalRow: object, mode: string, jobPayload: object } | { error: string }>}
 */
export async function buildPulseGoalInsert(
  admin,
  src,
  { repeat_mode, concilium_id, pulse_id, pulse_owner }
) {
  if (!src?.id || !src.user_id) return { error: 'source goal missing' };
  if (BLOCKED_STATUSES.has(src.status)) return { error: 'source goal is cancelled or failed' };
  if (hasNativeAxwiseScopeMarkers(src)) {
    return { error: 'native source requires a newly confirmed AxWise scope' };
  }
  if (!['same_team', 'consilium'].includes(repeat_mode)) {
    return { error: 'invalid repeat_mode' };
  }

  const pulseData = {
    pulse_of: src.id,
    pulse_mode: repeat_mode,
    pulse_created_at: new Date().toISOString(),
    pulse_id: pulse_id || null,
    pulse_owner: pulse_owner || null,
  };
  if (src.data?.test_model) pulseData.test_model = src.data.test_model;
  if (src.data?.local_only) pulseData.local_only = true;

  const baseInsert = {
    user_id: src.user_id,
    title: `Pulse: ${src.title || 'Goal'}`,
    description: src.description || '',
    target_value: src.target_value || null,
    target_unit: src.target_unit || 'usd',
    budget_usd: src.budget_usd || 10,
    status: 'feasibility',
    max_iterations: 3,
    parsed_category: src.parsed_category || null,
    parsed_priority: src.parsed_priority || 'medium',
    parsed_requirements: src.parsed_requirements || '',
    complexity: src.complexity || 'simple',
    execution_mode: src.execution_mode || 'auto',
    hitl_mode: normalizeGoalHitlMode(src.hitl_mode),
    mode: src.mode || 'simple',
    po_depth: src.po_depth || 'standard',
    org_id: src.org_id || null,
    unit_id: src.unit_id || null,
    workflow_id: src.workflow_id || null,
    theory_mode: src.theory_mode === true,
    loop_enabled: false,
    data: pulseData,
  };

  if (repeat_mode === 'same_team') {
    const teamId = await resolveSourceTeamId(admin, src);
    if (!teamId) {
      return { error: 'No team found on this goal — run it once or assign a team first.' };
    }
    baseInsert.executor_type = 'team';
    baseInsert.executor_id = teamId;
    baseInsert.concilium_id = src.concilium_id || null;
  } else {
    const boardId = await resolveConciliumBoardId(admin, src, concilium_id);
    if (!boardId) {
      return { error: 'Select a Consilium board to assign fresh agents.' };
    }
    baseInsert.executor_type = 'consilium';
    baseInsert.concilium_id = boardId;
    baseInsert.executor_id = null;
    baseInsert.mode = 'advanced';
  }

  return {
    goalRow: baseInsert,
    mode: repeat_mode,
    jobPayload: buildFeasibilityJobPayload(null, src.user_id, baseInsert, src, repeat_mode),
  };
}
