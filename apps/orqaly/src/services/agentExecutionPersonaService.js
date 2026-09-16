/**
 * Build Agent Hub presentation records from goal-scoped task overlays.
 * Permanent agent_profiles rows remain unchanged.
 */
import { PREDEFINED_TOOLS } from '../config/predefinedTools.js';

const KNOWN_TOOL_IDS = new Set(PREDEFINED_TOOLS.map((tool) => tool.id));

function normalizeToolIds(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    let id = raw;
    if (!raw.startsWith('tool-') && !raw.startsWith('mcp-')) {
      id = KNOWN_TOOL_IDS.has(`tool-${raw}`)
        ? `tool-${raw}`
        : KNOWN_TOOL_IDS.has(`mcp-${raw}`)
          ? `mcp-${raw}`
          : `tool-${raw}`;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function getAgentExecutionPersonas(tasks = [], goals = [], selectedAgentIds = []) {
  // A goal can intentionally assign several agents and several goal-specific
  // roles. Collapse only repeated task observations of the same agent+role,
  // never the entire goal into one overlay.
  const byAgentRole = new Map();
  const goalsById = new Map((goals || []).map((goal) => [String(goal.id), goal]));
  for (const task of tasks || []) {
    const context = task?.axwise_execution_context || task?.data?.axwise_execution_context;
    if (!context?.customer_persona || !context?.execution_persona) continue;
    const goalId = String(task.goal_id || task.data?.goal_id || context.step_id || task.id);
    const goal = goalsById.get(goalId);
    const executionApproval = goal?.data?.goal_approvals?.execution;
    const executionAuthorization = goal?.data?.execution_authorization;
    const manifestTask = executionApproval?.snapshot?.authorization_manifest?.tasks?.find(
      (item) => String(item.task_id) === String(task.id)
    );
    const taskAgentId = task.agentId || task.agent_id || context.assignment?.agent_id || null;
    const executionRole = String(
      context.execution_persona?.role ||
        context.assignment?.role ||
        task.required_role ||
        'Goal executor'
    ).trim();
    const overlayKey = [goalId, taskAgentId || 'unassigned', executionRole.toLowerCase()].join(
      '::'
    );
    const currentRequiredTools = normalizeToolIds(
      task.tool_requirements || task.data?.tool_requirements || []
    );
    const authorized =
      executionApproval?.status === 'approved' &&
      Boolean(executionApproval.snapshot_hash) &&
      executionAuthorization?.status === 'approved' &&
      executionAuthorization.snapshot_hash === executionApproval.snapshot_hash &&
      context.authorization_snapshot_hash === executionApproval.snapshot_hash &&
      String(context.authorization_task_id || '') === String(task.id || '') &&
      String(context.authorization_agent_id || '') === String(taskAgentId || '') &&
      Boolean(manifestTask) &&
      String(manifestTask.agent_id || '') === String(taskAgentId || '') &&
      JSON.stringify(manifestTask.research_contract || null) ===
        JSON.stringify(context.research_contract || null) &&
      JSON.stringify(manifestTask.required_tool_ids || []) ===
        JSON.stringify(currentRequiredTools) &&
      JSON.stringify(manifestTask.granted_tool_ids || []) ===
        JSON.stringify(context.authorization_granted_tool_ids || []);
    const item = {
      overlayKey,
      goalId,
      agentId: taskAgentId ? String(taskAgentId) : null,
      agentName:
        context.assignment?.agent_name ||
        context.assignment?.name ||
        task.agent_name ||
        task.data?.agent_name ||
        null,
      executionRole,
      goalTitle:
        task.goal_title || task.data?.goal_title || goal?.title || task.title || 'Goal assignment',
      phaseName: task.phase_name || task.data?.phase_name || '',
      customerPersona: context.customer_persona,
      executionPersona: context.execution_persona,
      assignment: context.assignment || {},
      decisionId: context.decision_id || null,
      sourceJobId: context.source_job_id || null,
      presentationStatus: authorized ? 'authorized_overlay' : 'pending_execution_approval',
      authorizationStatus: authorized ? 'approved' : 'pending_execution_approval',
      authoritative: authorized,
      assignable: authorized,
      executable: authorized,
      updatedAt: task.updatedAt || task.updated_at || task.createdAt || task.created_at || '',
    };
    const prior = byAgentRole.get(overlayKey);
    if (!prior || new Date(item.updatedAt || 0) >= new Date(prior.updatedAt || 0)) {
      byAgentRole.set(overlayKey, item);
    }
  }

  const selected = new Set((selectedAgentIds || []).filter(Boolean).map(String));
  for (const goal of goals || []) {
    const hypothesis = goal?.data?.axwise_customer_intelligence?.working_hypothesis;
    const resolution = hypothesis?.persona_resolution;
    const recommended = resolution?.recommended_agent;
    if (!resolution?.customer_persona || !resolution?.ideal_agent_persona) continue;
    if (!recommended?.agent_id || !selected.has(String(recommended.agent_id))) continue;
    const goalId = String(goal.id);
    const executionRole = String(resolution.ideal_agent_persona?.role || 'Goal executor').trim();
    const overlayKey = [goalId, String(recommended.agent_id), executionRole.toLowerCase()].join(
      '::'
    );
    if (byAgentRole.has(overlayKey)) continue;
    byAgentRole.set(overlayKey, {
      overlayKey,
      goalId,
      agentId: String(recommended.agent_id),
      agentName: recommended.agent_name || recommended.name || null,
      executionRole,
      goalTitle: goal.title || 'Goal working hypothesis',
      phaseName: '',
      customerPersona: resolution.customer_persona,
      executionPersona: resolution.ideal_agent_persona,
      assignment: { ...recommended, applied: false },
      decisionId: hypothesis.decision_id || null,
      sourceJobId: goal.data?.axwise_customer_intelligence?.job_id || null,
      presentationStatus: hypothesis.review_status || 'awaiting_verification',
      authorizationStatus: 'unverified_hypothesis',
      authoritative: false,
      assignable: false,
      executable: false,
      updatedAt: hypothesis.created_at || goal.updated_at || goal.created_at || '',
    });
  }
  return [...byAgentRole.values()].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
}
