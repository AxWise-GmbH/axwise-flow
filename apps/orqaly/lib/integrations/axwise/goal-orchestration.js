/**
 * Goal -> AxWise Phase 1-3 bridge.
 *
 * Orqaly remains the authority. This module snapshots the live Orqaly goal,
 * plan, team, tools and budget, requests an immutable AxWise decision, then
 * revalidates every returned agent and tool before exposing an assignment map
 * to team-formation. Shadow mode never changes execution.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createOrchestrationDecision } from './orchestration-client.js';
import { axwiseEnforcement, isAxwiseEnabled } from './config.js';
import { isAxwiseUserDisabled } from './user-flag.js';
import { normalizeAgentAvailability } from './customer-intelligence.js';
import { CREDENTIAL_FREE_DOCUMENT_TOOL_ID, normalizeToolId } from '../../_shared/tool-ids.js';
import { goalSkipsTools } from '../../_shared/goal-tool-policy.js';
import {
  executionCapabilityAliases,
  formatExecutionRole,
} from '../../goal-handlers/team-assigner.js';
import { resolveAcceptedNativeGoalAuthority } from '../../_shared/native-goal-authority.js';

const NON_EXECUTOR_NAMES = new Set(['Team Lead', 'Project Manager']);
const ORQALY_GOAL_EXECUTOR_CAPABILITY = 'orqaly_goal_executor';

function unique(values) {
  return [
    ...new Set(
      (values || [])
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ];
}

function normalizeExactCapability(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();
}

function requireMaximum(label, values, maximum) {
  if (values.length > maximum) {
    throw new Error(`${label} exceeds the AxWise contract maximum of ${maximum}`);
  }
  return values;
}

function boundedText(value, fallback, maxLength) {
  const text = String(value || '').trim();
  return (text.length >= 3 ? text : fallback).slice(0, maxLength);
}

/**
 * Project a native goal onto the one accepted AxWise authority before building
 * another AxWise request. Historical goal prose, PO output, feasibility, and
 * persona records remain audit history; they must never steer routing after
 * the canonical scope packet has been accepted.
 */
export function goalOrchestrationAuthorityView(goal) {
  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (!authority.native) return goal;
  if (!authority.ready) {
    throw new Error(
      `Native AxWise orchestration authority is invalid: ${authority.reasons.join(', ')}`
    );
  }

  const packet = authority.packet;
  const requirements = (packet.ledger?.requirements || [])
    .map((item) => String(item?.text || '').trim())
    .filter(Boolean);
  const constraints = (packet.ledger?.constraints || [])
    .map((item) => String(item?.text || item?.constraint || item || '').trim())
    .filter(Boolean);
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  // The resolver above proved this exact context approval is current. Persona
  // and upstream lineage are therefore projected from its immutable snapshot,
  // never from the mutable live intelligence object or historical goal prose.
  const approvedContext = goal?.data?.goal_approvals?.context?.snapshot || {};
  return {
    ...goal,
    title: packet.intent.objective,
    description: packet.intent.desired_outcome,
    parsed_category: authority.route.playbook_id,
    parsed_requirements: [...requirements, ...constraints].join('\n'),
    feasibility_report: null,
    tech_doc: {
      required_capabilities: authority.admission?.required_capabilities || [],
    },
    data: {
      retry_count: Number(goal?.data?.retry_count || 0),
      tool_mode: goal?.data?.tool_mode,
      skip_tools: goal?.data?.skip_tools === true,
      required_tools: goal?.data?.required_tools || [],
      unconfigured_tools: goal?.data?.unconfigured_tools || [],
      team_formation_log: goal?.data?.team_formation_log || null,
      axwise_customer_intelligence: {
        generation: intelligence.generation,
        updated_at: intelligence.updated_at,
        decision_id: approvedContext.decision_id || null,
        request_hash: approvedContext.request_hash || null,
        routing_mode: approvedContext.routing_mode || null,
        routing_assessment: approvedContext.routing_assessment || null,
        degraded: approvedContext.degraded === true,
        degraded_reason: approvedContext.degraded_reason || null,
        persona_resolution: approvedContext.persona_resolution || null,
        research_bundle: approvedContext.research_bundle || null,
        scope_packet: packet,
        scope_validation: intelligence.scope_validation,
        axwise_scope_confirmation: intelligence.axwise_scope_confirmation,
      },
    },
  };
}

/**
 * Carry the exact role assignments already accepted by local team formation
 * into the AxWise catalogue snapshot. Team formation may conservatively map a
 * compound planning role (for example "AI Product Manager / Lead Technical
 * Writer") to an existing Product Manager. Without this bounded evidence,
 * AxWise sees the hard plan capability but only the agent's base role and
 * rejects an otherwise locally authorized owner.
 *
 * Only exact roles in the current plan and exact current member names are
 * accepted. Stale, invented, or unmatched log entries cannot widen authority.
 */
function membersWithTeamFormationRoles(goal, members = []) {
  const memberList = Array.isArray(members) ? members : [];
  const memberNameCounts = new Map();
  for (const member of memberList) {
    const key = normalizeExactCapability(member?.name);
    if (key) memberNameCounts.set(key, (memberNameCounts.get(key) || 0) + 1);
  }
  const planRoles = new Map();
  for (const phase of Array.isArray(goal?.plan?.phases) ? goal.plan.phases : []) {
    for (const job of Array.isArray(phase?.jobs) ? phase.jobs : []) {
      const role = String(job?.required_role || '').trim();
      const key = normalizeExactCapability(role);
      if (key) planRoles.set(key, role);
    }
  }

  const rolesByAgent = new Map();
  const mappings = Array.isArray(goal?.data?.team_formation_log?.matchedRoles)
    ? goal.data.team_formation_log.matchedRoles
    : [];
  for (const mapping of mappings) {
    if (mapping?.via !== 'role') continue;
    const role = planRoles.get(normalizeExactCapability(mapping?.role));
    const agentKey = normalizeExactCapability(mapping?.agent);
    if (!role || !agentKey || memberNameCounts.get(agentKey) !== 1) continue;
    const roles = rolesByAgent.get(agentKey) || [];
    roles.push(role);
    rolesByAgent.set(agentKey, unique(roles));
  }

  return memberList.map((member) => {
    const mappedRoles = rolesByAgent.get(normalizeExactCapability(member?.name)) || [];
    if (!mappedRoles.length) return member;
    return {
      ...member,
      capabilities: unique([...(member?.capabilities || []), ...mappedRoles]),
    };
  });
}

function hasExactPlanOwner(goal, members) {
  const planRoles = (Array.isArray(goal?.plan?.phases) ? goal.plan.phases : [])
    .flatMap((phase) => (Array.isArray(phase?.jobs) ? phase.jobs : []))
    .map((job) => formatExecutionRole(job?.required_role))
    .filter(Boolean);
  return planRoles.every((role) =>
    (Array.isArray(members) ? members : []).some((member) =>
      executionCapabilityAliases(member).some(
        (capability) => normalizeExactCapability(capability) === normalizeExactCapability(role)
      )
    )
  );
}

async function goalWithPersistedTeamFormationLog(admin, goal, members) {
  if (
    Array.isArray(goal?.data?.team_formation_log?.matchedRoles) ||
    hasExactPlanOwner(goal, members)
  ) {
    return goal;
  }
  const { data: persisted, error } = await admin
    .from('goals')
    .select('data')
    .eq('id', goal.id)
    .single();
  if (error) throw error;
  const teamFormationLog = persisted?.data?.team_formation_log;
  if (!Array.isArray(teamFormationLog?.matchedRoles)) return goal;
  return {
    ...goal,
    data: {
      ...(goal?.data || {}),
      team_formation_log: teamFormationLog,
    },
  };
}

function actionFor(job = {}) {
  const raw = job.deliverable_type || job.category || 'goal_step';
  return `produce_${
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'goal_step'
  }`;
}

export function goalPlanSteps(goal) {
  const phases = Array.isArray(goal?.plan?.phases) ? goal.plan.phases : [];
  const toolsSkipped = goalSkipsTools(goal);
  const steps = [];
  let priorPhaseIds = [];

  phases.forEach((phase, phaseIndex) => {
    const currentPhaseIds = [];
    const jobs = Array.isArray(phase?.jobs) ? phase.jobs : [];
    jobs.forEach((job, jobIndex) => {
      const stepId = `phase-${phaseIndex + 1}-job-${jobIndex + 1}`;
      currentPhaseIds.push(stepId);
      const requiredTools = toolsSkipped
        ? []
        : unique((job.tool_requirements || []).map(normalizeToolId));
      // The planned role is part of the execution contract. Treating it as a
      // preference let AxWise report full coverage while assigning pricing,
      // GDPR and sales work to a generic QA agent. Persistent specialists are
      // materialized before this call, so the role can be a hard capability.
      const requiredCapabilities = unique([
        ORQALY_GOAL_EXECUTOR_CAPABILITY,
        formatExecutionRole(job.required_role),
        ...(job.axwise_required_capabilities || job.required_capabilities || []),
      ]);
      const preferredCapabilities = unique([job.category]);
      const completionCriteria = Array.isArray(job.acceptance_criteria)
        ? unique(job.acceptance_criteria)
        : [];
      steps.push({
        step_id: stepId,
        title: boundedText(job.title, `${phase?.name || 'Goal'} step`, 500),
        objective: boundedText(
          job.description || job.requirements || job.title,
          'Complete the goal step',
          4000
        ),
        required_capabilities: requiredCapabilities,
        preferred_capabilities: preferredCapabilities,
        required_tools: requiredTools,
        requested_actions: [actionFor(job)],
        dependencies: [...priorPhaseIds],
        input_contract: { goal_id: 'string', prior_phase_outputs: 'array' },
        output_contract: { deliverable: job.deliverable_type || 'markdown' },
        completion_criteria: completionCriteria.length
          ? completionCriteria.slice(0, 50)
          : [`${String(job.title || 'Goal step').slice(0, 300)} is complete and reviewable`],
        review_rules: ['Orqaly validates ownership, tools, budget and output before execution'],
        budget: { currency: 'USD' },
      });
    });
    if (currentPhaseIds.length) priorPhaseIds = currentPhaseIds;
  });

  return steps;
}

function riskFromGoal(goal) {
  const text = `${goal?.parsed_priority || ''} ${goal?.complexity || ''}`.toLowerCase();
  if (text.includes('critical')) return 'critical';
  if (text.includes('high') || text.includes('complex')) return 'high';
  if (text.includes('low') || text.includes('simple')) return 'low';
  return 'medium';
}

function urgencyFromGoal(goal) {
  const priority = String(goal?.parsed_priority || '').toLowerCase();
  if (priority === 'critical' || priority === 'urgent') return 'critical';
  if (priority === 'high') return 'high';
  if (priority === 'low') return 'low';
  return 'normal';
}

function buildEvidence(goal) {
  const items = [];
  const resolution = goal?.data?.axwise_customer_intelligence?.persona_resolution;
  const idealCapabilities = unique(resolution?.ideal_agent_persona?.required_capabilities || []);
  if (goal?.feasibility_report) {
    items.push({
      reference_id: `orqaly:goal:${goal.id}:feasibility`,
      provenance: 'operational',
      relevance: 0.85,
      quality: 0.75,
      verified: true,
      verification_source: 'orqaly_asserted',
      capability_hints: unique(goal?.tech_doc?.required_capabilities || []).slice(0, 100),
      classification: 'internal',
    });
  }
  if (goal?.plan) {
    items.push({
      reference_id: `orqaly:goal:${goal.id}:plan:${Number(goal.iteration || 0)}`,
      provenance: 'operational',
      relevance: 0.95,
      quality: 0.8,
      verified: true,
      verification_source: 'orqaly_asserted',
      capability_hints: unique(goal?.tech_doc?.required_capabilities || []).slice(0, 100),
      classification: 'internal',
    });
  }
  for (const [index, item] of (resolution?.customer_persona?.evidence || [])
    .slice(0, 23)
    .entries()) {
    const quote = String(item?.quote || '');
    if (!quote) continue;
    const documentId = String(item.document_id || 'axwise-persona');
    const start = Number.isFinite(Number(item.start_char)) ? Number(item.start_char) : null;
    const end = Number.isFinite(Number(item.end_char)) ? Number(item.end_char) : null;
    items.push({
      reference_id: `axwise:customer:${documentId}:${start ?? 'na'}:${end ?? 'na'}:${index}`,
      provenance: 'synthetic',
      content_hash: createHash('sha256').update(quote).digest('hex'),
      relevance: 0.9,
      quality: 0.85,
      verified: start != null && end != null,
      verification_source: start != null && end != null ? 'axwise_audit' : 'none',
      capability_hints: idealCapabilities.slice(0, 100),
      classification: 'internal',
    });
  }
  return items;
}

export function buildGoalOrchestrationRequest({
  goal,
  members,
  tools = [],
  requestId = randomUUID(),
}) {
  goal = goalOrchestrationAuthorityView(goal);
  if (!goal?.id || !goal?.user_id || !goal?.org_id) {
    throw new Error('Goal id, user_id and org_id are required for AxWise orchestration');
  }
  const steps = goalPlanSteps(goal);
  if (!steps.length) throw new Error('Goal plan has no executable jobs');
  requireMaximum('Goal plan', steps, 50);
  requireMaximum('Agent catalogue', members || [], 500);
  requireMaximum('Tool catalogue', tools, 500);

  const toolIds = new Set(tools.filter((tool) => tool.available).map((tool) => tool.tool_id));
  const allMembers = membersWithTeamFormationRoles(goal, members);
  const executors = allMembers.filter((member) => !NON_EXECUTOR_NAMES.has(member?.name));
  const candidates = executors.length ? executors : allMembers;
  const remainingBudget = Math.max(0, Number(goal.budget_usd || 0) - Number(goal.spent_usd || 0));
  const requiredCapabilities = unique(steps.flatMap((step) => step.required_capabilities));
  const requiredTools = unique(steps.flatMap((step) => step.required_tools));
  // Gate 2 already grants the credential-free document generator only to the
  // assigned agent of an exact task that declares it. Mirror that bounded
  // platform grant in the earlier AxWise catalogue snapshot so newly
  // materialized specialists remain eligible for document tasks without
  // widening their persistent Agent Hub metadata. No other internal,
  // credentialed, networked, or side-effecting tool receives this treatment.
  const goalScopedPlatformToolIds =
    requiredTools.includes(CREDENTIAL_FREE_DOCUMENT_TOOL_ID) &&
    toolIds.has(CREDENTIAL_FREE_DOCUMENT_TOOL_ID)
      ? [CREDENTIAL_FREE_DOCUMENT_TOOL_ID]
      : [];
  const requestedActions = unique(steps.flatMap((step) => step.requested_actions));
  requireMaximum('Task capability catalogue', requiredCapabilities, 100);
  requireMaximum('Task tool catalogue', requiredTools, 100);
  requireMaximum('Task action catalogue', requestedActions, 100);
  const risk = riskFromGoal(goal);
  const personaResolution = goal?.data?.axwise_customer_intelligence?.persona_resolution;
  const customerPersona = personaResolution?.customer_persona;
  const idealAgentPersona = personaResolution?.ideal_agent_persona;

  const availableAgents = candidates.map((member) => {
    const completed = Number(member.tasks_completed || 0);
    const failed = Number(member.tasks_failed || 0);
    const observed = completed + failed;
    const successRate =
      observed > 0
        ? completed / observed
        : Number(member.avg_quality || 0) > 0
          ? Math.min(1, Number(member.avg_quality) / 100)
          : null;
    const authorizedToolIds = unique(
      [
        ...(Array.isArray(member?.metadata?.tools) ? member.metadata.tools : []),
        ...goalScopedPlatformToolIds,
      ]
        .map(normalizeToolId)
        .filter((toolId) => toolIds.has(toolId))
    );
    return {
      agent_id: String(member.id),
      org_id: String(goal.org_id),
      name: String(member.name || member.id),
      capabilities: unique([
        ORQALY_GOAL_EXECUTOR_CAPABILITY,
        ...executionCapabilityAliases(member),
      ]).slice(0, 200),
      // AxWise interprets these as per-agent grants, not as a catalogue of
      // globally configured tools. Only advertise the intersection of the
      // agent's own allow-list and the live available tool snapshot.
      tool_ids: authorizedToolIds.slice(0, 100),
      availability: normalizeAgentAvailability(
        member.metadata?.availability_status || member.status || 'available'
      ),
      estimated_cost: Math.max(0, Number(member.cost_per_task || 0)),
      ...(successRate == null ? {} : { success_rate: successRate }),
      max_data_classification: 'internal',
      max_risk_level: 'critical',
      stakeholder_tags: unique([goal.parsed_category, customerPersona?.name]),
      collaboration_tags: ['orqaly-goal-team'],
    };
  });

  return {
    contract_version: '1.0',
    tenant: { userId: String(goal.user_id), orgId: String(goal.org_id) },
    upstream_decision_id: goal?.data?.axwise_customer_intelligence?.decision_id || null,
    task: {
      contract_version: '1.0',
      task_id: String(goal.id),
      objective: boundedText(goal.title, 'Complete Orqaly goal', 8000),
      desired_outcome: boundedText(
        goal.description || goal.parsed_requirements || goal.title,
        'Completed Orqaly goal',
        8000
      ),
      domain: String(goal.parsed_category || 'general_operations').slice(0, 120),
      task_class: 'orqaly_goal',
      capability_profile: String(goal.complexity || 'general').slice(0, 120),
      required_capabilities: requiredCapabilities,
      preferred_capabilities: unique([
        ...(goal?.tech_doc?.required_capabilities || []),
        ...(idealAgentPersona?.required_capabilities || []),
      ]).slice(0, 100),
      required_tools: requiredTools,
      requested_actions: requestedActions,
      stakeholders: unique([goal.parsed_category || 'goal_owner', customerPersona?.name]),
      constraints: unique([
        goal.parsed_requirements,
        ...(idealAgentPersona?.operating_principles || []),
        'AxWise recommendations require Orqaly live-state authorization before execution',
      ]).slice(0, 100),
      data_classification: 'internal',
      risk_level: risk,
      urgency: urgencyFromGoal(goal),
      reversibility: requestedActions.some((action) =>
        /deploy|send|publish|payment|delete/.test(action)
      )
        ? 'partially_reversible'
        : 'reversible',
    },
    available_agents: availableAgents,
    available_tools: tools,
    policy_context: {
      human_approval_required_for: requestedActions.filter((action) =>
        /deploy|send|publish|payment|delete/.test(action)
      ),
      maximum_risk_without_human: 'medium',
      guardrails: [
        'Use only agents and tools from the authenticated Orqaly catalogue snapshot',
        'Do not execute external side effects; Orqaly authorizes and executes',
      ],
    },
    budget: { currency: 'USD', maximum_cost: remainingBudget },
    evidence_catalogue: buildEvidence(goal),
    research_policy: {
      allow_existing_evidence: true,
      allow_hybrid_research: false,
      maximum_research_iterations: 0,
      maximum_evidence_items: 25,
    },
    planning: {
      pattern: steps.length === 1 ? 'single' : 'parallel',
      steps,
      maximum_team_size: Math.max(1, Math.min(50, availableAgents.length || 1)),
      required_collaboration_tags: ['orqaly-goal-team'],
      total_budget: { currency: 'USD', maximum_cost: remainingBudget },
    },
    // Kept outside the wire request by orchestrateGoalWithAxwise. Useful to
    // callers/tests for correlating local jobs with returned plan nodes.
    _orqaly: { requestId },
  };
}

export function authorizeGoalDecision({
  decision,
  members,
  tools,
  steps = [],
  enforcement = 'shadow',
}) {
  const allMembers = Array.isArray(members) ? members : [];
  const executors = allMembers.filter((member) => !NON_EXECUTOR_NAMES.has(member?.name));
  const authorizedMembers = executors.length ? executors : allMembers;
  const memberIds = new Set(authorizedMembers.map((member) => String(member.id)));
  const availableToolIds = new Set(
    (tools || []).filter((tool) => tool.available).map((tool) => tool.tool_id)
  );
  const goalScopedDocumentGrant =
    availableToolIds.has(CREDENTIAL_FREE_DOCUMENT_TOOL_ID) &&
    (steps || []).some((step) =>
      (step.required_tools || []).includes(CREDENTIAL_FREE_DOCUMENT_TOOL_ID)
    );
  const authorizedToolIdsByAgent = new Map(
    authorizedMembers.map((member) => [
      String(member.id),
      new Set(
        unique(
          [
            ...(Array.isArray(member?.metadata?.tools) ? member.metadata.tools : []),
            ...(goalScopedDocumentGrant ? [CREDENTIAL_FREE_DOCUMENT_TOOL_ID] : []),
          ].map(normalizeToolId)
        ).filter((toolId) => availableToolIds.has(toolId))
      ),
    ])
  );
  const normalizedCapabilitiesByAgent = new Map(
    authorizedMembers.map((member) => [
      String(member.id),
      new Set(
        unique([ORQALY_GOAL_EXECUTOR_CAPABILITY, ...executionCapabilityAliases(member)]).map(
          normalizeExactCapability
        )
      ),
    ])
  );
  const nodes = Array.isArray(decision?.execution_plan?.nodes) ? decision.execution_plan.nodes : [];
  const expectedSteps = new Map((steps || []).map((step) => [String(step.step_id), step]));
  const seenNodeIds = new Set();
  const rejections = [];
  const assignments = {};

  for (const node of nodes) {
    const nodeId = String(node.node_id || '');
    if (seenNodeIds.has(nodeId)) {
      rejections.push({ code: 'invalid_plan', node_id: nodeId, reason: 'duplicate plan node' });
      continue;
    }
    seenNodeIds.add(nodeId);
    const expectedStep = expectedSteps.get(nodeId);
    if (expectedSteps.size && !expectedStep) {
      rejections.push({ code: 'invalid_plan', node_id: nodeId, reason: 'unexpected plan node' });
      continue;
    }
    if (!memberIds.has(String(node.assigned_agent_id))) {
      rejections.push({
        code: 'agent_not_owned',
        node_id: nodeId,
        agent_id: node.assigned_agent_id,
      });
      continue;
    }
    const assignedCapabilities =
      normalizedCapabilitiesByAgent.get(String(node.assigned_agent_id)) || new Set();
    const missingCapability = (expectedStep?.required_capabilities || []).find(
      (capability) => !assignedCapabilities.has(normalizeExactCapability(capability))
    );
    if (missingCapability) {
      rejections.push({
        code: 'agent_capability_mismatch',
        node_id: nodeId,
        agent_id: node.assigned_agent_id,
        capability: missingCapability,
      });
      continue;
    }
    const nodeToolIds = unique(node.tool_ids || []);
    const unavailableTool = nodeToolIds.find((toolId) => !availableToolIds.has(toolId));
    if (unavailableTool) {
      rejections.push({ code: 'tool_unavailable', node_id: nodeId, tool_id: unavailableTool });
      continue;
    }
    const agentToolIds = authorizedToolIdsByAgent.get(String(node.assigned_agent_id)) || new Set();
    const unauthorizedTool = nodeToolIds.find((toolId) => !agentToolIds.has(toolId));
    if (unauthorizedTool) {
      rejections.push({
        code: 'tool_not_authorized',
        node_id: nodeId,
        agent_id: node.assigned_agent_id,
        tool_id: unauthorizedTool,
      });
      continue;
    }
    const missingTool = (expectedStep?.required_tools || []).find(
      (toolId) => !nodeToolIds.includes(toolId)
    );
    if (missingTool) {
      rejections.push({
        code: 'invalid_plan',
        node_id: nodeId,
        tool_id: missingTool,
        reason: 'required tool omitted',
      });
      continue;
    }
    assignments[nodeId] = String(node.assigned_agent_id);
  }

  for (const stepId of expectedSteps.keys()) {
    if (!seenNodeIds.has(stepId)) {
      rejections.push({
        code: 'invalid_plan',
        node_id: stepId,
        reason: 'required plan node omitted',
      });
    }
  }

  const recommended =
    decision?.status === 'recommended' &&
    decision?.requires_orqaly_authorization === true &&
    decision?.execution_plan?.executable === true &&
    decision?.plan_feasibility?.feasible === true &&
    nodes.length > 0 &&
    rejections.length === 0;

  return {
    applied: enforcement === 'authoritative' && recommended,
    recommended,
    assignments,
    feasible: recommended && rejections.length === 0,
    rejections,
  };
}

async function loadGoalTools(admin, goal, steps, toolInfo = {}) {
  const requiredIds = unique(steps.flatMap((step) => step.required_tools));
  if (!requiredIds.length) return [];
  let rows = [];
  try {
    const { data, error } = await admin
      .from('tools')
      .select('id, name, status, connection_type, data')
      .eq('user_id', goal.user_id)
      .in('id', requiredIds);
    if (!error) rows = data || [];
  } catch {
    rows = [];
  }
  const byId = new Map(rows.map((row) => [row.id, row]));

  return requiredIds.map((toolId) => {
    const row = byId.get(toolId);
    const definition = toolInfo[toolId] || {};
    const internal = (row?.connection_type || definition.connection_type) === 'internal';
    const available = internal || row?.status === 'active';
    const allowedActions = unique(
      steps
        .filter((step) => step.required_tools.includes(toolId))
        .flatMap((step) => step.requested_actions)
    );
    return {
      tool_id: toolId,
      org_id: String(goal.org_id),
      name: String(row?.name || definition.name || toolId),
      available,
      allowed_actions: allowedActions.slice(0, 100),
      allowed_data_classifications: ['internal'],
      requires_approval: allowedActions.some((action) =>
        /deploy|send|publish|payment|delete/.test(action)
      ),
    };
  });
}

async function persistGoalOrchestration(admin, goal, record) {
  try {
    const { data: current } = await admin.from('goals').select('data').eq('id', goal.id).single();
    const currentData = current?.data || goal.data || {};
    const prior = Array.isArray(currentData.axwise_orchestration_history)
      ? currentData.axwise_orchestration_history
      : [];
    await admin
      .from('goals')
      .update({
        data: {
          ...currentData,
          axwise_orchestration: record,
          axwise_orchestration_history: [...prior, record].slice(-5),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', goal.id);
  } catch {
    // Goal execution must not fail because best-effort observability failed.
  }
}

async function finishWithoutAxwiseDecision(
  admin,
  goal,
  status,
  reason,
  { persistRecord = true } = {}
) {
  const record = {
    decision_id: null,
    request_id: null,
    iteration: Number(goal?.iteration || 0),
    retry_count: Number(goal?.data?.retry_count || 0),
    status,
    reason,
    applied: false,
    enforcement: axwiseEnforcement(),
    feasible: null,
    created_at: new Date().toISOString(),
  };
  // A goal can be retried or replanned after an earlier AxWise-backed attempt.
  // Persisting the current no-decision attempt clears that stale decision
  // pointer while retaining it in axwise_orchestration_history for audit.
  // Otherwise locally planned tasks (which correctly carry no decision id)
  // are filtered out as if they belonged to an older attempt.
  if (persistRecord) await persistGoalOrchestration(admin, goal, record);
  return { status, applied: false, assignments: {}, record };
}

async function recordCall(admin, goal, request, decision, result, durationMs, error = null) {
  try {
    await admin.from('axwise_calls').insert({
      user_id: goal.user_id,
      org_id: goal.org_id,
      trace_id: decision?.request_id || null,
      request_id: request?._orqaly?.requestId || null,
      integration_point: 'goal.orchestrate',
      destination_url: `${(process.env.AXWISE_API_URL || '').replace(/\/+$/, '')}/orchestration/decisions`,
      model: decision?.scorer_version || null,
      status: error ? 'error' : 'ok',
      applied_outcome: result?.applied
        ? 'assignment-applied'
        : error
          ? 'fallback:local'
          : 'shadow-logged',
      ax_decision: decision?.status || null,
      local_decision: 'orqaly-live-state-authorized',
      degraded: Boolean(error),
      skipped: false,
      duration_ms: durationMs,
      cost_usd: 0,
      request_payload: {
        task_id: request?.task?.task_id,
        objective: request?.task?.objective,
        plan_steps: request?.planning?.steps?.length || 0,
        available_agents: request?.available_agents?.length || 0,
        available_tools: request?.available_tools?.length || 0,
      },
      processed_outputs: decision
        ? {
            decision_id: decision.decision_id,
            status: decision.status,
            routing_mode: decision.routing_mode,
            confidence: decision.confidence,
            execution_plan: decision.execution_plan,
            plan_feasibility: decision.plan_feasibility,
          }
        : null,
      applicable_conditions: result?.rejections || null,
    });
  } catch {
    // Telemetry is best-effort.
  }
}

export async function orchestrateGoalWithAxwise({
  admin,
  goal,
  members,
  toolInfo = {},
  createDecision = createOrchestrationDecision,
  requestId = randomUUID(),
  axwiseUserDisabled,
  persistRecord = true,
}) {
  if (!isAxwiseEnabled()) {
    return finishWithoutAxwiseDecision(admin, goal, 'disabled', 'integration_disabled', {
      persistRecord,
    });
  }
  const userDisabled =
    axwiseUserDisabled === undefined
      ? await isAxwiseUserDisabled(admin, goal?.user_id)
      : axwiseUserDisabled;
  if (userDisabled) {
    return finishWithoutAxwiseDecision(admin, goal, 'disabled', 'disabled_by_user', {
      persistRecord,
    });
  }
  if (!goal?.org_id) {
    return finishWithoutAxwiseDecision(admin, goal, 'skipped_missing_org', 'missing_org', {
      persistRecord,
    });
  }

  const steps = goalPlanSteps(goal);
  if (!steps.length) {
    return finishWithoutAxwiseDecision(admin, goal, 'skipped_no_plan', 'missing_plan', {
      persistRecord,
    });
  }
  const startedAt = Date.now();
  let request = null;

  try {
    const tools = await loadGoalTools(admin, goal, steps, toolInfo);
    const roleMappingGoal = await goalWithPersistedTeamFormationLog(admin, goal, members);
    const roleMappedMembers = membersWithTeamFormationRoles(roleMappingGoal, members);
    request = buildGoalOrchestrationRequest({
      goal: roleMappingGoal,
      members: roleMappedMembers,
      tools,
      requestId,
    });
    const wireRequest = { ...request };
    delete wireRequest._orqaly;
    const decision = await createDecision(wireRequest, {
      idempotencyKey: `orqaly-goal:${goal.id}:iteration:${Number(goal.iteration || 0)}:snapshot:${createHash('sha256').update(JSON.stringify(wireRequest)).digest('hex').slice(0, 16)}`,
      requestId,
    });
    if (
      !decision?.decision_id ||
      decision?.contract_version !== '1.0' ||
      String(decision?.task_id) !== String(goal.id) ||
      decision?.requires_orqaly_authorization !== true
    ) {
      throw new Error('AxWise returned an invalid orchestration decision');
    }
    const authorization = authorizeGoalDecision({
      decision,
      members: roleMappedMembers,
      tools,
      steps,
      enforcement: axwiseEnforcement(),
    });
    const record = {
      decision_id: decision.decision_id,
      parent_decision_id: decision.parent_decision_id || null,
      request_id: decision.request_id || requestId,
      request_hash: decision.request_hash || null,
      contract_version: decision.contract_version || '1.0',
      scorer_version: decision.scorer_version || null,
      router_version: decision.router_version || null,
      routing_mode: decision.routing_mode,
      status: decision.status,
      confidence: decision.confidence,
      iteration: Number(goal.iteration || 0),
      retry_count: Number(goal?.data?.retry_count || 0),
      applied: authorization.applied,
      enforcement: axwiseEnforcement(),
      feasible: authorization.feasible,
      rejections: authorization.rejections,
      assignments: authorization.assignments,
      created_at: decision.created_at || new Date().toISOString(),
    };
    if (persistRecord) await persistGoalOrchestration(admin, goal, record);
    await recordCall(admin, goal, request, decision, authorization, Date.now() - startedAt);
    return { status: 'ok', decision, record, ...authorization };
  } catch (error) {
    const record = {
      decision_id: null,
      request_id: requestId,
      iteration: Number(goal.iteration || 0),
      retry_count: Number(goal?.data?.retry_count || 0),
      applied: false,
      enforcement: axwiseEnforcement(),
      feasible: false,
      degraded: true,
      error: String(error?.message || 'AxWise orchestration unavailable').slice(0, 200),
      created_at: new Date().toISOString(),
    };
    if (persistRecord) await persistGoalOrchestration(admin, goal, record);
    await recordCall(
      admin,
      goal,
      request,
      null,
      { applied: false, rejections: [] },
      Date.now() - startedAt,
      error
    );
    return { status: 'degraded', applied: false, assignments: {}, record, error };
  }
}
