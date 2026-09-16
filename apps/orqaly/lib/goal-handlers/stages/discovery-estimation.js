/**
 * Stage 5: Discovery & Estimation
 *
 * Each agent does a quick discovery task, then PM aggregates estimates.
 * Runs in both modes because the execution approval is mandatory and must be
 * grounded in a complete proposal snapshot.
 *
 * Output: proposal JSONB on goal.
 * Next: client-approval
 */
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  generateId,
  logGoalEvent,
  reserveGoalDiscoveryEstimationAttempt,
  updateGoalIfDiscoveryEstimationAttempt,
  updateGoalIfNativeScopeBinding,
  loadGoal,
  enqueueGoalAction,
  computeHistoricalAverages,
  pickTestModel,
} from '../_helpers.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import { effectiveGoalTaskToolIds } from '../../_shared/goal-tool-policy.js';
import {
  acceptedNativePlanningActionBinding,
  resolveAcceptedNativeGoalAuthority,
} from '../../_shared/native-goal-authority.js';

const log = createLogger('goal-stage:discovery-estimation');

function stateChangedResult(goal) {
  return {
    type: 'orchestrate-goal',
    action: 'discovery-estimation',
    goalId: goal.id,
    status: 'state_changed',
  };
}

function completedToolProvisioningAttempt(goal, authority) {
  const teamAttempt = goal?.data?.native_team_formation_attempt;
  const commonTeamAttempt = goal?.data?.team_formation_attempt;
  const commonToolAttempt = goal?.data?.tool_provisioning_attempt;
  const nativeToolAttempt = goal?.data?.native_tool_provisioning_attempt;
  const commonReady = Boolean(
    commonTeamAttempt?.version === 'orqaly_team_formation_attempt_v1' &&
    commonTeamAttempt.status === 'completed' &&
    commonTeamAttempt.completed_at &&
    commonTeamAttempt.attempt_id &&
    commonToolAttempt?.version === 'orqaly_tool_provisioning_attempt_v1' &&
    commonToolAttempt.status === 'completed' &&
    commonToolAttempt.completed_at &&
    commonToolAttempt.attempt_id &&
    commonToolAttempt.team_formation_attempt_id === commonTeamAttempt.attempt_id
  );
  if (!commonReady) return null;
  if (!authority.native) {
    return { teamAttempt: commonTeamAttempt, toolAttempt: commonToolAttempt };
  }
  return teamAttempt?.version === 'orqaly_team_formation_attempt_v1' &&
    teamAttempt.status === 'completed' &&
    teamAttempt.completed_at &&
    teamAttempt.attempt_id &&
    teamAttempt.scope_hash === authority?.packet?.scope_hash &&
    teamAttempt.attempt_id === commonTeamAttempt.attempt_id &&
    teamAttempt.completed_at === commonTeamAttempt.completed_at &&
    commonTeamAttempt.scope_hash === authority?.packet?.scope_hash &&
    nativeToolAttempt?.version === 'orqaly_tool_provisioning_attempt_v1' &&
    nativeToolAttempt.status === 'completed' &&
    nativeToolAttempt.completed_at &&
    nativeToolAttempt.attempt_id === commonToolAttempt.attempt_id &&
    nativeToolAttempt.completed_at === commonToolAttempt.completed_at &&
    nativeToolAttempt.scope_hash === authority?.packet?.scope_hash &&
    nativeToolAttempt.team_formation_attempt_id === teamAttempt.attempt_id
    ? { teamAttempt: commonTeamAttempt, toolAttempt: commonToolAttempt }
    : null;
}

export function currentProposalAssignments(goal, tasks = []) {
  return currentGoalTaskAttempt(goal, tasks)
    .filter((task) => ['planned', 'todo'].includes(task.status))
    .map((task) => ({
      task_id: task.id,
      step_id: task.data?.axwise_step_id || null,
      task: task.title,
      agent_id: task.agent_id || null,
      agent_name: task.assigned_to || null,
      role: task.data?.required_role || null,
      tools: effectiveGoalTaskToolIds(goal, task.data?.tool_requirements || []),
      axwise_decision_id: task.data?.axwise_decision_id || null,
      axwise_assignment_applied: task.data?.axwise_assignment_applied === true,
      assignment_rationale: task.data?.axwise_execution_context?.assignment || null,
      execution_persona: task.data?.axwise_execution_context?.execution_persona || null,
    }));
}

export async function handle(admin, payload, req) {
  let goal = await loadGoal(admin, payload.goalId);
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (goal.status !== 'estimating' || !goal.updated_at) return stateChangedResult(goal);
  if (nativeAuthority.native && !nativeAuthority.ready) return stateChangedResult(goal);

  const prerequisite = completedToolProvisioningAttempt(goal, nativeAuthority);
  const entryBinding = nativeAuthority.native
    ? acceptedNativePlanningActionBinding(goal, nativeAuthority)
    : null;
  if (!prerequisite || (nativeAuthority.native && !entryBinding)) {
    return stateChangedResult(goal);
  }

  const attempt = {
    version: 'orqaly_discovery_estimation_attempt_v1',
    attempt_id: generateId('nde'),
    scope_hash: nativeAuthority.native ? nativeAuthority.packet.scope_hash : null,
    team_formation_attempt_id: prerequisite.teamAttempt.attempt_id,
    tool_provisioning_attempt_id: prerequisite.toolAttempt.attempt_id,
    status: 'running',
    started_at: new Date().toISOString(),
    source_goal_updated_at: goal.updated_at,
  };
  const entryData = {
    ...(goal.data || {}),
    discovery_estimation_attempt: attempt,
    ...(nativeAuthority.native ? { native_discovery_estimation_attempt: attempt } : {}),
  };
  const entryPatch = {
    status: 'estimating',
    data: entryData,
    updated_at: attempt.started_at,
  };
  const acquired = nativeAuthority.native
    ? await updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        'estimating',
        {
          ...entryBinding,
          team_formation_attempt_id: prerequisite.teamAttempt.attempt_id,
          tool_provisioning_attempt_id: prerequisite.toolAttempt.attempt_id,
        },
        entryPatch
      )
    : await reserveGoalDiscoveryEstimationAttempt(
        admin,
        goal,
        prerequisite.toolAttempt.attempt_id,
        entryPatch
      );
  if (!acquired) return stateChangedResult(goal);

  goal = { ...goal, updated_at: attempt.started_at, data: entryData };
  const stageRun = {
    native: nativeAuthority.native,
    authority: nativeAuthority,
    binding: nativeAuthority.native
      ? {
          ...entryBinding,
          goal_updated_at: attempt.started_at,
          team_formation_attempt_id: prerequisite.teamAttempt.attempt_id,
          tool_provisioning_attempt_id: prerequisite.toolAttempt.attempt_id,
          discovery_estimation_attempt_id: attempt.attempt_id,
        }
      : null,
    attempt,
  };

  // Native estimation can consume only the accepted AxWise packet and the
  // plan/team materialized from it. Historical raw goal prose and legacy PO
  // analysis remain available exclusively to legacy goals.
  const authorityGoal = stageRun.native
    ? {
        ...goal,
        title: stageRun.authority.packet.intent.objective,
        description: stageRun.authority.packet.intent.desired_outcome,
        tech_doc: null,
        feasibility_report: null,
      }
    : goal;

  const phases = authorityGoal.plan?.phases || [];
  const techDoc = authorityGoal.tech_doc || {};
  const feasibility = authorityGoal.feasibility_report || {};

  // Aggregate task info for estimation
  const taskSummary = phases.map((p, i) => ({
    phase: p.name,
    phaseIndex: i,
    jobs: p.jobs.map((j) => ({
      title: j.title,
      role: j.required_role,
      tools: effectiveGoalTaskToolIds(authorityGoal, j.tool_requirements || []),
      estimate_hours: j.estimate_hours,
    })),
  }));

  const totalJobsCount = phases.reduce((s, p) => s + (p.jobs?.length || 1), 0);

  // ── Historical grounding ────────────────────────────────────
  // Pull the last 10 completed goals for this user and compute real
  // avg cost + duration per task. This is the ground truth we anchor
  // the LLM estimate to. If there's no history, fall back to realistic
  // per-task baselines (NOT the old $0.005 guess).
  let historicalAvgCostPerTask = 0.015; // realistic default — 1 LLM call w/ reasoning
  let historicalAvgTimePerTask = 2.5; // minutes — queue + LLM + tool overhead
  let historySampleSize = 0;
  try {
    const { data: pastGoals } = await admin
      .from('goals')
      .select('id, spent_usd, plan, created_at, data')
      .eq('user_id', goal.user_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    // Uses median + stall-pollution filter (see _helpers.js::computeHistoricalAverages).
    // Previously this naively averaged wall-clock time, so any goal that sat
    // stuck for hours before being healed would poison every future estimate.
    const stats = computeHistoricalAverages(pastGoals);
    historicalAvgCostPerTask = stats.avgCostPerTask;
    historicalAvgTimePerTask = stats.avgTimePerTaskMin;
    historySampleSize = stats.sampleSize;
  } catch (histErr) {
    log.warn(req, 'discovery-estimation.history-load.failed', { error: histErr.message });
  }

  // Anchor figures — what we expect this goal to cost/take based on reality
  const anchorCost = Math.round(historicalAvgCostPerTask * totalJobsCount * 100) / 100;
  const anchorTimeMinutes = Math.max(2, Math.round(historicalAvgTimePerTask * totalJobsCount));

  // PM aggregates estimates — anchored to real historical data, not LLM guesses
  const result = await executeLlmTracked({
    prompt: [
      'As Project Manager, produce a realistic estimate for this goal execution.',
      `Goal: ${authorityGoal.title}`,
      `Budget: $${authorityGoal.budget_usd}`,
      ...(stageRun.native
        ? [
            `Accepted deliverable: ${JSON.stringify(stageRun.authority.packet.deliverable)}`,
            `Accepted success criteria: ${JSON.stringify(stageRun.authority.packet.admission?.success_criteria || [])}`,
          ]
        : [
            `Feasibility success probability: ${feasibility.feasibility?.success_probability || 'unknown'}`,
          ]),
      '',
      'Task breakdown:',
      JSON.stringify(taskSummary, null, 2),
      '',
      '## HISTORICAL GROUND TRUTH (this is REAL data — anchor your estimate here)',
      historySampleSize > 0
        ? `Based on ${historySampleSize} of this user's recently completed goals:`
        : '(no completed goals yet — using platform baselines)',
      `- Average cost per task: $${historicalAvgCostPerTask.toFixed(4)}`,
      `- Average wall-clock time per task: ${historicalAvgTimePerTask.toFixed(1)} minutes`,
      `- This goal has ${totalJobsCount} tasks across ${phases.length} phases`,
      `- Anchor cost estimate: $${anchorCost.toFixed(4)}`,
      `- Anchor time estimate: ${anchorTimeMinutes} minutes`,
      '',
      '## ADJUSTMENT RULES',
      'Start from the anchor, then adjust ±30% based on these signals:',
      '- Tasks requiring real tools (web-search, browser, github, deploy) = +20% cost, +40% time',
      '- Research-only / pure LLM tasks = baseline (no adjustment)',
      '- Complex multi-tool tasks (full-stack build + deploy) = +40% cost, +60% time',
      '- Low feasibility score (<60%) = +30% time (retries likely)',
      '',
      'Never go below 50% of the anchor or above 200% of the anchor — those are hard bounds.',
      'time_minutes is REAL wall-clock time (queue + LLM latency + tool calls + transitions).',
      '',
      'Respond with JSON: {',
      '  "total_estimated_tokens": number,',
      '  "total_estimated_cost_usd": number,',
      '  "total_estimated_service_cost_usd": number,',
      '  "total_estimated_time_minutes": number,',
      '  "per_phase_breakdown": [{ "phase": "name", "tokens": number, "cost": number, "time_minutes": number }],',
      '  "confidence_score": 0-100,',
      '  "adjustment_reasoning": "brief explanation of why you adjusted up/down from the anchor"',
      '}',
    ].join('\n'),
    systemPrompt:
      'You are a PM estimating project costs. Be realistic — anchor to historical data, not guesses. Slightly overestimate rather than underestimate.',
    // Keep estimation on the same pinned executor as the rest of the goal.
    ...pickTestModel(goal),
    temperature: 0.2,
    maxTokens: 800,
    jsonMode: true,
    req,
    usage: {
      admin,
      userId: authorityGoal.user_id,
      goalId: authorityGoal.id,
      organizationId: authorityGoal.org_id,
      teamId: authorityGoal.agent_team_id || authorityGoal.team_id,
      consiliumId: authorityGoal.concilium_id,
      source: 'discovery-estimation',
      operation: 'estimation',
      description: `Discovery estimation: ${authorityGoal.title}`,
    },
  });

  // Realistic fallback based on historical anchors (not the old $0.005 guess)
  const fallbackPhaseCost = (p) => (p.jobs?.length || 1) * historicalAvgCostPerTask;
  const fallbackPhaseTime = (p) =>
    Math.max(2, Math.round((p.jobs?.length || 1) * historicalAvgTimePerTask));
  let estimates = parseLlmJson(result.content);
  if (!estimates || typeof estimates.total_estimated_cost_usd !== 'number') {
    estimates = {
      total_estimated_tokens: totalJobsCount * 2500,
      total_estimated_cost_usd: anchorCost,
      total_estimated_service_cost_usd: 0,
      total_estimated_time_minutes: anchorTimeMinutes,
      per_phase_breakdown: phases.map((p) => ({
        phase: p.name,
        tokens: (p.jobs?.length || 1) * 2500,
        cost: fallbackPhaseCost(p),
        time_minutes: fallbackPhaseTime(p),
      })),
      confidence_score: historySampleSize > 0 ? 70 : 50,
      adjustment_reasoning: 'Fallback — LLM parse failed, using historical anchor directly.',
    };
  } else {
    // Enforce hard bounds: clamp to [0.5x, 2x] of anchor to prevent LLM hallucination
    const minCost = anchorCost * 0.5;
    const maxCost = anchorCost * 2.0;
    const minTime = Math.max(1, Math.round(anchorTimeMinutes * 0.5));
    const maxTime = Math.round(anchorTimeMinutes * 2.0);
    if (estimates.total_estimated_cost_usd < minCost) estimates.total_estimated_cost_usd = minCost;
    if (estimates.total_estimated_cost_usd > maxCost) estimates.total_estimated_cost_usd = maxCost;
    if (estimates.total_estimated_time_minutes < minTime)
      estimates.total_estimated_time_minutes = minTime;
    if (estimates.total_estimated_time_minutes > maxTime)
      estimates.total_estimated_time_minutes = maxTime;
    estimates.history_sample_size = historySampleSize;
    estimates.anchor_cost_usd = anchorCost;
    estimates.anchor_time_minutes = anchorTimeMinutes;
  }

  // Build proposal combining all pipeline outputs
  const proposal = {
    goal_title: authorityGoal.title,
    goal_description: authorityGoal.description,
    feasibility: stageRun.native
      ? {
          success_probability: null,
          complexity_score: null,
          risk_factors: [],
          source: 'not_asserted_by_accepted_native_scope',
        }
      : {
          success_probability: feasibility.feasibility?.success_probability,
          complexity_score: feasibility.complexity_score,
          risk_factors: feasibility.feasibility?.risk_factors || [],
        },
    tech_doc_summary: stageRun.native
      ? {
          depth: null,
          problem_statement: stageRun.authority.packet.intent.problem,
          success_criteria: stageRun.authority.packet.admission?.success_criteria || [],
          source: 'accepted_native_scope',
          scope_hash: stageRun.authority.packet.scope_hash,
        }
      : {
          depth: techDoc.depth,
          problem_statement: techDoc.problem_statement,
          success_criteria: techDoc.success_criteria,
        },
    plan: {
      strategy: goal.plan?.strategy,
      phase_count: phases.length,
      total_jobs: phases.reduce((s, p) => s + p.jobs.length, 0),
      phases: phases.map((p) => ({
        name: p.name,
        description: p.description,
        job_count: p.jobs.length,
        acceptance_criteria: p.acceptance_criteria || [],
        timebox_minutes: p.timebox_minutes,
      })),
    },
    customer_intelligence: stageRun.native
      ? {
          scope_ref: stageRun.authority.packet.scope_ref,
          scope_hash: stageRun.authority.packet.scope_hash,
          context_approval: {
            status: authorityGoal.data?.goal_approvals?.context?.status || null,
            snapshot_hash: authorityGoal.data?.goal_approvals?.context?.snapshot_hash || null,
            approved_at: authorityGoal.data?.goal_approvals?.context?.approved_at || null,
            approved_by: authorityGoal.data?.goal_approvals?.context?.approved_by || null,
          },
        }
      : {
          decision_id: authorityGoal.data?.axwise_customer_intelligence?.decision_id || null,
          routing_mode: authorityGoal.data?.axwise_customer_intelligence?.routing_mode || null,
          routing_assessment:
            authorityGoal.data?.axwise_customer_intelligence?.routing_assessment || null,
          persona_resolution:
            authorityGoal.data?.axwise_customer_intelligence?.persona_resolution || null,
          context_approval: authorityGoal.data?.goal_approvals?.context || null,
        },
    axwise_orchestration: authorityGoal.data?.axwise_orchestration || null,
    team: null,
    assignments: [],
    tools: {
      required: authorityGoal.data?.required_tools || [],
      unresolved: authorityGoal.data?.unconfigured_tools || [],
    },
    governance: {
      context_confirmation_required: true,
      execution_confirmation_required: true,
      requires_orqaly_authorization: true,
      approval_points: ['customer_context', 'execution_proposal'],
    },
    estimates,
    total_cost: {
      tokens: estimates.total_estimated_cost_usd,
      services: estimates.total_estimated_service_cost_usd,
      pipeline_overhead: Number(authorityGoal.spent_usd || 0), // cost of analysis so far
      total:
        estimates.total_estimated_cost_usd +
        estimates.total_estimated_service_cost_usd +
        Number(authorityGoal.spent_usd || 0),
    },
    created_at: new Date().toISOString(),
  };

  // The task rows are the actual authorized execution assignments, including
  // their goal-specific AxWise persona overlays. They are more trustworthy
  // than reconstructing a team from a legacy membership table.
  try {
    const { data: assignedTasks } = await admin
      .from('team_tasks')
      .select('id, title, assigned_to, agent_id, status, materialization_attempt, data')
      .eq('data->>goal_id', authorityGoal.id)
      .in('status', ['planned', 'todo']);
    proposal.assignments = currentProposalAssignments(authorityGoal, assignedTasks || []);
    const uniqueMembers = new Map();
    for (const assignment of proposal.assignments) {
      if (!assignment.agent_id) continue;
      uniqueMembers.set(String(assignment.agent_id), {
        id: assignment.agent_id,
        name: assignment.agent_name,
        role: assignment.role,
      });
    }
    proposal.team = {
      id: authorityGoal.agent_team_id || authorityGoal.team_id || null,
      members: [...uniqueMembers.values()],
    };
  } catch (err) {
    log.warn(req, 'discovery-estimation.assignments.failed', { error: err.message });
  }

  const costUsd = result.estimatedCostUsd || 0;
  const completedAt = new Date().toISOString();
  const completedAttempt = {
    ...stageRun.attempt,
    status: 'completed',
    completed_at: completedAt,
  };
  const proposalPatch = {
    proposal,
    spent_usd: Number(authorityGoal.spent_usd || 0) + costUsd,
    data: {
      ...(goal.data || {}),
      discovery_estimation_attempt: completedAttempt,
      ...(stageRun.native ? { native_discovery_estimation_attempt: completedAttempt } : {}),
    },
  };
  const persisted = stageRun.native
    ? await updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        'estimating',
        stageRun.binding,
        proposalPatch
      )
    : await updateGoalIfDiscoveryEstimationAttempt(
        admin,
        goal,
        stageRun.attempt.attempt_id,
        proposalPatch
      );
  if (!persisted) return stateChangedResult(goal);

  await logGoalEvent(
    admin,
    goal.id,
    'proposal_ready',
    {
      estimated_cost: estimates.total_estimated_cost_usd,
      estimated_time: estimates.total_estimated_time_minutes,
      confidence: estimates.confidence_score,
    },
    costUsd
  );

  // Next: client-approval
  await enqueueGoalAction(admin, 'client-approval', goal.id);
  return { type: 'orchestrate-goal', action: 'discovery-estimation', goalId: goal.id, estimates };
}
