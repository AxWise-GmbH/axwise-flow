/**
 * run-instruction pulse action.
 *
 * Fired by the pulse-tick engine for pulses created from the Pulse UI / the
 * pulse.create chat tool. A pulse carries a list of entries; each entry spawns
 * its own goal (the existing orchestrate-goal pipeline does the actual work).
 *
 * metadata shape:
 *   {
 *     owner_type: 'agent' | 'team' | 'organization',
 *     owner_id:   string,
 *     owner_name: string,
 *     created_by_name: string,
 *     entries: [
 *       { kind: 'instrument', instrument: { slug, route }, prompt, ref },
 *       { kind: 'repeat_goal', source_goal_id, source_goal_title, prompt,
 *         repeat_mode?: 'same_team' | 'consilium' | 'prompt_only', concilium_id? },
 *     ],
 *     // legacy single-field mirror: instruction, instrument
 *     schedule_kind, time_of_day, weekday, day_of_month, run_at  // (scheduling)
 *   }
 */
import { isDeepStrictEqual } from 'node:util';
import { deterministicAgentJobId, enqueueAgentJob } from '../../goal-handlers/_helpers.js';
import {
  bindJobPayloadToWorkerDeployment,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../../agent-handlers/worker-scope.js';
import { buildPulseGoalInsert } from '../repeat-goal-clone.js';
import { hasNativeAxwiseScopeMarkers } from '../../_shared/native-scope-approval.js';

const PULSE_HANDOFF_KEY = 'pulse_handoff';

function expectedPulseJob(job, env = process.env) {
  const workerScope = resolveWorkerScope(env);
  const payload = bindJobPayloadToWorkerDeployment(job?.payload, env);
  const requestedId = job.id;
  const id = payload[WORKER_DEPLOYMENT_PAYLOAD_KEY]
    ? deterministicAgentJobId('preview-deployment-agent-job', {
        id: requestedId,
        deployment: payload[WORKER_DEPLOYMENT_PAYLOAD_KEY],
      })
    : workerScope === 'local'
      ? deterministicAgentJobId('local-agent-job', { id: requestedId })
      : requestedId;
  return { id, user_id: job.user_id, payload, worker_scope: workerScope };
}

async function inspectPulseJob(admin, expected) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, user_id, status, worker_scope, payload, updated_at')
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };
    const exact =
      job.id === expected.id &&
      job.user_id === expected.user_id &&
      job.worker_scope === expected.worker_scope &&
      isDeepStrictEqual(job.payload || {}, expected.payload || {});
    return exact ? { state: 'present', job } : { state: 'conflict', job };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function inspectPulseGoalPark(admin, snapshot, jobId, parkedData) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, title, status, data, updated_at')
      .eq('id', snapshot.id)
      .eq('user_id', snapshot.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };
    if (
      current.status === 'needs_human' &&
      current.data?.[PULSE_HANDOFF_KEY]?.job_id === jobId &&
      current.data?.[PULSE_HANDOFF_KEY]?.status === 'stopped' &&
      isDeepStrictEqual(current.data || {}, parkedData || {})
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === snapshot.status &&
      current.updated_at === snapshot.updated_at &&
      isDeepStrictEqual(current.data || {}, snapshot.data || {})
    ) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function parkStoppedPulseGoal(admin, snapshot, pulseId, expectedJob, enqueueError, jobState) {
  if (!snapshot?.updated_at) return { state: 'unknown' };
  const parkedAt = new Date().toISOString();
  const parkedData = {
    ...(snapshot.data || {}),
    [PULSE_HANDOFF_KEY]: {
      status: 'stopped',
      pulse_id: pulseId,
      job_id: expectedJob.id,
      job_state: jobState,
      failed_at: parkedAt,
      error: String(enqueueError?.message || enqueueError || 'Worker handoff failed').slice(0, 500),
      reconciliation_required: false,
    },
  };

  const updateExact = async () => {
    try {
      return await admin
        .from('goals')
        .update({ status: 'needs_human', data: parkedData, updated_at: parkedAt })
        .eq('id', snapshot.id)
        .eq('user_id', snapshot.user_id)
        .eq('status', snapshot.status)
        .eq('updated_at', snapshot.updated_at)
        .select('id, user_id, title, status, data, updated_at')
        .maybeSingle();
    } catch (error) {
      return { data: null, error };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (
      !response.error &&
      response.data?.status === 'needs_human' &&
      response.data?.data?.[PULSE_HANDOFF_KEY]?.job_id === expectedJob.id
    ) {
      return { state: 'committed', goal: response.data };
    }
    const inspection = await inspectPulseGoalPark(admin, snapshot, expectedJob.id, parkedData);
    if (inspection.state === 'committed' || inspection.state === 'conflict') return inspection;
    if (inspection.state !== 'original') return inspection;
  }
  return { state: 'unknown' };
}

async function compensatePulseGoalHandoff({ admin, goal, pulseId, expectedJob, enqueueError }) {
  const inspection = await inspectPulseJob(admin, expectedJob);
  if (inspection.state === 'present' && inspection.job.status === 'done') {
    return { state: 'processed', goal, reconciliationRequired: false };
  }

  const terminal =
    inspection.state === 'absent' ||
    (inspection.state === 'present' && ['failed', 'cancelled'].includes(inspection.job.status));
  if (terminal) {
    const parked = await parkStoppedPulseGoal(
      admin,
      goal,
      pulseId,
      expectedJob,
      enqueueError,
      inspection.state === 'absent' ? 'absent' : inspection.job.status
    );
    if (parked.state === 'committed') {
      return { state: 'parked', goal: parked.goal, reconciliationRequired: false };
    }
  }

  return {
    state: 'reconciliation_required',
    goal,
    reconciliationState: inspection.state,
    reconciliationRequired: true,
  };
}

function truncate(str, max) {
  const s = String(str || '').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

const BLOCKED_STATUSES = new Set(['cancelled', 'failed']);

/** Normalize metadata.entries, synthesizing one from legacy fields if absent. */
function normalizeEntries(meta) {
  if (Array.isArray(meta.entries) && meta.entries.length) return meta.entries;
  const instruction = String(meta.instruction || '').trim();
  if (!instruction) return [];
  return [
    { kind: 'instrument', instrument: meta.instrument || null, prompt: instruction, ref: '' },
  ];
}

/** Build the goal row + context for one entry. Returns { goalRow, jobPayload?, copyUnitId? } or { skip }. */
async function buildGoalRow(admin, pulse, meta, entry) {
  const ownerType = meta.owner_type || 'agent';
  const ownerName = meta.owner_name || '';
  const ownerLine = ownerName ? `Owner: ${ownerName} (${ownerType})` : `Owner type: ${ownerType}`;
  const baseData = {
    pulse_id: pulse.id,
    pulse_owner: { owner_type: ownerType, owner_id: meta.owner_id || null, owner_name: ownerName },
  };

  if (entry.kind === 'repeat_goal') {
    const sourceId = entry.source_goal_id;
    if (!sourceId) return { skip: 'repeat_goal without source_goal_id' };

    const repeatMode = entry.repeat_mode || 'prompt_only';

    if (repeatMode === 'same_team' || repeatMode === 'consilium') {
      const { data: src } = await admin
        .from('goals')
        .select('*')
        .eq('id', sourceId)
        .eq('user_id', pulse.user_id)
        .single();

      if (!src || src.user_id !== pulse.user_id) {
        return { skip: 'source goal missing / not owned' };
      }
      if (BLOCKED_STATUSES.has(src.status)) {
        return { skip: 'source goal is cancelled or failed' };
      }
      if (hasNativeAxwiseScopeMarkers(src)) {
        return { skip: 'native source requires a newly confirmed AxWise scope' };
      }

      const built = await buildPulseGoalInsert(admin, src, {
        repeat_mode: repeatMode,
        concilium_id: entry.concilium_id,
        pulse_id: pulse.id,
        pulse_owner: baseData.pulse_owner,
      });
      if (built.error) return { skip: built.error };

      return {
        goalRow: built.goalRow,
        jobPayload: { ...built.jobPayload, goalId: undefined },
        copyUnitId: src.unit_id || null,
        logDetails: { title: built.goalRow.title, pulse_of: src.id, pulse_mode: repeatMode },
      };
    }

    const { data: src } = await admin
      .from('goals')
      .select('id, title, description, user_id, status, data')
      .eq('id', sourceId)
      .eq('user_id', pulse.user_id)
      .single();

    if (!src || src.user_id !== pulse.user_id || src.status !== 'completed') {
      return { skip: 'source goal missing / not owned / not completed' };
    }
    if (hasNativeAxwiseScopeMarkers(src)) {
      return { skip: 'native source requires a newly confirmed AxWise scope' };
    }

    const prompt = String(entry.prompt || '').trim();
    const title = truncate(`Repeat: ${src.title || 'goal'}`, 80);
    const description = [
      `Regenerate this goal with the following changes: ${prompt}`,
      '',
      `Original goal: ${src.title || ''}`,
      src.description ? `Original brief:\n${src.description}` : null,
      '',
      `[${ownerLine} | Repeat of goal ${src.id} | Triggered by a scheduled pulse.]`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    return {
      goalRow: {
        user_id: pulse.user_id,
        title,
        description,
        budget_usd: 10,
        complexity: 'simple',
        execution_mode: 'auto',
        status: 'feasibility',
        data: { ...baseData, repeat_of: src.id },
      },
    };
  }

  // instrument entry
  const prompt = String(entry.prompt || '').trim();
  if (!prompt) return { skip: 'instrument entry without prompt' };
  const instrument = entry.instrument || null;
  const instrumentSlug = instrument?.slug || null;
  const ref = String(entry.ref || '').trim();

  const contextLine = [
    ownerLine,
    instrumentSlug ? `Instrument: ${instrumentSlug}` : null,
    ref ? `Reference: ${ref}` : null,
    'Triggered by a scheduled pulse.',
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    goalRow: {
      user_id: pulse.user_id,
      title: truncate(prompt, 80) || 'Scheduled pulse',
      description: `${prompt}\n\n[${contextLine}]`,
      budget_usd: 10,
      complexity: 'simple',
      execution_mode: 'auto',
      status: 'feasibility',
      data: { ...baseData, instrument, reference: ref || null },
    },
  };
}

export async function handleRunInstruction(admin, pulse, ctx = {}) {
  const meta = pulse.metadata || {};
  if (!pulse.user_id) return { status: 'skipped', reason: 'no user_id' };

  const entries = normalizeEntries(meta);
  if (!entries.length) return { status: 'skipped', reason: 'no entries' };

  const goalIds = [];
  const outcomes = [];
  const skipped = [];
  let lastError = null;

  for (const entry of entries) {
    const built = await buildGoalRow(admin, pulse, meta, entry);
    if (built.skip) {
      skipped.push(built.skip);
      continue;
    }

    const { data: goal, error: goalErr } = await admin
      .from('goals')
      .insert(built.goalRow)
      .select('id, user_id, title, status, data, updated_at')
      .single();

    if (goalErr || !goal) {
      lastError = goalErr?.message || 'goal insert failed';
      continue;
    }

    // The domain row is already durable. Always expose its identity in the
    // pulse outcome, even if the exact queue handoff below fails.
    goalIds.push(goal.id);
    const goalSnapshot = {
      ...built.goalRow,
      ...goal,
      user_id: goal.user_id || pulse.user_id,
      data: goal.data ?? built.goalRow.data ?? {},
    };

    if (built.copyUnitId) {
      await admin
        .from('goal_unit_members')
        .insert({
          unit_id: built.copyUnitId,
          goal_id: goal.id,
          sequence_order: 99,
        })
        .catch(() => {});
    }

    if (!goal.user_id || goal.user_id !== pulse.user_id) {
      throw new Error('Pulse-created goal did not preserve its durable owner');
    }
    const ownerId = goal.user_id;
    const jobPayload = built.jobPayload
      ? {
          ...built.jobPayload,
          goalId: goal.id,
          _userId: ownerId,
          userId: ownerId,
          user_id: ownerId,
        }
      : {
          type: 'orchestrate-goal',
          action: 'feasibility-analysis',
          goalId: goal.id,
          _userId: ownerId,
          userId: ownerId,
          user_id: ownerId,
        };

    const env = ctx.env || process.env;
    const requestedJob = {
      id: deterministicAgentJobId('pulse-goal-feasibility', { goalId: goal.id }),
      user_id: ownerId,
      payload: jobPayload,
    };
    const expectedJob = expectedPulseJob(requestedJob, env);
    try {
      const enqueueOptions = { idempotent: true, env };
      const queuedJob = ctx.enqueueAgentJobImpl
        ? await ctx.enqueueAgentJobImpl(admin, requestedJob, enqueueOptions)
        : await enqueueAgentJob(admin, requestedJob, enqueueOptions);
      outcomes.push({
        goalId: goal.id,
        jobId: queuedJob.id,
        status: queuedJob.status === 'done' ? 'processed' : 'queued',
        reconciliationRequired: false,
      });
    } catch (jobError) {
      lastError = jobError.message;
      const recovery = await compensatePulseGoalHandoff({
        admin,
        goal: goalSnapshot,
        pulseId: pulse.id,
        expectedJob,
        enqueueError: jobError,
      });
      outcomes.push({
        goalId: goal.id,
        jobId: expectedJob.id,
        status: recovery.state,
        reconciliationRequired: recovery.reconciliationRequired,
        reconciliationState: recovery.reconciliationState || null,
        error: String(jobError?.message || jobError).slice(0, 500),
      });
    }

    if (built.logDetails) {
      await admin
        .from('goal_log')
        .insert({
          goal_id: goal.id,
          event_type: 'goal_created',
          details: built.logDetails,
        })
        .catch(() => {});
    }
  }

  if (!goalIds.length) {
    return { status: 'failed', error: lastError || 'no goals created', goalIds, outcomes, skipped };
  }

  const queuedCount = outcomes.filter((outcome) =>
    ['queued', 'processed'].includes(outcome.status)
  ).length;
  const parkedGoalIds = outcomes
    .filter((outcome) => outcome.status === 'parked')
    .map((outcome) => outcome.goalId);
  const reconciliationRequired = outcomes.some(
    (outcome) => outcome.reconciliationRequired === true
  );
  const handoffStatus =
    queuedCount === goalIds.length
      ? 'done'
      : queuedCount > 0
        ? 'partial'
        : reconciliationRequired
          ? 'reconciliation_required'
          : 'parked';
  // pulse_runs.status has a constrained legacy enum. Keep detailed producer
  // state in the JSON outcome while recording any incomplete handoff as failed.
  const status = handoffStatus === 'done' ? 'done' : 'failed';

  return {
    status,
    handoffStatus,
    goalIds,
    count: goalIds.length,
    queuedCount,
    parkedGoalIds,
    reconciliationRequired,
    outcomes,
    error: handoffStatus === 'done' ? null : lastError || 'one or more goal handoffs stopped',
    skipped,
  };
}
