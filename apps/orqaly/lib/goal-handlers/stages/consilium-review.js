/**
 * Consilium Review — invoked by evaluate-phase when goal has a linked board.
 *
 * Replaces single-LLM PM review with multi-member Consilium evaluation.
 * Falls back to standard PM review if no board is linked.
 *
 * Also handles:
 * - Agent accountability (flag/replace underperformers)
 * - Budget monitoring (pause if approaching limit)
 * - Phase acceptance criteria enforcement
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { logGoalEvent, loadGoal, pickTestModel } from '../_helpers.js';
import { resolveAcceptedNativeGoalAuthority } from '../../_shared/native-goal-authority.js';

const log = createLogger('goal-stage:consilium-review');

export function resolveConsiliumReviewAuthority(initialGoal, currentGoal = initialGoal) {
  const initial = resolveAcceptedNativeGoalAuthority(initialGoal);
  const current = resolveAcceptedNativeGoalAuthority(currentGoal);
  const changed =
    initial.native !== current.native ||
    (initial.native && initial.packet?.scope_hash !== current.packet?.scope_hash);
  const invalid = (initial.native && !initial.ready) || (current.native && !current.ready);
  if (changed || invalid) {
    return {
      blocked: true,
      reasons: [
        ...(initial.reasons || []),
        ...(current.reasons || []),
        ...(changed ? ['native_scope_authority_changed_during_consilium_review'] : []),
      ].filter((reason, index, values) => values.indexOf(reason) === index),
      objective: null,
      goal: currentGoal,
    };
  }
  return {
    blocked: false,
    reasons: [],
    objective: current.native ? current.packet.intent.objective : currentGoal.title,
    goal: currentGoal,
  };
}

/**
 * Run Consilium evaluation on phase outputs.
 * Returns { passed, quality_score, feedback, next_action, consilium_evaluation }
 */
export async function runConsiliumPhaseReview(
  admin,
  goal,
  phaseIndex,
  evaluationDigest,
  phaseCost,
  req
) {
  const initialAuthority = resolveConsiliumReviewAuthority(goal);
  if (initialAuthority.blocked) {
    return {
      native_scope_authority_blocked: true,
      reasons: initialAuthority.reasons,
    };
  }
  if (!goal.concilium_id) return null;

  const currentGoal = await loadGoal(admin, goal.id);
  const reviewAuthority = resolveConsiliumReviewAuthority(goal, currentGoal);
  if (reviewAuthority.blocked) {
    return {
      native_scope_authority_blocked: true,
      reasons: reviewAuthority.reasons,
    };
  }
  const reviewGoal = reviewAuthority.goal;
  const phases = reviewGoal.plan?.phases || [];
  const phase = phases[phaseIndex];
  if (!phase) return null;

  const conciliumId = reviewGoal.concilium_id;
  if (!conciliumId) return null; // No board linked — caller should use standard PM review

  // Check board exists and has active members
  const { data: board, error: boardError } = await admin
    .from('concilium')
    .select('id, user_id, name, approval_threshold')
    .eq('id', conciliumId)
    .eq('user_id', reviewGoal.user_id)
    .maybeSingle();

  if (boardError || !board || board.user_id !== reviewGoal.user_id) {
    log.warn(req, 'consilium-review.board-not-found', { conciliumId, goalId: reviewGoal.id });
    return null; // Fall back to PM review
  }

  const { count: memberCount, error: membersError } = await admin
    .from('concilium_members')
    .select('id', { count: 'exact', head: true })
    .eq('concilium_id', conciliumId)
    .eq('user_id', reviewGoal.user_id)
    .eq('active', true)
    .eq('quarantined', false);

  if (membersError || !memberCount) {
    log.warn(req, 'consilium-review.no-members', { conciliumId });
    return null;
  }

  // Import evaluation engine dynamically (avoid circular deps)
  const { runEvaluation } = await import('../../concilium-handlers/evaluation-engine.js');

  // Build job description from goal + phase context
  const acceptanceCriteria = phase.acceptance_criteria || [];
  const jobDescription = [
    `Goal: ${reviewAuthority.objective}`,
    `Phase ${phaseIndex + 1}: ${phase.name} — ${phase.description || ''}`,
    `Budget: $${reviewGoal.budget_usd} (spent: $${reviewGoal.spent_usd})`,
    `Phase cost: $${phaseCost.toFixed(4)}`,
    acceptanceCriteria.length > 0
      ? `\nAcceptance Criteria (ALL must pass):\n${acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`
      : '',
    '\nEvaluate whether the deliverables meet the acceptance criteria. Score quality 0-100.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const evaluation = await runEvaluation(admin, {
      conciliumId,
      jobId: null,
      jobDescription,
      // evaluate-phase already builds a bounded, fair per-task digest. Do not
      // slice it again: a second global prefix cap would hide later tasks.
      agentOutput: evaluationDigest,
      userId: reviewGoal.user_id,
      llm: pickTestModel(reviewGoal),
    });

    const passed = evaluation.consensus?.approved && evaluation.risk?.level !== 'CRITICAL';
    const qualityScore = Math.round(evaluation.overallScore || 0);

    // Build feedback from member responses
    const memberFeedback = (evaluation.memberResponses || [])
      .map((m) => `[${m.memberName}]: ${m.feedback || m.summary || ''}`)
      .filter(Boolean)
      .join('\n');

    await logGoalEvent(
      admin,
      reviewGoal.id,
      'consilium_reviewed',
      {
        phaseIndex,
        passed,
        quality_score: qualityScore,
        consensus: evaluation.consensus,
        risk_level: evaluation.risk?.level,
        member_count: evaluation.memberResponses?.length || 0,
        cost_usd: evaluation.totalCostUsd || 0,
      },
      evaluation.totalCostUsd || 0,
      phaseIndex
    );

    return {
      passed,
      quality_score: qualityScore,
      feedback: memberFeedback || evaluation.consensus?.summary || 'Consilium review complete.',
      next_action: passed ? (phaseIndex >= phases.length - 1 ? 'complete' : 'continue') : 'iterate',
      progress_percent: passed
        ? Math.round(((phaseIndex + 1) / phases.length) * 100)
        : Math.round((phaseIndex / phases.length) * 100),
      consilium_evaluation: {
        consensus: evaluation.consensus,
        risk: evaluation.risk,
        memberCount: evaluation.memberResponses?.length || 0,
        totalCost: evaluation.totalCostUsd || 0,
      },
    };
  } catch (err) {
    log.error(req, 'consilium-review.failed', {
      error: err.message,
      goalId: reviewGoal.id,
      phaseIndex,
    });
    return null; // Fall back to PM review
  }
}

/**
 * Check agent accountability — flag underperformers, update activity log.
 * Called after phase evaluation.
 */
export async function checkAgentAccountability(admin, goal, phaseIndex, tasks, req) {
  if (!goal.team_id) return;

  const phases = goal.plan?.phases || [];
  const phase = phases[phaseIndex];
  if (!phase) return;

  const failedTasks = (tasks || []).filter((t) => t.status !== 'done');
  if (failedTasks.length === 0) return; // All tasks completed — no issues

  // Find which agents failed
  for (const task of failedTasks) {
    const agentId = task.agent_id;
    if (!agentId) continue;

    // Check agent's failure history
    const { data: perf } = await admin
      .from('agent_performance')
      .select('tasks_failed, tasks_completed')
      .eq('agent_id', agentId)
      .eq('task_type', 'general')
      .maybeSingle();

    const totalFailed = (perf?.tasks_failed || 0) + 1;
    const totalCompleted = perf?.tasks_completed || 0;
    const failureRate = totalFailed / Math.max(totalFailed + totalCompleted, 1);

    // Log warning
    await logGoalEvent(admin, goal.id, 'agent_warning', {
      agent_id: agentId,
      agent_name: task.assigned_to,
      task_title: task.title,
      failure_count: totalFailed,
      failure_rate: failureRate,
      phase_index: phaseIndex,
    });

    // If agent has failed 3+ tasks consecutively, flag for replacement
    if (totalFailed >= 3 && failureRate > 0.5) {
      await logGoalEvent(admin, goal.id, 'agent_flagged', {
        agent_id: agentId,
        agent_name: task.assigned_to,
        reason: `Failed ${totalFailed} tasks (${(failureRate * 100).toFixed(0)}% failure rate)`,
        action: 'recommend_replacement',
      });

      // Update agent performance
      try {
        await admin.from('agent_performance').upsert(
          {
            agent_id: agentId,
            task_type: 'general',
            tasks_failed: totalFailed,
            tasks_completed: totalCompleted,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'agent_id,task_type' }
        );
      } catch (err) {
        log.warn(req, 'accountability.perf-update.failed', { error: err.message });
      }
    }
  }
}

/**
 * Monitor budget in real-time during execution.
 * Returns { ok, action, reason } — 'ok' to continue, 'pause'/'fail' to stop.
 */
export function checkBudgetHealth(goal, phaseCost) {
  const spent = Number(goal.spent_usd || 0) + phaseCost;
  const budget = Number(goal.budget_usd || 0);
  if (budget <= 0) return { ok: false, action: 'fail', reason: 'No budget set' };

  const pct = spent / budget;

  if (pct >= 1.0)
    return {
      ok: false,
      action: 'fail',
      reason: `Budget exhausted ($${spent.toFixed(2)} / $${budget.toFixed(2)})`,
    };
  if (pct >= 0.9)
    return {
      ok: false,
      action: 'pause',
      reason: `Budget 90% spent ($${spent.toFixed(2)} / $${budget.toFixed(2)})`,
    };
  if (pct >= 0.8)
    return {
      ok: true,
      action: 'warn',
      reason: `Budget 80% spent ($${spent.toFixed(2)} / $${budget.toFixed(2)})`,
    };

  return { ok: true, action: 'continue', remaining: budget - spent };
}
