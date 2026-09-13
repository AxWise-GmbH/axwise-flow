/**
 * Build the live authorization manifest reviewed at human gate 2.
 *
 * The manifest deliberately contains no credentials. It freezes identities and
 * grants only: exact team membership, task-to-agent assignments, task tool
 * requirements, per-agent grants, MCP action grants, and current availability.
 */
import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';
import { resolveToolCredential } from '../agent-handlers/tool-credentials.js';
import { CREDENTIAL_FREE_DOCUMENT_TOOL_ID, normalizeToolIds } from '../_shared/tool-ids.js';
import {
  buildContextApprovalSnapshot,
  buildExecutionApprovalSnapshot,
  isApprovalCurrent,
} from './approval-audit.js';
import { extractUrls, isCloneRestyleGoal, LANDING_PAGE_PATTERN } from './_clone-detectors.js';
import { defaultModel, defaultProvider } from '../_shared/llm-defaults.js';
import { effectiveGoalTaskToolIds, goalSkipsTools } from '../_shared/goal-tool-policy.js';
import {
  agentMatchesRequiredRole,
  formatExecutionRole,
  isLeadershipRole,
} from './team-assigner.js';
import { hashResearchPersonaContext } from './research-execution-contract.js';
import { currentGoalTaskAttempt } from './current-goal-task-attempt.js';
import { resolveAcceptedNativeGoalAuthority } from '../_shared/native-goal-authority.js';
import { canonicalContractHash } from '../agent-handlers/compact-agent-contracts.js';
import { resolveNativeEnrichmentContext } from './native-enrichment-context.js';

export { goalSkipsTools } from '../_shared/goal-tool-policy.js';

export const EXECUTION_AUTHORIZATION_VERSION = 'orqaly_execution_authorization_v1';

export const SYSTEM_ENRICHMENT_IDS = Object.freeze({
  BRAND_SEED: 'brand-seed',
  CLONE_REFERENCE: 'clone-reference',
  IMAGE_POOL: 'image-pool',
});

const TOOL_BY_ID = new Map(PREDEFINED_TOOLS.map((tool) => [tool.id, tool]));

const LLM_SERVICE_LABELS = Object.freeze({
  anthropic: 'Anthropic API',
  deepseek: 'DeepSeek API',
  gemini: 'Google Gemini API',
  gateway: 'Vercel AI Gateway',
  glm: 'Z.AI API',
  groq: 'Groq API',
  openai: 'OpenAI API',
  openrouter: 'OpenRouter API',
  qwen: 'Alibaba Qwen API',
  'vercel-gateway': 'Vercel AI Gateway',
});

function approvedEnrichmentLlm(goal) {
  const explicit = goal?.data?.test_model;
  const provider = explicit?.provider || defaultProvider();
  const model = explicit?.model || defaultModel();
  return {
    provider,
    model,
    service: LLM_SERVICE_LABELS[provider] || `${provider} LLM API`,
  };
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort();
}

function taskGoalId(task) {
  return task?.goal_id || task?.data?.goal_id || null;
}

function researchContractOf(task) {
  const contract = task?.data?.axwise_execution_context?.research_contract;
  return contract && typeof contract === 'object' ? contract : null;
}

function sameIds(left, right) {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

/** Fail closed if any persisted task persona input drifts from its current goal pointer. */
function taskResearchIntegrityIssues(goal, task, requiredRole) {
  const pointer = goal?.data?.axwise_customer_intelligence?.research_bundle;
  if (!pointer?.run_id) return [];

  const taskId = String(task?.id || '');
  const context = task?.data?.axwise_execution_context;
  const contract = researchContractOf(task);
  if (!contract) return [{ code: 'task_research_contract_missing', task_id: taskId }];

  const issues = [];
  const overlayCustomerIds = Array.isArray(context?.customer_personas)
    ? context.customer_personas.map((persona) => persona?.persona_id)
    : [];
  const expectedCustomerIds = pointer.selected_persona_ids || [];
  const overlayExecutorId = context?.execution_persona?.persona_id || null;
  const computedPersonaContextHash = hashResearchPersonaContext(context);
  const expectedResearchRole = requiredRole ? formatExecutionRole(requiredRole) : null;

  if (String(contract.run_id || '') !== String(pointer.run_id)) {
    issues.push({ code: 'task_research_run_mismatch', task_id: taskId });
  }
  if (contract.bundle_hash !== pointer.bundle_hash) {
    issues.push({ code: 'task_research_bundle_mismatch', task_id: taskId });
  }
  if (contract.research_prd_hash !== (pointer.research_prd_hash || null)) {
    issues.push({ code: 'task_research_prd_mismatch', task_id: taskId });
  }
  if (
    !sameIds(contract.selected_customer_persona_ids, expectedCustomerIds) ||
    !sameIds(overlayCustomerIds, expectedCustomerIds)
  ) {
    issues.push({ code: 'task_research_customer_personas_mismatch', task_id: taskId });
  }
  if (!contract.executor_persona_id) {
    issues.push({ code: 'task_executor_persona_missing', task_id: taskId });
  } else if (String(contract.executor_persona_id) !== String(overlayExecutorId || '')) {
    issues.push({ code: 'task_research_executor_persona_mismatch', task_id: taskId });
  }
  if (expectedResearchRole && contract.required_role !== expectedResearchRole) {
    issues.push({ code: 'task_research_role_mismatch', task_id: taskId });
  }
  if (!contract.persona_context_hash) {
    issues.push({ code: 'task_research_persona_context_hash_missing', task_id: taskId });
  } else if (
    !computedPersonaContextHash ||
    contract.persona_context_hash !== computedPersonaContextHash
  ) {
    issues.push({ code: 'task_research_persona_context_mismatch', task_id: taskId });
  }
  return issues;
}

/**
 * Keep Gate 2 bound to the current AxWise planning attempt. Goal retries retain
 * old task rows for audit/history, so they must not inflate the authorization
 * manifest or make an AxWise decision look partially covered.
 *
 * Once an AxWise decision exists, task status is runtime state rather than a
 * material authorization change. Completed tasks must remain in the manifest
 * while later phases execute, otherwise every phase transition shrinks the
 * approved task set and invalidates Gate 2.
 */
export function currentAuthorizationTasks(goal, tasks = []) {
  const attemptTasks = currentGoalTaskAttempt(goal, tasks);
  const decisionId = goal?.data?.axwise_orchestration?.decision_id;
  if (!decisionId) {
    return attemptTasks.filter((task) => ['planned', 'todo'].includes(task.status));
  }
  return attemptTasks.filter(
    (task) => String(task.data?.axwise_decision_id || '') === String(decisionId)
  );
}

/**
 * Deterministic, credential-free actions that Orqaly may perform after gate 2
 * and before the first agent task. Keeping them in the signed manifest makes
 * their network and persistence effects visible instead of treating them as
 * hidden planning work.
 */
export function buildSystemEnrichments(goal) {
  // The durable user policy is the first boundary. This covers brand seeding,
  // public-reference fetching, and image-pool preparation: all of them have
  // external effects even when task-level tool requirements were waived.
  if (goalSkipsTools(goal)) return [];
  const enrichmentContext = resolveNativeEnrichmentContext(goal);
  if (!enrichmentContext.ready) return [];
  const authorityText = enrichmentContext.text;
  if (!LANDING_PAGE_PATTERN.test(authorityText)) return [];

  const llm = approvedEnrichmentLlm(goal);

  const enrichments = [
    {
      id: SYSTEM_ENRICHMENT_IDS.BRAND_SEED,
      label: 'Prepare goal-specific brand context',
      external_services: [llm.service],
      llm: { provider: llm.provider, model: llm.model },
      effects: [
        'Read an explicitly selected workspace brand kit when requested',
        'Write the approved goal brand context',
      ],
    },
  ];

  if (isCloneRestyleGoal(authorityText)) {
    enrichments.push({
      id: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
      label: 'Fetch the declared design reference',
      external_services: ['Declared source URL'],
      source_urls: extractUrls(authorityText).slice(0, 8),
      effects: ['Fetch and sanitize declared public HTML', 'Write the sanitized goal reference'],
    });
  }

  enrichments.push({
    id: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
    label: 'Prepare licensed stock-image candidates',
    external_services: [llm.service, 'Pexels API'],
    llm: { provider: llm.provider, model: llm.model },
    effects: ['Generate goal-specific image queries', 'Write image candidates to the goal'],
  });

  return enrichments;
}

function nativeAuthorizationScope(authority) {
  if (!authority.native) return null;
  if (!authority.ready) {
    return {
      version: 'orqaly_native_authorization_scope_v1',
      status: 'invalid',
      reasons: authority.reasons,
    };
  }
  return {
    version: 'orqaly_native_authorization_scope_v1',
    status: 'accepted',
    scope_hash: authority.packet.scope_hash,
    playbook_id: authority.route.playbook_id,
    work_types: authority.admission.work_types,
    deliverable: authority.deliverable,
    requested_actions: authority.admission.requested_actions,
    requires_authorization: authority.route.requires_authorization,
    maximum_side_effect: authority.route.maximum_side_effect,
    grants_authorization: false,
  };
}

function nativeAuthorizationScopeIsCurrent(authority, manifest) {
  if (!authority.native) return true;
  const approvedScope = manifest?.native_scope_authority;
  if (!approvedScope) return false;
  return (
    canonicalContractHash(approvedScope) ===
    canonicalContractHash(nativeAuthorizationScope(authority))
  );
}

/**
 * Gate 2 may sign only the exact native post-planning attempt chain. Queue
 * retries can otherwise jump directly from an old `estimating` row into
 * approval even though team formation, tool resolution, or proposal
 * estimation belongs to a different scope generation.
 */
function nativePostFormationStageChain(goal, authority) {
  if (!authority.native) return { chain: null, issues: [] };
  if (!authority.ready) return { chain: null, issues: [] };

  const scopeHash = authority.packet.scope_hash;
  const commonTeam = goal?.data?.team_formation_attempt;
  const nativeTeam = goal?.data?.native_team_formation_attempt;
  const tool = goal?.data?.tool_provisioning_attempt;
  const nativeTool = goal?.data?.native_tool_provisioning_attempt;
  const discovery = goal?.data?.discovery_estimation_attempt;
  const nativeDiscovery = goal?.data?.native_discovery_estimation_attempt;
  const issues = [];

  const teamReady = Boolean(
    commonTeam?.version === 'orqaly_team_formation_attempt_v1' &&
    commonTeam.status === 'completed' &&
    commonTeam.completed_at &&
    commonTeam.attempt_id &&
    commonTeam.scope_hash === scopeHash &&
    nativeTeam?.version === commonTeam.version &&
    nativeTeam?.attempt_id === commonTeam.attempt_id &&
    nativeTeam?.status === 'completed' &&
    nativeTeam?.completed_at === commonTeam.completed_at &&
    nativeTeam?.scope_hash === scopeHash
  );
  if (!teamReady) issues.push({ code: 'native_team_formation_attempt_incomplete' });

  const toolReady = Boolean(
    teamReady &&
    tool?.version === 'orqaly_tool_provisioning_attempt_v1' &&
    tool.status === 'completed' &&
    tool.completed_at &&
    tool.attempt_id &&
    tool.scope_hash === scopeHash &&
    tool.team_formation_attempt_id === commonTeam.attempt_id &&
    nativeTool?.version === tool.version &&
    nativeTool?.attempt_id === tool.attempt_id &&
    nativeTool?.status === 'completed' &&
    nativeTool?.completed_at === tool.completed_at &&
    nativeTool?.team_formation_attempt_id === commonTeam.attempt_id &&
    nativeTool?.scope_hash === scopeHash
  );
  if (!toolReady) issues.push({ code: 'native_tool_provisioning_attempt_incomplete' });

  const discoveryReady = Boolean(
    toolReady &&
    discovery?.version === 'orqaly_discovery_estimation_attempt_v1' &&
    discovery.status === 'completed' &&
    discovery.completed_at &&
    discovery.attempt_id &&
    discovery.scope_hash === scopeHash &&
    discovery.team_formation_attempt_id === commonTeam.attempt_id &&
    discovery.tool_provisioning_attempt_id === tool.attempt_id &&
    nativeDiscovery?.version === discovery.version &&
    nativeDiscovery?.attempt_id === discovery.attempt_id &&
    nativeDiscovery?.status === 'completed' &&
    nativeDiscovery?.completed_at === discovery.completed_at &&
    nativeDiscovery?.team_formation_attempt_id === commonTeam.attempt_id &&
    nativeDiscovery?.tool_provisioning_attempt_id === tool.attempt_id &&
    nativeDiscovery?.scope_hash === scopeHash &&
    goal?.proposal
  );
  if (!discoveryReady) issues.push({ code: 'native_discovery_estimation_attempt_incomplete' });

  return {
    chain: {
      version: 'orqaly_native_post_formation_chain_v1',
      scope_hash: scopeHash,
      team_formation_attempt_id: commonTeam?.attempt_id || null,
      tool_provisioning_attempt_id: tool?.attempt_id || null,
      discovery_estimation_attempt_id: discovery?.attempt_id || null,
      status: issues.length === 0 ? 'completed' : 'invalid',
    },
    issues,
  };
}

function contextApprovalIsCurrent(goal, nativeAuthority) {
  return nativeAuthority.native
    ? nativeAuthority.contextApprovalCurrent
    : isApprovalCurrent(
        'context',
        buildContextApprovalSnapshot(goal),
        goal?.data?.goal_approvals?.context
      );
}

/** Pure builder, exported so trust-boundary behavior is testable without a DB. */
export function buildExecutionAuthorizationManifest({
  goal,
  teamMembers = [],
  agents = [],
  tasks = [],
  skillRows = [],
  libraryRows = [],
  availableToolIds = [],
}) {
  const teamId = goal?.agent_team_id || goal?.team_id || null;
  const toolsSkipped = goalSkipsTools(goal);
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  const memberIds = new Set(teamMembers.map((member) => String(member.member_id || member.id)));
  const agentById = new Map(agents.map((agent) => [String(agent.id), agent]));
  const available = new Set(normalizeToolIds(availableToolIds));

  const skillGrantsByAgent = new Map();
  for (const row of skillRows || []) {
    const agentId = String(row.agent_id || '');
    if (!agentId) continue;
    const prior = skillGrantsByAgent.get(agentId) || [];
    skillGrantsByAgent.set(agentId, [
      ...prior,
      ...(row.agent_skill_packs?.required_tools || row.required_tools || []),
    ]);
  }

  const librariesByAgent = new Map();
  for (const row of libraryRows || []) {
    if (row.status !== 'active') continue;
    const agentId = String(row.agent_id || '');
    const toolId = normalizeToolIds([row.tool_id])[0];
    const actions = sortedUnique(row.enabled_actions);
    if (!agentId || !toolId || !toolId.startsWith('mcp-') || actions.length === 0) continue;
    const prior = librariesByAgent.get(agentId) || [];
    prior.push({ tool_id: toolId, allowed_actions: actions });
    librariesByAgent.set(agentId, prior);
  }

  const normalizedMembers = teamMembers
    .map((member) => ({
      agent_id: String(member.member_id || member.id),
      team_role: member.role || 'member',
    }))
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id));

  const relevantTasks = (tasks || []).filter(
    (task) => !goal?.id || String(taskGoalId(task)) === String(goal.id)
  );
  const goalRequiredTools = new Set(
    relevantTasks.flatMap((task) =>
      effectiveGoalTaskToolIds(goal, task.data?.tool_requirements || [])
    )
  );
  const agentGrants = [];
  const grantIdsByAgent = new Map();
  const libraryActionsByAgentTool = new Map();

  // The document generator is a purely declarative platform capability: it has
  // no credential, network, publishing, or other external side effect. Grant
  // it only when an exact task declares it, and only to that task's assigned
  // agent. The grant remains goal-scoped and is frozen into Gate 2; persistent
  // agent metadata is not widened. Do not generalize this from
  // `connectionType: internal`: Cloudflare Pages, HTTP client, Stability and
  // other internal runners are side-effecting and retain explicit Agent Hub or
  // skill grants, just like credentialed and MCP tools.
  const documentTaskGrantsByAgent = new Map();
  if (!toolsSkipped) {
    for (const task of relevantTasks) {
      const agentId = task.agent_id ? String(task.agent_id) : null;
      if (!agentId) continue;
      const requiresDocumentTool = effectiveGoalTaskToolIds(
        goal,
        task.data?.tool_requirements || []
      ).includes(CREDENTIAL_FREE_DOCUMENT_TOOL_ID);
      if (!requiresDocumentTool) continue;
      documentTaskGrantsByAgent.set(agentId, [
        ...(documentTaskGrantsByAgent.get(agentId) || []),
        CREDENTIAL_FREE_DOCUMENT_TOOL_ID,
      ]);
    }
  }

  for (const member of normalizedMembers) {
    const agent = agentById.get(member.agent_id);
    const platformGrants = normalizeToolIds([
      ...(Array.isArray(agent?.metadata?.tools) ? agent.metadata.tools : []),
      ...(skillGrantsByAgent.get(member.agent_id) || []),
    ]).filter((toolId) => !toolId.startsWith('mcp-'));
    const libraries = (librariesByAgent.get(member.agent_id) || [])
      .filter((grant) => goalRequiredTools.has(grant.tool_id))
      .sort((a, b) => a.tool_id.localeCompare(b.tool_id));
    const toolIds = sortedUnique([
      ...platformGrants.filter((toolId) => goalRequiredTools.has(toolId)),
      ...libraries.map((grant) => grant.tool_id),
      ...(documentTaskGrantsByAgent.get(member.agent_id) || []),
    ]);
    grantIdsByAgent.set(member.agent_id, new Set(toolIds));
    for (const library of libraries) {
      libraryActionsByAgentTool.set(
        `${member.agent_id}:${library.tool_id}`,
        library.allowed_actions
      );
    }
    agentGrants.push({
      agent_id: member.agent_id,
      tool_ids: toolIds,
      mcp_action_grants: libraries,
    });
  }

  const issues = [];
  if (nativeAuthority.native && !nativeAuthority.ready) {
    issues.push({
      code: 'native_scope_authority_invalid',
      reasons: nativeAuthority.reasons,
    });
  }
  const nativeStageChain = nativePostFormationStageChain(goal, nativeAuthority);
  issues.push(...nativeStageChain.issues);
  const normalizedTasks = relevantTasks
    .map((task) => {
      const taskId = String(task.id || '');
      const agentId = task.agent_id ? String(task.agent_id) : null;
      const requiredRole = String(task.data?.required_role || '').trim() || null;
      const assignedAgent = agentId ? agentById.get(agentId) : null;
      const declaredToolIds = normalizeToolIds(task.data?.tool_requirements || []);
      const requiredToolIds = effectiveGoalTaskToolIds(goal, declaredToolIds);
      const allowed = grantIdsByAgent.get(agentId) || new Set();
      const grantedToolIds = requiredToolIds.filter(
        (toolId) => allowed.has(toolId) && available.has(toolId)
      );
      const missingToolIds = requiredToolIds.filter((toolId) => !grantedToolIds.includes(toolId));
      const toolGrants = grantedToolIds.map((toolId) => ({
        tool_id: toolId,
        allowed_actions: libraryActionsByAgentTool.get(`${agentId}:${toolId}`) || [],
      }));
      const researchContract = researchContractOf(task);
      const researchPointer = goal?.data?.axwise_customer_intelligence?.research_bundle;
      const approvedResearch = goal?.data?.goal_approvals?.context?.snapshot?.research_bundle;

      if (!taskId) issues.push({ code: 'missing_task_id' });
      if (!agentId) issues.push({ code: 'missing_task_agent', task_id: taskId });
      else if (!memberIds.has(agentId)) {
        issues.push({ code: 'task_agent_not_on_team', task_id: taskId, agent_id: agentId });
      } else if (!agentById.has(agentId)) {
        issues.push({ code: 'task_agent_not_owned', task_id: taskId, agent_id: agentId });
      } else if (isLeadershipRole(assignedAgent)) {
        issues.push({ code: 'task_assigned_to_coordinator', task_id: taskId, agent_id: agentId });
      } else if (requiredRole && !agentMatchesRequiredRole(assignedAgent, requiredRole)) {
        issues.push({
          code: 'task_agent_role_mismatch',
          task_id: taskId,
          agent_id: agentId,
          required_role: requiredRole,
        });
      }
      for (const toolId of missingToolIds) {
        issues.push({
          code: allowed.has(toolId) ? 'task_tool_unavailable' : 'task_tool_not_granted',
          task_id: taskId,
          agent_id: agentId,
          tool_id: toolId,
        });
      }
      if (researchPointer?.run_id) {
        issues.push(...taskResearchIntegrityIssues(goal, task, requiredRole));
        if (
          approvedResearch?.bundle_hash !== researchPointer.bundle_hash ||
          approvedResearch?.research_prd_hash !== (researchPointer.research_prd_hash || null) ||
          !sameIds(approvedResearch?.selected_persona_ids, researchPointer.selected_persona_ids)
        ) {
          issues.push({ code: 'approved_research_contract_stale', task_id: taskId });
        }
      }

      return {
        task_id: taskId,
        step_id: task.data?.axwise_step_id || null,
        agent_id: agentId,
        required_role: requiredRole,
        declared_tool_ids: declaredToolIds,
        waived_tool_ids: declaredToolIds.filter((toolId) => !requiredToolIds.includes(toolId)),
        required_tool_ids: requiredToolIds,
        granted_tool_ids: grantedToolIds,
        tool_grants: toolGrants,
        research_contract: researchContract,
      };
    })
    .sort((a, b) => a.task_id.localeCompare(b.task_id));

  if (!teamId) issues.push({ code: 'missing_team' });
  if (!normalizedMembers.length) issues.push({ code: 'empty_team' });
  if (!normalizedTasks.length) issues.push({ code: 'empty_task_set' });

  return {
    version: EXECUTION_AUTHORIZATION_VERSION,
    goal_id: goal?.id || null,
    team_id: teamId,
    tool_mode: toolsSkipped ? 'skipped_by_user' : 'configured',
    ...(nativeAuthority.native
      ? { native_scope_authority: nativeAuthorizationScope(nativeAuthority) }
      : {}),
    ...(nativeStageChain.chain ? { native_stage_chain: nativeStageChain.chain } : {}),
    system_enrichments: buildSystemEnrichments(goal),
    team_members: normalizedMembers,
    agent_grants: agentGrants.sort((a, b) => a.agent_id.localeCompare(b.agent_id)),
    tasks: normalizedTasks,
    valid: issues.length === 0,
    issues,
  };
}

/** Pure guard used by every post-approval system-enrichment stage. */
export function verifySystemEnrichmentAuthorization(goal, enrichmentId) {
  const manifest = goal?.data?.execution_authorization?.manifest;
  const approval = goal?.data?.goal_approvals?.execution;
  const authorization = goal?.data?.execution_authorization;
  const snapshot = buildExecutionApprovalSnapshot(goal, manifest);
  const enrichment = (manifest?.system_enrichments || []).find((item) => item.id === enrichmentId);
  const reasons = [];
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  const currentEnrichment = buildSystemEnrichments(goal).find((item) => item.id === enrichmentId);

  // Defense in depth for persisted manifests created before the no-tools
  // boundary existed. Even a previously signed enrichment grant cannot
  // override the goal's current durable user policy.
  if (goalSkipsTools(goal)) reasons.push('system_enrichment_forbidden_by_no_tools_policy');
  if (nativeAuthority.native && !nativeAuthority.ready) {
    reasons.push('native_scope_authority_invalid');
  }
  if (goal?.status !== 'active') reasons.push('goal_not_active');
  if (!manifest?.valid) reasons.push('authorization_manifest_invalid');
  if (!contextApprovalIsCurrent(goal, nativeAuthority)) {
    reasons.push('context_approval_stale');
  }
  if (!nativeAuthorizationScopeIsCurrent(nativeAuthority, manifest)) {
    reasons.push('native_scope_authority_changed');
  }
  if (!isApprovalCurrent('execution', snapshot, approval)) reasons.push('execution_approval_stale');
  if (authorization?.status !== 'approved') reasons.push('authorization_not_approved');
  if (!approval?.snapshot_hash || authorization?.snapshot_hash !== approval.snapshot_hash) {
    reasons.push('authorization_hash_mismatch');
  }
  if (!enrichment) {
    reasons.push('system_enrichment_not_approved');
  } else if (nativeAuthority.native && !currentEnrichment) {
    reasons.push('system_enrichment_not_in_canonical_scope');
  }

  if (enrichmentId === SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE && enrichment) {
    const currentUrls = currentEnrichment?.source_urls || [];
    if (JSON.stringify(currentUrls) !== JSON.stringify(enrichment.source_urls || [])) {
      reasons.push('approved_source_urls_changed');
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    snapshot_hash: approval?.snapshot_hash || null,
    enrichment: enrichment || null,
  };
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

/** Load and normalize the current DB state that gate 2 authorizes. */
export async function loadExecutionAuthorizationManifest(admin, goal) {
  const teamId = goal?.agent_team_id || goal?.team_id;
  let teamMembers = [];
  if (teamId) {
    teamMembers = await queryRows(
      admin
        .from('agent_team_members')
        .select('member_id, role')
        .eq('team_id', teamId)
        .eq('user_id', goal.user_id),
      'Unable to inspect execution team membership'
    );
    if (!teamMembers.length) {
      teamMembers = await queryRows(
        admin
          .from('concilium_team_members')
          .select('member_id')
          .eq('team_id', teamId)
          .eq('user_id', goal.user_id),
        'Unable to inspect legacy execution team membership'
      );
    }
  }

  const taskRows = await queryRows(
    admin
      .from('team_tasks')
      .select('id, goal_id, title, agent_id, assigned_to, status, materialization_attempt, data')
      .eq('user_id', goal.user_id)
      .eq('data->>goal_id', goal.id),
    'Unable to inspect execution task assignments'
  );
  const tasks = currentAuthorizationTasks(goal, taskRows);
  const agentIds = sortedUnique([
    ...teamMembers.map((member) => member.member_id),
    ...tasks.map((task) => task.agent_id),
  ]);

  const agents = agentIds.length
    ? await queryRows(
        admin
          .from('agents')
          .select('id, name, category, capabilities, metadata, status')
          .eq('user_id', goal.user_id)
          .eq('status', 'active')
          .in('id', agentIds),
        'Unable to inspect authorized agents'
      )
    : [];
  const skillRows = agentIds.length
    ? await queryRows(
        admin
          .from('agent_installed_skills')
          .select('agent_id, agent_skill_packs(required_tools)')
          .eq('user_id', goal.user_id)
          .eq('is_active', true)
          .in('agent_id', agentIds),
        'Unable to inspect installed-skill grants'
      )
    : [];
  const libraryRows = agentIds.length
    ? await queryRows(
        admin
          .from('agent_connected_libraries')
          .select('agent_id, tool_id, status, enabled_actions')
          .eq('user_id', goal.user_id)
          .eq('status', 'active')
          .in('agent_id', agentIds),
        'Unable to inspect connected-library grants'
      )
    : [];

  const requiredToolIds = normalizeToolIds(
    tasks.flatMap((task) => effectiveGoalTaskToolIds(goal, task.data?.tool_requirements || []))
  );
  const toolRows = requiredToolIds.length
    ? await queryRows(
        admin
          .from('tools')
          .select('id, data, connection_type, status')
          .eq('user_id', goal.user_id)
          .in('id', requiredToolIds),
        'Unable to inspect required tool availability'
      )
    : [];
  const rowById = new Map(toolRows.map((row) => [row.id, row]));
  const availableToolIds = [];
  for (const toolId of requiredToolIds) {
    const definition = TOOL_BY_ID.get(toolId);
    if (!definition) continue;
    const credential = await resolveToolCredential({
      def: definition,
      row: rowById.get(toolId),
      userId: goal.user_id,
    });
    if (credential.ready) availableToolIds.push(toolId);
  }

  return buildExecutionAuthorizationManifest({
    goal,
    teamMembers,
    agents,
    tasks,
    skillRows,
    libraryRows,
    availableToolIds,
  });
}

/**
 * Bind Agent Hub overlays to the exact approved hash. A missing/partial stamp
 * remains review-only, so presentation fails closed.
 */
export async function stampTaskExecutionAuthorization(admin, goal, manifest, snapshotHash) {
  for (const authorizedTask of manifest.tasks || []) {
    const { data: row, error } = await admin
      .from('team_tasks')
      .select('data')
      .eq('id', authorizedTask.task_id)
      .eq('user_id', goal.user_id)
      .single();
    if (error || !row) {
      throw new Error(`Unable to bind approval to task ${authorizedTask.task_id}`);
    }
    const context = row.data?.axwise_execution_context || {};
    const { error: updateError } = await admin
      .from('team_tasks')
      .update({
        data: {
          ...(row.data || {}),
          axwise_execution_context: {
            ...context,
            authorization_status: 'approved',
            authorization_snapshot_hash: snapshotHash,
            authorization_task_id: authorizedTask.task_id,
            authorization_agent_id: authorizedTask.agent_id,
            authorization_required_tool_ids: authorizedTask.required_tool_ids,
            authorization_granted_tool_ids: authorizedTask.granted_tool_ids,
            authoritative: true,
            executable: true,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', authorizedTask.task_id)
      .eq('user_id', goal.user_id);
    if (updateError) {
      throw new Error(`Unable to bind approval to task ${authorizedTask.task_id}`);
    }
  }
}

/** Pure final guard used by the worker immediately before an agent starts. */
export function verifyTaskExecutionAuthorization({ goal, task, payload, manifest }) {
  const approval = goal?.data?.goal_approvals?.execution;
  const authorization = goal?.data?.execution_authorization;
  const snapshot = buildExecutionApprovalSnapshot(goal, manifest);
  const taskAuthorization = (manifest?.tasks || []).find(
    (item) => String(item.task_id) === String(task?.id)
  );
  const toolsSkipped = goalSkipsTools(goal);
  const expectedToolIds = toolsSkipped ? [] : taskAuthorization?.granted_tool_ids || [];
  const expectedToolGrants = toolsSkipped ? [] : taskAuthorization?.tool_grants || [];
  const currentRequirements = effectiveGoalTaskToolIds(goal, task?.data?.tool_requirements || []);
  const taskHash = task?.data?.axwise_execution_context?.authorization_snapshot_hash;
  const currentResearchContract = researchContractOf(task);
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);

  const reasons = [];
  if (goal?.status !== 'active') reasons.push('goal_not_active');
  if (nativeAuthority.native && !nativeAuthority.ready) {
    reasons.push('native_scope_authority_invalid');
  }
  if (!contextApprovalIsCurrent(goal, nativeAuthority)) {
    reasons.push('context_approval_stale');
  }
  if (!nativeAuthorizationScopeIsCurrent(nativeAuthority, manifest)) {
    reasons.push('native_scope_authority_changed');
  }
  if (!manifest?.valid) reasons.push('authorization_manifest_invalid');
  if (!isApprovalCurrent('execution', snapshot, approval)) reasons.push('execution_approval_stale');
  if (authorization?.status !== 'approved') reasons.push('authorization_not_approved');
  if (!approval?.snapshot_hash || authorization?.snapshot_hash !== approval.snapshot_hash) {
    reasons.push('authorization_hash_mismatch');
  }
  if (payload?.authorizationSnapshotHash !== approval?.snapshot_hash) {
    reasons.push('queued_job_hash_mismatch');
  }
  if (taskHash !== approval?.snapshot_hash) reasons.push('task_overlay_hash_mismatch');
  if (!taskAuthorization) reasons.push('task_not_authorized');
  if (
    JSON.stringify(taskAuthorization?.research_contract || null) !==
    JSON.stringify(currentResearchContract || null)
  ) {
    reasons.push('task_research_contract_changed');
  }
  for (const issue of taskResearchIntegrityIssues(
    goal,
    task,
    String(task?.data?.required_role || '').trim() || null
  )) {
    if (!reasons.includes(issue.code)) reasons.push(issue.code);
  }
  if (
    taskAuthorization &&
    String(taskAuthorization.agent_id || '') !== String(task?.agent_id || '')
  ) {
    reasons.push('task_agent_changed');
  }
  if (
    taskAuthorization &&
    JSON.stringify(taskAuthorization.required_tool_ids || []) !==
      JSON.stringify(currentRequirements)
  ) {
    reasons.push('task_requirements_changed');
  }
  if (
    JSON.stringify(normalizeToolIds(payload?.toolIds || [])) !== JSON.stringify(expectedToolIds)
  ) {
    reasons.push('runtime_tool_grants_changed');
  }
  if (JSON.stringify(payload?.toolGrants || []) !== JSON.stringify(expectedToolGrants)) {
    reasons.push('runtime_tool_action_grants_changed');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    snapshot_hash: approval?.snapshot_hash || null,
    task_authorization: taskAuthorization || null,
  };
}
