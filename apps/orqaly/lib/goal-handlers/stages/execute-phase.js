/**
 * Stage 7a: Execute Phase
 *
 * Activates pre-created tasks for the current phase (created during team-formation),
 * enqueues execute-task jobs, and updates workflow nodes.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { orgScopeFromGoal } from '../../_shared/kb-scope.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  enqueueAgentJob,
  enqueueGoalAction,
  triggerProcessNext,
  checkBudget,
  pickTestModel,
} from '../_helpers.js';
import { consiliumBriefTeamLead, teamLeadInstruct } from '../goal-messaging.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { effectiveGoalTaskToolIds } from '../../_shared/goal-tool-policy.js';
import {
  buildContextApprovalSnapshot,
  buildExecutionApprovalSnapshot,
  isApprovalCurrent,
  pendingApproval,
} from '../approval-audit.js';
import { loadExecutionAuthorizationManifest } from '../execution-authorization.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';

const log = createLogger('goal-stage:execute-phase');

function inactiveGoalResult(goal, phaseIndex) {
  return {
    type: 'orchestrate-goal',
    action: 'execute-phase',
    status: 'goal_not_active',
    goalId: goal.id,
    phaseIndex,
  };
}

function feedbackVersionOf(payload) {
  return typeof payload?.feedbackApplicationVersion === 'string'
    ? payload.feedbackApplicationVersion.trim()
    : '';
}

function activePhaseFeedbackVersion(goal, phaseIndex) {
  const marker = goal?.plan?.phases?.[phaseIndex]?.feedback;
  if (
    marker?.kind !== 'feedback_application' ||
    typeof marker.application_version !== 'string' ||
    !marker.application_version.trim()
  ) {
    return '';
  }
  // Full retries and quality iterations are new execution generations, even
  // when they temporarily reuse the same plan object.
  if (
    Number(marker.retry_count || 0) !== Number(goal?.data?.retry_count || 0) ||
    Number(marker.iteration || 0) !== Number(goal?.iteration || 0)
  ) {
    return '';
  }
  return marker.application_version.trim();
}

function feedbackGenerationCurrent(goal, feedbackVersion, phaseIndex) {
  if (!feedbackVersion) return !activePhaseFeedbackVersion(goal, phaseIndex);
  return (
    goal?.data?.last_feedback_application_version === feedbackVersion &&
    activePhaseFeedbackVersion(goal, phaseIndex) === feedbackVersion
  );
}

function supersededFeedbackResult(goal, phaseIndex, feedbackVersion) {
  return {
    type: 'orchestrate-goal',
    action: 'execute-phase',
    status: 'feedback_superseded',
    goalId: goal.id,
    phaseIndex,
    feedbackApplicationVersion: feedbackVersion,
  };
}

function requirePayloadOwner(payload) {
  const aliases = ['_userId', 'userId', 'user_id']
    .filter((field) => Object.hasOwn(payload || {}, field))
    .map((field) => [field, typeof payload[field] === 'string' ? payload[field].trim() : '']);
  const owner = aliases[0]?.[1] || '';
  if (!owner || aliases.some(([, value]) => value !== owner)) {
    const error = new Error('AGENT_JOB_OWNER_VALIDATION_ERROR: execute-phase owner mismatch');
    error.code = 'AGENT_JOB_OWNER_VALIDATION_ERROR';
    throw error;
  }
  return owner;
}

async function reloadActiveGoal(admin, goalId, userId, feedbackVersion = '', phaseIndex = 0) {
  const currentGoal = await loadGoal(admin, goalId, userId);
  return currentGoal.status === 'active' &&
    feedbackGenerationCurrent(currentGoal, feedbackVersion, phaseIndex)
    ? currentGoal
    : null;
}

export async function handle(admin, payload, req) {
  const authorizationUserId = requirePayloadOwner(payload);
  const goal = await loadGoal(admin, payload.goalId, authorizationUserId);
  const phaseIndex = payload.phaseIndex || 0;
  const phases = goal.plan?.phases || [];
  const feedbackVersion = feedbackVersionOf(payload);

  if (!feedbackGenerationCurrent(goal, feedbackVersion, phaseIndex)) {
    return supersededFeedbackResult(goal, phaseIndex, feedbackVersion);
  }

  // A task can remain queued while a human pauses or cancels the goal. Never
  // let that stale job complete the goal, mutate tasks, or enqueue execution.
  if (goal.status !== 'active') return inactiveGoalResult(goal, phaseIndex);

  // No-work guards run before the approval boundary: they either return or
  // pause the goal and cannot enqueue any execution.
  if (phaseIndex >= phases.length) {
    await enqueueGoalAction(admin, 'complete', goal.id);
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      status: 'all_phases_done',
      goalId: goal.id,
    };
  }

  if (phases[phaseIndex].status === 'executing') {
    log.info(req, 'goal.execute-phase.already-executing', { goalId: goal.id, phaseIndex });
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      status: 'already_executing',
      phaseIndex,
    };
  }

  const budget = checkBudget(goal);
  if (!budget.ok && !budget.warning) {
    await updateGoal(admin, goal.id, { status: 'paused' });
    await logGoalEvent(
      admin,
      goal.id,
      'budget_exhausted',
      { reason: budget.reason },
      0,
      phaseIndex
    );
    return { type: 'orchestrate-goal', action: 'execute-phase', status: 'budget_paused' };
  }
  if (budget.warning) {
    log.info(req, 'goal.execute-phase.budget-warning', { goalId: goal.id, reason: budget.reason });
    await logGoalEvent(admin, goal.id, 'budget_warning', { reason: budget.reason }, 0, phaseIndex);
  }

  // Server-side boundary: even a manually queued execute job cannot bypass
  // either human confirmation. The approval hashes cover customer context,
  // plan, team, tools, assignments, budget and proposal.
  const approvals = goal.data?.goal_approvals || {};
  const contextSnapshot = buildContextApprovalSnapshot(goal);
  if (!isApprovalCurrent('context', contextSnapshot, approvals.context)) {
    await updateGoal(admin, goal.id, {
      status: 'awaiting_context_approval',
      data: {
        ...(goal.data || {}),
        goal_approvals: {
          ...approvals,
          context: pendingApproval('context', contextSnapshot, approvals.context),
        },
      },
    });
    await logGoalEvent(admin, goal.id, 'execution_blocked_missing_context_approval', {
      phase_index: phaseIndex,
    });
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      status: 'awaiting_context_approval',
      goalId: goal.id,
    };
  }
  let authorizationManifest = null;
  try {
    authorizationManifest = await loadExecutionAuthorizationManifest(admin, goal);
  } catch (error) {
    log.warn(req, 'goal.execute-phase.authorization-inspection-failed', {
      goalId: goal.id,
      error: error.message,
    });
  }
  const goalWithCurrentAuthorization = {
    ...goal,
    data: {
      ...(goal.data || {}),
      execution_authorization: {
        ...(goal.data?.execution_authorization || {}),
        manifest: authorizationManifest,
      },
    },
  };
  const executionSnapshot = buildExecutionApprovalSnapshot(
    goalWithCurrentAuthorization,
    authorizationManifest
  );
  const authorizationRecord = goal.data?.execution_authorization;
  const approvalBoundToCurrentAuthorization =
    authorizationManifest?.valid === true &&
    authorizationRecord?.status === 'approved' &&
    authorizationRecord?.snapshot_hash === approvals.execution?.snapshot_hash;
  if (
    !approvalBoundToCurrentAuthorization ||
    !isApprovalCurrent('execution', executionSnapshot, approvals.execution)
  ) {
    const pending = pendingApproval('execution', executionSnapshot, approvals.execution);
    const pauseStatus = authorizationManifest?.issues?.some((issue) =>
      issue.code.startsWith('task_tool_')
    )
      ? 'awaiting_tools'
      : 'awaiting_approval';
    await updateGoal(admin, goal.id, {
      status: pauseStatus,
      data: {
        ...(goal.data || {}),
        execution_authorization: {
          status: authorizationManifest?.valid ? 'pending' : 'invalid',
          snapshot_hash: pending.snapshot_hash,
          manifest: authorizationManifest,
        },
        goal_approvals: {
          ...approvals,
          execution: pending,
        },
      },
    });
    await logGoalEvent(admin, goal.id, 'execution_blocked_missing_proposal_approval', {
      phase_index: phaseIndex,
      authorization_issues: authorizationManifest?.issues || [
        { code: 'authorization_inspection_failed' },
      ],
    });
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      status: pauseStatus,
      goalId: goal.id,
    };
  }

  const phase = phases[phaseIndex];

  // Load only agents frozen in the current approved team manifest. There is no
  // fallback to the user's wider agent pool after approval.
  const authorizedMemberIds = (authorizationManifest.team_members || []).map(
    (member) => member.agent_id
  );
  const { data: approvedAgents, error: approvedAgentsError } = await admin
    .from('agents')
    .select('id, name, description, category, metadata')
    .eq('user_id', goal.user_id)
    .in('id', authorizedMemberIds);
  const members = (approvedAgents || []).map((agent) => ({
    ...agent,
    agent_type: agent.category || 'general',
  }));
  if (approvedAgentsError || members.length !== authorizedMemberIds.length) {
    await updateGoal(admin, goal.id, { status: 'awaiting_approval' });
    await logGoalEvent(admin, goal.id, 'execution_blocked_team_changed', {
      phase_index: phaseIndex,
    });
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      status: 'awaiting_approval',
      goalId: goal.id,
    };
  }

  // Activate pre-created tasks for this phase (created during team-formation)
  // Tasks were created with status 'planned', then moved to 'todo' after tool provisioning
  //
  // NOTE: Uses eq() with JSON path extraction (->> casts to text) instead of
  // .contains() to avoid JSONB type-mismatch issues where phase_index stored
  // as a number wouldn't match the filter value. This is the same pattern used
  // at line 229 below and is more reliable for cross-type comparisons.
  const { data: candidatePhaseTasks } = await admin
    .from('team_tasks')
    .select(
      'id, user_id, goal_id, title, job_pool_id, agent_id, assigned_to, status, materialization_attempt, data'
    )
    .eq('user_id', goal.user_id)
    .eq('data->>goal_id', goal.id)
    .eq('data->>phase_index', String(phaseIndex));
  const currentPhaseTasks = currentGoalTaskAttempt(goal, candidatePhaseTasks || []);
  if (
    feedbackVersion &&
    currentPhaseTasks.some((task) => task.data?.feedback_application_version !== feedbackVersion)
  ) {
    return supersededFeedbackResult(goal, phaseIndex, feedbackVersion);
  }
  // 'todo' = ready, 'planned' = fallback if tools were skipped. Loading the
  // complete phase set first lets a feedback continuation fail closed if even
  // one current-attempt task was not reset into the exact generation.
  const phaseTasks = currentPhaseTasks.filter((task) => ['todo', 'planned'].includes(task.status));

  if (!phaseTasks?.length) {
    // Hard-fail instead of enqueuing iterate. If team-formation produced no
    // team_tasks (empty agent pool, bad phase_index cast, deleted tasks from
    // a prior iterate sweep), looping through iterate → team-formation →
    // execute-phase hits the same empty state every time and just burns
    // max_iterations. Stop now with a reason the user can actually act on.
    const reason = `execute-phase found 0 tasks for phase ${phaseIndex} (${phase.name}). Team-formation likely produced no tasks — check plan.phases[].jobs and the agents table for this user.`;
    phases[phaseIndex].status = 'failed';
    await updateGoal(admin, goal.id, {
      status: 'failed',
      plan: { ...goal.plan, phases },
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failed_at: new Date().toISOString(),
        failure_stage: 'execute-phase',
      },
    });
    await logGoalEvent(
      admin,
      goal.id,
      'goal_failed',
      { reason, stage: 'execute-phase', phaseIndex },
      0,
      phaseIndex
    );
    log.warn(req, 'execute-phase.no-tasks.fail-fast', { goalId: goal.id, phaseIndex });
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      goalId: goal.id,
      phaseIndex,
      jobsCreated: 0,
      status: 'no_tasks',
    };
  }

  // Mark tasks as 'todo' (in case they were still 'planned') and enqueue execution
  const createdJobIds = [];
  const queuedWorkerJobIds = [];
  const authorizationByTask = new Map(
    (authorizationManifest.tasks || []).map((task) => [String(task.task_id), task])
  );
  const runtimeJobIds = [...new Set(phaseTasks.map((task) => task.job_pool_id).filter(Boolean))];
  const { data: runtimeJobs, error: runtimeJobsError } = runtimeJobIds.length
    ? await admin
        .from('jobs')
        .select('id, user_id, goal_id, status')
        .eq('user_id', goal.user_id)
        .eq('goal_id', goal.id)
        .in('id', runtimeJobIds)
    : { data: [], error: null };
  const runtimeJobById = new Map((runtimeJobs || []).map((row) => [String(row.id), row]));
  const changedTask = phaseTasks.find((task) => {
    const taskAuthorization = authorizationByTask.get(String(task.id));
    const currentRequiredTools = effectiveGoalTaskToolIds(goal, task.data?.tool_requirements || []);
    const runtimeJob = runtimeJobById.get(String(task.job_pool_id || ''));
    return (
      runtimeJobsError ||
      String(task.user_id || '') !== String(goal.user_id) ||
      String(task.goal_id || '') !== String(goal.id) ||
      String(task.data?.goal_id || '') !== String(goal.id) ||
      !task.job_pool_id ||
      !runtimeJob ||
      String(runtimeJob.user_id || '') !== String(goal.user_id) ||
      String(runtimeJob.goal_id || '') !== String(goal.id) ||
      runtimeJob.status !== 'active' ||
      !taskAuthorization ||
      String(taskAuthorization.agent_id || '') !== String(task.agent_id || '') ||
      JSON.stringify(taskAuthorization.required_tool_ids || []) !==
        JSON.stringify(currentRequiredTools)
    );
  });
  if (changedTask) {
    await updateGoal(admin, goal.id, { status: 'awaiting_approval' });
    await logGoalEvent(admin, goal.id, 'execution_blocked_task_changed', {
      phase_index: phaseIndex,
      task_id: changedTask.id,
    });
    return {
      type: 'orchestrate-goal',
      action: 'execute-phase',
      status: 'awaiting_approval',
      goalId: goal.id,
    };
  }

  if (!(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))) {
    return inactiveGoalResult(goal, phaseIndex);
  }

  for (const task of phaseTasks) {
    const taskAuthorization = authorizationByTask.get(String(task.id));
    if (
      !(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))
    ) {
      return inactiveGoalResult(goal, phaseIndex);
    }
    const { data: activatedTask, error: activationError } = await admin
      .from('team_tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('user_id', goal.user_id)
      .eq('goal_id', goal.id)
      .eq('job_pool_id', task.job_pool_id)
      .eq('status', task.status)
      .select('id, status')
      .maybeSingle();
    if (activationError || activatedTask?.id !== task.id || activatedTask.status !== 'todo') {
      return inactiveGoalResult(goal, phaseIndex);
    }

    // Confirm that the approved assignment still resolves. The worker reloads
    // the owned agent and derives prompt identity from the live manifest; no
    // queued prose or agent profile is an authority input.
    let mergedToolIds = [...(taskAuthorization.granted_tool_ids || [])];
    if (task.agent_id) {
      const agent = members.find((m) => m.id === task.agent_id);
      if (agent) {
        if (mergedToolIds.length === 0) {
          log.warn(req, 'goal.execute-phase.tools-empty', { agentId: agent.id, role: agent.name });
        }
      }
    }

    // One-shot "retry without tools": a human resolution set goal.data.skip_tools,
    // so run this phase's agents tool-free (empty toolIds => hasTools false in
    // runAgentWithTools). Cleared once below so normal tool use resumes next run.
    if (goal.data?.skip_tools) {
      mergedToolIds = [];
    }

    // Recheck after the task write and immediately before queue insertion. A
    // final execute-task authorization check closes the remaining insert race.
    if (
      !(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))
    ) {
      return inactiveGoalResult(goal, phaseIndex);
    }

    const queuedWorkerJob = await enqueueAgentJob(
      admin,
      {
        user_id: goal.user_id,
        payload: {
          type: 'execute-task',
          taskId: task.id,
          jobId: task.job_pool_id,
          // goalId included so job-processor.claimNextJob can resolve
          // local_only without a team_tasks lookup. Required for compare-mode
          // goals to stay on the localhost worker (claude-code provider is
          // localhost-only and Vercel cron otherwise grabs these jobs).
          goalId: goal.id,
          toolIds: mergedToolIds,
          toolGrants: goal.data?.skip_tools ? [] : taskAuthorization.tool_grants || [],
          authorizationSnapshotHash: approvals.execution.snapshot_hash,
          _userId: goal.user_id,
          userId: goal.user_id,
          user_id: goal.user_id,
          ...(feedbackVersion ? { feedbackApplicationVersion: feedbackVersion } : {}),
        },
      },
      // Finish the phase-state write before any task can be claimed.
      { wake: false }
    );
    queuedWorkerJobIds.push(queuedWorkerJob.id);
    if (task.job_pool_id) createdJobIds.push(task.job_pool_id);
  }

  log.info(req, 'goal.execute-phase.activated-tasks', {
    goalId: goal.id,
    phaseIndex,
    taskCount: phaseTasks.length,
  });

  if (!(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))) {
    return inactiveGoalResult(goal, phaseIndex);
  }

  // Save phase plan to KB as formatted markdown
  try {
    const mdLines = [`# Phase ${phaseIndex + 1}: ${phase.name}`, ''];
    if (phase.description) mdLines.push(phase.description, '');
    if (phase.acceptance_criteria?.length) {
      mdLines.push('## Acceptance Criteria');
      phase.acceptance_criteria.forEach((c) => mdLines.push(`- ${c}`));
      mdLines.push('');
    }
    mdLines.push(
      '## Team',
      members.map((m) => `- ${m.name} (${m.agent_type || 'general'})`).join('\n'),
      ''
    );
    mdLines.push('## Jobs');
    for (const job of phase.jobs || []) {
      mdLines.push(`1. **${job.title}** — ${job.required_role || 'general'}`);
      if (job.description) mdLines.push(`   ${job.description}`);
      if (job.tool_requirements?.length)
        mdLines.push(`   Tools: ${job.tool_requirements.join(', ')}`);
    }
    await admin.from('knowledge_documents').insert({
      user_id: goal.user_id,
      title: `Phase ${phaseIndex + 1} Plan: ${phase.name}`,
      content: mdLines.join('\n'),
      source: 'goal-orchestrator',
      category: 'goal-plan',
      owner_type: goal.team_id ? 'team' : 'user',
      owner_id: goal.team_id || goal.user_id,
      content_type: 'note',
      tags: ['goal', 'plan', `phase-${phaseIndex + 1}`],
      metadata: { goal_id: goal.id, phase_index: phaseIndex, project_id: goal.project_id },
      ...orgScopeFromGoal(goal),
    });
  } catch (err) {
    log.warn(req, 'goal.kb-plan.failed', { error: err.message });
  }

  // Update phase status. Also clear the one-shot skip_tools flag (if set) so the
  // tool-free retry applies to this run only.
  phases[phaseIndex].status = 'executing';
  phases[phaseIndex].started_at = new Date().toISOString();
  const goalPatch = { plan: { ...goal.plan, phases } };
  if (goal.data?.skip_tools) {
    log.info(req, 'goal.execute-phase.tools-disabled', {
      goalId: goal.id,
      phaseIndex,
      reason: goal.data.skip_tools_reason || null,
    });
    const { skip_tools: _st, skip_tools_reason: _sr, ...restData } = goal.data;
    goalPatch.data = restData;
  }
  if (!(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))) {
    return inactiveGoalResult(goal, phaseIndex);
  }
  await updateGoal(admin, goal.id, goalPatch);

  // Database webhooks target Production and cannot claim Preview-partitioned
  // jobs. Wake every task by its exact queue id after the phase is durably in
  // executing state; this neither scans nor widens into another goal's work.
  for (const queuedJobId of queuedWorkerJobIds) {
    await triggerProcessNext({ jobId: queuedJobId });
  }

  // Update workflow node
  if (goal.workflow_id) {
    try {
      const { data: wf } = await admin
        .from('workflows')
        .select('data')
        .eq('id', goal.workflow_id)
        .eq('user_id', goal.user_id)
        .single();
      if (wf?.data?.nodes) {
        wf.data.nodes = wf.data.nodes.map((n, i) =>
          i === phaseIndex ? { ...n, data: { ...(n.data || {}), status: 'executing' } } : n
        );
        await admin
          .from('workflows')
          .update({ data: wf.data, updated_at: new Date().toISOString() })
          .eq('id', goal.workflow_id)
          .eq('user_id', goal.user_id);
      }
    } catch (err) {
      log.warn(req, 'goal.workflow-update.failed', { error: err.message });
    }
  }

  // Consilium briefs team lead before phase starts — real LLM-generated strategic brief
  if (!(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))) {
    return inactiveGoalResult(goal, phaseIndex);
  }
  try {
    const phaseTeam = [];
    try {
      const { data: phaseTaskRows } = await admin
        .from('team_tasks')
        .select('id, user_id, goal_id, assigned_to, title, materialization_attempt, data')
        .eq('user_id', goal.user_id)
        .eq('goal_id', goal.id)
        .eq('data->>goal_id', goal.id)
        .eq('data->>phase_index', String(phaseIndex));
      for (const t of currentGoalTaskAttempt(goal, phaseTaskRows || [])) {
        if (t.assigned_to && !phaseTeam.includes(t.assigned_to)) phaseTeam.push(t.assigned_to);
      }
    } catch {
      /* non-critical */
    }

    const briefResult = await executeLlmTracked({
      // Keep the phase brief on the same pinned executor as the rest of the
      // goal. An unavailable provider fails visibly instead of switching.
      ...pickTestModel(goal),
      temperature: 0.3,
      maxTokens: 400,
      systemPrompt: `You are the Consilium — a strategic advisory board overseeing an AI agent team. You brief the Team Lead at the start of each phase. Your briefs are concise (3-5 sentences), strategic, and actionable. Surface risks, highlight dependencies, and remind the team of the quality bar. No preamble, no bullet points — write like a senior exec memo.`,
      prompt: [
        `Goal: ${goal.title}`,
        `Overall strategy: ${goal.plan?.strategy || ''}`,
        `Phase ${phaseIndex + 1}/${phases.length}: ${phase.name}`,
        `Phase description: ${phase.description || ''}`,
        `Acceptance criteria: ${(phase.acceptance_criteria || []).join('; ')}`,
        phaseTeam.length ? `Team for this phase: ${phaseTeam.join(', ')}` : '',
        phaseIndex > 0
          ? `Prior phase outcome: ${goal.data?.phase_results?.[phaseIndex - 1]?.summary || 'successful'}`
          : '',
        '',
        'Write the phase brief to the Team Lead now.',
      ]
        .filter(Boolean)
        .join('\n'),
      req,
      usage: {
        admin,
        userId: goal.user_id,
        goalId: goal.id,
        organizationId: goal.org_id,
        teamId: goal.agent_team_id || goal.team_id,
        consiliumId: goal.concilium_id,
        source: 'execute-phase',
        operation: 'consilium-brief',
        description: `Consilium phase brief: ${phase.name}`,
        phaseIndex,
      },
    });
    const realBriefing = (briefResult.content || '').trim();
    await consiliumBriefTeamLead(admin, goal, phaseIndex, realBriefing);
  } catch (briefErr) {
    log.warn(req, 'execute-phase.consilium-brief-failed', { error: briefErr.message });
    // Fall back to templated brief so the team chat still has something
    await consiliumBriefTeamLead(admin, goal, phaseIndex);
  }

  // Team Lead delegates each task to its assigned agent (templated, zero LLM cost)
  if (!(await reloadActiveGoal(admin, goal.id, authorizationUserId, feedbackVersion, phaseIndex))) {
    return inactiveGoalResult(goal, phaseIndex);
  }
  try {
    const { data: phaseTaskRows } = await admin
      .from('team_tasks')
      .select('id, user_id, goal_id, title, agent_id, assigned_to, materialization_attempt, data')
      .eq('user_id', goal.user_id)
      .eq('goal_id', goal.id)
      .eq('data->>goal_id', goal.id)
      .eq('data->>phase_index', String(phaseIndex));
    for (const t of currentGoalTaskAttempt(goal, phaseTaskRows || [])) {
      if (!t.agent_id) continue;
      const ac = (t.data?.acceptance_criteria || []).join('; ');
      const msg = `You're on "${t.title}". ${ac ? `Acceptance criteria: ${ac}. ` : ''}Ship it end-to-end. Read the TEAM CONTEXT block at the top of your task for teammate deliverables. Your output will be broadcast to the team when done.`;
      await teamLeadInstruct(admin, goal, t.agent_id, t.assigned_to, msg);
    }
  } catch (delegErr) {
    log.warn(req, 'execute-phase.delegation-failed', { error: delegErr.message });
  }

  await logGoalEvent(
    admin,
    goal.id,
    'phase_started',
    {
      phaseIndex,
      phaseName: phase.name,
      jobCount: createdJobIds.length,
      jobIds: createdJobIds,
    },
    0,
    phaseIndex
  );

  return {
    type: 'orchestrate-goal',
    action: 'execute-phase',
    goalId: goal.id,
    phaseIndex,
    jobsCreated: createdJobIds.length,
  };
}
