/**
 * Stage 3: Team Formation
 *
 * Matches agents to roles from the plan using capability + performance scoring.
 * Both modes form a proposed team and require the user's final execution
 * confirmation. A linked Consilium can review phase outputs later; this stage
 * must not claim that review has already happened.
 *
 * Output: concilium_teams + concilium_team_members rows.
 * Next: tool-provisioning
 */
import {
  agentMatchesRequiredRole,
  ensureGoalTeam,
  findReusableGoalTeam,
  dedupeExecutionAgents,
  dedupeExecutionRoles,
  ensurePersistentAgentsForRoles,
  formatExecutionRole,
  formTeam,
  goalRequiredExecutionRoles,
  isLeadershipRole,
  matchDistinctAgentsToRoles,
  MAX_ROSTER_ROLES,
  pickBestAgent,
  planTaskExecutionRoles,
  replaceGoalTeamMembers,
} from '../team-assigner.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { hashApprovalSnapshot } from '../approval-audit.js';
import {
  logGoalEvent,
  updateGoalIfStatus,
  updateGoalIfSnapshot,
  updateGoalIfNativeScopeBinding,
  reserveGoalTeamFormationAttempt,
  updateGoalIfTeamFormationAttempt,
  loadGoal,
  enqueueGoalAction,
  generateId,
  TOOL_INFO,
} from '../_helpers.js';
import {
  goalOrchestrationAuthorityView,
  orchestrateGoalWithAxwise,
} from '../../integrations/axwise/goal-orchestration.js';
import { createTaskExecutionContext } from '../../integrations/axwise/customer-intelligence.js';
import { loadGoalResearchBundle } from '../../integrations/axwise/research-bundle.js';
import {
  buildGoalAgentPersonaAssignmentRows,
  goalRequiresResearchBundle,
  selectTaskResearchPersonas,
  taskResearchExecutionOverlay,
  validateGoalResearchBoundary,
  validateResearchRoleCoverage,
  validateResearchTaskBindingCoverage,
} from '../research-execution-contract.js';
import {
  acceptedNativePlanningActionBinding,
  resolveAcceptedNativeGoalAuthority,
} from '../../_shared/native-goal-authority.js';

const log = createLogger('goal-stage:team-formation');

export function researchMaterializationAttempt(goal, researchRunId, orchestration, members = []) {
  const planIdentity = {
    goal_id: goal.id,
    iteration: Number(goal.iteration || 0),
    retry_count: Number(goal.data?.retry_count || 0),
    research_run_id: researchRunId,
    axwise_decision_id: orchestration?.decision?.decision_id || null,
    assignments: orchestration?.assignments || {},
    member_ids: members.map((member) => String(member.id)).sort(),
    plan: goal.plan || null,
  };
  return hashApprovalSnapshot('research-work-materialization', planIdentity);
}

function materializationRowId(prefix, attemptKey, stepId) {
  const hash = createHash('sha256').update(`${attemptKey}:${prefix}:${stepId}`).digest('hex');
  return `${prefix}-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export async function materializeGoalResearchWork(
  admin,
  { goal, researchRunId, attemptKey, jobs, tasks, assignments }
) {
  const stampedAssignments = assignments.map((row) => ({
    ...row,
    assignment_source: 'orqaly_team_formation',
    payload: { ...(row.payload || {}), materialization_attempt: attemptKey },
  }));
  const { data, error } = await admin.rpc('materialize_goal_research_work', {
    p_goal_id: goal.id,
    p_user_id: goal.user_id,
    p_research_run_id: researchRunId,
    p_attempt_key: attemptKey,
    p_jobs: jobs,
    p_tasks: tasks,
    p_assignments: stampedAssignments,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function materializeGoalTeamWork(
  admin,
  {
    goal,
    formationAttemptId,
    nativeScopeHash = null,
    researchRunId = null,
    researchAttemptKey = null,
    jobs,
    tasks,
    assignments = [],
    team = null,
    memberIds = [],
  }
) {
  const stampedAssignments = assignments.map((row) => ({
    ...row,
    assignment_source: 'orqaly_team_formation',
    payload: { ...(row.payload || {}), materialization_attempt: researchAttemptKey },
  }));
  const { data, error } = await admin.rpc('materialize_goal_team_work', {
    p_goal_id: goal.id,
    p_user_id: goal.user_id,
    p_formation_attempt: formationAttemptId,
    p_native_scope_hash: nativeScopeHash,
    p_research_run_id: researchRunId,
    p_research_attempt_key: researchAttemptKey,
    p_jobs: jobs,
    p_tasks: tasks,
    p_assignments: stampedAssignments,
    p_team: team,
    p_member_ids: memberIds,
  });
  if (error) throw new Error(error.message);
  return data;
}

const ELIGIBLE_TEAM_FORMATION_STATUSES = new Set(['planning', 'forming_team']);

const AGENT_SELECT = 'id, name, description, category, capabilities, cost_per_task, metadata';

export function requiresOrganizationAgentScope(goal) {
  // The organization is the tenant/workspace boundary regardless of whether
  // the user asks Orqaly to choose, names a Consilium, or explicitly selects a
  // team/agent. Explicit assignment must not become a cross-org escape hatch.
  return Boolean(goal?.org_id);
}

export function teamFormationReviewState(goal) {
  return {
    consilium_reviewed: false,
    consilium_review_pending: Boolean(goal?.concilium_id),
  };
}

/**
 * Retire unfinished rows from an older planning attempt before materializing
 * the current plan. Completed rows remain immutable history, while runnable
 * rows are replaced so retries cannot accumulate duplicate Gate 2 tasks.
 */
export async function retireSupersededGoalWork(admin, goalId) {
  const [tasksResult, jobsResult] = await Promise.all([
    admin
      .from('team_tasks')
      .update({ status: 'cancelled' })
      .eq('goal_id', goalId)
      .in('status', ['planned', 'todo', 'in_progress', 'inProgress']),
    admin
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('goal_id', goalId)
      .in('status', ['active', 'queued']),
  ]);
  if (tasksResult?.error) {
    throw new Error(`Unable to retire superseded goal tasks: ${tasksResult.error.message}`);
  }
  if (jobsResult?.error) {
    throw new Error(`Unable to retire superseded goal jobs: ${jobsResult.error.message}`);
  }
}

/**
 * Load the explicit Agent Hub membership for an organization.
 *
 * The service-role client bypasses RLS, so both org_id and user_id are required
 * here. Errors are never treated as an empty optional scope: doing so would let
 * downstream fallbacks expand the goal to every agent owned by the user.
 */
export async function loadOrganizationAgentIds(admin, goal) {
  if (!requiresOrganizationAgentScope(goal)) return null;

  const { data, error } = await admin
    .from('org_agents')
    .select('agent_id')
    .eq('org_id', goal.org_id)
    .eq('user_id', goal.user_id);
  if (error) {
    throw new Error(`Unable to verify organization agent membership: ${error.message}`);
  }
  return [...new Set((data || []).map((row) => String(row.agent_id)).filter(Boolean))];
}

/**
 * Safely grow an organization-scoped Agent Hub roster for the concrete plan.
 * The service client bypasses RLS, so organization ownership is re-proven
 * here before any persistent agent-to-organization mapping is written.
 */
export async function materializeOrganizationAgentScope(admin, goal) {
  if (!requiresOrganizationAgentScope(goal)) {
    return { mappedAgentIds: [], requiredRoles: [], missingRoles: [] };
  }

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id')
    .eq('id', goal.org_id)
    .eq('user_id', goal.user_id)
    .eq('is_active', true)
    .maybeSingle();
  if (organizationError) {
    throw new Error(`Unable to verify organization ownership: ${organizationError.message}`);
  }
  if (!organization?.id) {
    throw new Error(`Organization ${goal.org_id} is inactive or is not owned by this account.`);
  }

  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (authority.native && !authority.ready) {
    throw new Error(
      `Native organization roster authority is invalid: ${authority.reasons.join(', ')}`
    );
  }
  const authoritativeGoalTitle = authority.native ? authority.packet.intent.objective : goal.title;

  // The plan's per-task roles come first: those are what the authorization gate
  // will check task by task. The contract roster is kept behind them so a goal
  // that has not planned yet still provisions its declared specialists.
  const { roles: planRoles } = planTaskExecutionRoles(goal);
  const requiredRoles = dedupeExecutionRoles([
    ...planRoles,
    ...goalRequiredExecutionRoles(goal, 5),
  ]);
  // Coordinator first. Any downstream cap truncates from the end, and a goal
  // without a Team Lead fails coverage outright — it must never be the role
  // that gets dropped to make room.
  const rosterRoles = ['Team Lead', ...requiredRoles];
  const persistentAgents = await ensurePersistentAgentsForRoles(
    admin,
    goal.user_id,
    rosterRoles,
    authoritativeGoalTitle
  );
  const { assignments, missing } = matchDistinctAgentsToRoles(
    persistentAgents,
    rosterRoles,
    rosterRoles.length
  );
  const mappedAgentIds = assignments.map(({ agent }) => String(agent.id));

  if (mappedAgentIds.length) {
    const { error: mappingError } = await admin.from('org_agents').upsert(
      mappedAgentIds.map((agentId) => ({
        user_id: goal.user_id,
        org_id: goal.org_id,
        agent_id: agentId,
      })),
      { onConflict: 'org_id,agent_id', ignoreDuplicates: true }
    );
    if (mappingError) {
      throw new Error(
        `Unable to assign persistent specialists to organization: ${mappingError.message}`
      );
    }
  }

  return { mappedAgentIds, requiredRoles, missingRoles: missing };
}

export function evaluateOrganizationTeamCoverage(goal, members = []) {
  const requiredRoles = goalRequiredExecutionRoles(goal, 5);
  const executorMembers = members.filter((member) => !isLeadershipRole(member?.name));
  const { missing } = matchDistinctAgentsToRoles(
    executorMembers,
    requiredRoles,
    requiredRoles.length
  );
  const coordinatorPresent = members.some((member) => isLeadershipRole(member?.name));
  const missingRoles = [
    ...missing,
    ...(!coordinatorPresent ? ['Team Lead (non-executing coordinator)'] : []),
  ];
  return {
    complete: missingRoles.length === 0,
    requiredRoles,
    missingRoles,
    coordinatorPresent,
  };
}

/**
 * Load active fallback candidates while preserving the goal's organization
 * boundary. For an organization-scoped goal, null or empty membership is a
 * deliberate empty result and never means "all user agents".
 */
export async function loadDirectFallbackAgents(admin, goal, scopeAgentIds = null, limit = 5) {
  const organizationScoped = requiresOrganizationAgentScope(goal);
  if (organizationScoped && (!Array.isArray(scopeAgentIds) || scopeAgentIds.length === 0)) {
    return [];
  }

  let query = admin
    .from('agents')
    .select(AGENT_SELECT)
    .eq('user_id', goal.user_id)
    .eq('status', 'active');
  if (organizationScoped) query = query.in('id', scopeAgentIds);

  // Historical starter-catalogue builds could leave many physical rows for
  // one logical role. Read enough rows to dedupe before applying the caller's
  // logical limit, otherwise five duplicate Analysts can crowd out every
  // other role.
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  const logicalLimit =
    nativeAuthority.native && nativeAuthority.ready ? Math.max(limit, MAX_ROSTER_ROLES + 1) : limit;
  const { data, error } = await query.limit(Math.max(logicalLimit, 500));
  if (error) throw new Error(`Unable to load eligible execution agents: ${error.message}`);
  return dedupeExecutionAgents(data || [])
    .slice(0, logicalLimit)
    .map((agent) => ({
      ...agent,
      agent_type: agent.category || 'general',
    }));
}

/**
 * Persist a goal-owned one-agent team through the same conflict-recovery path
 * used by automatic formation. The returned ID is always the committed winner
 * of migration 192's one-active-team-per-goal constraint.
 */
export async function formSingleAgentGoalTeam(admin, goal, executorId) {
  const ensuredTeam = await ensureGoalTeam(admin, goal, goal.user_id, executorId);
  await replaceGoalTeamMembers(admin, {
    teamId: ensuredTeam.teamId,
    goalId: goal.id,
    userId: goal.user_id,
    memberIds: [executorId],
  });
  return ensuredTeam;
}

/**
 * Classify the expected deliverable type for a task based on title, role, and category.
 * Used by post-task validation in evaluate-phase to enforce that code/asset/data tasks
 * actually produce real artifacts (not just markdown descriptions).
 *
 * Returns one of:
 *   markdown   — text deliverable, no tool calls required (research, strategy, planning)
 *   code       — must produce committed code in a real GitHub repo
 *   deployment — must produce a live deployment URL
 *   asset      — must produce a real image/file URL (Stability/Replicate/DALL-E)
 *   data       — must contain real fetched data from web search/scrape/HTTP
 */
function classifyDeliverableType(title = '', role = '', category = '') {
  const text = `${title} ${role} ${category}`.toLowerCase();

  // Presentation/pitch-deck tasks — must produce a real PDF via
  // tool_pdf_generator__create_slides, not a markdown description.
  if (
    /\b(pitch deck|pitch-deck|slide deck|slide-deck|investor deck|pdf deck|generate.*deck|create.*deck|build.*deck|create.*slides|generate.*slides|presentation)\b/.test(
      text
    )
  )
    return 'presentation';

  // Deployment is the strongest signal — explicit "deploy/launch/publish/live" wins
  if (/\b(deploy|launch|publish|go.live|go live|production|hosted)\b/.test(text))
    return 'deployment';

  // Code work — building software
  if (
    /\b(code|implement|build|develop|create.*app|create.*site|create.*page|landing page|api endpoint|integration|integrate|backend|frontend|database)\b/.test(
      text
    )
  ) {
    // Landing page gets its own deliverable type with dedicated format + builder
    if (/\b(landing page)\b/.test(text)) return 'landing_page';
    // Other frontend/full-stack tasks want a deployed result
    if (/\b(website|web app|web site|frontend|ui|page|site)\b/.test(text)) return 'deployment';
    return 'code';
  }

  // Visual asset generation
  if (
    /\b(logo|hero image|illustration|mockup|icon|graphic|visual|design.*image|generate.*image|product shot|asset)\b/.test(
      text
    )
  )
    return 'asset';

  // Pure design/UX specs without image generation
  if (/\b(design.*spec|wireframe|user flow|ux|ui design|style guide)\b/.test(text))
    return 'markdown';

  // Data/research tasks — competitor analysis, market research
  // These benefit from real web search but markdown summaries are also acceptable
  if (/\b(research|competitor|market analy|survey|benchmark|trends)\b/.test(text))
    return 'markdown';

  // Default — markdown is safe (no validation triggered)
  return 'markdown';
}

async function getAgentPerformance(admin, agentIds) {
  if (!agentIds?.length) return {};
  try {
    const { data } = await admin
      .from('agent_performance')
      .select(
        'agent_id, task_type, tasks_completed, tasks_failed, avg_quality_score, avg_tokens_used'
      )
      .in('agent_id', agentIds);
    const perf = {};
    for (const row of data || []) {
      if (!perf[row.agent_id]) perf[row.agent_id] = {};
      perf[row.agent_id][row.task_type] = row;
    }
    return perf;
  } catch {
    return {};
  }
}

export async function handle(admin, payload, req) {
  let goal = await loadGoal(admin, payload.goalId);
  if (!ELIGIBLE_TEAM_FORMATION_STATUSES.has(goal.status)) {
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'stage_not_eligible',
      goalStatus: goal.status,
    };
  }

  // `goals.team_id` is the legacy Consilium-team pointer. The atomic work RPC
  // can authorize and bind only an Agent Hub `agent_team_id`; treating the two
  // UUID domains as interchangeable produces a late, cryptic
  // team_work_materialized_team_required failure after reservation. Stop on
  // the original row snapshot so the user can select a current executor team.
  if (goal.team_id && !goal.agent_team_id) {
    const reason =
      'Team formation is blocked because this goal is bound to a legacy Consilium team, not an Agent Hub execution team. Select an active Agent Hub team or agent, then retry.';
    const transitioned = await updateGoalIfSnapshot(admin, goal, {
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:legacy-team-incompatible',
        legacy_team_migration: {
          status: 'executor_selection_required',
          legacy_team_id: goal.team_id,
        },
      },
    });
    if (!transitioned) {
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    await logGoalEvent(admin, goal.id, 'legacy_team_execution_blocked', {
      reason,
      legacy_team_id: goal.team_id,
    });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_legacy_team_incompatible',
    };
  }

  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  const nativeAuthorityIssues = nativeAuthority.native
    ? [
        ...(!nativeAuthority.ready
          ? nativeAuthority.reasons?.length
            ? nativeAuthority.reasons
            : ['native_scope_contract_invalid']
          : []),
        ...(nativeAuthority.ready && !nativeAuthority.packet
          ? ['native_scope_packet_missing']
          : []),
        ...(nativeAuthority.ready && !nativeAuthority.packet?.scope_hash
          ? ['native_scope_hash_missing']
          : []),
        ...(nativeAuthority.ready && !nativeAuthority.packet?.intent?.objective
          ? ['native_scope_objective_missing']
          : []),
        ...(nativeAuthority.ready && !nativeAuthority.route?.playbook_id
          ? ['native_work_shape_route_missing']
          : []),
      ]
    : [];
  if (nativeAuthority.native && nativeAuthorityIssues.length) {
    const reason = `Team formation is blocked because the accepted native AxWise scope authority is missing or stale: ${nativeAuthorityIssues.join(', ')}.`;
    const transitioned = await updateGoalIfSnapshot(admin, goal, {
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:native-scope-authority',
        native_scope_authority: {
          status: 'blocked',
          reasons: nativeAuthorityIssues,
        },
      },
    });
    if (!transitioned) {
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    await logGoalEvent(admin, goal.id, 'native_scope_team_formation_blocked', {
      reason,
      reasons: nativeAuthorityIssues,
    });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_native_scope_authority',
      reasons: nativeAuthorityIssues,
    };
  }
  const authoritativeGoal = nativeAuthority.native ? goalOrchestrationAuthorityView(goal) : goal;
  const authoritativeGoalTitle = authoritativeGoal.title;
  const nativePlanningAttempt = nativeAuthority.native
    ? goal.data?.native_planning_attempt || null
    : null;
  const currentNativePlanHash = nativeAuthority.native
    ? hashApprovalSnapshot('native-execution-plan', goal.plan || null)
    : null;
  const nativePlanningInProgress =
    nativeAuthority.native &&
    goal.status === 'planning' &&
    nativePlanningAttempt?.version === 'orqaly_native_planning_attempt_v1' &&
    Boolean(nativePlanningAttempt?.attempt_id) &&
    nativePlanningAttempt?.status === 'running' &&
    nativePlanningAttempt?.scope_hash === nativeAuthority.packet.scope_hash;
  if (nativePlanningInProgress) {
    // A stale team-formation delivery may overlap the legitimate PM worker.
    // The running planner still owns the plan; converting that healthy race to
    // needs_human would cancel forward progress.
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'state_changed',
      reason: 'native_planning_in_progress',
    };
  }
  const nativePlanningIssues = nativeAuthority.native
    ? [
        nativePlanningAttempt?.version !== 'orqaly_native_planning_attempt_v1'
          ? 'native_planning_attempt_version_invalid'
          : null,
        !nativePlanningAttempt?.attempt_id ? 'native_planning_attempt_id_missing' : null,
        nativePlanningAttempt?.status !== 'completed'
          ? 'native_planning_attempt_not_completed'
          : null,
        nativePlanningAttempt?.scope_hash !== nativeAuthority.packet.scope_hash
          ? 'native_planning_attempt_scope_mismatch'
          : null,
        nativePlanningAttempt?.plan_hash !== currentNativePlanHash
          ? 'native_planning_attempt_plan_mismatch'
          : null,
        !isDeepStrictEqual(nativePlanningAttempt?.plan_snapshot, goal.plan)
          ? 'native_planning_attempt_snapshot_mismatch'
          : null,
        !nativePlanningAttempt?.completed_at ? 'native_planning_attempt_completion_missing' : null,
      ].filter(Boolean)
    : [];
  if (nativePlanningIssues.length) {
    const reason = `Team formation is blocked because the accepted native execution plan is incomplete or stale: ${nativePlanningIssues.join(', ')}.`;
    const transitioned = await updateGoalIfSnapshot(admin, goal, {
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:native-planning-authority',
        native_planning_authority: {
          status: 'blocked',
          reasons: nativePlanningIssues,
          scope_hash: nativeAuthority.packet.scope_hash,
          plan_hash: currentNativePlanHash,
        },
      },
    });
    if (!transitioned) {
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    await logGoalEvent(admin, goal.id, 'native_plan_team_formation_blocked', {
      reason,
      reasons: nativePlanningIssues,
    });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_native_planning_authority',
      reasons: nativePlanningIssues,
    };
  }
  const baseNativeEntryBinding = nativeAuthority.native
    ? acceptedNativePlanningActionBinding(goal, nativeAuthority)
    : null;
  const nativeEntryBinding = baseNativeEntryBinding
    ? {
        ...baseNativeEntryBinding,
        planning_attempt_id: nativePlanningAttempt.attempt_id,
        planning_attempt_status: 'completed',
        planning_plan_hash: currentNativePlanHash,
      }
    : null;
  if (nativeAuthority.native && !nativeEntryBinding) {
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'state_changed',
    };
  }
  const nativeRequiredRoles = nativeAuthority.native
    ? goalRequiredExecutionRoles(goal, MAX_ROSTER_ROLES)
    : [];
  if (nativeRequiredRoles.length > MAX_ROSTER_ROLES) {
    const reasons = ['native_required_role_roster_exceeds_limit'];
    const reason = `Team formation is blocked because the accepted native AxWise scope requires ${nativeRequiredRoles.length} distinct executor roles, above the bounded roster capacity of ${MAX_ROSTER_ROLES}. Revise the canonical role contract before execution.`;
    const roleCapacityPatch = {
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:native-role-capacity',
        native_scope_authority: {
          status: 'blocked',
          reasons,
          required_roles: nativeRequiredRoles,
          maximum_roles: MAX_ROSTER_ROLES,
        },
      },
    };
    const transitioned = nativeAuthority.native
      ? await updateGoalIfNativeScopeBinding(
          admin,
          goal.id,
          goal.status,
          nativeEntryBinding,
          roleCapacityPatch
        )
      : await updateGoalIfStatus(admin, goal.id, goal.status, roleCapacityPatch);
    if (!transitioned) {
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    await logGoalEvent(admin, goal.id, 'native_scope_team_formation_blocked', {
      reason,
      reasons,
      required_roles: nativeRequiredRoles,
      maximum_roles: MAX_ROSTER_ROLES,
    });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_native_role_capacity',
      reasons,
    };
  }
  const nativeTeamFormationAttempt = {
    version: 'orqaly_team_formation_attempt_v1',
    attempt_id: generateId('ntf'),
    scope_hash: nativeAuthority.native ? nativeAuthority.packet.scope_hash : null,
    planning_attempt_id: nativePlanningAttempt?.attempt_id || null,
    plan_hash: currentNativePlanHash,
    status: 'running',
    started_at: new Date().toISOString(),
    source_goal_updated_at: goal.updated_at,
  };
  const formationReservationPatch = {
    status: 'forming_team',
    data: {
      ...(goal.data || {}),
      team_formation_attempt: nativeTeamFormationAttempt,
      ...(nativeAuthority.native
        ? { native_team_formation_attempt: nativeTeamFormationAttempt }
        : {}),
    },
    updated_at: nativeTeamFormationAttempt.started_at,
  };
  const reserved = nativeAuthority.native
    ? await updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        goal.status,
        nativeEntryBinding,
        formationReservationPatch
      )
    : await reserveGoalTeamFormationAttempt(
        admin,
        goal,
        nativeTeamFormationAttempt,
        formationReservationPatch
      );
  if (!reserved) {
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'state_changed',
    };
  }
  goal = {
    ...goal,
    status: formationReservationPatch.status,
    data: formationReservationPatch.data,
    updated_at: formationReservationPatch.updated_at,
  };

  const nativeFormationBinding = nativeAuthority.native
    ? {
        ...nativeEntryBinding,
        goal_updated_at: undefined,
        team_formation_attempt_id: nativeTeamFormationAttempt.attempt_id,
      }
    : null;
  const bindFormationAttempt = (updates) => {
    if (!updates?.data) return updates;
    const attempt = {
      ...nativeTeamFormationAttempt,
      ...(updates.data.native_team_formation_attempt || {}),
      ...(updates.data.team_formation_attempt || {}),
    };
    return {
      ...updates,
      data: {
        ...updates.data,
        team_formation_attempt: attempt,
        ...(nativeAuthority.native ? { native_team_formation_attempt: attempt } : {}),
      },
    };
  };
  let teamFormationOwnedStatus = 'forming_team';
  const persistTeamFormationOutcome = async (updates) => {
    if (nativeAuthority.native) {
      return updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        teamFormationOwnedStatus,
        nativeFormationBinding,
        bindFormationAttempt(updates)
      );
    }
    return updateGoalIfTeamFormationAttempt(
      admin,
      goal.id,
      teamFormationOwnedStatus,
      nativeTeamFormationAttempt.attempt_id,
      bindFormationAttempt(updates)
    );
  };
  const stateChangedResult = () => ({
    type: 'orchestrate-goal',
    action: 'team-formation',
    goalId: goal.id,
    status: 'state_changed',
  });

  // ── Executor-aware team formation ────────────────────────────
  const { executor_type, org_id, executor_id } = goal;
  const organizationScoped = requiresOrganizationAgentScope(goal);
  let teamId = goal.agent_team_id || goal.team_id;
  let formResult = null;
  let teamProposal = null;
  let teamProposalMemberIds = [];
  let scopeAgentIds = null;
  let scopedActiveAgents = null;
  let scopeFailureReason = null;
  let materializedScope = null;

  if (executor_type === 'team' && executor_id && teamId && String(teamId) !== String(executor_id)) {
    const reason =
      'Execution is blocked because the selected team no longer matches the team already bound to this goal. Confirm the executor again before formation.';
    const transitioned = await persistTeamFormationOutcome({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:executor-team-mismatch',
      },
    });
    if (!transitioned) return stateChangedResult();
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_executor_team_mismatch',
    };
  }

  if (organizationScoped) {
    try {
      if (!executor_type || executor_type === 'organization') {
        materializedScope = await materializeOrganizationAgentScope(admin, goal);
      }
      const mappedAgentIds = await loadOrganizationAgentIds(admin, goal);
      scopedActiveAgents = await loadDirectFallbackAgents(admin, goal, mappedAgentIds, 500);
      scopeAgentIds = scopedActiveAgents.map((agent) => String(agent.id));
      log.info(req, 'team-formation.scoped-to-org', {
        orgId: org_id,
        mappedCount: mappedAgentIds.length,
        activeScopeCount: scopeAgentIds.length,
        materializedCount: materializedScope?.mappedAgentIds?.length || 0,
        materializationMissingRoles: materializedScope?.missingRoles || [],
      });
    } catch (err) {
      scopeAgentIds = [];
      scopedActiveAgents = [];
      scopeFailureReason = err.message;
      log.warn(req, 'team-formation.org-scope.failed', { error: err.message });
    }
  }

  if (executor_type === 'team' && executor_id && !teamId) {
    // Pre-assigned team — skip auto-formation
    teamId = executor_id;
    if (!(await persistTeamFormationOutcome({ agent_team_id: teamId }))) {
      return stateChangedResult();
    }
    log.info(req, 'team-formation.pre-assigned-team', { teamId, executorType: 'team' });
  } else if (executor_type === 'agent' && executor_id && !teamId) {
    // Single agent — select a one-member goal team. The team and its exact
    // membership are committed later in the same transaction as the work
    // manifest, after this formation attempt proves it still owns the goal.
    if (organizationScoped && !scopeAgentIds.includes(String(executor_id))) {
      scopeFailureReason = `Agent ${executor_id} is not an active member of organization ${org_id}.`;
      log.warn(req, 'team-formation.single-agent.out-of-scope', {
        orgId: org_id,
        agentId: executor_id,
      });
    } else {
      try {
        const { data: selectedAgent, error: selectedAgentError } = await admin
          .from('agents')
          .select(AGENT_SELECT)
          .eq('id', executor_id)
          .eq('user_id', goal.user_id)
          .eq('status', 'active')
          .single();
        if (selectedAgentError || !selectedAgent) {
          throw new Error(selectedAgentError?.message || 'Selected agent is unavailable');
        }
        const existingGoalTeam = await findReusableGoalTeam(admin, goal.user_id, goal.id);
        teamId = existingGoalTeam?.id || null;
        const singleMember = {
          ...selectedAgent,
          agent_type: selectedAgent.category || 'general',
        };
        teamProposal = {
          ...(teamId ? { id: teamId } : {}),
          user_id: goal.user_id,
          goal_id: goal.id,
          name: `Goal: ${String(authoritativeGoalTitle || 'Untitled goal').slice(0, 50)}`,
          description: `Team for goal: ${String(authoritativeGoalTitle || 'Untitled goal')}`,
          leader_id: selectedAgent.id,
        };
        teamProposalMemberIds = [selectedAgent.id];
        formResult = {
          teamId,
          members: [singleMember],
          leaderId: selectedAgent.id,
          proposedTeam: teamProposal,
          decisionLog: {
            requiredRoles: [selectedAgent.category || selectedAgent.name],
            matchedRoles: [
              {
                role: selectedAgent.category || selectedAgent.name,
                agent: selectedAgent.name,
                via: 'explicit-agent',
              },
            ],
            unmatchedRoles: [],
            fallbackPicks: [],
            leader: selectedAgent.name,
          },
        };
        log.info(req, 'team-formation.single-agent-team', {
          teamId,
          agentId: executor_id,
          pendingAtomicMaterialization: true,
        });
      } catch (err) {
        log.warn(req, 'team-formation.single-agent.failed', { error: err.message });
      }
    }
  } else if (!teamId) {
    // Auto-form team (default) — optionally scoped to org's agents
    if (!organizationScoped || scopeAgentIds.length > 0) {
      try {
        formResult = await formTeam(admin, goal, goal.user_id, scopeAgentIds, {
          persistTeam: false,
        });
        if (organizationScoped) {
          const allowed = new Set(scopeAgentIds);
          const leaked = (formResult?.members || []).filter(
            (member) => !allowed.has(String(member.id))
          );
          if (leaked.length) {
            scopeFailureReason =
              'Team formation returned agents outside the selected organization and was rejected.';
            formResult = { ...formResult, members: [] };
            log.warn(req, 'team-formation.org-scope.rejected', {
              orgId: org_id,
              rejectedAgentIds: leaked.map((member) => member.id),
            });
          }
        }
        if (formResult?.teamId && !scopeFailureReason) {
          teamId = formResult.teamId;
        }
        if (
          formResult?.proposedTeam &&
          formResult?.leaderId &&
          formResult?.members?.length &&
          !scopeFailureReason
        ) {
          teamProposal = formResult.proposedTeam;
          teamProposalMemberIds = (formResult.members || []).map((member) => member.id);
        }
        log.info(req, 'team-formation.result', {
          teamId: formResult?.teamId,
          memberCount: formResult?.members?.length || 0,
          members: (formResult?.members || []).map((m) => m.name),
          executorType: executor_type || 'default',
        });
      } catch (err) {
        log.warn(req, 'team-formation.form-team.failed', { error: err.message });
      }
    } else if (!scopeFailureReason) {
      scopeFailureReason = `Organization ${org_id} has no active Agent Hub agents assigned.`;
      log.warn(req, 'team-formation.org-scope.empty', { orgId: org_id });
    }
  }

  // Use members from formTeam result, or load from DB
  let members = formResult?.members || [];

  // Fallback: if no members from formTeam, load agents directly
  if (members.length === 0 && !teamId) {
    try {
      const directAgents = organizationScoped
        ? scopedActiveAgents || []
        : await loadDirectFallbackAgents(admin, goal);
      members = directAgents;
      if (members.length > 0) {
        log.info(req, 'team-formation.direct-fallback', {
          count: members.length,
          organizationScoped,
        });
      }
    } catch (err) {
      log.warn(req, 'team-formation.direct-fallback.failed', { error: err.message });
    }
  }
  if (teamId && members.length === 0) {
    try {
      // Load from agent_team_members (new) first, fallback to concilium_team_members (legacy)
      let memberIds = [];
      const { data: agentTeamMembers } = await admin
        .from('agent_team_members')
        .select('member_id')
        .eq('team_id', teamId);
      if (agentTeamMembers?.length) {
        memberIds = agentTeamMembers.map((m) => m.member_id);
      } else {
        const { data: conciliumMembers } = await admin
          .from('concilium_team_members')
          .select('member_id')
          .eq('team_id', teamId);
        memberIds = (conciliumMembers || []).map((m) => m.member_id);
      }
      if (memberIds.length) {
        if (organizationScoped) {
          const allowed = new Set(scopeAgentIds || []);
          memberIds = memberIds.filter((id) => allowed.has(String(id)));
        }
        let agentQuery = admin
          .from('agents')
          .select(AGENT_SELECT)
          .eq('user_id', goal.user_id)
          .eq('status', 'active');
        if (memberIds.length) agentQuery = agentQuery.in('id', memberIds);
        const { data: agents, error: agentsError } = memberIds.length
          ? await agentQuery
          : { data: [], error: null };
        if (agentsError) throw agentsError;
        members = (agents || []).map((a) => ({ ...a, agent_type: a.category || 'general' }));
      }
    } catch (err) {
      log.warn(req, 'team-formation.load-members.failed', { error: err.message });
    }
  }

  if (!teamId && members.length > 0 && !teamProposal) {
    members = members.slice(0, MAX_ROSTER_ROLES + 1);
    const leader = members.find((member) => isLeadershipRole(member)) || members[0];
    teamProposal = {
      user_id: goal.user_id,
      goal_id: goal.id,
      name: `Goal: ${String(authoritativeGoalTitle || 'Untitled goal').slice(0, 50)}`,
      description: `Team for goal: ${String(authoritativeGoalTitle || 'Untitled goal')}`,
      leader_id: leader.id,
    };
    teamProposalMemberIds = members.map((member) => member.id);
  }

  // Hard-fail guard: after every agent-loading fallback (formTeam → direct
  // agents → team-member tables), if we STILL have no members, do not
  // synthesise fake agents via pickBestAgent([]) — that path produces tasks
  // with assigned_agent_id=null and generic names, every downstream
  // deliverable comes back hollow, and the goal burns through max_iterations
  // before the user sees why. Stop now with a clear reason.
  if (members.length === 0) {
    const reason = organizationScoped
      ? scopeFailureReason ||
        `No active agents are assigned to organization ${org_id}. Assign Agent Hub agents to this organization before execution.`
      : 'No agents available — create agents in Agent Hub (public.agents with status=active), or assign a pre-existing team/agent as the executor.';
    const transitioned = await persistTeamFormationOutcome({
      status: 'failed',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failed_at: new Date().toISOString(),
        failure_stage: 'team-formation',
      },
    });
    if (!transitioned) return stateChangedResult();
    await logGoalEvent(admin, goal.id, 'goal_failed', { reason, stage: 'team-formation' });
    log.warn(req, 'team-formation.no-agents.fail-fast', { goalId: goal.id, userId: goal.user_id });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'failed_no_agents',
    };
  }

  if (
    executor_type === 'agent' &&
    executor_id &&
    (members.length !== 1 || String(members[0]?.id) !== String(executor_id))
  ) {
    const reason =
      'Execution is blocked because the goal is bound to a single executor, but its existing team roster contains a different or additional agent. Confirm the executor again before formation.';
    const transitioned = await persistTeamFormationOutcome({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:executor-agent-roster-mismatch',
      },
    });
    if (!transitioned) return stateChangedResult();
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_executor_agent_mismatch',
    };
  }

  // An organization boundary is also an execution-authorization boundary.
  // Do not let best-match scoring silently assign specialist tasks to an
  // unrelated in-scope agent. Persistent materialization above should cover
  // normal gaps; if it cannot, stop before tasks/proposal/approval exist and
  // tell the user exactly which Agent Hub roles remain required.
  if (organizationScoped && (!executor_type || executor_type === 'organization')) {
    const coverage = evaluateOrganizationTeamCoverage(goal, members);
    const { requiredRoles, coordinatorPresent } = coverage;
    const missingCoverage = coverage.missingRoles;
    if (missingCoverage.length) {
      const reason = `Execution team is incomplete for organization ${org_id}. Add or authorize these Agent Hub roles, then retry: ${missingCoverage.join(', ')}.`;
      const transitioned = await persistTeamFormationOutcome({
        status: 'needs_human',
        data: {
          ...(goal.data || {}),
          failure_reason: reason,
          failure_stage: 'team-formation:coverage',
          team_coverage: {
            status: 'incomplete',
            required_roles: requiredRoles,
            missing_roles: missingCoverage,
            coordinator_present: coordinatorPresent,
          },
        },
      });
      if (!transitioned) return stateChangedResult();
      await logGoalEvent(admin, goal.id, 'team_coverage_incomplete', {
        reason,
        required_roles: requiredRoles,
        missing_roles: missingCoverage,
        organization_id: org_id,
      });
      log.warn(req, 'team-formation.coverage-incomplete', {
        goalId: goal.id,
        orgId: org_id,
        missingRoles: missingCoverage,
      });
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'needs_human_missing_roles',
        missingRoles: missingCoverage,
      };
    }
  }

  // Get performance data for team members
  const perfData = await getAgentPerformance(
    admin,
    members.map((m) => m.id)
  );

  // Build rich team summary with roles and performance
  const teamSummary = members.map((m) => {
    const perf = perfData[m.id] || {};
    const generalPerf = perf.general || {};
    return {
      id: m.id,
      name: m.name,
      type: m.agent_type || 'general',
      description: m.description?.slice(0, 100),
      capabilities: m.capabilities || [],
      cost_per_task: m.cost_per_task || 0,
      metadata: m.metadata || {},
      tasks_completed: generalPerf.tasks_completed || 0,
      tasks_failed: generalPerf.tasks_failed || 0,
      avg_quality: generalPerf.avg_quality_score || 0,
    };
  });

  if (formResult?.decisionLog) {
    const nextGoalData = {
      ...(goal.data || {}),
      team_formation_log: formResult.decisionLog,
    };
    if (!(await persistTeamFormationOutcome({ data: nextGoalData }))) {
      return stateChangedResult();
    }
    goal = {
      ...goal,
      data: bindFormationAttempt({ data: nextGoalData }).data,
    };
  }

  // Re-load the exact normalized research run after the team exists. Planning
  // may only proceed on the approved bundle, but task materialization also
  // needs one role-specific executor persona per planned specialist.
  const researchPointer = goal.data?.axwise_customer_intelligence?.research_bundle;
  const researchRequired = goalRequiresResearchBundle(goal) || Boolean(researchPointer?.run_id);
  let goalResearch = null;
  let researchBoundary = null;
  if (researchRequired) {
    try {
      goalResearch = await loadGoalResearchBundle(admin, goal);
      researchBoundary = validateGoalResearchBoundary(goal, goalResearch);
    } catch (err) {
      researchBoundary = {
        ok: false,
        reasons: ['research_bundle_load_failed'],
        error: err.message,
      };
    }
    const requiredRoles = goalRequiredExecutionRoles(goal, 20);
    const personaCoverage = goalResearch
      ? validateResearchRoleCoverage(goalResearch, requiredRoles)
      : { ok: false, missingRoles: requiredRoles };
    if (!researchBoundary?.ok || !personaCoverage.ok) {
      const reasons = [
        ...(researchBoundary?.reasons || []),
        ...personaCoverage.missingRoles.map((role) => `missing_executor_persona:${role}`),
      ];
      const reason = `Execution is blocked because the approved AxWise research contract cannot cover the planned team: ${reasons.join(', ')}.`;
      const transitioned = await persistTeamFormationOutcome({
        status: 'needs_human',
        data: {
          ...(goal.data || {}),
          failure_reason: reason,
          failure_stage: 'team-formation:research-boundary',
          research_boundary: {
            status: 'blocked',
            reasons,
            missing_executor_persona_roles: personaCoverage.missingRoles,
          },
          axwise_customer_intelligence: {
            ...(goal.data?.axwise_customer_intelligence || {}),
            status: 'required_research_blocked',
            reason,
            research_failure: {
              code: 'research_persona_coverage_incomplete',
              message: reason,
              stage: 'team-formation',
              retryable: true,
            },
            updated_at: new Date().toISOString(),
          },
        },
      });
      if (!transitioned) return stateChangedResult();
      await logGoalEvent(admin, goal.id, 'research_execution_boundary_blocked', {
        stage: 'team-formation',
        reasons,
        missing_executor_persona_roles: personaCoverage.missingRoles,
      });
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'needs_human_research_personas',
        reasons,
      };
    }
  }

  // AxWise evaluates the whole goal plan against the live Orqaly agent/tool
  // catalogue. Shadow mode records the recommendation; authoritative mode
  // may change assignments only after every returned ID is revalidated.
  const axwiseOrchestration = await orchestrateGoalWithAxwise({
    admin,
    goal,
    members: teamSummary,
    toolInfo: TOOL_INFO,
    persistRecord: false,
  });
  const orchestrationRecord = axwiseOrchestration.record || {
    decision_id: axwiseOrchestration.decision?.decision_id || null,
    iteration: Number(goal.iteration || 0),
    retry_count: Number(goal.data?.retry_count || 0),
    status: axwiseOrchestration.status || 'degraded',
    applied: false,
    feasible: false,
    degraded: true,
    error: String(
      axwiseOrchestration.error?.message || 'Missing AxWise orchestration record'
    ).slice(0, 200),
    created_at: new Date().toISOString(),
  };
  const priorOrchestrationRecords = Array.isArray(goal.data?.axwise_orchestration_history)
    ? goal.data.axwise_orchestration_history
    : [];
  const orchestrationGoalData = {
    ...(goal.data || {}),
    axwise_orchestration: orchestrationRecord,
    axwise_orchestration_history: [...priorOrchestrationRecords, orchestrationRecord].slice(-5),
  };
  if (!(await persistTeamFormationOutcome({ data: orchestrationGoalData }))) {
    return stateChangedResult();
  }
  goal = {
    ...goal,
    data: bindFormationAttempt({ data: orchestrationGoalData }).data,
  };
  const axwiseDecisionEvent = axwiseOrchestration.decision?.decision_id
    ? {
        decision_id: axwiseOrchestration.decision.decision_id,
        status: axwiseOrchestration.decision.status,
        routing_mode: axwiseOrchestration.decision.routing_mode,
        feasible: axwiseOrchestration.feasible,
        applied: axwiseOrchestration.applied,
        rejections: axwiseOrchestration.rejections || [],
      }
    : null;

  // ── Create ALL tasks upfront (status: 'planned') — BATCH INSERT ──
  // Tasks are visible in Work Log immediately. They wait for tool setup + approval before execution.
  const phases = goal.plan?.phases || [];
  const jobRows = [];
  const taskRows = [];
  const unassignableTasks = [];
  const rejectedAxwiseAssignments = [];
  const researchPersonaBindings = [];
  const researchMaterializationKey = goalResearch
    ? researchMaterializationAttempt(
        goal,
        researchBoundary.run.id,
        axwiseOrchestration,
        teamSummary
      )
    : null;
  for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
    const phase = phases[phaseIdx];
    for (let jobIdx = 0; jobIdx < (phase.jobs || []).length; jobIdx++) {
      const jobSpec = phase.jobs[jobIdx];
      const stepId = `phase-${phaseIdx + 1}-job-${jobIdx + 1}`;
      // Canonicalize once and reuse for every downstream write, so the value the
      // gate compares is the value that was matched against.
      const requiredRole = jobSpec.required_role
        ? formatExecutionRole(jobSpec.required_role)
        : null;
      const localAgent = pickBestAgent(
        members,
        `${jobSpec.title} ${jobSpec.description} role: ${requiredRole || ''}`,
        requiredRole,
        { strict: true }
      );
      const axwiseAgentId = axwiseOrchestration.applied
        ? axwiseOrchestration.assignments?.[stepId]
        : null;
      const axwiseAgent =
        members.find((member) => String(member.id) === String(axwiseAgentId)) || null;
      // An AxWise assignment is a recommendation, not an authorization. It may
      // only override a role-verified local pick if it is itself role-verified.
      const axwiseAgentAuthorized =
        axwiseAgent && (!requiredRole || agentMatchesRequiredRole(axwiseAgent, requiredRole));
      if (axwiseAgent && !axwiseAgentAuthorized) {
        rejectedAxwiseAssignments.push({
          step_id: stepId,
          agent_id: String(axwiseAgent.id),
          required_role: requiredRole,
        });
      }
      const agent = axwiseAgentAuthorized ? axwiseAgent : localAgent;
      if (!agent) {
        // Do not build a row we know cannot be authorized.
        unassignableTasks.push({
          step_id: stepId,
          title: jobSpec.title,
          required_role: requiredRole,
        });
        continue;
      }
      const workMaterializationKey =
        researchMaterializationKey || nativeTeamFormationAttempt?.attempt_id || null;
      const jobId = workMaterializationKey
        ? materializationRowId('job', workMaterializationKey, stepId)
        : generateId('job');
      const estimateHours = Number(jobSpec.estimate_hours) || 1;
      const dueDate = new Date(Date.now() + estimateHours * 60 * 60 * 1000).toISOString();
      const axwiseExecutionContext = createTaskExecutionContext({
        goal: authoritativeGoal,
        agentId: agent?.id || null,
        decisionId: axwiseOrchestration.decision?.decision_id || null,
        stepId,
        assignmentApplied: Boolean(axwiseAgentId),
      });
      const researchSelection = goalResearch
        ? selectTaskResearchPersonas(goalResearch, {
            requiredRole: requiredRole,
            agentId: agent?.id || null,
          })
        : null;
      const researchOverlay = researchSelection
        ? taskResearchExecutionOverlay(researchSelection, researchBoundary, requiredRole)
        : null;
      const taskExecutionContext = researchOverlay
        ? {
            ...(axwiseExecutionContext || {}),
            ...researchOverlay,
            version: 'orqaly_goal_execution_persona_v2',
            source_job_id:
              axwiseExecutionContext?.source_job_id ||
              goal.data?.axwise_customer_intelligence?.job_id ||
              null,
            decision_id: axwiseOrchestration.decision?.decision_id || null,
            step_id: stepId,
            assignment: {
              ...(axwiseExecutionContext?.assignment || {}),
              agent_id: agent?.id || null,
              agent_name: agent?.name || null,
              role: requiredRole || null,
              applied: Boolean(axwiseAgentId),
              source: axwiseAgentId ? 'axwise_orchestration' : 'orqaly_role_match',
            },
            authorization_status: 'pending_execution_approval',
            authoritative: false,
            executable: false,
          }
        : axwiseExecutionContext;
      const taskId = workMaterializationKey
        ? materializationRowId('task', workMaterializationKey, stepId)
        : generateId('task');

      if (researchSelection?.executor_persona && agent?.id) {
        researchPersonaBindings.push({
          agentId: agent.id,
          selection: researchSelection,
          requiredRole: requiredRole,
          stepId,
          taskId,
        });
      }

      jobRows.push({
        id: jobId,
        user_id: goal.user_id,
        goal_id: goal.id,
        description: `${jobSpec.title}: ${jobSpec.description}`,
        category: jobSpec.category || 'general',
        requirements: jobSpec.requirements || '',
        status: 'active',
        assigned_agent_id: agent?.id || null,
        assigned_agent_name: agent?.name || '',
        ...(nativeTeamFormationAttempt
          ? { materialization_attempt: nativeTeamFormationAttempt.attempt_id }
          : {}),
      });
      taskRows.push({
        id: taskId,
        user_id: goal.user_id,
        job_pool_id: jobId,
        title: `${jobSpec.title} — ${authoritativeGoalTitle}`,
        description: [
          jobSpec.description,
          '',
          `Role: ${requiredRole || 'general'}`,
          jobSpec.tool_requirements?.length
            ? `Tools: ${jobSpec.tool_requirements.join(', ')}`
            : null,
          jobSpec.acceptance_criteria?.length
            ? `Acceptance criteria:\n${jobSpec.acceptance_criteria.map((c) => `  - ${c}`).join('\n')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
        status: 'planned',
        sequence_order: phaseIdx * 100 + jobIdx + 1,
        assigned_to: agent?.name || requiredRole || null,
        agent_id: agent?.id || null,
        category: 'AI Agents',
        goal_id: goal.id,
        estimate: estimateHours ? `${estimateHours}h` : null,
        deadline: dueDate.split('T')[0],
        priority: goal.parsed_priority || 'medium',
        data: {
          category: jobSpec.category,
          goal_id: goal.id,
          phase_index: phaseIdx,
          required_role: requiredRole,
          tool_requirements: jobSpec.tool_requirements || [],
          acceptance_criteria: jobSpec.acceptance_criteria || [],
          goal_title: authoritativeGoalTitle,
          materialization_attempt: workMaterializationKey,
          goal_retry_count: Number(goal.data?.retry_count || 0),
          phase_name: phase.name,
          axwise_decision_id: axwiseOrchestration.decision?.decision_id || null,
          axwise_step_id: stepId,
          axwise_assignment_applied: Boolean(axwiseAgentId),
          axwise_execution_context: taskExecutionContext,
          // Respect the PM's explicit deliverable_type if set (landing-page
          // goals use the mandatory 3-phase structure where Phase 1 = markdown
          // design brief, Phase 2 = deployment, Phase 3 = markdown QA). Only
          // fall back to heuristic classification when the PM didn't specify
          // one — without this override, classifyDeliverableType was seeing
          // "landing page" in task titles like "Landing Page Design Brief"
          // and wrongly returning 'deployment', turning Iris's design brief
          // task into a broken deployment that never called deploy_site.
          deliverable_type:
            jobSpec.deliverable_type ||
            classifyDeliverableType(jobSpec.title, requiredRole, jobSpec.category),
        },
        ...(nativeTeamFormationAttempt
          ? { materialization_attempt: nativeTeamFormationAttempt.attempt_id }
          : {}),
      });
    }
  }

  let researchAssignmentRows = [];
  if (goalResearch) {
    researchAssignmentRows = buildGoalAgentPersonaAssignmentRows({
      goal,
      boundary: researchBoundary,
      bindings: researchPersonaBindings,
      decisionId: axwiseOrchestration.decision?.decision_id || null,
    });
    const bindingCoverage = validateResearchTaskBindingCoverage(taskRows, researchAssignmentRows);
    if (!bindingCoverage.ok) {
      const uncoveredCount = new Set([
        ...bindingCoverage.missingContractTaskIds,
        ...bindingCoverage.missingTaskIds,
        ...bindingCoverage.duplicateTaskIds,
        ...bindingCoverage.unexpectedTaskIds,
      ]).size;
      const reason = `Execution is blocked because ${uncoveredCount} planned task binding(s) do not exactly match the durable AxWise executor persona contract.`;
      const transitioned = await persistTeamFormationOutcome({
        status: 'needs_human',
        data: {
          ...(goal.data || {}),
          failure_reason: reason,
          failure_stage: 'team-formation:research-persona-persistence',
        },
      });
      if (!transitioned) return stateChangedResult();
      await logGoalEvent(admin, goal.id, 'research_persona_assignment_blocked', {
        reason,
        expected_task_count: bindingCoverage.expectedTaskCount,
        bound_task_count: bindingCoverage.boundTaskCount,
        missing_contract_task_ids: bindingCoverage.missingContractTaskIds,
        unbound_task_ids: bindingCoverage.missingTaskIds,
        duplicate_binding_task_ids: bindingCoverage.duplicateTaskIds,
        unexpected_binding_task_ids: bindingCoverage.unexpectedTaskIds,
      });
      return {
        type: 'orchestrate-goal',
        action: 'team-formation',
        goalId: goal.id,
        status: 'needs_human_research_persona_persistence',
      };
    }
  }

  // Nothing may be persisted that the authorization gate would refuse. A task
  // whose required role no in-scope agent can perform, or that names a
  // coordinator, is unapprovable no matter how many times Gate 2 is re-entered.
  // Stopping here gives the user the role name instead of an opaque manifest
  // issue two stages later. Unconditional: this closes the org-scope and
  // executor_type holes in the coverage guard above.
  const { leadershipRoles: plannedCoordinatorRoles } = planTaskExecutionRoles(goal);
  if (unassignableTasks.length || plannedCoordinatorRoles.length) {
    const roleList = [
      ...new Set([
        ...plannedCoordinatorRoles.map((role) => `${role} (coordinators never execute tasks)`),
        ...unassignableTasks.map((task) => task.required_role || task.title),
      ]),
    ];
    const scope = goal.org_id ? 'organization' : 'workspace';
    const reason =
      `Execution cannot be authorized: ${unassignableTasks.length || plannedCoordinatorRoles.length} ` +
      `planned task(s) require roles no agent in this ${scope} can perform - ${roleList.join(', ')}. ` +
      `Add or authorize an agent for each role, or request changes so the plan uses the ` +
      `available roster.`;
    const transitioned = await persistTeamFormationOutcome({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:role-assignment',
        team_coverage: {
          status: 'unassignable',
          unassignable_tasks: unassignableTasks,
          coordinator_owned_roles: plannedCoordinatorRoles,
        },
      },
    });
    if (!transitioned) return stateChangedResult();
    await logGoalEvent(admin, goal.id, 'task_role_assignment_blocked', {
      reason,
      unassignable_tasks: unassignableTasks,
      coordinator_owned_roles: plannedCoordinatorRoles,
      rejected_axwise_assignments: rejectedAxwiseAssignments,
    });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_unassignable_roles',
    };
  }

  if (!jobRows.length || taskRows.length !== jobRows.length) {
    const reason =
      'Execution is blocked because the accepted plan did not produce a complete one-job/one-task work manifest.';
    const transitioned = await persistTeamFormationOutcome({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: 'team-formation:empty-work-manifest',
      },
    });
    if (!transitioned) return stateChangedResult();
    await logGoalEvent(admin, goal.id, 'work_materialization_blocked', { reason });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'needs_human_work_materialization',
    };
  }

  // Validate launch-critical credentials before publishing a team or runnable
  // manifest. Once the atomic RPC hands the goal to provisioning_tools, this
  // stage no longer owns the row and must never race the next worker.
  const hasCodeTask = taskRows.some((task) => task.data?.deliverable_type === 'code');
  const hasDeploymentTask = taskRows.some((task) => task.data?.deliverable_type === 'deployment');
  const missingCreds = [];
  if (hasCodeTask && !process.env.GITHUB_TOKEN) {
    missingCreds.push('GITHUB_TOKEN (required for code deliverables)');
  }
  if (hasDeploymentTask && !process.env.CLOUDFLARE_API_TOKEN) {
    missingCreds.push('CLOUDFLARE_API_TOKEN (required for deployment deliverables)');
  }
  if (missingCreds.length > 0) {
    const reason = `This goal includes ${hasCodeTask ? 'code' : ''}${hasCodeTask && hasDeploymentTask ? '/' : ''}${hasDeploymentTask ? 'deployment' : ''} tasks, but required credentials are missing: ${missingCreds.join(', ')}. Add them to .env.local (dev) or Vercel env (prod), or configure the corresponding tool in Agent Hub → Tools.`;
    const transitioned = await persistTeamFormationOutcome({
      status: 'failed',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failed_at: new Date().toISOString(),
        failure_stage: 'team-formation:credentials',
      },
    });
    if (!transitioned) return stateChangedResult();
    await logGoalEvent(admin, goal.id, 'goal_failed', {
      reason,
      stage: 'team-formation:credentials',
      missing: missingCreds,
    });
    log.warn(req, 'team-formation.missing-credentials.fail-fast', {
      goalId: goal.id,
      missing: missingCreds,
    });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: 'failed_missing_creds',
    };
  }

  // The formation token now owns one database transaction that publishes the
  // team, membership, jobs, tasks, optional research-persona bindings, and the
  // completed handoff to tool provisioning. No partial manifest is visible.
  const materializingAttempt = {
    ...nativeTeamFormationAttempt,
    status: 'materializing',
    materializing_at: new Date().toISOString(),
  };
  const materializingGoalData = {
    ...(goal.data || {}),
    team_formation_attempt: materializingAttempt,
  };
  const materializing = await persistTeamFormationOutcome({ data: materializingGoalData });
  if (!materializing) return stateChangedResult();
  goal = {
    ...goal,
    data: bindFormationAttempt({ data: materializingGoalData }).data,
  };

  let materialized;
  try {
    materialized = await materializeGoalTeamWork(admin, {
      goal,
      formationAttemptId: nativeTeamFormationAttempt.attempt_id,
      nativeScopeHash: nativeAuthority.native ? nativeAuthority.packet.scope_hash : null,
      researchRunId: goalResearch ? researchBoundary.run.id : null,
      researchAttemptKey: researchMaterializationKey,
      jobs: jobRows,
      tasks: taskRows,
      assignments: researchAssignmentRows,
      team: teamProposal,
      memberIds: teamProposal ? teamProposalMemberIds : [],
    });
  } catch (error) {
    const researchLabel = goalResearch ? 'AxWise-bound ' : '';
    const reason = `Execution is blocked because Orqaly could not atomically persist the ${researchLabel}team and work manifest: ${error.message}.`;
    const transitioned = await persistTeamFormationOutcome({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failure_stage: goalResearch
          ? 'team-formation:research-materialization'
          : 'team-formation:work-materialization',
      },
    });
    if (!transitioned) return stateChangedResult();
    await logGoalEvent(admin, goal.id, 'work_materialization_blocked', { reason });
    return {
      type: 'orchestrate-goal',
      action: 'team-formation',
      goalId: goal.id,
      status: goalResearch
        ? 'needs_human_research_materialization'
        : 'needs_human_work_materialization',
    };
  }
  if (!materialized || materialized.reused === true) return stateChangedResult();
  teamFormationOwnedStatus = 'provisioning_tools';
  teamId = materialized.team_id || teamId;
  log.info(req, 'team-formation.work-materialized', {
    goalId: goal.id,
    formationAttempt: nativeTeamFormationAttempt.attempt_id,
    researchAttempt: researchMaterializationKey,
    teamId,
    taskCount: materialized.task_count || taskRows.length,
  });
  log.info(req, 'team-formation.tasks-created', { goalId: goal.id, count: taskRows.length });

  // Native goals expose only the accepted canonical roster. Legacy goals keep
  // their historical PO-tech-doc event payload.
  const requiredRoles = nativeAuthority.native
    ? goalRequiredExecutionRoles(goal, MAX_ROSTER_ROLES)
    : goal.tech_doc?.required_capabilities || [];

  const autoCreatedCount = members.filter((m) => m.metadata?.source === 'auto-generated').length;

  const latestOwnedGoal = await loadGoal(admin, goal.id);
  const completedTeamAttempt = latestOwnedGoal?.data?.team_formation_attempt;
  const nativeCompletedAttempt = latestOwnedGoal?.data?.native_team_formation_attempt;
  const workMaterialization = latestOwnedGoal?.data?.team_work_materialization;
  if (
    latestOwnedGoal?.status !== teamFormationOwnedStatus ||
    completedTeamAttempt?.version !== 'orqaly_team_formation_attempt_v1' ||
    completedTeamAttempt?.attempt_id !== nativeTeamFormationAttempt.attempt_id ||
    completedTeamAttempt?.status !== 'completed' ||
    workMaterialization?.version !== 'orqaly_team_work_materialization_v1' ||
    workMaterialization?.formation_attempt !== nativeTeamFormationAttempt.attempt_id ||
    (nativeAuthority.native &&
      (!isDeepStrictEqual(nativeCompletedAttempt, completedTeamAttempt) ||
        completedTeamAttempt.scope_hash !== nativeAuthority.packet.scope_hash ||
        workMaterialization.native_scope_hash !== nativeAuthority.packet.scope_hash))
  ) {
    return stateChangedResult();
  }
  goal = latestOwnedGoal;

  // Resolve team name for display in UI
  let teamName = null;
  if (teamId) {
    try {
      const { data: agentTeam } = await admin
        .from('agent_teams')
        .select('name')
        .eq('id', teamId)
        .single();
      if (agentTeam?.name) {
        teamName = agentTeam.name;
      } else {
        const { data: conciliumTeam } = await admin
          .from('concilium_teams')
          .select('name')
          .eq('id', teamId)
          .single();
        if (conciliumTeam?.name) teamName = conciliumTeam.name;
      }
    } catch {
      /* non-critical */
    }
  }

  if (axwiseDecisionEvent) {
    await logGoalEvent(admin, goal.id, 'axwise_orchestration_decision', axwiseDecisionEvent);
  }
  await logGoalEvent(admin, goal.id, 'team_approved', {
    team_id: teamId,
    team_name: teamName,
    members: teamSummary.map((m, i) => ({
      ...m,
      source: members[i]?.metadata?.source || 'existing',
    })),
    member_count: teamSummary.length,
    auto_created_count: autoCreatedCount,
    required_roles: requiredRoles,
    leader: teamSummary[0]?.name || null,
    mode: goal.mode,
    ...teamFormationReviewState(goal),
    axwise_decision_id: axwiseOrchestration.decision?.decision_id || null,
    axwise_assignment_applied: axwiseOrchestration.applied,
  });

  // External image enrichment is part of the signed gate-2 manifest and runs
  // only after approval. First resolve tools and build the final proposal.
  await enqueueGoalAction(admin, 'tool-provisioning', goal.id);
  return {
    type: 'orchestrate-goal',
    action: 'team-formation',
    goalId: goal.id,
    teamId,
    memberCount: members.length,
  };
}
