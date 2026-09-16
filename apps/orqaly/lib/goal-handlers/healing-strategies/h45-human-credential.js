/**
 * h45 — Human fallback for credential provisioning
 *
 * Symptom: goal is blocked on a missing credential
 *          or the provider explicitly requires a human (KYC, invite-only,
 *          OAuth-only, ToS disallows automation).
 *
 * Action:  create a row in public.human_tasks for the account owner, flip
 *          the goal to awaiting_tools with a human_task_id reference, and
 *          notify the user via notification_log. The UI's HumanTaskInbox
 *          picks the row up. Every credential checkpoint stays with the owner
 *          indefinitely. Trusted legacy browser failure provenance is retained
 *          only as audit context and never enables paid-human dispatch.
 *
 * Plain missing-key and unrecoverable browser cases both create non-escalating
 * manual checkpoints.
 */
import { isDeepStrictEqual } from 'node:util';

const MISSING_CREDENTIAL_PATTERN =
  /missing.*api.*key|credential not configured|no apikey|tool.*not.*configured/i;
const UNRECOVERABLE_PATTERN =
  /phone.*verification|invite.?only|oauth.?only|tos.*automation|captcha.*unsolvable|kyc|identity.*required/i;
const KYC_PATTERN =
  /kyc|identity.*verif|upload.*id|selfie|passport|driver.*license|government.*id/i;

const ACTIVE_HUMAN_TASK_STATUSES = ['pending', 'claimed'];
const CREDENTIAL_HUMAN_TASK_TYPES = ['provide_credential', 'provide_key', 'manual_signup'];

export const name = 'h45-human-credential';
export const priority = 45;

export function matches(goal) {
  const status = goal.status;
  if (status !== 'failed' && status !== 'awaiting_tools') return false;
  if (goal.data?.manual_credential_checkpoint?.status === 'awaiting_user') return false;
  if (goal.data?.last_heal_strategy === name && goal.data?.blocked_by_human_task_id) {
    return false;
  }
  const reason = goal.data?.failure_reason || '';

  // This is the structured contract emitted by tool-provisioning. Handle it
  // directly so a missing failure_reason cannot leave the goal unclaimed.
  const unconfigured = goal.data?.unconfigured_tools;
  if (Array.isArray(unconfigured) && unconfigured.length > 0) return true;

  if (MISSING_CREDENTIAL_PATTERN.test(reason) && goal.data?.required_tool_id) return true;

  // Trigger 1: same signal h40 uses, but h40 already skipped
  //            (missing Sandris / no signup_url / etc.)
  const h40Skipped =
    goal.data?.last_heal_strategy === 'h40-missing-credential' && goal.data?.h40_skipped_reason;
  if (h40Skipped && MISSING_CREDENTIAL_PATTERN.test(reason)) return true;

  // Trigger 2: failure_reason explicitly names an unrecoverable gate
  if (UNRECOVERABLE_PATTERN.test(reason) && goal.data?.required_tool_id) return true;

  // Trigger 3: job was marked needs_human by browser-task itself
  if (goal.data?.sandris_needs_human) return true;

  return false;
}

function sameText(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.trim() === right.trim();
}

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

/**
 * Legacy browser-failure provenance is trusted only when the server-owned
 * browser_task_runs row exactly corroborates the goal marker. Goal JSON by
 * itself is user-editable and therefore is not trusted evidence. This audit
 * context never enables paid-human dispatch.
 */
async function loadTrustedLegacyBrowserFailure(admin, goal, toolId) {
  const marker = goal.data?.sandris_needs_human;
  const jobId = marker?.job_id;
  if (
    !jobId ||
    !toolId ||
    goal.data?.blocked_by_job_id !== jobId ||
    marker.tool_id !== toolId ||
    !UNRECOVERABLE_PATTERN.test(marker.reason || '')
  ) {
    return null;
  }

  try {
    const { data: job, error: jobError } = await admin
      .from('agent_jobs')
      .select('id, user_id, status, payload, result, error')
      .eq('id', jobId)
      .eq('user_id', goal.user_id)
      .maybeSingle();
    const payload = job?.payload || {};
    const result = job?.result || {};
    if (
      jobError ||
      !job ||
      job.id !== jobId ||
      job.user_id !== goal.user_id ||
      job.status !== 'failed' ||
      result.type !== 'browser-task' ||
      result.needs_human !== true ||
      !sameText(job.error, marker.reason) ||
      !sameText(result.error, marker.reason) ||
      payload.handler !== 'browser-task' ||
      payload.blocking_goal_id !== goal.id ||
      payload.targetToolId !== toolId ||
      payload._userId !== goal.user_id ||
      payload.userId !== goal.user_id ||
      payload.user_id !== goal.user_id
    ) {
      return null;
    }

    const { data: run, error } = await admin
      .from('browser_task_runs')
      .select('job_id, user_id, target_tool_id, status, steps, temp_email, error')
      .eq('job_id', jobId)
      .eq('user_id', goal.user_id)
      .eq('target_tool_id', toolId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      error ||
      !run ||
      run.job_id !== jobId ||
      run.user_id !== goal.user_id ||
      run.target_tool_id !== toolId ||
      run.status !== 'failed' ||
      !sameText(run.error, marker.reason) ||
      !UNRECOVERABLE_PATTERN.test(run.error || '')
    ) {
      return null;
    }
    return run;
  } catch {
    return null;
  }
}

async function loadActiveCredentialTask(admin, goal, toolId) {
  if (!goal.id || !goal.user_id || !toolId) return null;
  try {
    const { data, error } = await admin
      .from('human_tasks')
      .select(
        'id, escalation_allowed, escalate_after_seconds, status, claimed_at, escalated_at, updated_at'
      )
      .eq('goal_id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('tool_id', toolId)
      .in('status', ACTIVE_HUMAN_TASK_STATUSES)
      .in('type', CREDENTIAL_HUMAN_TASK_TYPES)
      .is('escalated_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return error ? null : data || null;
  } catch {
    return null;
  }
}

async function inspectGoalTransition(admin, { goal, taskId, transitionAt, expectedData }) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };

    const checkpoint = current.data?.manual_credential_checkpoint;
    if (
      current.status === 'awaiting_tools' &&
      sameTimestamp(current.updated_at, transitionAt) &&
      current.data?.blocked_by_human_task_id === taskId &&
      current.data?.last_heal_strategy === name &&
      current.data?.last_heal_at === transitionAt &&
      checkpoint?.status === 'awaiting_user' &&
      checkpoint.human_task_id === taskId &&
      checkpoint.created_at === transitionAt &&
      isDeepStrictEqual(current.data || {}, expectedData || {})
    ) {
      return { state: 'committed', goal: current };
    }

    if (
      current.status === goal.status &&
      current.updated_at === goal.updated_at &&
      isDeepStrictEqual(current.data || {}, goal.data || {})
    ) {
      return { state: 'original', goal: current };
    }

    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function cancelExactCreatedTask(admin, { task, goal, nowIso }) {
  let cleanup = admin
    .from('human_tasks')
    .update({
      status: 'cancelled',
      completed_at: nowIso,
      completed_by: 'cancelled',
      escalation_allowed: false,
      escalate_after_seconds: null,
    })
    .eq('id', task.id)
    .eq('user_id', goal.user_id)
    .eq('status', task.status)
    .eq('updated_at', task.updated_at);
  cleanup = task.claimed_at
    ? cleanup.eq('claimed_at', task.claimed_at)
    : cleanup.is('claimed_at', null);
  cleanup = task.escalated_at
    ? cleanup.eq('escalated_at', task.escalated_at)
    : cleanup.is('escalated_at', null);
  await cleanup;
}

export async function apply(admin, goal, { log } = {}) {
  const nowIso = new Date().toISOString();
  const unconfiguredTools = Array.isArray(goal.data?.unconfigured_tools)
    ? goal.data.unconfigured_tools.filter(Boolean)
    : [];
  const toolId =
    unconfiguredTools[0] || goal.data?.required_tool_id || goal.data?.sandris_needs_human?.tool_id;
  const taskToolId = toolId || 'unknown';
  const trustedBrowserFailure = await loadTrustedLegacyBrowserFailure(admin, goal, toolId);
  const reason =
    trustedBrowserFailure?.error ||
    goal.data?.failure_reason ||
    (toolId
      ? `Add the API key for ${toolId} in Tool Setup to continue.`
      : 'Add the required API key in Tool Setup to continue.');

  // Every credential checkpoint stays with the account owner. Corroborated
  // browser provenance is useful audit context, not escalation authority.
  const isKyc = KYC_PATTERN.test(reason);
  const manualOnly = true;
  const action = 'manual-credential-checkpoint';
  const reasonCode = classifyReason(reason, goal);

  // Look up the tool for provider_url context (best effort)
  let providerUrl = null;
  let recommendedProvider = null;
  if (toolId) {
    try {
      const { data: tool } = await admin
        .from('tools')
        .select('id, name, data')
        .eq('id', toolId)
        .eq('user_id', goal.user_id)
        .maybeSingle();
      if (tool) {
        providerUrl = tool.data?.signup_url || tool.data?.url || null;
        recommendedProvider = tool.name || null;
      }
    } catch {
      /* non-fatal */
    }
  }

  const partialContext = {
    credential_checkpoint: {
      manual_only: manualOnly,
      trusted_legacy_browser_failure: Boolean(trustedBrowserFailure),
    },
    ...(trustedBrowserFailure
      ? {
          temp_email: trustedBrowserFailure.temp_email,
          steps_completed: (trustedBrowserFailure.steps || [])
            .filter((step) => step.status === 'done')
            .map((step) => step.step),
          last_error: trustedBrowserFailure.error,
          browser_job_id: trustedBrowserFailure.job_id,
        }
      : {}),
  };

  const taskRow = {
    user_id: goal.user_id,
    goal_id: goal.id,
    tool_id: taskToolId,
    provider_url: providerUrl,
    type: 'provide_credential',
    reason,
    reason_code: reasonCode,
    instructions: buildInstructions(providerUrl, recommendedProvider, isKyc),
    recommended_provider: recommendedProvider,
    partial_context: partialContext,
    status: 'pending',
    escalation_allowed: false,
    escalate_after_seconds: null,
  };

  // Reuse an existing active checkpoint. Migration 213 adds the matching
  // partial unique index; the 23505 retry closes the concurrent insert race.
  let task = await loadActiveCredentialTask(admin, goal, taskToolId);
  let taskCreated = false;
  if (!task) {
    const { data: inserted, error: taskErr } = await admin
      .from('human_tasks')
      .insert(taskRow)
      .select(
        'id, user_id, escalation_allowed, escalate_after_seconds, status, claimed_at, escalated_at, updated_at'
      )
      .single();
    if (taskErr?.code === '23505') {
      task = await loadActiveCredentialTask(admin, goal, taskToolId);
    } else if (taskErr) {
      log?.warn?.(null, 'self-healer.h45.insert-failed', {
        goalId: goal.id,
        error: taskErr.message,
      });
      return { action: 'skipped', reason: 'human-task-insert-failed' };
    } else {
      task = inserted;
      taskCreated = true;
    }
  }
  if (!task) {
    return { action: 'skipped', reason: 'human-task-dedup-reload-failed' };
  }

  // Never inherit an old countdown for a checkpoint that is now known to be
  // owner-only. This also protects deployments where the backfill is pending.
  if (task.escalation_allowed || task.escalate_after_seconds) {
    let downgrade = admin
      .from('human_tasks')
      .update({
        escalation_allowed: false,
        escalate_after_seconds: null,
      })
      .eq('id', task.id)
      .eq('user_id', goal.user_id)
      .eq('status', task.status)
      .eq('updated_at', task.updated_at);
    downgrade = task.claimed_at
      ? downgrade.eq('claimed_at', task.claimed_at)
      : downgrade.is('claimed_at', null);
    downgrade = task.escalated_at
      ? downgrade.eq('escalated_at', task.escalated_at)
      : downgrade.is('escalated_at', null);
    const { data: downgradedTask, error: downgradeError } = await downgrade
      .select(
        'id, escalation_allowed, escalate_after_seconds, status, claimed_at, escalated_at, updated_at'
      )
      .maybeSingle();
    if (downgradeError) {
      log?.warn?.(null, 'self-healer.h45.downgrade-failed', {
        goalId: goal.id,
        humanTaskId: task.id,
        error: downgradeError.message,
      });
      return { action: 'skipped', reason: 'human-task-downgrade-failed' };
    }
    if (!downgradedTask) {
      task = await loadActiveCredentialTask(admin, goal, taskToolId);
      if (!task || task.escalation_allowed || task.escalate_after_seconds) {
        return { action: 'skipped', reason: 'human-task-downgrade-cas-lost' };
      }
    } else {
      task = downgradedTask;
    }
  }

  // Keep the goal in the existing awaiting_tools checkpoint so the
  // reconciler does not resume until the owner saves the credential.
  const mergedData = {
    ...goal.data,
    blocked_by_human_task_id: task.id,
    required_tool_id: toolId || goal.data?.required_tool_id,
    unconfigured_tools: unconfiguredTools.length > 0 ? unconfiguredTools : toolId ? [toolId] : [],
    failure_reason: reason,
    manual_credential_checkpoint: {
      status: 'awaiting_user',
      reason: 'manual-credential-checkpoint',
      tool_ids: unconfiguredTools.length > 0 ? unconfiguredTools : toolId ? [toolId] : [],
      human_task_id: task.id,
      message: reason,
      created_at: nowIso,
    },
    last_heal_strategy: name,
    last_heal_at: nowIso,
    heal_attempts: (goal.data?.heal_attempts || 0) + 1,
    healing_log: [
      ...(goal.data?.healing_log || []),
      {
        at: nowIso,
        strategy: name,
        action,
        human_task_id: task.id,
        tool_id: toolId,
        kyc: isKyc,
        manual_only: manualOnly,
      },
    ],
  };
  let goalTransition;
  try {
    goalTransition = await admin
      .from('goals')
      .update({
        status: 'awaiting_tools',
        data: mergedData,
        updated_at: nowIso,
      })
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', goal.status)
      .eq('updated_at', goal.updated_at)
      .select('id, user_id, status, data, updated_at')
      .maybeSingle();
  } catch (error) {
    goalTransition = { data: null, error };
  }

  let transitionedGoal = goalTransition.data;
  let goalTransitionError = goalTransition.error;
  if (goalTransitionError) {
    const inspection = await inspectGoalTransition(admin, {
      goal,
      taskId: task.id,
      transitionAt: nowIso,
      expectedData: mergedData,
    });
    if (inspection.state === 'committed') {
      transitionedGoal = inspection.goal;
      goalTransitionError = null;
    } else if (inspection.state === 'original') {
      if (taskCreated) await cancelExactCreatedTask(admin, { task, goal, nowIso });
      log?.warn?.(null, 'self-healer.h45.goal-transition-proven-absent', {
        goalId: goal.id,
        humanTaskId: task.id,
        error: goalTransition.error?.message || null,
      });
      return { action: 'skipped', reason: 'goal-transition-failed' };
    } else {
      // The task remains active and unique. Cancelling it after an ambiguous
      // response could strand a goal whose pointer was durably committed.
      log?.warn?.(null, 'self-healer.h45.goal-transition-needs-reconciliation', {
        goalId: goal.id,
        humanTaskId: task.id,
        inspectionState: inspection.state,
        error: goalTransition.error?.message || null,
        inspectionError: inspection.error?.message || null,
      });
      return { action: 'skipped', reason: 'goal-transition-needs-reconciliation' };
    }
  }

  if (!transitionedGoal) {
    // A stale healer must not revive or overwrite a concurrently cancelled or
    // edited goal. Clean up only the exact untouched task it created; reused or
    // already-claimed tasks remain untouched.
    if (taskCreated) await cancelExactCreatedTask(admin, { task, goal, nowIso });
    log?.warn?.(null, 'self-healer.h45.goal-cas-lost', {
      goalId: goal.id,
      humanTaskId: task.id,
      error: null,
    });
    return {
      action: 'skipped',
      reason: 'goal-transition-cas-lost',
    };
  }

  // Only the creator emits user-facing side effects; retry/reuse paths merely
  // restore the goal's pointer to the canonical active checkpoint.
  if (taskCreated) {
    await admin.from('goal_log').insert({
      goal_id: goal.id,
      event_type: 'goal_needs_human_credential',
      details: {
        strategy: name,
        human_task_id: task.id,
        tool_id: toolId,
        kyc: isKyc,
        manual_only: manualOnly,
        reason_code: reasonCode,
      },
    });

    try {
      await admin.from('notification_log').insert({
        user_id: goal.user_id,
        channel: 'in_app',
        event_type: 'human_action_required',
        subject: isKyc ? 'Manual signup required (identity verification)' : 'API key required',
        body: isKyc
          ? `The provider for "${goal.title}" requires ID verification. We do not automate that — please complete the signup manually.`
          : `${reason} The goal will resume after you save it.`,
        status: 'sent',
        sent_at: nowIso,
        metadata: {
          priority: isKyc ? 'high' : 'normal',
          human_task_id: task.id,
          goal_id: goal.id,
          tool_id: toolId,
          kyc: isKyc,
          manual_only: manualOnly,
          action: {
            type: 'open_human_task',
            label: 'Open task',
            target_url: `/goals?humanTask=${task.id}`,
          },
        },
      });
    } catch {
      /* best effort */
    }
  }

  log?.info?.(null, 'self-healer.h45.created', {
    goalId: goal.id,
    humanTaskId: task.id,
    kyc: isKyc,
    manualOnly,
  });
  return {
    action,
    humanTaskId: task.id,
    kyc: isKyc,
    manualOnly,
    reused: !taskCreated,
    reasonCode,
  };
}

function classifyReason(reason, goal) {
  const r = String(reason).toLowerCase();
  if (goal.data?.h40_skipped_reason === 'sandris-missing-or-inactive') return 'sandris_missing';
  if (goal.data?.h40_skipped_reason === 'no-signup-url') return 'no_signup_url';
  if (goal.data?.h40_skipped_reason === 'tool-requires-human') return 'human_only';
  if (/kyc|identity|passport|selfie|driver.*license/i.test(r)) return 'kyc_required';
  if (/phone.*verif|sms/i.test(r)) return 'phone_required';
  if (/oauth.?only/i.test(r)) return 'oauth_only';
  if (/invite.?only/i.test(r)) return 'invite_only';
  if (/tos.*automation|automation.*forbidden/i.test(r)) return 'tos_disallows';
  if (/captcha.*unsolvable/i.test(r)) return 'captcha_unsolvable';
  return 'manual';
}

function buildInstructions(providerUrl, providerName, isKyc) {
  const provider = providerName || (providerUrl ? new URL(providerUrl).host : 'the provider');
  if (isKyc) {
    return [
      `1. Go to ${providerUrl || provider} and complete the signup in your browser.`,
      '2. Complete the identity verification step yourself (upload ID / take a selfie / etc.).',
      '3. Once the account is active, navigate to the API Keys section.',
      '4. Copy the API key.',
      '5. Paste it into the field below and click Submit. The blocked goal will resume automatically.',
    ].join('\n');
  }
  return [
    `1. Open ${providerUrl || provider} and find its API Keys or Developer settings.`,
    '2. Create or copy an API key.',
    '3. Paste it into Tool Setup and save it.',
    '4. The blocked goal will resume after the credential is configured.',
  ].join('\n');
}
