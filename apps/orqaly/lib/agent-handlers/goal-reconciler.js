/**
 * Goal Reconciler — Kubernetes-style control loop for goal execution.
 *
 * Principle:
 *   1. Desired state: goal.status === 'completed'
 *   2. Question: is it done?
 *   3. Action: if not, figure out what's missing and enqueue it
 *
 * Called by process-next on every invocation. Scans all active goals
 * and ensures each one has a queued/running job driving it forward.
 * If a goal is stuck (no pending jobs, not completed), it enqueues
 * the correct next action.
 *
 * This is the safety net — even if chains break, timeouts kill jobs,
 * or webhooks fail, the reconciler will always push goals to completion.
 */
import { createLogger } from '../../api/_lib/logger.js';
import {
  pendingScopeRevisionToken,
  scopeRevisionContinuationPayload,
} from '../_shared/scope-revision-continuation.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';
import {
  resolveNativeRecoveryDispatch,
  transitionNativeRecoveryToCanonicalStage,
} from '../goal-handlers/native-legacy-dispatch.js';
import { bindAgentJobToWorkerDeployment } from './worker-scope.js';

const log = createLogger('goal-reconciler');

// Only statuses for which diagnoseNextAction can safely produce autonomous
// work belong in this query. Human gates are deliberately absent: filtering
// them in Postgres (rather than after LIMIT) prevents a page of approvals from
// hiding runnable goals behind it.
export const RECONCILABLE_STATUSES = [
  'feasibility',
  'analyzing',
  'researching_customer',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'active',
  'pending_validation',
];
const NEEDS_USER_ACTION = [
  'awaiting_tools',
  'awaiting_context_approval',
  'awaiting_approval',
  'awaiting_po_input',
  'paused',
  'needs_human',
];
const RECONCILER_PAGE_SIZE = 20;
const AUTHORIZATION_RECOVERY_PAGE_SIZE = 100;
// If diagnoseNextAction returns null AND no jobs are queued AND the goal
// hasn't been touched in this long, the pipeline is genuinely halted —
// some stage handler must have forgotten to enqueue a follow-up action.
// Hard-fail so the user sees the stall instead of letting it sit forever.
const STALLED_THRESHOLD_MS = 3 * 60 * 1000;

async function recoverInterruptedAuthorization(admin, goal) {
  const idleMs = Date.now() - new Date(goal.updated_at).getTime();
  const authorization = goal.data?.execution_authorization;
  const attempt = goal.data?.execution_approval_attempt;
  if (!goal.id || !goal.user_id || !goal.updated_at) {
    return { recovered: false, idleMs };
  }

  let transition = admin
    .from('goals')
    .update({
      status: 'awaiting_approval',
      data: {
        ...(goal.data || {}),
        execution_authorization: {
          ...(authorization || {}),
          status: 'binding_interrupted',
          interrupted_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', 'authorizing_execution')
    .eq('updated_at', goal.updated_at);

  // New reservations carry an attempt identity; bind recovery to it as well
  // as the full row snapshot so a second authorizer that remains in the same
  // status cannot be rolled back by the stale reconciler read. Historical
  // transitional rows remain recoverable only while the marker is still absent.
  if (attempt?.attempt_token && attempt.snapshot_hash) {
    transition = transition
      .eq('data->execution_approval_attempt->>attempt_token', attempt.attempt_token)
      .eq('data->execution_approval_attempt->>snapshot_hash', attempt.snapshot_hash)
      .eq('data->goal_approvals->execution->>snapshot_hash', attempt.snapshot_hash);
  } else {
    transition = transition.is('data->execution_approval_attempt', null);
  }

  const { data, error } = await transition.select('id').maybeSingle();

  if (error) {
    log.warn(null, 'reconciler.authorization-recovery-failed', {
      goalId: goal.id,
      error: error.message,
    });
    return { recovered: false, idleMs };
  }
  if (!data) return { recovered: false, idleMs };

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'execution_authorization_interrupted',
    details: {
      reason: 'authorization_binding_timed_out',
      idleMs,
      snapshot_hash: authorization?.snapshot_hash || null,
    },
  });
  log.warn(null, 'reconciler.authorization-recovered', { goalId: goal.id, idleMs });
  return { recovered: true, idleMs };
}

async function hasActiveGoalJob(admin, goalId, userId) {
  const { data, error } = await admin
    .from('agent_jobs')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .contains('payload', { goalId })
    .limit(1);
  if (error) {
    log.warn(null, 'reconciler.job-inspection-failed', { goalId, error: error.message });
    return true;
  }
  return Boolean(data?.length);
}

async function recoverInterruptedAuthorizations(admin) {
  const cutoff = new Date(Date.now() - STALLED_THRESHOLD_MS).toISOString();
  let cursor = null;
  let recovered = 0;
  let skipped = 0;

  // A separate, ID-cursor query keeps status-changing recovery from shifting
  // the offset-paged runnable result set. That preserves fairness when many
  // independent projects are progressing concurrently.
  while (true) {
    let query = admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('status', 'authorizing_execution')
      .lt('updated_at', cutoff);
    if (cursor) query = query.gt('id', cursor);
    const { data: goals, error } = await query
      .order('id', { ascending: true })
      .limit(AUTHORIZATION_RECOVERY_PAGE_SIZE);

    if (error) {
      log.warn(null, 'reconciler.authorization-select-failed', {
        error: error.message,
        hint: error.hint || null,
      });
      return { recovered, skipped };
    }
    if (!goals?.length) break;

    for (const goal of goals) {
      // A slow but live approval binder owns the reservation. Recover only
      // when no queued/running job can still finish the CAS transition.
      if (await hasActiveGoalJob(admin, goal.id, goal.user_id)) {
        skipped++;
        continue;
      }
      const result = await recoverInterruptedAuthorization(admin, goal);
      if (result.recovered) recovered++;
      else skipped++;
    }

    cursor = goals.at(-1).id;
    if (goals.length < AUTHORIZATION_RECOVERY_PAGE_SIZE) break;
  }

  return { recovered, skipped };
}

/**
 * Reconcile all active goals — ensure each has a job driving it.
 *
 * Eligible goals are read in deterministic, oldest-first pages. Pagination is
 * intentional: Supabase/PostgREST applies a server-side row cap, and a fixed
 * LIMIT here previously allowed 20 approval-waiting goals to starve every
 * runnable goal after them forever.
 * @param {object} admin — Supabase admin client
 * @param {{ pageSize?: number }} [options]
 * @returns {{ reconciled: number, skipped: number }}
 */
export async function reconcileGoals(admin, { pageSize = RECONCILER_PAGE_SIZE } = {}) {
  // This safety recovery is independent of the user's autopilot preference:
  // it never advances work and only restores a mandatory human checkpoint.
  const authorizationRecovery = await recoverInterruptedAuthorizations(admin);
  let reconciled = authorizationRecovery.recovered;
  let skipped = authorizationRecovery.skipped;
  let offset = 0;

  // A positive, bounded page keeps individual PostgREST responses small. The
  // loop itself continues to exhaustion so the 21st (or 301st) project cannot
  // be permanently hidden by earlier rows on subsequent cron invocations.
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || RECONCILER_PAGE_SIZE, 100));

  while (true) {
    const { data: goals, error: gErr } = await admin
      .from('goals')
      .select('id, user_id, status, plan, title, data, updated_at, autopilot_enabled')
      .in('status', RECONCILABLE_STATUSES)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + safePageSize - 1);

    // Surface the actual Supabase error before process-next.js's outer catch
    // swallows it. Schema drift on the new autopilot_enabled column previously
    // gave the user "skipped: 0" with zero clue what was wrong.
    if (gErr) {
      log.warn(null, 'reconciler.select-failed', { error: gErr.message, hint: gErr.hint || null });
      return { reconciled, skipped };
    }
    if (!goals?.length) break;

    for (const goal of goals) {
      if (typeof goal.user_id !== 'string' || !goal.user_id.trim()) {
        log.error(null, 'reconciler.skip-ownerless-goal', { goalId: goal.id });
        skipped++;
        continue;
      }
      // M4: Respect the autopilot toggle. Default true (set by migration 122)
      // preserves pre-M4 behavior; only goals the user explicitly flipped off
      // are excluded from reconciliation. Self-healer runs independently so
      // error recovery stays active.
      if (goal.autopilot_enabled === false) {
        log.info(null, 'reconciler.skip', { goalId: goal.id, reason: 'autopilot_disabled' });
        skipped++;
        continue;
      }

      // Defence in depth: the database query excludes these statuses, but do
      // not auto-advance a gate if a stale mock/view ever returns one.
      if (NEEDS_USER_ACTION.includes(goal.status)) {
        log.info(null, 'reconciler.skip', {
          goalId: goal.id,
          reason: 'needs_user_action',
          status: goal.status,
        });
        skipped++;
        continue;
      }

      // 2. Check if this goal already has a queued or running job
      const { data: existingJobs } = await admin
        .from('agent_jobs')
        .select('id')
        .eq('user_id', goal.user_id)
        .in('status', ['queued', 'running'])
        .contains('payload', { goalId: goal.id })
        .limit(1);

      if (existingJobs?.length > 0) {
        // Goal has a job — it's being worked on
        log.info(null, 'reconciler.skip', { goalId: goal.id, reason: 'job_already_queued' });
        skipped++;
        continue;
      }

      // 3. Goal is active but has NO job — figure out what's needed
      let action = diagnoseNextAction(goal);
      if (!action) {
        // Reconciler doesn't know what to enqueue next AND no jobs are in
        // flight. If this has been true for > 3 minutes, some stage handler
        // forgot to enqueue a follow-up action. Hard-fail with a clear
        // reason — better than letting the goal sit forever with no trace.
        const idleMs = Date.now() - new Date(goal.updated_at).getTime();
        if (idleMs > STALLED_THRESHOLD_MS) {
          const reason = `Pipeline halted — no follow-up job was enqueued after stage ${goal.status}. Goal has been idle ${Math.round(idleMs / 1000)}s. Check recent logs for the last stage handler that ran.`;
          const { data: stalledGoal, error: upErr } = await admin
            .from('goals')
            .update({
              status: 'failed',
              data: {
                ...(goal.data || {}),
                failure_reason: reason,
                failed_at: new Date().toISOString(),
                failure_stage: 'reconciler:no-work',
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', goal.id)
            .eq('status', goal.status)
            .eq('updated_at', goal.updated_at)
            .select('id')
            .maybeSingle();
          if (upErr) {
            log.warn(null, 'reconciler.stalled-update-failed', {
              goalId: goal.id,
              error: upErr.message,
            });
          } else if (stalledGoal?.id) {
            await admin
              .from('goal_log')
              .insert({
                goal_id: goal.id,
                event_type: 'goal_failed',
                details: { reason, stage: 'reconciler:no-work', idleMs },
              })
              .then(({ error: logErr }) => {
                if (logErr)
                  log.warn(null, 'reconciler.stalled-log-failed', {
                    goalId: goal.id,
                    error: logErr.message,
                  });
              });
            log.warn(null, 'reconciler.stalled.fail-fast', {
              goalId: goal.id,
              idleMs,
              lastStatus: goal.status,
            });
            reconciled++; // count it — we did take an action
            continue;
          } else {
            log.info(null, 'reconciler.stalled-transition-skipped', {
              goalId: goal.id,
              reason: 'goal_snapshot_changed',
            });
          }
        }
        log.info(null, 'reconciler.skip', {
          goalId: goal.id,
          reason: 'no_action_diagnosed',
          status: goal.status,
          idleMs,
        });
        skipped++;
        continue;
      }

      const nativeRecovery = resolveNativeRecoveryDispatch(goal, action.name);
      if (nativeRecovery.handled) {
        if (!nativeRecovery.safe) {
          log.warn(null, 'reconciler.native-recovery-blocked', {
            goalId: goal.id,
            proposedAction: action.name,
            reasons: nativeRecovery.reasons,
          });
          skipped++;
          continue;
        }
        let transitioned = false;
        try {
          transitioned = await transitionNativeRecoveryToCanonicalStage(
            admin,
            goal,
            nativeRecovery
          );
        } catch (transitionError) {
          log.warn(null, 'reconciler.native-recovery-transition-failed', {
            goalId: goal.id,
            proposedAction: action.name,
            error: transitionError.message,
          });
          skipped++;
          continue;
        }
        if (!transitioned) {
          log.info(null, 'reconciler.native-recovery-transition-skipped', {
            goalId: goal.id,
            reason: 'goal_snapshot_changed',
          });
          skipped++;
          continue;
        }
        action = {
          name: nativeRecovery.action,
          extra: ['scope-admission', 'customer-intelligence'].includes(nativeRecovery.action)
            ? scopeRevisionContinuationPayload(goal)
            : {},
        };
      }

      // 4. Enqueue the missing job
      const { error: enqErr } = await admin.from('agent_jobs').insert(
        bindAgentJobToWorkerDeployment({
          user_id: goal.user_id,
          status: 'queued',
          payload: {
            type: 'orchestrate-goal',
            action: action.name,
            goalId: goal.id,
            ...action.extra,
            _userId: goal.user_id,
            userId: goal.user_id,
            user_id: goal.user_id,
            _reconciledAt: new Date().toISOString(),
          },
        })
      );

      if (enqErr) {
        log.warn(null, 'reconciler.enqueue-failed', {
          goalId: goal.id,
          action: action.name,
          error: enqErr.message,
        });
      } else {
        log.info(null, 'reconciler.enqueued', {
          goalId: goal.id,
          action: action.name,
          title: goal.title,
        });
        reconciled++;
      }
    }

    offset += goals.length;
    if (goals.length < safePageSize) break;
  }

  return { reconciled, skipped };
}

/**
 * Diagnose what action a stuck goal needs next.
 * Looks at goal.status and phase states to determine the correct next step.
 */
function diagnoseNextAction(goal) {
  const phases = goal.plan?.phases || [];
  const status = goal.status;
  const revisionToken = pendingScopeRevisionToken(goal);
  const revisionExtra = scopeRevisionContinuationPayload(goal);

  // Pre-execution pipeline stages — re-trigger based on status
  const pipelineMap = {
    feasibility: 'feasibility-analysis',
    analyzing: 'po-analysis',
    researching_customer: 'customer-intelligence',
    planning: 'pm-planning',
    forming_team: 'team-formation',
    provisioning_tools: 'tool-provisioning',
    estimating: 'discovery-estimation',
  };

  // Smart Requests deliberately reuse the historical `analyzing` lifecycle
  // state while AxWise admits the domain-neutral scope.  The durable marker
  // distinguishes that first stage from the legacy PO-analysis pipeline so a
  // lost queue row cannot silently skip scope admission during reconciliation.
  if (status === 'analyzing' && hasNativeAxwiseScopeMarkers(goal)) {
    if (revisionToken === null) return null;
    return { name: 'scope-admission', extra: revisionExtra };
  }

  if (pipelineMap[status]) {
    const action = pipelineMap[status];
    if (action === 'customer-intelligence') {
      if (revisionToken === null) return null;
      return { name: action, extra: revisionExtra };
    }
    return { name: action, extra: {} };
  }

  // A strict PRD remains non-terminal while its exact artifact/scope pair is
  // being attested or repaired. If the owning worker dies after reserving the
  // state, resume the bounded quality action instead of leaving the goal stuck
  // or bypassing the gate through the generic completion path.
  if (status === 'pending_validation') {
    const repair = goal.data?.prd_quality_repair;
    const attestation = goal.data?.prd_quality_attestation;
    if (
      attestation?.status === 'failed' &&
      repair?.task_id &&
      ['queued', 'running'].includes(repair?.status)
    ) {
      return {
        name: 'prd-quality-repair',
        extra: {
          artifactHash: repair.artifact_hash,
          scopeHash: repair.scope_hash,
        },
      };
    }
    return { name: 'complete', extra: {} };
  }

  // Active goal — check phases
  if (status === 'active' || status === 'executing') {
    // Find the first non-completed phase
    const nextPhaseIdx = phases.findIndex((p) => p.status !== 'completed');

    if (nextPhaseIdx === -1) {
      // All phases completed — trigger completion
      return { name: 'complete', extra: {} };
    }

    const phase = phases[nextPhaseIdx];

    if (phase.status === 'failed') {
      // Failed phase — trigger iterate (re-plan)
      return {
        name: 'iterate',
        extra: { failedPhaseIndex: nextPhaseIdx, feedback: 'Phase failed — reconciler retry' },
      };
    }

    if (phase.status === 'executing') {
      // Phase is "executing" but no job exists — evaluation may have been lost
      return { name: 'evaluate-phase', extra: { phaseIndex: nextPhaseIdx } };
    }

    // Phase is pending — trigger execution
    return { name: 'execute-phase', extra: { phaseIndex: nextPhaseIdx } };
  }

  return null;
}
