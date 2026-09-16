/**
 * Loop continuation — auto-spawn the next goal in a loop chain when a
 * loop-enabled goal completes, then schedule deliverable refinements that
 * fold the new strategic direction back into the parent's artifacts.
 *
 * Wired into lib/goal-handlers/stages/complete.js right after the goal is
 * stamped completed. Failure paths invoke the existing self-healer and, if
 * unhealed, pause only this chain (leaving other chains untouched).
 */
import { createLogger } from '../../api/_lib/logger.js';
import { isDeepStrictEqual } from 'node:util';
import { healGoal } from './self-healer.js';
import { notifyUser } from '../notifications/dispatch.js';
import { normalizeGoalHitlMode } from './hitl-policy.js';
import { deterministicAgentJobId, enqueueAgentJob } from './_helpers.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';

const log = createLogger('loop-continuation');

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

// Soft safety net. The plan's stop-condition is "user toggles off"; this is
// a runaway-bug guard only. Configurable via env if a user genuinely wants
// chains longer than 50.
export const MAX_LOOP_DEPTH = Number(process.env.MAX_LOOP_DEPTH || 50);

// Advanced loop-control defaults, applied when loop_settings is null/partial.
// convergence_min_gain: min confidence-score improvement (0-100) between a
//   goal and its parent to justify spawning the next iteration.
// chain_budget_cap_usd: hard ceiling on aggregate chain spend (null = off).
// hitl_every: pause for approval every Nth iteration (0 = off).
// refine_max_versions: how many auto-refinement versions the child may add.
export const LOOP_SETTINGS_DEFAULTS = {
  convergence_min_gain: 5,
  chain_budget_cap_usd: null,
  hitl_every: 0,
  refine_max_versions: 2,
};

/** Merge a goal's stored loop_settings over the defaults. */
export function resolveLoopSettings(loopSettings) {
  return { ...LOOP_SETTINGS_DEFAULTS, ...(loopSettings || {}) };
}

/**
 * Evaluate the advanced-control stop conditions for a completed loop goal.
 * Returns { pause: true, reason, priority, payload } when the chain should
 * pause instead of spawning, or null to continue. Only meaningful when
 * goal.loop_advanced is true — callers gate on that first.
 */
export async function evaluateAdvancedGuards(admin, goal, depth, { req } = {}) {
  const settings = resolveLoopSettings(goal.loop_settings);

  // Chain budget ceiling (#6) — pause if aggregate chain spend hit the cap.
  const cap = Number(settings.chain_budget_cap_usd);
  if (Number.isFinite(cap) && cap > 0) {
    const { getChainSpend } = await import('../cost/chain.js');
    const chain = await getChainSpend(admin, goal.user_id, goal.id);
    const spent = Number(chain?.spent_usd || 0);
    if (spent >= cap) {
      log.warn(req, 'loop.advanced.budget-cap', { goalId: goal.id, spent, cap });
      return {
        pause: true,
        reason: 'chain_budget_cap',
        priority: 'high',
        payload: { reason: 'chain_budget_cap', spent_usd: spent, cap_usd: cap },
      };
    }
  }

  // Convergence stop (#5) — pause if the quality gain over the parent is
  // below the threshold (diminishing returns).
  if (goal.parent_goal_id) {
    const minGain = Number(settings.convergence_min_gain);
    if (Number.isFinite(minGain) && minGain > 0) {
      const { data: parent } = await admin
        .from('goals')
        .select('confidence_score')
        .eq('id', goal.parent_goal_id)
        .eq('user_id', goal.user_id)
        .maybeSingle();
      const parentScore = Number(parent?.confidence_score || 0);
      const thisScore = Number(goal.confidence_score || 0);
      // Only stop once we have a real signal from both goals.
      if (parentScore > 0 && thisScore > 0 && thisScore - parentScore < minGain) {
        log.info(req, 'loop.advanced.converged', {
          goalId: goal.id,
          thisScore,
          parentScore,
          minGain,
        });
        return {
          pause: true,
          reason: 'converged',
          priority: 'medium',
          payload: {
            reason: 'converged',
            this_score: thisScore,
            parent_score: parentScore,
            min_gain: minGain,
          },
        };
      }
    }
  }

  // HITL checkpoint (#7) — pause for approval every Nth iteration.
  const every = Number(settings.hitl_every);
  if (Number.isFinite(every) && every > 0 && (depth + 1) % every === 0) {
    log.info(req, 'loop.advanced.hitl', { goalId: goal.id, depth: depth + 1, every });
    return {
      pause: true,
      reason: 'hitl_checkpoint',
      priority: 'medium',
      payload: { reason: 'hitl_checkpoint', iteration: depth + 1, hitl_every: every },
    };
  }

  return null;
}

/**
 * Build the payload for the next continuation goal from the parent's
 * project_overview. The new goal inherits the loop switch on so the chain
 * keeps going, increments loop_depth, and carries the chain root id so
 * spend telemetry stays attached to the original chain.
 */
export function buildContinuationPayload(parent, projectOverview) {
  const overview = projectOverview || parent.data?.project_overview || {};
  const nextSteps = Array.isArray(overview.next_steps) ? overview.next_steps : [];
  const risks = Array.isArray(overview.risks_or_gaps) ? overview.risks_or_gaps : [];
  const roadmap = Array.isArray(overview.roadmap) ? overview.roadmap : [];

  const topItem = roadmap[0] || null;
  const titleBase =
    topItem?.title?.trim() || nextSteps[0]?.toString().slice(0, 80) || `${parent.title}`;
  const title = `[Continuation] ${titleBase}`.slice(0, 200);

  const descriptionLines = [`This goal continues the chain from "${parent.title}".`, ''];
  if (overview.summary) {
    descriptionLines.push('## What was done', overview.summary, '');
  }
  if (nextSteps.length) {
    descriptionLines.push('## Next steps to implement');
    nextSteps.forEach((s, i) => descriptionLines.push(`${i + 1}. ${s}`));
    descriptionLines.push('');
  }
  if (risks.length) {
    descriptionLines.push('## Known risks & gaps to address');
    risks.forEach((r) => descriptionLines.push(`- ${r}`));
    descriptionLines.push('');
  }
  if (roadmap.length) {
    descriptionLines.push('## Strategic roadmap (ranked by impact/effort)');
    roadmap.slice(0, 10).forEach((r, i) => {
      const meta = [
        r.impact && `impact: ${r.impact}`,
        r.effort && `effort: ${r.effort}`,
        r.timeframe && `timeframe: ${r.timeframe}`,
      ]
        .filter(Boolean)
        .join(' · ');
      descriptionLines.push(`${i + 1}. **${r.title}**${meta ? ` (${meta})` : ''}`);
      if (r.description) descriptionLines.push(`   ${r.description}`);
    });
  }

  const parentDepth = Number(parent.loop_depth || 0);
  const chainRoot = parent.loop_chain_root_id || parent.id;

  return {
    title,
    description: descriptionLines.join('\n'),
    budget_usd: Number(parent.budget_usd || 10),
    target_value: parent.target_value || null,
    target_unit: parent.target_unit || 'usd',
    parsed_category: parent.parsed_category || null,
    parsed_priority: parent.parsed_priority || 'medium',
    complexity: parent.complexity || 'simple',
    execution_mode: parent.execution_mode || 'auto',
    hitl_mode: normalizeGoalHitlMode(parent.hitl_mode),
    mode: parent.mode || 'simple',
    po_depth: parent.po_depth || 'standard',
    executor_type: parent.executor_type || 'organization',
    org_id: parent.org_id || null,
    executor_id: parent.executor_id || null,
    concilium_id: parent.concilium_id || null,
    workflow_id: parent.workflow_id || null,
    // Loop linkage
    loop_enabled: true,
    parent_goal_id: parent.id,
    loop_depth: parentDepth + 1,
    loop_chain_root_id: chainRoot,
    // Carry over Theory Mode if parent had it — same business class, same projection style.
    theory_mode: parent.theory_mode === true,
    // Tag the data blob so PM-planning + the strategist see the continuation context.
    _continuation_from: {
      parent_goal_id: parent.id,
      parent_title: parent.title,
      next_steps: nextSteps,
      risks_or_gaps: risks,
      roadmap,
    },
  };
}

/**
 * Programmatic goal creation — same shape as the HTTP `create` op in
 * lib/api-handlers/goals.js, but callable from within stages without an
 * HTTP request. Inserts the goal row + enqueues the first pipeline action.
 */
async function linkContinuationBeforeWake(admin, { parentSnapshot, userId, continuationGoalId }) {
  const parentGoalId = parentSnapshot.id;
  const linkedAt = new Date().toISOString();
  let response = null;
  let writeError = null;
  try {
    let linkQuery = admin
      .from('goals')
      .update({ continuation_goal_id: continuationGoalId, updated_at: linkedAt })
      .eq('id', parentGoalId)
      .eq('user_id', userId)
      .eq('status', parentSnapshot.status)
      .eq('updated_at', parentSnapshot.updated_at)
      .eq('loop_enabled', true)
      .is('continuation_goal_id', null);
    linkQuery =
      parentSnapshot.loop_paused === null || parentSnapshot.loop_paused === undefined
        ? linkQuery.is('loop_paused', null)
        : linkQuery.eq('loop_paused', false);
    response = await linkQuery.select('id, continuation_goal_id').maybeSingle();
    writeError = response?.error || null;
  } catch (error) {
    writeError = error;
  }
  if (
    !writeError &&
    response?.data?.id === parentGoalId &&
    response.data.continuation_goal_id === continuationGoalId
  ) {
    return;
  }

  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, updated_at, loop_enabled, loop_paused, continuation_goal_id')
      .eq('id', parentGoalId)
      .eq('user_id', userId)
      .maybeSingle();
    if (
      !error &&
      current?.continuation_goal_id === continuationGoalId &&
      current.status === parentSnapshot.status &&
      sameTimestamp(current.updated_at, linkedAt) &&
      current.loop_enabled === true &&
      current.loop_paused !== true
    ) {
      return;
    }
    const linkedButIneligible =
      current?.continuation_goal_id === continuationGoalId &&
      (current.status !== parentSnapshot.status ||
        !sameTimestamp(current.updated_at, linkedAt) ||
        current.loop_enabled !== true ||
        current.loop_paused === true);
    const ineligible =
      current &&
      (current.status !== parentSnapshot.status ||
        !sameTimestamp(current.updated_at, parentSnapshot.updated_at) ||
        current.loop_enabled !== true ||
        current.loop_paused === true);
    const linkError = new Error(
      current?.continuation_goal_id
        ? linkedButIneligible
          ? 'Parent goal changed after its continuation was linked'
          : 'Parent goal already points to another continuation'
        : ineligible
          ? 'Parent goal changed before its continuation could be linked'
          : 'Continuation parent link could not be verified'
    );
    linkError.code = current?.continuation_goal_id
      ? linkedButIneligible
        ? 'CONTINUATION_PARENT_LINKED_INELIGIBLE'
        : 'CONTINUATION_PARENT_CONFLICT'
      : ineligible
        ? 'CONTINUATION_PARENT_INELIGIBLE'
        : 'CONTINUATION_PARENT_LINK_UNVERIFIED';
    throw linkError;
  } catch (error) {
    if (error?.code?.startsWith('CONTINUATION_PARENT_')) throw error;
    const linkError = new Error('Continuation parent link could not be verified');
    linkError.code = 'CONTINUATION_PARENT_LINK_UNVERIFIED';
    linkError.cause = error || writeError;
    throw linkError;
  }
}

async function parkContinuationLinkReconciliation(admin, goal, error) {
  const parkedAt = new Date().toISOString();
  try {
    await admin
      .from('goals')
      .update({
        status: 'needs_human',
        data: {
          ...(goal.data || {}),
          continuation_setup: {
            status: 'parent_link_reconciliation_required',
            error: String(error?.message || error || 'Parent link outcome unknown').slice(0, 300),
            at: parkedAt,
          },
        },
        updated_at: parkedAt,
      })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', 'feasibility')
      .eq('parent_goal_id', goal.parent_goal_id);
  } catch {
    // The deterministic child id still prevents duplicate live children.
  }
}

async function cancelUnlinkedContinuation(admin, goal, error) {
  const cancelledAt = new Date().toISOString();
  try {
    await admin
      .from('goals')
      .update({
        status: 'cancelled',
        loop_enabled: false,
        data: {
          ...(goal.data || {}),
          continuation_setup: {
            status: 'parent_link_rejected',
            error: String(error?.message || error || 'Parent snapshot changed').slice(0, 300),
            at: cancelledAt,
          },
        },
        updated_at: cancelledAt,
      })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', 'feasibility')
      .eq('parent_goal_id', goal.parent_goal_id);
  } catch {
    // No worker row exists yet. The deterministic child identity prevents a
    // second active child even if this owner-visible cancellation write fails.
  }
}

async function inspectContinuationGoal(admin, expected) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select(
        'id, user_id, title, status, budget_usd, parent_goal_id, loop_chain_root_id, loop_depth, data'
      )
      .eq('id', expected.id)
      .eq('user_id', expected.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };
    const matches =
      current.id === expected.id &&
      current.user_id === expected.user_id &&
      current.status === 'feasibility' &&
      current.parent_goal_id === expected.parent_goal_id &&
      Number(current.loop_depth || 0) === Number(expected.loop_depth || 0) &&
      current.title === expected.title &&
      isDeepStrictEqual(current.data || null, expected.data || null);
    return matches ? { state: 'present', goal: current } : { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function parkUnwokenContinuation(admin, goal, error) {
  const parkedAt = new Date().toISOString();
  try {
    await admin
      .from('goals')
      .update({
        status: 'needs_human',
        data: {
          ...(goal.data || {}),
          continuation_setup: {
            status: 'wake_failed',
            error: String(error?.message || error || 'Preview wake unavailable').slice(0, 300),
            at: parkedAt,
          },
        },
        updated_at: parkedAt,
      })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', 'feasibility');
  } catch {
    // Parent linkage is the primary idempotency fence. Parking is a secondary
    // owner-visible signal and remains best effort after a proven stopped wake.
  }
}

export async function createContinuationGoal(
  admin,
  userId,
  payload,
  { beforeEnqueue = null, enqueueOptions = null } = {}
) {
  const { resolveGoalOrgId } = await import('../_shared/default-organization.js');
  const resolvedOrgId = await resolveGoalOrgId(admin, userId, {
    orgId: payload.org_id,
    parentGoalId: payload.parent_goal_id,
  });

  const data = {};
  if (payload._continuation_from) data.continuation_from = payload._continuation_from;
  if (payload.theory_mode) data.theory_mode_seed = true;

  const insertRow = {
    ...(payload._goal_id ? { id: payload._goal_id } : {}),
    user_id: userId,
    title: payload.title,
    description: payload.description || '',
    target_value: payload.target_value || null,
    target_unit: payload.target_unit || 'usd',
    budget_usd: Number(payload.budget_usd || 10),
    status: 'feasibility',
    max_iterations: 3,
    parsed_category: payload.parsed_category || null,
    parsed_priority: payload.parsed_priority || 'medium',
    complexity: payload.complexity || 'simple',
    execution_mode: payload.execution_mode || 'auto',
    hitl_mode: normalizeGoalHitlMode(payload.hitl_mode),
    mode: payload.mode || 'simple',
    po_depth: payload.po_depth || 'standard',
    executor_type: payload.executor_type || 'organization',
    org_id: resolvedOrgId,
    executor_id: payload.executor_id || null,
    concilium_id: payload.concilium_id || null,
    workflow_id: payload.workflow_id || null,
    theory_mode: payload.theory_mode === true,
    loop_enabled: payload.loop_enabled === true,
    parent_goal_id: payload.parent_goal_id || null,
    loop_depth: Number(payload.loop_depth || 0),
    loop_chain_root_id: payload.loop_chain_root_id || null,
    data: Object.keys(data).length ? data : null,
  };

  let goal = null;
  let insertError = null;
  try {
    const response = await admin
      .from('goals')
      .insert(insertRow)
      .select(
        'id, user_id, title, status, budget_usd, parent_goal_id, loop_chain_root_id, loop_depth, data'
      )
      .single();
    goal = response.data || null;
    insertError = response.error || null;
  } catch (error) {
    insertError = error;
  }
  if (insertError || !goal) {
    if (insertRow.id) {
      const inspection = await inspectContinuationGoal(admin, insertRow);
      if (inspection.state === 'present') goal = inspection.goal;
    }
    if (!goal) throw insertError || new Error('Continuation goal insert could not be verified');
  }

  // Root the chain on itself if this is the very first link.
  if (!goal.loop_chain_root_id) {
    await admin
      .from('goals')
      .update({ loop_chain_root_id: goal.id })
      .eq('id', goal.id)
      .eq('user_id', userId);
    goal.loop_chain_root_id = goal.id;
  }

  try {
    await beforeEnqueue?.(goal);
  } catch (linkError) {
    if (
      linkError?.code === 'CONTINUATION_PARENT_LINK_UNVERIFIED' ||
      linkError?.code === 'CONTINUATION_PARENT_LINKED_INELIGIBLE'
    ) {
      await parkContinuationLinkReconciliation(admin, goal, linkError);
    } else {
      await cancelUnlinkedContinuation(admin, goal, linkError);
    }
    throw linkError;
  }

  // Enqueue the first pipeline action — same as handleCreate in goals.js.
  try {
    await enqueueAgentJob(
      admin,
      {
        id: deterministicAgentJobId('loop-continuation-feasibility', { goalId: goal.id }),
        user_id: userId,
        payload: {
          type: 'orchestrate-goal',
          action: 'feasibility-analysis',
          goalId: goal.id,
          _userId: userId,
          userId,
          user_id: userId,
          context: {
            parsed_category: payload.parsed_category || null,
            parsed_priority: payload.parsed_priority || 'medium',
            executor_type: payload.executor_type || 'organization',
            org_id: resolvedOrgId,
            executor_id: payload.executor_id || null,
            concilium_id: payload.concilium_id || null,
          },
        },
      },
      { idempotent: true, ...(enqueueOptions || {}) }
    );
  } catch (enqueueError) {
    if (enqueueError?.code === 'PREVIEW_EXACT_WAKE_UNAVAILABLE') {
      await parkUnwokenContinuation(admin, goal, enqueueError);
    }
    throw enqueueError;
  }

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'goal_created',
    details: {
      title: goal.title,
      budget_usd: goal.budget_usd,
      source: 'loop_continuation',
      parent_goal_id: payload.parent_goal_id,
    },
  });

  return goal;
}

/**
 * Enqueue a single agent_jobs row that, when picked up by job-processor's
 * `loop-refine-parent-deliverables` handler, refines each of the parent
 * goal's refinable deliverables using the continuation's strategic output
 * as the prompt. Async on purpose — we don't block the new goal from
 * starting.
 */
export async function scheduleDeliverableRefinementChain(
  admin,
  userId,
  parentGoalId,
  continuationGoalId,
  projectOverview,
  refineMaxVersions
) {
  await enqueueAgentJob(
    admin,
    {
      id: deterministicAgentJobId('loop-refine-parent-deliverables', {
        parentGoalId,
        continuationGoalId,
      }),
      user_id: userId,
      payload: {
        type: 'loop-refine-parent-deliverables',
        goalId: parentGoalId,
        _userId: userId,
        userId,
        user_id: userId,
        parentGoalId,
        continuationGoalId,
        projectOverview: projectOverview || null,
        refineMaxVersions: Number.isFinite(Number(refineMaxVersions))
          ? Number(refineMaxVersions)
          : undefined,
      },
    },
    { idempotent: true }
  );
}

/**
 * Top-level orchestration called from complete.js after the goal is
 * stamped completed. Spawns the continuation goal (with safety checks)
 * and fires the refinement chain. Idempotent — re-running on the same
 * goal is a no-op once continuation_goal_id is set.
 */
export async function maybeSpawnContinuation(
  admin,
  goal,
  projectOverview,
  { req, env = process.env, triggerProcessNextImpl } = {}
) {
  if (!goal?.loop_enabled) return null;
  if (goal.loop_paused) {
    log.info(req, 'loop.spawn.skipped.paused', {
      goalId: goal.id,
      reason: goal.loop_paused_reason,
    });
    return null;
  }
  // A continuation synthesized from project_overview is a new scope, not an
  // authorized extension of the accepted AxWise contract. Until continuations
  // have their own Gate-1 proposal/confirmation flow, pause the chain instead
  // of creating a legacy feasibility child from untrusted summary prose.
  if (hasNativeAxwiseScopeMarkers(goal)) {
    if (!goal.updated_at || !goal.status || !goal.user_id) {
      log.error(req, 'loop.spawn.native-parent-snapshot-incomplete', { goalId: goal.id });
      return null;
    }
    const pauseReason = 'native_continuation_requires_new_scope_confirmation';
    let pauseQuery = admin
      .from('goals')
      .update({ loop_paused: true, loop_paused_reason: pauseReason })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', goal.status)
      .eq('updated_at', goal.updated_at)
      .eq('loop_enabled', true);
    pauseQuery = goal.continuation_goal_id
      ? pauseQuery.eq('continuation_goal_id', goal.continuation_goal_id)
      : pauseQuery.is('continuation_goal_id', null);
    const { data: paused, error: pauseError } = await pauseQuery.select('id').maybeSingle();
    if (pauseError) {
      log.error(req, 'loop.spawn.native-pause-failed', {
        goalId: goal.id,
        error: pauseError.message,
      });
      return null;
    }
    if (!paused) {
      log.info(req, 'loop.spawn.native-parent-state-changed', { goalId: goal.id });
      return null;
    }
    if (goal.continuation_goal_id) {
      const { data: continuation, error: continuationError } = await admin
        .from('goals')
        .select('*')
        .eq('id', goal.continuation_goal_id)
        .eq('user_id', goal.user_id)
        .maybeSingle();
      if (!continuationError && continuation?.updated_at && continuation?.status) {
        const quarantineData = {
          ...(continuation.data || {}),
          scope_admission: {
            ...(continuation.data?.scope_admission || {}),
            version: 1,
            native_scope: true,
            status: 'quarantined',
            state_key: 'axwise_customer_intelligence',
          },
          native_continuation_quarantine: {
            version: 'orqaly_native_continuation_quarantine_v1',
            parent_goal_id: goal.id,
            reason: 'native_continuation_requires_scope_confirmation',
            quarantined_at: new Date().toISOString(),
          },
        };
        await admin
          .from('goals')
          .update({
            status: 'needs_human',
            loop_enabled: false,
            loop_paused: true,
            loop_paused_reason: pauseReason,
            data: quarantineData,
          })
          .eq('id', continuation.id)
          .eq('user_id', goal.user_id)
          .eq('parent_goal_id', goal.id)
          .eq('status', continuation.status)
          .eq('updated_at', continuation.updated_at)
          .select('id')
          .maybeSingle();
      }
    }
    await notifyUser(admin, goal.user_id, {
      event_type: 'loop_chain_paused',
      priority: 'medium',
      payload: {
        goalId: goal.id,
        reason: 'native_scope_confirmation_required',
      },
    });
    return null;
  }
  if (goal.continuation_goal_id) {
    log.info(req, 'loop.spawn.skipped.exists', {
      goalId: goal.id,
      continuationGoalId: goal.continuation_goal_id,
    });
    return null;
  }
  const depth = Number(goal.loop_depth || 0);
  if (depth >= MAX_LOOP_DEPTH) {
    log.warn(req, 'loop.spawn.skipped.max-depth', { goalId: goal.id, depth, max: MAX_LOOP_DEPTH });
    await admin
      .from('goals')
      .update({ loop_paused: true, loop_paused_reason: `max_loop_depth_${MAX_LOOP_DEPTH}` })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id);
    await notifyUser(admin, goal.user_id, {
      event_type: 'loop_chain_paused',
      priority: 'high',
      payload: { goalId: goal.id, reason: 'max_depth', depth, max: MAX_LOOP_DEPTH },
    });
    return null;
  }

  // Advanced controls (opt-in per goal). Budget/quality-aware stops and the
  // human checkpoint pause the chain instead of spawning. Resuming (toggle
  // loop back on) re-invokes this helper, which is idempotent.
  if (goal.loop_advanced) {
    const guard = await evaluateAdvancedGuards(admin, goal, depth, { req });
    if (guard?.pause) {
      await admin
        .from('goals')
        .update({ loop_paused: true, loop_paused_reason: guard.reason })
        .eq('id', goal.id)
        .eq('user_id', goal.user_id);
      await notifyUser(admin, goal.user_id, {
        event_type: 'loop_chain_paused',
        priority: guard.priority,
        payload: { goalId: goal.id, ...guard.payload },
      });
      return null;
    }
  }

  const payload = buildContinuationPayload(goal, projectOverview);
  if (!goal.updated_at || !goal.status) {
    log.error(req, 'loop.spawn.parent-snapshot-incomplete', { goalId: goal.id });
    return null;
  }
  payload._goal_id = deterministicAgentJobId('loop-continuation-goal', {
    parentGoalId: goal.id,
    parentUpdatedAt: goal.updated_at,
    loopDepth: depth + 1,
  });

  try {
    const newGoal = await createContinuationGoal(admin, goal.user_id, payload, {
      beforeEnqueue: (continuationGoal) =>
        linkContinuationBeforeWake(admin, {
          parentSnapshot: goal,
          userId: goal.user_id,
          continuationGoalId: continuationGoal.id,
        }),
      enqueueOptions: { env, triggerProcessNextImpl },
    });
    // Backfill root if parent never had one (legacy goals).
    const chainRoot = goal.loop_chain_root_id || goal.id;
    if (!goal.loop_chain_root_id) {
      await admin
        .from('goals')
        .update({ loop_chain_root_id: chainRoot })
        .eq('id', goal.id)
        .eq('user_id', goal.user_id);
    }
    const refineCap = goal.loop_advanced
      ? resolveLoopSettings(goal.loop_settings).refine_max_versions
      : undefined;
    await scheduleDeliverableRefinementChain(
      admin,
      goal.user_id,
      goal.id,
      newGoal.id,
      projectOverview,
      refineCap
    );

    await admin.from('goal_log').insert({
      goal_id: goal.id,
      event_type: 'loop_continuation_spawned',
      details: { next_goal_id: newGoal.id, loop_depth: depth + 1 },
    });

    await notifyUser(admin, goal.user_id, {
      event_type: 'loop_continuation_spawned',
      priority: 'low',
      payload: {
        parent_goal_id: goal.id,
        parent_title: goal.title,
        continuation_goal_id: newGoal.id,
        continuation_title: newGoal.title,
        loop_depth: depth + 1,
      },
    });

    log.info(req, 'loop.spawn.ok', {
      parentGoalId: goal.id,
      continuationGoalId: newGoal.id,
      loopDepth: depth + 1,
    });

    return newGoal;
  } catch (err) {
    log.error(req, 'loop.spawn.failed', { goalId: goal.id, error: err.message });
    if (String(err?.code || '').startsWith('CONTINUATION_PARENT_')) return null;
    await admin
      .from('goals')
      .update({
        loop_paused: true,
        loop_paused_reason: `spawn_failed: ${String(err.message || err).slice(0, 200)}`,
      })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id);
    await notifyUser(admin, goal.user_id, {
      event_type: 'loop_chain_paused',
      priority: 'high',
      payload: { goalId: goal.id, reason: 'spawn_failed', error: String(err.message || err) },
    });
    return null;
  }
}

/**
 * Attempt to heal a failed continuation goal via the existing self-healer.
 * If the heal didn't take, pause this chain (one chain only — other chains
 * keep running) and notify the user. Returns true if healed, false otherwise.
 */
export async function tryHealContinuation(admin, goalId, { req, userId } = {}) {
  const expectedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!expectedUserId) throw new Error('Loop continuation durable owner is required');
  const { data: goal } = await admin
    .from('goals')
    .select('id, user_id, status, data, updated_at, loop_chain_root_id, loop_depth, parent_goal_id')
    .eq('id', goalId)
    .eq('user_id', expectedUserId)
    .maybeSingle();
  if (!goal) return false;

  let healed = false;
  try {
    const result = await healGoal(admin, goal, { req });
    healed = result && result.action === 'applied';
  } catch (err) {
    log.warn(req, 'loop.heal.error', { goalId, error: err.message });
  }

  if (!healed) {
    await admin
      .from('goals')
      .update({ loop_paused: true, loop_paused_reason: 'continuation_failed_after_heal' })
      .eq('id', goalId)
      .eq('user_id', expectedUserId);
    await notifyUser(admin, goal.user_id, {
      event_type: 'loop_chain_paused',
      priority: 'high',
      payload: {
        goalId,
        chainRoot: goal.loop_chain_root_id,
        reason: 'continuation_failed_after_heal',
        loopDepth: goal.loop_depth,
      },
    });
  }

  return healed;
}

/**
 * Build the refinement prompt that the continuation's strategy injects
 * into each parent deliverable. Kept short — the LLM is good at applying
 * context once it has clear instructions.
 */
export function buildRefinementPromptFromContinuation(projectOverview, deliverableTitle) {
  const overview = projectOverview || {};
  const nextSteps = Array.isArray(overview.next_steps) ? overview.next_steps.slice(0, 5) : [];
  const roadmap = Array.isArray(overview.roadmap) ? overview.roadmap.slice(0, 3) : [];
  const risks = Array.isArray(overview.risks_or_gaps) ? overview.risks_or_gaps.slice(0, 3) : [];

  const lines = [
    `Refine "${deliverableTitle || 'this deliverable'}" so it reflects the latest strategic direction from the continuation goal.`,
    '',
    'Incorporate these without breaking the existing structure or tone:',
  ];
  if (nextSteps.length) {
    lines.push('', 'Next steps to surface or address:');
    nextSteps.forEach((s) => lines.push(`- ${s}`));
  }
  if (roadmap.length) {
    lines.push('', 'Top strategic items (highest impact first):');
    roadmap.forEach((r) => {
      const meta = [r.impact && `impact: ${r.impact}`, r.timeframe && `by ${r.timeframe}`]
        .filter(Boolean)
        .join(', ');
      lines.push(
        `- **${r.title}**${meta ? ` (${meta})` : ''}${r.description ? `: ${r.description}` : ''}`
      );
    });
  }
  if (risks.length) {
    lines.push('', 'Risks & gaps to acknowledge:');
    risks.forEach((r) => lines.push(`- ${r}`));
  }
  lines.push(
    '',
    'Keep the document type, audience, and headings intact. Update or add sections only where the new strategy changes the picture. Do not invent facts.'
  );
  return lines.join('\n');
}
