/**
 * Stage 4: Tool Provisioning
 *
 * Checks tool availability and provisions missing tools.
 * Auto-provision via Browser Automation Lead if user has identity configured.
 * Falls back to awaiting_tools if provisioning fails.
 *
 * Output: tools configured and ready.
 * Next: discovery-estimation in every mode so the final human approval sees
 * the exact plan, team, tools, cost and assignment package.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import {
  generateId,
  logGoalEvent,
  reserveGoalToolProvisioningAttempt,
  updateGoalIfNativeScopeBinding,
  updateGoalIfToolProvisioningAttempt,
  loadGoal,
  enqueueGoalAction,
  notifyGoalEvent,
  TOOL_INFO,
} from '../_helpers.js';
import { apply as applyHumanCredentialCheckpoint } from '../healing-strategies/h45-human-credential.js';
import { PREDEFINED_TOOLS } from '../../../src/config/predefinedTools.js';
import { resolveToolCredential } from '../../agent-handlers/tool-credentials.js';
import { normalizeToolId } from '../../_shared/tool-ids.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import { ensureOwnedToolPlaceholder } from './_tool-placeholder.js';
import {
  acceptedNativePlanningActionBinding,
  resolveAcceptedNativeGoalAuthority,
} from '../../_shared/native-goal-authority.js';

const log = createLogger('goal-stage:tool-provisioning');
const TOOL_DEFINITION_BY_ID = new Map(PREDEFINED_TOOLS.map((tool) => [tool.id, tool]));

function stateChangedResult(goal) {
  return {
    type: 'orchestrate-goal',
    action: 'tool-provisioning',
    goalId: goal.id,
    status: 'state_changed',
  };
}

function completedTeamFormationAttempt(goal, authority) {
  const attempt = goal?.data?.team_formation_attempt;
  const nativeAttempt = goal?.data?.native_team_formation_attempt;
  const commonReady = Boolean(
    attempt?.version === 'orqaly_team_formation_attempt_v1' &&
    attempt.status === 'completed' &&
    attempt.completed_at &&
    attempt.attempt_id
  );
  if (!commonReady) return null;
  if (!authority.native) return attempt;
  return nativeAttempt?.version === 'orqaly_team_formation_attempt_v1' &&
    nativeAttempt?.attempt_id === attempt.attempt_id &&
    nativeAttempt?.status === 'completed' &&
    nativeAttempt?.completed_at &&
    nativeAttempt?.completed_at === attempt.completed_at &&
    attempt.scope_hash === authority?.packet?.scope_hash &&
    nativeAttempt?.scope_hash === authority?.packet?.scope_hash
    ? attempt
    : null;
}

/**
 * Normalize the short names produced by planning (for example `web-search`)
 * without inferring tools from a task category or any other metadata.
 */
export function normalizeExplicitToolId(value) {
  return normalizeToolId(value);
}

function removedTaskToolRequirements(tasks, allowedToolIds) {
  const allowed = new Set(allowedToolIds);
  const removed = new Set();

  for (const task of tasks || []) {
    const current = (task.data?.tool_requirements || [])
      .map(normalizeExplicitToolId)
      .filter(Boolean);
    const next = current.filter((toolId) => allowed.has(toolId));
    if (next.length === current.length) continue;
    current.filter((toolId) => !allowed.has(toolId)).forEach((toolId) => removed.add(toolId));
  }

  return [...removed];
}

export async function handle(admin, payload, req) {
  let goal = await loadGoal(admin, payload.goalId);
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (goal.status !== 'provisioning_tools' || !goal.updated_at) return stateChangedResult(goal);
  if (nativeAuthority.native && !nativeAuthority.ready) return stateChangedResult(goal);

  const teamFormationAttempt = completedTeamFormationAttempt(goal, nativeAuthority);
  const entryBinding = nativeAuthority.native
    ? acceptedNativePlanningActionBinding(goal, nativeAuthority)
    : null;
  if (!teamFormationAttempt || (nativeAuthority.native && !entryBinding)) {
    return stateChangedResult(goal);
  }

  const attempt = {
    version: 'orqaly_tool_provisioning_attempt_v1',
    attempt_id: generateId('ntp'),
    scope_hash: nativeAuthority.native ? nativeAuthority.packet.scope_hash : null,
    team_formation_attempt_id: teamFormationAttempt.attempt_id,
    status: 'running',
    started_at: new Date().toISOString(),
    source_goal_updated_at: goal.updated_at,
  };
  const entryData = {
    ...(goal.data || {}),
    tool_provisioning_attempt: attempt,
    ...(nativeAuthority.native ? { native_tool_provisioning_attempt: attempt } : {}),
  };
  const entryPatch = {
    status: 'provisioning_tools',
    data: entryData,
    updated_at: attempt.started_at,
  };
  const acquired = nativeAuthority.native
    ? await updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        'provisioning_tools',
        {
          ...entryBinding,
          team_formation_attempt_id: teamFormationAttempt.attempt_id,
        },
        entryPatch
      )
    : await reserveGoalToolProvisioningAttempt(
        admin,
        goal,
        teamFormationAttempt.attempt_id,
        entryPatch
      );
  if (!acquired) return stateChangedResult(goal);

  goal = {
    ...goal,
    status: 'provisioning_tools',
    updated_at: attempt.started_at,
    data: entryData,
  };
  const stageRun = {
    native: nativeAuthority.native,
    authority: nativeAuthority,
    binding: nativeAuthority.native
      ? {
          ...entryBinding,
          goal_updated_at: attempt.started_at,
          team_formation_attempt_id: teamFormationAttempt.attempt_id,
          tool_provisioning_attempt_id: attempt.attempt_id,
        }
      : null,
    attempt,
  };

  // Collect required tools from actual planned tasks (not plan specs)
  const { data: candidatePlannedTasks, error: tasksError } = await admin
    .from('team_tasks')
    .select('id, title, materialization_attempt, data')
    .eq('data->>goal_id', goal.id)
    .in('status', ['planned']);
  if (tasksError) throw new Error(`Unable to inspect planned task tools: ${tasksError.message}`);
  const plannedTasks = currentGoalTaskAttempt(goal, candidatePlannedTasks || []);

  // Only check tools EXPLICITLY listed in task tool_requirements
  // Do NOT use PO tech doc or category mapping — those over-suggest tools
  const toolsFromTasks = new Set();
  for (const task of plannedTasks || []) {
    for (const t of task.data?.tool_requirements || []) {
      const toolId = normalizeExplicitToolId(t);
      if (toolId) toolsFromTasks.add(toolId);
    }
  }

  const requiredToolIds = [...toolsFromTasks];
  const toolMode = goal.data?.tool_mode || 'with_tools';

  if (toolMode === 'no_tools') {
    const removed = removedTaskToolRequirements(plannedTasks, []);
    return skipToNextStage(admin, goal, [], [], {
      stageRun,
      message: 'No-tools policy enforced',
      policy: { tool_mode: toolMode, allowed: [], removed },
    });
  }

  if (requiredToolIds.length === 0) {
    // No tools needed — skip to next stage
    return skipToNextStage(admin, goal, [], [], {
      stageRun,
      message: 'No tools required',
    });
  }

  // Check the same live credential sources used during execution: encrypted
  // per-user vault, supported provider aliases, explicitly allowed local env
  // credentials, legacy rows, internal tools, and Composio availability.
  // Unknown explicit requirements remain unconfigured rather than being
  // silently assumed available.
  let unconfiguredTools = requiredToolIds;
  const configuredIds = new Set();
  try {
    const { data: userTools, error: toolsError } = await admin
      .from('tools')
      .select('id, data, connection_type, status')
      .eq('user_id', goal.user_id)
      .in('id', requiredToolIds);
    if (toolsError) throw new Error(toolsError.message);

    const rowById = new Map((userTools || []).map((tool) => [tool.id, tool]));
    for (const toolId of requiredToolIds) {
      const def = TOOL_DEFINITION_BY_ID.get(toolId);
      if (!def) continue;
      const credential = await resolveToolCredential({
        def,
        row: rowById.get(toolId),
        userId: goal.user_id,
      });
      if (credential.ready) configuredIds.add(toolId);
    }
    unconfiguredTools = requiredToolIds.filter((id) => !configuredIds.has(id));
  } catch (err) {
    log.warn(req, 'tool-provisioning.check.failed', { error: err.message });
  }

  if (toolMode === 'existing_only') {
    const allowed = requiredToolIds.filter((toolId) => configuredIds.has(toolId));
    const removed = removedTaskToolRequirements(plannedTasks, allowed);
    return skipToNextStage(admin, goal, allowed, [], {
      stageRun,
      message: 'Existing-tools-only policy enforced',
      policy: { tool_mode: toolMode, allowed, removed },
    });
  }

  if (unconfiguredTools.length === 0) {
    // All tools ready
    return skipToNextStage(admin, goal, requiredToolIds, [], {
      stageRun,
      message: 'All tools already configured',
    });
  }

  // Auto-bypass on retry: when handleRetry set data.retry_skip_gates = true,
  // skip the awaiting_tools pause and proceed with whatever tools the agents
  // have. Server-side fallback in execute-phase.js will handle missing
  // metadata.tools, and agents will gracefully degrade for unconfigured ones.
  if (!stageRun.native && goal.data?.retry_skip_gates) {
    log.info(req, 'tool-provisioning.auto-skipped-on-retry', {
      goalId: goal.id,
      unconfigured: unconfiguredTools.length,
    });
    return skipToNextStage(admin, goal, requiredToolIds, unconfiguredTools, {
      stageRun,
      message: `Auto-skipped on retry (${unconfiguredTools.length} tools unconfigured)`,
    });
  }

  const awaitingToolsAt = new Date().toISOString();
  const awaitingToolsData = {
    ...(goal.data || {}),
    required_tools: requiredToolIds,
    unconfigured_tools: unconfiguredTools,
    tool_provisioning_attempt: {
      ...stageRun.attempt,
      status: 'awaiting_user',
      completed_at: awaitingToolsAt,
    },
    ...(stageRun.native
      ? {
          native_tool_provisioning_attempt: {
            ...stageRun.attempt,
            status: 'awaiting_user',
            completed_at: awaitingToolsAt,
          },
        }
      : {}),
  };
  const awaitingToolsPatch = {
    status: 'awaiting_tools',
    data: awaitingToolsData,
  };
  const parked = stageRun.native
    ? await updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        'provisioning_tools',
        stageRun.binding,
        awaitingToolsPatch
      )
    : await updateGoalIfToolProvisioningAttempt(
        admin,
        goal,
        stageRun.attempt.attempt_id,
        awaitingToolsPatch
      );
  if (!parked) return stateChangedResult(goal);

  // Placeholder rows are an idempotent UI projection, but still a database
  // side effect. Create them only after the exact goal/attempt CAS has parked
  // this worker at the credential checkpoint.
  for (const toolId of unconfiguredTools) {
    const info = TOOL_INFO[toolId];
    const def = TOOL_DEFINITION_BY_ID.get(toolId);
    if (!info && !def) continue;
    try {
      await ensureOwnedToolPlaceholder(admin, {
        id: toolId,
        user_id: goal.user_id,
        name: info?.name || def.name,
        description: info?.description || def.description || '',
        connection_type: info?.connection_type || def.connectionType,
        status: 'inactive',
        data: info?.data || { credentials: def.credentials || [] },
      });
    } catch (err) {
      log.warn(req, 'tool-provisioning.placeholder.failed', { toolId, error: err.message });
      throw new Error(`Unable to prepare ${toolId} for credential setup: ${err.message}`);
    }
  }

  await logGoalEvent(admin, goal.id, 'awaiting_tools', {
    required: requiredToolIds,
    unconfigured: unconfiguredTools,
  });
  await notifyGoalEvent(admin, goal, 'awaiting_tools', {
    feedback: `${unconfiguredTools.length} tool${unconfiguredTools.length > 1 ? 's' : ''} need API keys before execution can begin.`,
  });

  // Record the manual credential checkpoint immediately instead of waiting
  // for the self-healer sweep. This deliberately does not enqueue privileged
  // browser/account-creation work.
  try {
    const refreshedGoal = await loadGoal(admin, goal.id);
    const checkpointResult = await applyHumanCredentialCheckpoint(admin, refreshedGoal, { log });
    log.info(req, 'tool-provisioning.credential-checkpoint.created', {
      goalId: goal.id,
      action: checkpointResult?.action || 'unknown',
      humanTaskId: checkpointResult?.humanTaskId || null,
      reasonCode: checkpointResult?.reasonCode || null,
    });
  } catch (err) {
    log.warn(req, 'tool-provisioning.credential-checkpoint.failed', {
      goalId: goal.id,
      error: err.message,
    });
  }

  return {
    type: 'orchestrate-goal',
    action: 'tool-provisioning',
    goalId: goal.id,
    status: 'awaiting_tools',
    requiredTools: requiredToolIds,
    unconfiguredTools,
  };
}

async function skipToNextStage(
  admin,
  goal,
  requiredTools,
  unconfiguredTools,
  { stageRun, message = 'Tools configured', policy = null } = {}
) {
  const completedAt = new Date().toISOString();
  const nextData = {
    ...(goal.data || {}),
    required_tools: requiredTools,
    unconfigured_tools: unconfiguredTools,
    tool_provisioning_attempt: {
      ...stageRun.attempt,
      status: 'completed',
      completed_at: completedAt,
    },
    ...(stageRun.native
      ? {
          native_tool_provisioning_attempt: {
            ...stageRun.attempt,
            status: 'completed',
            completed_at: completedAt,
          },
        }
      : {}),
  };
  const transitioned = stageRun.native
    ? await updateGoalIfNativeScopeBinding(admin, goal.id, 'provisioning_tools', stageRun.binding, {
        status: 'estimating',
        data: nextData,
      })
    : await updateGoalIfToolProvisioningAttempt(admin, goal, stageRun.attempt.attempt_id, {
        status: 'estimating',
        data: nextData,
      });
  if (!transitioned) return stateChangedResult(goal);

  if (policy) await logGoalEvent(admin, goal.id, 'tool_policy_enforced', policy);
  await logGoalEvent(admin, goal.id, 'tools_provisioned', {
    required: requiredTools,
    unconfigured: unconfiguredTools,
    message,
  });
  await notifyGoalEvent(admin, goal, 'plan_created', { strategy: goal.plan?.strategy });
  await enqueueGoalAction(admin, 'discovery-estimation', goal.id);
  return {
    type: 'orchestrate-goal',
    action: 'tool-provisioning',
    goalId: goal.id,
    status: 'tools_ready',
  };
}
