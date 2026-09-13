/**
 * Stage 7c: Iterate (Re-plan on Phase Failure)
 *
 * Checks iteration limits and budget, generates a revised plan via LLM,
 * updates the workflow, and re-enqueues execution from phase 0.
 *
 * Extracted from goal-orchestrator.js — preserves original behavior.
 */
import { executeLlm, parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  enqueueGoalAction,
  notifyGoalEvent,
  checkBudget,
  recordStageLlmUsage,
  pickTestModel,
  normalizePlanShape,
  updateGoalIfNativeScopeBinding,
} from '../_helpers.js';
import { postMessage } from '../goal-messaging.js';
import { tryHealContinuation } from '../loop-continuation.js';
import {
  enforceAxwiseEvidenceExecutionBoundary,
  enforceAxwiseResearchBoundary,
  formatAxwiseEvidenceExecutionPolicyForPlanning,
  formatAxwiseResearchPolicyForPlanning,
  normalizePlannerOutput,
} from '../planner-output-normalization.js';
import { goalRequiredExecutionRoles } from '../team-assigner.js';
import { alignPlanJobsToRequiredRoles, formatPlannerRole } from './pm-planning.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import {
  invalidateNativeExecutionForCanonicalReplan,
  resolveNativeLegacyDispatch,
  transitionNativeIterationToCanonicalPlanning,
} from '../native-legacy-dispatch.js';
import { clearJobLease, hasCompleteJobLease } from '../../agent-handlers/job-lease-runtime.js';

const log = createLogger('goal-stage:iterate');

/**
 * Shorten for a chat line without cutting a word in half.
 *
 * A flat slice ended the PM's re-planning message on "half-page r", which
 * reads as a bug rather than an elision.
 */
function clip(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const REPLAN_EXECUTION_INVALIDATION_REASON = 'plan_replaced_by_iteration';

/**
 * A successful re-plan replaces the tasks that gate 2 approved. Keep the
 * customer-context approval (the customer did not change), but immediately
 * make the old execution approval and authorization visibly non-executable.
 *
 * The later client-approval stage still builds a fresh manifest from the new
 * task rows. This early invalidation closes the transient state where the goal
 * could display an approved execution package while those approved tasks had
 * already been deleted and their replacements were still being provisioned.
 */
export function invalidateExecutionForReplan(
  data = {},
  reason = REPLAN_EXECUTION_INVALIDATION_REASON
) {
  return invalidateNativeExecutionForCanonicalReplan(data, reason);
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);

  // Classify before any legacy shortcut. Canonical transition is deliberately
  // delayed until iteration/progress/budget guards below have passed.
  const nativeDispatch = resolveNativeLegacyDispatch(goal, 'iterate');
  if (nativeDispatch.native && !nativeDispatch.safe) {
    log.warn(req, 'iterate.native-canonical-transition-blocked', {
      goalId: goal.id,
      reasons: nativeDispatch.reasons,
    });
    return {
      type: 'orchestrate-goal',
      action: 'iterate',
      status: 'state_changed',
      reason: 'native_canonical_replan_blocked',
      reasons: nativeDispatch.reasons,
    };
  }
  const updateIterationState = async (updates) => {
    if (nativeDispatch.native) {
      return updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        'active',
        nativeDispatch.binding,
        updates
      );
    }
    await updateGoal(admin, goal.id, updates);
    return true;
  };

  // Preserve prior successful deploy only inside the legacy iteration
  // engine. Native work always returns to canonical PM planning.
  if (!nativeDispatch.native)
    try {
      const { data: lps } = await admin
        .from('landing_pages')
        .select('id, status, deployment_url')
        .eq('goal_id', goal.id)
        .eq('status', 'deployed');
      const liveLp = (lps || []).find((r) => r.deployment_url);
      if (liveLp) {
        const phases = goal.plan?.phases || [];
        if (phases.length >= 2) {
          const preserved = phases.map((p, idx) => {
            if (idx <= 1) return { ...p, status: 'completed' };
            return { ...p, status: 'pending' };
          });
          await updateGoal(admin, goal.id, {
            plan: { ...goal.plan, phases: preserved },
            data: {
              ...(goal.data || {}),
              deployment_url: liveLp.deployment_url,
              deploy_preserved_on_iterate: true,
            },
            iteration: (goal.iteration || 0) + 1,
          });
          await logGoalEvent(admin, goal.id, 'iteration_deploy_preserved', {
            iteration: (goal.iteration || 0) + 1,
            deployment_url: liveLp.deployment_url,
          });
          const nextPhaseIndex = preserved.findIndex((p) => p.status === 'pending');
          if (nextPhaseIndex >= 0) {
            await enqueueGoalAction(admin, 'execute-phase', goal.id, {
              phaseIndex: nextPhaseIndex,
            });
          } else {
            await enqueueGoalAction(admin, 'complete', goal.id);
          }
          return {
            type: 'orchestrate-goal',
            action: 'iterate',
            status: 'deploy_preserved',
            deployment_url: liveLp.deployment_url,
          };
        }
      }
    } catch (preserveErr) {
      log.warn(req, 'iterate.deploy-preserve-check-failed', { error: preserveErr.message });
    }

  if (goal.iteration >= goal.max_iterations) {
    const reason = `Max iterations reached (${goal.iteration}/${goal.max_iterations}). The team could not produce passing results after multiple replanning attempts.`;
    const transitioned = await updateIterationState({
      status: 'failed',
      data: { ...(goal.data || {}), failure_reason: reason, failed_at: new Date().toISOString() },
    });
    if (!transitioned) {
      return { type: 'orchestrate-goal', action: 'iterate', status: 'state_changed' };
    }
    await logGoalEvent(admin, goal.id, 'goal_failed', { reason });
    await notifyGoalEvent(admin, goal, 'goal_failed', { reason });

    // Loop chain failure-handling: if this goal is part of a loop chain,
    // try the self-healer once. If it can't heal, pause only THIS chain
    // (other chains keep running) and alert the user. Sibling chains are
    // untouched because we only flip loop_paused on this specific goal.
    if (goal.loop_chain_root_id) {
      try {
        await tryHealContinuation(admin, goal.id, { req, userId: goal.user_id });
      } catch (healErr) {
        log.warn(req, 'iterate.loop.heal-error', { goalId: goal.id, error: healErr.message });
      }
    }
    return { type: 'orchestrate-goal', action: 'iterate', status: 'max_iterations' };
  }

  // Iteration-failure history is stored as `goal.data.iteration_failures`.
  // Legacy entries are bare strings; new entries are objects with
  // { reason, iteration, spend_at_iteration, tasks_done_at_iteration, at }
  // so we can detect structural no-progress signals in addition to text-equality.
  const rawReason = String(payload?.feedback || payload?.failure_reason || '').trim();
  const normalise = (s) =>
    s.toLowerCase().replace(/\s+/g, ' ').replace(/\d+ms/g, 'Nms').slice(0, 300);
  const history = Array.isArray(goal.data?.iteration_failures) ? goal.data.iteration_failures : [];
  let currentGoalData = goal.data || {};
  const asEntry = (h) => (typeof h === 'string' ? { reason: h } : h || {});
  const currentSpend = Number(goal.spent_usd || 0);

  // Multi-signal progress detection. Count only the current attempt: completed
  // history retained after Request Changes must not make a replacement plan
  // look productive or surface an obsolete subprocess error.
  let tasksDoneNow = 0;
  let subprocessError = '';
  try {
    const { data: attemptRows, error: attemptError } = await admin
      .from('team_tasks')
      .select('id, status, materialization_attempt, data, updated_at')
      .eq('goal_id', goal.id);
    if (attemptError) throw attemptError;
    const attemptTasks = currentGoalTaskAttempt(goal, attemptRows || []);
    tasksDoneNow = attemptTasks.filter(
      (task) => task.status === 'done' && Boolean(task.data?.output)
    ).length;
    const lastFailedTask = attemptTasks
      .filter((task) => task.status === 'failed')
      .sort(
        (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
      )[0];
    subprocessError = String(lastFailedTask?.data?.error || '').slice(0, 200);
  } catch (countErr) {
    log.warn(req, 'iterate.current-attempt-task-fetch-failed', {
      goalId: goal.id,
      error: countErr.message,
    });
  }
  const currentReason = subprocessError
    ? `${rawReason || '(no feedback)'} [task error: ${subprocessError}]`
    : rawReason;

  const newFailureEntry = () => ({
    reason: currentReason || '(no feedback)',
    iteration: goal.iteration,
    spend_at_iteration: currentSpend,
    tasks_done_at_iteration: tasksDoneNow,
    at: new Date().toISOString(),
  });

  // No-progress guard: only fire when BOTH spend AND completed-task count
  // have not moved across the last two iterations. Spend alone gives false
  // positives on subscription-billed providers (claude-code/Opus Sub).
  const recent = history.slice(-2).map(asEntry);
  const noSpendDelta =
    recent.length === 2 &&
    recent.every(
      (r) => typeof r.spend_at_iteration === 'number' && r.spend_at_iteration === currentSpend
    );
  const noTaskDelta =
    recent.length === 2 &&
    recent.every(
      (r) =>
        typeof r.tasks_done_at_iteration === 'number' && r.tasks_done_at_iteration === tasksDoneNow
    );
  if (noSpendDelta && noTaskDelta) {
    const reason = `Two consecutive iterations produced no spend delta ($${currentSpend.toFixed(4)} unchanged) AND no new completed tasks (${tasksDoneNow} done, unchanged across iterations ${goal.iteration - 1} and ${goal.iteration}). The orchestrator could not detect forward progress. Likely causes: a task-execution timeout, a stuck subprocess, or a deliverable that was shipped but never recorded against this goal. Open the Resolve & Resume dialog and pick "Retry from stage"; if the issue persists, check team_tasks for this goal_id and confirm done-tasks have data.output populated. Last task error: ${subprocessError || '(none recorded)'}.`;
    // Set status directly to 'needs_human' (not 'failed') — this is a
    // genuinely unrecoverable condition and we don't want the healer to
    // re-enqueue the failure_stage. failure_stage stays a plain action name
    // so any consumer that re-enqueues from it doesn't end up with the
    // bogus 'iterate:no-progress' action that broke goal 96b4e599.
    const transitioned = await updateIterationState({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failed_at: new Date().toISOString(),
        failure_stage: 'iterate',
        no_progress_escalated: true,
        iteration_failures: [...history, newFailureEntry()].slice(-5),
      },
    });
    if (!transitioned) {
      return { type: 'orchestrate-goal', action: 'iterate', status: 'state_changed' };
    }
    await logGoalEvent(admin, goal.id, 'goal_needs_human', {
      reason,
      stage: 'iterate',
      classification: 'no_progress',
    });
    await notifyGoalEvent(admin, goal, 'goal_failed', { reason });
    log.warn(req, 'iterate.no-progress.escalate', {
      goalId: goal.id,
      iteration: goal.iteration,
      spend: currentSpend,
      tasksDone: tasksDoneNow,
    });
    return { type: 'orchestrate-goal', action: 'iterate', status: 'no_progress' };
  }

  // Same-cause short-circuit: if the previous iteration failed with the
  // same normalised feedback as this one, re-planning is guaranteed to hit
  // the same wall (e.g. "provider X timed out", "agent pool empty", "no
  // GitHub creds"). Stop now so the user sees the actual cause at iteration
  // 2 instead of iteration 5.
  const lastReason = history.length > 0 ? asEntry(history[history.length - 1]).reason || '' : '';
  if (currentReason && lastReason && normalise(currentReason) === normalise(lastReason)) {
    const reason = `Same failure repeated across iterations ${goal.iteration} and ${goal.iteration + 1}. Not re-planning — underlying cause didn't change. Last reason: ${currentReason.slice(0, 300)}`;
    // Same rationale as the no-progress branch above: status='needs_human'
    // (terminal), plain failure_stage='iterate' so downstream re-enqueue
    // can't ever produce 'iterate:same-cause' as an unknown action.
    const transitioned = await updateIterationState({
      status: 'needs_human',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failed_at: new Date().toISOString(),
        failure_stage: 'iterate',
        same_cause_escalated: true,
        iteration_failures: [...history, newFailureEntry()].slice(-5),
      },
    });
    if (!transitioned) {
      return { type: 'orchestrate-goal', action: 'iterate', status: 'state_changed' };
    }
    await logGoalEvent(admin, goal.id, 'goal_needs_human', {
      reason,
      stage: 'iterate',
      classification: 'same_cause',
    });
    await notifyGoalEvent(admin, goal, 'goal_failed', { reason });
    log.warn(req, 'iterate.same-cause.fail-fast', { goalId: goal.id, iteration: goal.iteration });
    return { type: 'orchestrate-goal', action: 'iterate', status: 'same_cause' };
  }
  // Record this iteration's reason + progress snapshot for comparison on
  // the NEXT round (both same-cause and no-progress guards read this).
  if (currentReason) {
    currentGoalData = {
      ...currentGoalData,
      iteration_failures: [...history, newFailureEntry()].slice(-5),
    };
    if (!nativeDispatch.native) {
      await updateGoal(admin, goal.id, {
        data: currentGoalData,
      });
    }
  }

  const budget = checkBudget(goal);
  if (!budget.ok) {
    const isBudgetWarning = !!budget.warning;
    const newStatus = isBudgetWarning ? 'paused' : 'failed';
    const eventType = isBudgetWarning ? 'budget_warning' : 'budget_exhausted';
    const updates = { status: newStatus };
    if (!isBudgetWarning) {
      updates.data = {
        ...(goal.data || {}),
        failure_reason: `Budget exhausted: ${budget.reason}`,
        failed_at: new Date().toISOString(),
      };
    }
    const transitioned = await updateIterationState(updates);
    if (!transitioned) {
      return { type: 'orchestrate-goal', action: 'iterate', status: 'state_changed' };
    }
    await logGoalEvent(admin, goal.id, isBudgetWarning ? 'budget_warning' : 'goal_failed', {
      reason: budget.reason,
    });
    await notifyGoalEvent(admin, goal, eventType, { reason: budget.reason });
    return {
      type: 'orchestrate-goal',
      action: 'iterate',
      status: isBudgetWarning ? 'budget_warning' : 'budget_exhausted',
    };
  }

  if (nativeDispatch.native) {
    // Carry the observed failure history into the exact planning reservation;
    // a separate preliminary write would stale the native binding itself.
    const nativeTransition = await transitionNativeIterationToCanonicalPlanning(admin, {
      ...goal,
      data: currentGoalData,
    });
    if (!nativeTransition.safe || !nativeTransition.ok) {
      log.warn(req, 'iterate.native-canonical-transition-blocked', {
        goalId: goal.id,
        reasons: nativeTransition.reasons,
      });
      return {
        type: 'orchestrate-goal',
        action: 'iterate',
        status: 'state_changed',
        reason: 'native_canonical_replan_blocked',
        reasons: nativeTransition.reasons,
      };
    }
    if (goal.data?.goal_approvals?.execution || goal.data?.execution_authorization) {
      await logGoalEvent(admin, goal.id, 'execution_approval_invalidated', {
        reason: REPLAN_EXECUTION_INVALIDATION_REASON,
        prior_snapshot_hash:
          goal.data?.goal_approvals?.execution?.snapshot_hash ||
          goal.data?.execution_authorization?.snapshot_hash ||
          null,
        iteration: Number(goal.iteration || 0) + 1,
      });
    }
    await enqueueGoalAction(admin, 'pm-planning', goal.id);
    return {
      type: 'orchestrate-goal',
      action: 'iterate',
      status: 'canonical_stage_queued',
      canonicalAction: 'pm-planning',
      iteration: Number(goal.iteration || 0) + 1,
    };
  }

  // Detect landing-page goals so iterate preserves the mandatory
  // Designer → Developer → QA structure on re-plan. Without this,
  // iterate's generic "try a different approach" instruction causes
  // it to invent 4+ phases of generic busy-work (Research, Content,
  // Prototyping, Feedback) that never deploy anything.
  const goalText = `${goal.title} ${goal.description || ''}`.toLowerCase();
  const axwiseResearchPolicy = formatAxwiseResearchPolicyForPlanning(goal);
  const axwiseEvidenceExecutionPolicy = formatAxwiseEvidenceExecutionPolicyForPlanning(goal);
  const isLandingPageGoal =
    /\b(landing page|landing-page|website|web site|web app|web-app|marketing site|homepage|home page|microsite|one[-\s]?pager|splash page)\b/.test(
      goalText
    );
  const landingPageRule = isLandingPageGoal
    ? `

MANDATORY STRUCTURE — landing page / website / web app goals (keep on iterate):

Preserve the 3-phase Designer → Developer → QA structure on every iteration. Do NOT switch to a different approach by splitting work into more phases — the issue is ALWAYS fixable within the same 3 phases by tightening the failing stage's inputs.

Phase 1 — "Design Research & Specification" (deliverable_type: markdown)
  Job: required_role: "Designer"
  On retry, the Designer MUST include the LITERAL :root CSS block (6 real hex values, no placeholders) AND a LITERAL Google Fonts <link> line with TWO family= params. These are non-negotiable — the Developer's deployment template hard-fails on MISSING_DESIGN_SYSTEM without them.
  tool_requirements: ["web-search", "doc-generator"]

Phase 2 — "Implementation & Deployment" (deliverable_type: deployment)
  Job: required_role: "Frontend Developer"
  Implements the Design Brief EXACTLY via tool_cloudflare_pages__deploy_site.
  tool_requirements: ["cloudflare-pages"]

Phase 3 — "Quality Verification" (deliverable_type: markdown, optional)
  Job: required_role: "QA Tester"
  tool_requirements: ["http-client", "vision-qa"]
  MUST call tool_vision_qa__compare with the Phase 2 deploymentUrl and the Phase 1 markdown design brief.
  The tool returns { score, summary, passed, failures[{category, severity, viewport, location, details, suggestion}] }.
  If passed:false OR any failure has severity:"high", FAIL Phase 3 — return the structured failures verbatim
  so the re-planner gets categorized signal (not prose). Categories include: mobile_overflow, contrast_fail,
  palette_mismatch, typography_mismatch, spacing_issue, image_quality, cta_invisible, hero_blank, layout_broken.

DO NOT create 4+ phases. DO NOT rename phases to "Content Creation" / "Prototyping" / "Feedback" / etc. — those are not valid alternatives, they are PM hallucinations that skip the Designer and fail to deploy. The fix is always: tighten the Designer's spec, not split the work.
`
    : '';

  // Run the re-planner. `extraInstruction` lets the retry below hammer harder
  // on JSON-only output — some providers (notably the text-only claude-code
  // Agent SDK used by compare-mode "Opus Sub" goals) occasionally answer the
  // first call with prose or a truncated object, which parses to no phases.
  const runReplan = (extraInstruction = '') =>
    executeLlm({
      prompt: [
        `Goal: ${goal.title}`,
        goal.description ? `Description: ${goal.description}` : '',
        `Previous strategy: ${goal.plan?.strategy || 'none'}`,
        `What failed: ${payload.feedback || 'Phase did not produce adequate results'}`,
        `Iteration: ${goal.iteration + 1} of ${goal.max_iterations}`,
        `Remaining budget: $${(Number(goal.budget_usd) - Number(goal.spent_usd)).toFixed(2)}`,
        landingPageRule,
        axwiseResearchPolicy,
        axwiseEvidenceExecutionPolicy,
        '',
        'Create a revised plan with a different approach. Include effort estimates.',
        'Respond with JSON: { "strategy": "...", "confidence_score": 0-100, "phases": [{ "name": "...", "description": "...", "jobs": [{ "title": "...", "description": "...", "required_role": "...", "deliverable_type": "...", "category": "...", "tool_requirements": ["..."], "requirements": "...", "estimate_hours": number }] }] }',
        extraInstruction,
      ]
        .filter(Boolean)
        .join('\n'),
      systemPrompt:
        "You are a PM. Revise the plan based on failure feedback. Be practical, cost-efficient. For landing-page goals, PRESERVE the 3-phase Designer→Developer→QA structure — don't invent new phases.",
      // Keep re-planning on the same pinned executor as the rest of the goal.
      ...pickTestModel(goal),
      temperature: 0.5,
      maxTokens: 2000,
      jsonMode: true,
      userId: goal.user_id,
      req,
    });

  let replanResult = await runReplan();
  let newPlan = normalizePlanShape(parseLlmJson(replanResult.content));
  if (!newPlan?.phases?.length) {
    // One retry with an explicit JSON-only reminder before giving up. Cheap
    // insurance against a single malformed response ending an otherwise
    // recoverable goal.
    await logGoalEvent(admin, goal.id, 'replan_retry', { reason: 'no_phases_first_attempt' });
    replanResult = await runReplan(
      '\nIMPORTANT: Return ONLY a single valid JSON object with a non-empty "phases" array. No prose, no markdown code fences, no explanation.'
    );
    newPlan = normalizePlanShape(parseLlmJson(replanResult.content));
  }
  if (!newPlan?.phases?.length) {
    const reason = 'Re-plan failed: the LLM did not return a valid revised plan with phases.';
    await updateGoal(admin, goal.id, {
      status: 'failed',
      data: { ...(goal.data || {}), failure_reason: reason, failed_at: new Date().toISOString() },
    });
    await logGoalEvent(admin, goal.id, 'goal_failed', { reason });
    return { type: 'orchestrate-goal', action: 'iterate', status: 'replan_failed' };
  }

  // Re-planning is a second untrusted plan-production boundary. Apply the
  // same canonicalization used by initial PM planning before the replacement
  // plan can reach team-formation or tool-provisioning.
  const { diagnostics: outputNormalization } = normalizePlannerOutput(newPlan);
  const { diagnostics: researchBoundary } = enforceAxwiseResearchBoundary(newPlan, goal);
  const { diagnostics: evidenceExecutionBoundary } = enforceAxwiseEvidenceExecutionBoundary(
    newPlan,
    goal
  );
  if (outputNormalization.toolMappings.length || outputNormalization.deliverableMappings.length) {
    log.info(req, 'iterate.output-normalized', {
      goalId: goal.id,
      toolMappings: outputNormalization.toolMappings,
      deliverableMappings: outputNormalization.deliverableMappings,
    });
  }
  if (outputNormalization.unknownTools.length) {
    log.warn(req, 'iterate.output-unknown-tools', {
      goalId: goal.id,
      tools: outputNormalization.unknownTools,
    });
  }
  if (researchBoundary.enforced) {
    log.info(req, 'iterate.axwise-research-boundary', {
      goalId: goal.id,
      routingMode: researchBoundary.routingMode,
      removedJobs: researchBoundary.removedJobs,
      replacedPhases: researchBoundary.replacedPhases,
      removedTools: researchBoundary.removedTools,
      scrubbedFields: researchBoundary.scrubbedFields,
    });
  }
  if (evidenceExecutionBoundary.enforced) {
    log.info(req, 'iterate.axwise-evidence-execution-boundary', {
      goalId: goal.id,
      convertedJobs: evidenceExecutionBoundary.convertedJobs,
    });
  }

  for (const phase of newPlan.phases) {
    phase.status = 'pending';
    // Same guard as pm-planning: the re-planner LLM occasionally returns
    // phase.jobs as a non-array truthy value, and `|| []` doesn't catch it.
    phase.jobs = (Array.isArray(phase.jobs) ? phase.jobs : []).map((j) => ({
      title: j.title || 'Untitled',
      description: j.description || '',
      category: j.category || 'general',
      // Preserve these fields from the PM's revised plan — previously
      // stripped during normalization, which destroyed the landing-page
      // Designer → Developer assignment on every iterate.
      required_role: j.required_role || 'researcher',
      deliverable_type: j.deliverable_type,
      tool_requirements: j.tool_requirements,
      acceptance_criteria: Array.isArray(j.acceptance_criteria) ? j.acceptance_criteria : [],
      requirements: j.requirements || '',
      estimate_hours: Number(j.estimate_hours) || 1,
      status: 'pending',
    }));
  }

  // Keep the re-planned roles inside the specialist roster, exactly as
  // pm-planning does for the first plan. Without this the re-planner is free
  // to name roles the first plan never had; the union grows past the roster
  // cap during team formation and the goal hard-stops on incomplete coverage -
  // which is why a first pass could form a team and the retry could not.
  //
  // Unlike pm-planning this never fails the goal. The team is already formed
  // by the time we iterate, and the alignment only refuses when the revised
  // tasks carry too little text to score against any role. Turning that into
  // needs_human would strand recoverable re-plans; team formation still gates
  // real coverage gaps.
  const replanRequiredRoles = goalRequiredExecutionRoles(
    { ...goal, plan: { strategy: newPlan.strategy, phases: newPlan.phases } },
    5
  ).map(formatPlannerRole);
  const replanAlignment = alignPlanJobsToRequiredRoles(
    { phases: newPlan.phases },
    replanRequiredRoles
  );
  if (replanAlignment.valid) {
    if (replanAlignment.changes.length) {
      log.info(req, 'iterate.role-alignment-applied', {
        goalId: goal.id,
        requiredRoles: replanRequiredRoles,
        changes: replanAlignment.changes,
      });
    }
  } else {
    log.warn(req, 'iterate.role-alignment-skipped', {
      goalId: goal.id,
      requiredRoles: replanRequiredRoles,
      uncoveredRoles: replanAlignment.uncoveredRoles,
      unmappableTasks: replanAlignment.unmappableTasks || [],
    });
  }

  const replanData = invalidateExecutionForReplan(currentGoalData);
  await updateGoal(admin, goal.id, {
    status: 'forming_team',
    plan: { strategy: newPlan.strategy, phases: newPlan.phases },
    iteration: goal.iteration + 1,
    confidence_score: Math.min(100, Math.max(0, Number(newPlan.confidence_score) || 40)),
    spent_usd: Number(goal.spent_usd || 0) + (replanResult.estimatedCostUsd || 0),
    data: replanData,
  });
  if (currentGoalData.goal_approvals?.execution || currentGoalData.execution_authorization) {
    await logGoalEvent(admin, goal.id, 'execution_approval_invalidated', {
      reason: REPLAN_EXECUTION_INVALIDATION_REASON,
      prior_snapshot_hash:
        currentGoalData.goal_approvals?.execution?.snapshot_hash ||
        currentGoalData.execution_authorization?.snapshot_hash ||
        null,
      iteration: goal.iteration + 1,
    });
  }

  // Update workflow with new phases
  if (goal.workflow_id) {
    try {
      const nodes = newPlan.phases.map((phase, i) => ({
        id: `phase-${i}`,
        type: 'phase',
        position: { x: 200, y: 100 + i * 150 },
        data: {
          label: phase.name,
          description: phase.description,
          status: phase.status,
          jobs: phase.jobs.map((j) => j.title),
          phaseIndex: i,
          goalId: goal.id,
        },
      }));
      const edges = newPlan.phases
        .slice(0, -1)
        .map((_, i) => ({ id: `edge-${i}`, source: `phase-${i}`, target: `phase-${i + 1}` }));
      await admin
        .from('workflows')
        .update({
          data: { nodes, edges, goal_id: goal.id, iteration: goal.iteration + 1 },
          updated_at: new Date().toISOString(),
        })
        .eq('id', goal.workflow_id);
    } catch (err) {
      log.warn(req, 'goal.workflow-replan.failed', { error: err.message });
    }
  }

  await logGoalEvent(
    admin,
    goal.id,
    'iteration_started',
    { iteration: goal.iteration + 1, newStrategy: newPlan.strategy, feedback: payload.feedback },
    replanResult.estimatedCostUsd || 0
  );
  await postMessage(admin, {
    goalId: goal.id,
    senderName: 'PM',
    channel: 'team-room',
    message: `Re-planning: ${payload.feedback || 'Phase failed'}. New strategy: ${clip(newPlan.strategy, 240)}`,
    messageType: 'instruction',
  });
  await recordStageLlmUsage(admin, goal, replanResult, {
    source: 'iterate',
    description: 'Re-plan iteration',
    phaseIndex: -1,
  });

  // Delete stale tasks from the previous plan iteration so team-formation
  // can create fresh tasks for the new phases. Without this, execute-phase
  // would find 0 tasks (the old ones are done/failed and don't match the
  // new phase indexes), and the iterate loop would spin until max-iterations.
  //
  // Race condition guard: cancel any execute-task agent_jobs still queued or
  // running for this goal BEFORE deleting team_tasks. Otherwise the worker
  // claims the old execute-task, tries to load a now-deleted team_task row,
  // and logs `Task task-XXX not found` (seen 3x in the Auto Parts Opus Sub
  // goal's job history). Cancelled jobs are marked superseded so the
  // job-processor logs them as expected, not as silent failures.
  try {
    const { data: oldJobs } = await admin.from('jobs').select('id').eq('goal_id', goal.id);
    const oldJobIds = (oldJobs || []).map((j) => j.id);
    if (oldJobIds.length) {
      // Cancel any in-flight execute-task jobs for this goal first. Match by
      // payload.goalId since the agent_jobs.payload is JSON.
      try {
        const { data: queuedSuperseded } = await admin
          .from('agent_jobs')
          .update({
            status: 'cancelled',
            error: 'superseded by goal iteration — task row is being replaced',
            updated_at: new Date().toISOString(),
            ...clearJobLease(),
          })
          .eq('status', 'queued')
          .eq('user_id', goal.user_id)
          .contains('payload', { type: 'execute-task', goalId: goal.id })
          .select('id');
        const { data: runningRows } = await admin
          .from('agent_jobs')
          .select('id, user_id, status, lease_token, heartbeat_at, lease_expires_at')
          .eq('status', 'running')
          .eq('user_id', goal.user_id)
          .contains('payload', { type: 'execute-task', goalId: goal.id });
        let runningSuperseded = 0;
        for (const runningRow of runningRows || []) {
          if (!hasCompleteJobLease(runningRow)) continue;
          const { data: revoked } = await admin
            .from('agent_jobs')
            .update({
              status: 'cancelled',
              error: 'superseded by goal iteration — task row is being replaced',
              updated_at: new Date().toISOString(),
              ...clearJobLease(),
            })
            .eq('id', runningRow.id)
            .eq('user_id', runningRow.user_id)
            .eq('status', 'running')
            .eq('lease_token', runningRow.lease_token)
            .eq('lease_expires_at', runningRow.lease_expires_at)
            .select('id')
            .maybeSingle();
          if (revoked?.id) runningSuperseded += 1;
        }
        const cancelledCount = (queuedSuperseded?.length || 0) + runningSuperseded;
        if (cancelledCount) {
          log.info(req, 'iterate.execute-tasks-cancelled', {
            goalId: goal.id,
            cancelledCount,
          });
        }
      } catch (cancelErr) {
        log.warn(req, 'iterate.execute-tasks-cancel-failed', {
          goalId: goal.id,
          error: cancelErr.message,
        });
      }
      await admin.from('team_tasks').delete().in('job_pool_id', oldJobIds);
      await admin.from('jobs').delete().in('id', oldJobIds);
    }
    log.info(req, 'iterate.stale-tasks-cleared', {
      goalId: goal.id,
      oldJobCount: oldJobIds.length,
    });
  } catch (err) {
    log.warn(req, 'iterate.stale-tasks-clear-failed', { goalId: goal.id, error: err.message });
  }

  // Run team-formation for the new plan so fresh tasks get created.
  // team-formation will then enqueue tool-provisioning → execute-phase.
  await enqueueGoalAction(admin, 'team-formation', goal.id);

  return {
    type: 'orchestrate-goal',
    action: 'iterate',
    goalId: goal.id,
    iteration: goal.iteration + 1,
    newStrategy: newPlan.strategy,
  };
}
