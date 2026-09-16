import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  PRD_QUALITY_ATTESTATION_VERSION,
  PRD_QUALITY_RULESET_VERSION,
  buildPrdQualityAttestation,
  buildPrdSemanticCriticRequest,
  isPrdDeliverableProfile,
  isQualityGateApplicableGoal,
  prdArtifactHash,
  prdCompletionAttestationDecision,
  resolveDeliverableProfile,
  resolvePrdQualityThreshold,
  resolvePrdScopeHash,
  resolveTrustedPrdRuntimeModel,
  runPrdDeterministicValidation,
  sha256,
} from '../../quality/prd-quality-gate.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import { enqueueGoalAction, loadGoal, logGoalEvent, pickTestModel } from '../_helpers.js';
import { resolveAcceptedNativeGoalAuthority } from '../../_shared/native-goal-authority.js';

const log = createLogger('goal-stage:prd-quality-validation');
const VALIDATION_RESERVATION_STATUSES = new Set(['active', 'pending_validation']);

function asCompletionCandidate(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    output: task.data?.output || '',
    deliverable_type: task.data?.deliverable_type || 'markdown',
    phase_index: task.data?.phase_index,
    quality_score: task.data?.quality_score,
    quality_score_kind: task.data?.quality_score_kind || 'structural',
    task_data: task.data || {},
    materialization_attempt: task.materialization_attempt || null,
    updated_at: task.updated_at || null,
  };
}

export async function loadStrictPrdCandidates(admin, goal, selectDeliverables) {
  const { data: taskRows, error } = await admin
    .from('team_tasks')
    .select('id, title, status, materialization_attempt, data, updated_at')
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id);
  if (error) throw new Error(`Unable to load quality-gate completion candidates: ${error.message}`);
  const done = currentGoalTaskAttempt(goal, taskRows || [])
    .filter((task) => task.status === 'done' && task.data?.output)
    .map(asCompletionCandidate);
  return selectDeliverables(goal, done);
}

function candidateAttemptRow(candidate) {
  return {
    id: candidate?.id,
    title: candidate?.title,
    status: candidate?.status,
    materialization_attempt: candidate?.materialization_attempt,
    data: candidate?.task_data || {},
  };
}

function nativeValidationBlocked(goal, reason, authority = null) {
  return {
    applicable: true,
    allowed: false,
    superseded: true,
    candidate: null,
    artifact: '',
    attestation: goal?.data?.prd_quality_attestation || null,
    decision: {
      allowed: false,
      applicable: true,
      reasons: [reason, ...(authority?.reasons || [])],
    },
    goalStatus: goal?.status,
  };
}

function attestationIsCurrent(attestation, artifactHash, scopeHash, threshold, deliverableProfile) {
  if (!attestation) return false;
  return (
    attestation.version === PRD_QUALITY_ATTESTATION_VERSION &&
    attestation.ruleset_version === PRD_QUALITY_RULESET_VERSION &&
    attestation.artifact_hash === artifactHash &&
    attestation.scope_hash === scopeHash &&
    Number(attestation.threshold) === Number(threshold) &&
    (!attestation.deliverable_profile || attestation.deliverable_profile === deliverableProfile)
  );
}

async function updateAttestedTaskScore(admin, candidate, attestation) {
  if (!candidate?.id || !candidate.task_data) return false;
  const updatedAt = new Date().toISOString();
  let query = admin
    .from('team_tasks')
    .update({
      data: {
        ...candidate.task_data,
        quality_score: attestation.score,
        quality_score_kind: 'semantic_attested',
        prd_quality_attestation: {
          version: attestation.version,
          deliverable_profile: attestation.deliverable_profile,
          status: attestation.status,
          score: attestation.score,
          semantic_score: attestation.semantic_score,
          structural_score: attestation.structural_score,
          artifact_hash: attestation.artifact_hash,
          scope_hash: attestation.scope_hash,
        },
      },
      updated_at: updatedAt,
    })
    .eq('id', candidate.id)
    .eq('status', 'done');
  if (candidate.updated_at) query = query.eq('updated_at', candidate.updated_at);
  const { data, error } = await query.select('id, updated_at').maybeSingle();
  if (error) throw new Error(`Unable to persist attested PRD task score: ${error.message}`);
  return Boolean(data?.id);
}

function finiteScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

/**
 * Compare a repaired artifact with the last attested artifact. A repair is
 * monotonic only when every available top-level quality score is preserved or
 * improved. Missing repair provenance deliberately disables rollback rather
 * than guessing at an artifact that was not captured by the repair stage.
 */
export function postRepairScoreRegression(candidate, attestation, repairAttempts) {
  if (Number(repairAttempts || 0) < 1) return null;
  const repair = candidate?.task_data?.prd_quality_repair;
  if (!repair?.prior_artifact || !repair?.prior_attestation) return null;

  const dimensions = ['score', 'semantic_score', 'structural_score'];
  const regressions = dimensions.flatMap((dimension) => {
    const prior = finiteScore(
      repair.prior_scores?.[dimension] ?? repair.prior_attestation?.[dimension]
    );
    const attempted = finiteScore(attestation?.[dimension]);
    return prior !== null && (attempted === null || attempted < prior)
      ? [{ dimension, prior, attempted }]
      : [];
  });
  if (regressions.length === 0) return null;

  const priorArtifact = String(repair.prior_artifact);
  const priorArtifactHash = prdArtifactHash(priorArtifact);
  if (
    repair.prior_artifact_hash !== priorArtifactHash ||
    repair.prior_attestation.artifact_hash !== priorArtifactHash
  ) {
    return {
      invalid: true,
      reason: 'Captured pre-repair artifact provenance does not match its attestation.',
      regressions,
      repair,
    };
  }

  return {
    invalid: false,
    regressions,
    repair,
    priorArtifact,
    priorArtifactHash,
    priorAttestation: repair.prior_attestation,
    priorScores: {
      score: finiteScore(repair.prior_scores?.score ?? repair.prior_attestation.score),
      semantic_score: finiteScore(
        repair.prior_scores?.semantic_score ?? repair.prior_attestation.semantic_score
      ),
      structural_score: finiteScore(
        repair.prior_scores?.structural_score ?? repair.prior_attestation.structural_score
      ),
    },
  };
}

async function restoreRegressedPrdTask(admin, candidate, regression, attemptedAttestation) {
  const restoredAt = new Date().toISOString();
  const repairEvidence = {
    ...(candidate.task_data?.prd_quality_repair || {}),
    status: 'needs_human',
    outcome: 'regressed',
    restored_at: restoredAt,
    restored_artifact_hash: regression.priorArtifactHash,
    restored_scores: regression.priorScores,
    attempted_artifact_hash: attemptedAttestation.artifact_hash,
    attempted_scores: {
      score: attemptedAttestation.score,
      semantic_score: attemptedAttestation.semantic_score,
      structural_score: attemptedAttestation.structural_score,
    },
    attempted_attestation: attemptedAttestation,
    regression_dimensions: regression.regressions,
  };
  const restoredTaskData = {
    ...(candidate.task_data || {}),
    output: regression.priorArtifact,
    quality_score: regression.priorScores.score,
    quality_score_kind: 'semantic_attested',
    prd_quality_attestation: regression.priorAttestation,
    prd_quality_repair: repairEvidence,
  };
  let query = admin
    .from('team_tasks')
    .update({ data: restoredTaskData, updated_at: restoredAt })
    .eq('id', candidate.id)
    .eq('status', 'done');
  if (candidate.updated_at) query = query.eq('updated_at', candidate.updated_at);
  const { data, error } = await query.select('id, updated_at').maybeSingle();
  if (error) throw new Error(`Unable to restore regressed PRD task: ${error.message}`);
  return data?.id ? { data: restoredTaskData, updatedAt: data.updated_at || restoredAt } : null;
}

async function reserveValidation(admin, goal, validation) {
  const reservedAt = new Date().toISOString();
  const reservationId = sha256(
    `${goal.id}:${validation.artifact_hash}:${validation.scope_hash}:${reservedAt}`
  );
  const reservedData = {
    ...(goal.data || {}),
    prd_quality_validation: {
      ...validation,
      status: 'running',
      reservation_id: reservationId,
      started_at: reservedAt,
    },
  };
  let query = admin
    .from('goals')
    .update({ status: 'pending_validation', data: reservedData, updated_at: reservedAt })
    .eq('id', goal.id)
    .eq('status', goal.status);
  if (goal.updated_at) query = query.eq('updated_at', goal.updated_at);
  const { data, error } = await query.select('id, status, data, updated_at').maybeSingle();
  if (error) throw new Error(`Unable to reserve strict PRD validation: ${error.message}`);
  if (!data?.id) return null;
  return {
    reservationId,
    goal: {
      ...goal,
      ...data,
      status: data.status || 'pending_validation',
      data: data.data || reservedData,
      updated_at: data.updated_at || reservedAt,
    },
  };
}

async function finalizeReservedValidation(admin, reserved, updates) {
  const updatedAt = new Date().toISOString();
  let query = admin
    .from('goals')
    .update({ ...updates, updated_at: updatedAt })
    .eq('id', reserved.goal.id)
    .eq('status', 'pending_validation')
    .eq('data->prd_quality_validation->>reservation_id', reserved.reservationId);
  if (reserved.goal.updated_at) query = query.eq('updated_at', reserved.goal.updated_at);
  const { data, error } = await query.select('id, status, data, updated_at').maybeSingle();
  if (error) throw new Error(`Unable to finalize strict PRD validation: ${error.message}`);
  return data || null;
}

async function supersededValidationResult(admin, goal, candidate, artifact, reason) {
  let currentGoal = goal;
  try {
    currentGoal = await loadGoal(admin, goal.id);
  } catch {
    // Preserve the observed row when a follow-up read is temporarily unavailable.
  }
  return {
    applicable: true,
    allowed: false,
    superseded: true,
    candidate,
    artifact,
    attestation: currentGoal.data?.prd_quality_attestation || null,
    decision: { allowed: false, applicable: true, reasons: [reason] },
    goalStatus: currentGoal.status,
  };
}

async function releaseSupersededReservation(admin, reserved, candidate, artifact, reason) {
  const released = await finalizeReservedValidation(admin, reserved, {
    status: 'pending_validation',
    data: {
      ...(reserved.goal.data || {}),
      prd_quality_validation: {
        ...(reserved.goal.data?.prd_quality_validation || {}),
        status: 'superseded',
        superseded_reason: reason,
        completed_at: new Date().toISOString(),
      },
    },
  });
  if (released) {
    try {
      await enqueueGoalAction(admin, 'complete', reserved.goal.id);
    } catch {
      // The exact next completion can also be recovered manually; never let a
      // stale validator overwrite newer state merely to report a wake failure.
    }
  }
  return supersededValidationResult(admin, reserved.goal, candidate, artifact, reason);
}

async function casGoalRow(admin, row, updates) {
  const updatedAt = new Date().toISOString();
  let query = admin
    .from('goals')
    .update({ ...updates, updated_at: updatedAt })
    .eq('id', row.id)
    .eq('status', row.status);
  if (row.updated_at) query = query.eq('updated_at', row.updated_at);
  const { data, error } = await query.select('id, status, data, updated_at').maybeSingle();
  if (error) throw new Error(`Unable to update finalized PRD validation: ${error.message}`);
  return data || null;
}

export async function ensureStrictPrdCompletionAttestation(
  admin,
  goal,
  { req, selectDeliverables, candidates = null } = {}
) {
  const initialNativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (initialNativeAuthority.native && !initialNativeAuthority.ready) {
    return nativeValidationBlocked(goal, 'native_scope_authority_invalid', initialNativeAuthority);
  }
  if (!isQualityGateApplicableGoal(goal)) return { applicable: false, allowed: true };
  if (typeof selectDeliverables !== 'function' && !Array.isArray(candidates)) {
    throw new Error('Deliverable quality validation requires a completion deliverable selector.');
  }

  const selected = Array.isArray(candidates)
    ? candidates
    : await loadStrictPrdCandidates(admin, goal, selectDeliverables);
  if (initialNativeAuthority.native) {
    const currentCandidates = currentGoalTaskAttempt(goal, selected.map(candidateAttemptRow));
    const currentIds = new Set(currentCandidates.map((task) => String(task.id)));
    if (
      selected.length === 0 ||
      selected.some((candidate) => !currentIds.has(String(candidate?.id || '')))
    ) {
      return nativeValidationBlocked(goal, 'native_current_artifact_missing');
    }
  }
  const candidate = selected[0] || null;
  const artifact = candidate?.output || '';
  const artifactHash = prdArtifactHash(artifact);
  const scopeHash = resolvePrdScopeHash(goal);
  const threshold = resolvePrdQualityThreshold();
  const canonicalTask = candidate
    ? { id: candidate.id, title: candidate.title, data: candidate.task_data }
    : null;
  const deliverableProfile = resolveDeliverableProfile(goal, canonicalTask);
  const prdProfile = isPrdDeliverableProfile(deliverableProfile);
  const expectedRuntimeModel = resolveTrustedPrdRuntimeModel(
    goal,
    canonicalTask,
    pickTestModel(goal).model
  );
  const existing = goal.data?.prd_quality_attestation;

  if (!VALIDATION_RESERVATION_STATUSES.has(goal.status)) {
    return supersededValidationResult(
      admin,
      goal,
      candidate,
      artifact,
      'goal_status_not_validation_eligible'
    );
  }

  if (attestationIsCurrent(existing, artifactHash, scopeHash, threshold, deliverableProfile)) {
    const decision = prdCompletionAttestationDecision({
      goal,
      artifact,
      attestation: existing,
      threshold,
    });
    return {
      applicable: true,
      allowed: decision.allowed,
      reused: true,
      candidate,
      artifact,
      attestation: existing,
      decision,
      goalStatus: goal.status,
      deliverableProfile,
    };
  }

  const reserved = await reserveValidation(admin, goal, {
    version: 1,
    artifact_hash: artifactHash,
    scope_hash: scopeHash,
    threshold,
    deliverable_profile: deliverableProfile,
  });
  if (!reserved) {
    return supersededValidationResult(
      admin,
      goal,
      candidate,
      artifact,
      'validation_reservation_lost'
    );
  }
  const validationGoal = reserved.goal;
  const startedAt = validationGoal.data.prd_quality_validation.started_at;
  if (initialNativeAuthority.native) {
    const reservedAuthority = resolveAcceptedNativeGoalAuthority(validationGoal);
    if (
      !reservedAuthority.ready ||
      reservedAuthority.packet?.scope_hash !== initialNativeAuthority.packet?.scope_hash
    ) {
      return releaseSupersededReservation(
        admin,
        reserved,
        candidate,
        artifact,
        'native_scope_authority_changed_before_critic'
      );
    }
  }

  const deterministic = runPrdDeterministicValidation({
    goal: validationGoal,
    artifact,
    deliverableCount: selected.length,
    expectedRuntimeModel,
    task: canonicalTask,
  });
  const criticRequest = buildPrdSemanticCriticRequest({
    goal: validationGoal,
    artifact,
    deterministic,
    expectedRuntimeModel,
  });

  let semanticCritic = null;
  let criticError = null;
  const aggregateAttestationUnsupported = deterministic.blockers.some(
    (item) => item.code === 'unsupported_multi_artifact_attestation'
  );
  // V1 binds one artifact hash. A model cannot repair that missing
  // aggregate-set primitive, so fail before spending a critic call or
  // mutating one arbitrary member of the requested artifact set.
  if (!aggregateAttestationUnsupported) {
    try {
      const criticResult = await executeLlmTracked({
        ...pickTestModel(goal),
        model: expectedRuntimeModel,
        prompt: criticRequest.prompt,
        systemPrompt: criticRequest.systemPrompt,
        temperature: 0.1,
        // Keep the provider's full final-artifact window. Concision is enforced
        // by the eight-item JSON contract, not by truncating the critic.
        maxTokens: 65536,
        jsonMode: true,
        reasoningEffort: 'high',
        req,
        usage: {
          admin,
          userId: validationGoal.user_id,
          goalId: validationGoal.id,
          organizationId: validationGoal.org_id,
          teamId: validationGoal.agent_team_id || validationGoal.team_id,
          consiliumId: validationGoal.concilium_id,
          source: 'goal-complete',
          operation: 'prd-semantic-critic',
          description: `${prdProfile ? 'Strict PRD' : 'AxWise deliverable'} semantic quality critic: ${initialNativeAuthority.native ? initialNativeAuthority.packet.intent.objective : validationGoal.title}`,
        },
      });
      semanticCritic = parseLlmJson(criticResult.content);
    } catch (error) {
      criticError = error;
      log.warn(req, 'goal.prd-quality.semantic-critic-failed', {
        goalId: validationGoal.id,
        error: error.message,
      });
    }
  }

  const completedAt = new Date().toISOString();
  const attestation = buildPrdQualityAttestation({
    goal: validationGoal,
    artifact,
    deliverableCount: selected.length,
    expectedRuntimeModel,
    task: canonicalTask,
    semanticCritic,
    threshold,
    generatedAt: completedAt,
  });
  if (criticError) {
    attestation.semantic.error = criticError.message;
  }

  const repairAttempts = Number(validationGoal.data?.prd_quality_repair_attempts || 0);
  const repairRegression = postRepairScoreRegression(candidate, attestation, repairAttempts);
  if (repairRegression && !repairRegression.invalid) {
    const restoredTask = await restoreRegressedPrdTask(
      admin,
      candidate,
      repairRegression,
      attestation
    );
    if (!restoredTask) {
      return releaseSupersededReservation(
        admin,
        reserved,
        candidate,
        artifact,
        'final_task_changed_during_repair_rollback'
      );
    }

    // The tracked critic may have updated token/cost rollups while the
    // reservation was held. Preserve those fields when atomically publishing
    // the restored attestation on the goal row.
    let currentReservedGoal = validationGoal;
    try {
      currentReservedGoal = await loadGoal(admin, validationGoal.id);
    } catch {
      // Reservation predicates below still prevent stale goal finalization.
    }
    const completedAt = new Date().toISOString();
    const attemptedScores = {
      score: attestation.score,
      semantic_score: attestation.semantic_score,
      structural_score: attestation.structural_score,
    };
    const regressionReason = `Automatic PRD repair regressed ${repairRegression.regressions
      .map((item) => `${item.dimension} (${item.prior} to ${item.attempted ?? 'missing'})`)
      .join(', ')}; the previous attested artifact was restored.`;
    const repairEvidence = {
      ...(currentReservedGoal.data?.prd_quality_repair || {}),
      status: 'needs_human',
      outcome: 'regressed',
      completed_at: completedAt,
      failure_reason: regressionReason,
      prior_artifact_hash: repairRegression.priorArtifactHash,
      prior_scores: repairRegression.priorScores,
      prior_attestation: repairRegression.priorAttestation,
      restored_artifact_hash: repairRegression.priorArtifactHash,
      restored_scores: repairRegression.priorScores,
      attempted_artifact_hash: attestation.artifact_hash,
      attempted_scores: attemptedScores,
      attempted_attestation: attestation,
      regression_dimensions: repairRegression.regressions,
    };
    const finalized = await finalizeReservedValidation(
      admin,
      { ...reserved, goal: currentReservedGoal },
      {
        status: 'needs_human',
        data: {
          ...(currentReservedGoal.data || {}),
          // Restore the exact pre-repair attestation. Its artifact hash now
          // again names the task output, so goal and task cannot disagree.
          prd_quality_attestation: repairRegression.priorAttestation,
          prd_quality_validation: {
            version: 1,
            deliverable_profile: deliverableProfile,
            status: 'repair_regressed',
            reservation_id: reserved.reservationId,
            artifact_hash: repairRegression.priorArtifactHash,
            scope_hash: repairRegression.priorAttestation.scope_hash,
            threshold: repairRegression.priorAttestation.threshold ?? threshold,
            started_at: startedAt,
            completed_at: completedAt,
            attempted_artifact_hash: attestation.artifact_hash,
          },
          prd_quality_repair: repairEvidence,
          failure_reason: regressionReason,
          recovery_action:
            'Review the attempted repair evidence and revise the restored PRD manually before retrying completion.',
        },
      }
    );
    if (!finalized) {
      return supersededValidationResult(
        admin,
        validationGoal,
        { ...candidate, output: repairRegression.priorArtifact, task_data: restoredTask.data },
        repairRegression.priorArtifact,
        'goal_changed_during_repair_rollback'
      );
    }

    await logGoalEvent(admin, validationGoal.id, 'prd_quality_repair_regressed', {
      status: 'needs_human',
      regression_dimensions: repairRegression.regressions,
      prior_artifact_hash: repairRegression.priorArtifactHash,
      restored_artifact_hash: repairRegression.priorArtifactHash,
      attempted_artifact_hash: attestation.artifact_hash,
      prior_scores: repairRegression.priorScores,
      attempted_scores: attemptedScores,
      attempted_attestation: attestation,
    });

    const restoredCandidate = {
      ...candidate,
      output: repairRegression.priorArtifact,
      task_data: restoredTask.data,
      updated_at: restoredTask.updatedAt,
    };
    const decision = prdCompletionAttestationDecision({
      goal: {
        ...validationGoal,
        status: 'needs_human',
        data: {
          ...(validationGoal.data || {}),
          prd_quality_attestation: repairRegression.priorAttestation,
        },
      },
      artifact: repairRegression.priorArtifact,
      attestation: repairRegression.priorAttestation,
      threshold: repairRegression.priorAttestation.threshold ?? threshold,
    });
    return {
      applicable: true,
      allowed: false,
      reused: false,
      regressed: true,
      candidate: restoredCandidate,
      artifact: repairRegression.priorArtifact,
      attestation: repairRegression.priorAttestation,
      attemptedAttestation: attestation,
      decision,
      goalStatus: finalized.status || 'needs_human',
    };
  }

  const criticCompleted = attestation.semantic.status === 'completed';
  const canAutoRepair =
    attestation.status === 'failed' &&
    selected.length === 1 &&
    repairAttempts < 1 &&
    criticCompleted &&
    Boolean(candidate?.id) &&
    attestation.repair.strategy !== 'none';
  const nextGoalStatus =
    attestation.status === 'failed' && !canAutoRepair ? 'needs_human' : 'pending_validation';
  let persistedGoalStatus = nextGoalStatus;
  attestation.repair = {
    ...attestation.repair,
    task_id: candidate?.id || null,
    status: canAutoRepair
      ? 'queued'
      : attestation.status === 'failed'
        ? 'needs_human'
        : 'not_needed',
    attempt: canAutoRepair ? repairAttempts + 1 : repairAttempts,
    max_attempts: 1,
  };

  if (candidate && selected.length === 1) {
    const taskScorePersisted = await updateAttestedTaskScore(admin, candidate, attestation);
    if (!taskScorePersisted) {
      return releaseSupersededReservation(
        admin,
        reserved,
        candidate,
        artifact,
        'final_task_changed_during_validation'
      );
    }
  }

  // Tracked critic usage updates the goal's token/cost rollups while this
  // reservation is running. Reload that exact reserved row before the final
  // CAS so the usage write neither invalidates validation nor gets overwritten
  // by the pre-critic goal.data snapshot.
  let currentReservedGoal = validationGoal;
  try {
    currentReservedGoal = await loadGoal(admin, validationGoal.id);
  } catch {
    // The reservation id + status predicates below still fail closed if the
    // row cannot safely be finalized from the last known snapshot.
  }
  const finalizationReservation = { ...reserved, goal: currentReservedGoal };
  const finalized = await finalizeReservedValidation(admin, finalizationReservation, {
    status: nextGoalStatus,
    data: {
      ...(currentReservedGoal.data || {}),
      prd_quality_attestation: attestation,
      prd_quality_validation: {
        version: 1,
        deliverable_profile: deliverableProfile,
        status: attestation.status,
        reservation_id: reserved.reservationId,
        artifact_hash: attestation.artifact_hash,
        scope_hash: attestation.scope_hash,
        threshold,
        started_at: startedAt,
        completed_at: completedAt,
      },
      ...(attestation.status === 'failed'
        ? { prd_quality_repair: attestation.repair }
        : { prd_quality_repair: null }),
      ...(nextGoalStatus === 'needs_human'
        ? {
            failure_reason: `The ${prdProfile ? 'strict PRD' : 'AxWise-governed deliverable'} did not pass its quality attestation after the available automatic repair.`,
            recovery_action: `Review the quality blockers, revise the final ${prdProfile ? 'PRD' : 'deliverable'}, then retry completion.`,
          }
        : {}),
    },
  });
  if (!finalized) {
    return supersededValidationResult(
      admin,
      validationGoal,
      candidate,
      artifact,
      'goal_changed_during_validation'
    );
  }
  persistedGoalStatus = finalized.status || nextGoalStatus;
  await logGoalEvent(
    admin,
    validationGoal.id,
    attestation.status === 'passed' ? 'prd_quality_attested' : 'prd_quality_validation_failed',
    {
      status: attestation.status,
      score: attestation.score,
      semantic_score: attestation.semantic_score,
      structural_score: attestation.structural_score,
      threshold: attestation.threshold,
      artifact_hash: attestation.artifact_hash,
      scope_hash: attestation.scope_hash,
      blockers: attestation.blockers.slice(0, 8),
      repair: attestation.repair,
      deliverable_profile: deliverableProfile,
    }
  );

  if (canAutoRepair) {
    try {
      await enqueueGoalAction(admin, 'prd-quality-repair', validationGoal.id, {
        artifactHash: attestation.artifact_hash,
        scopeHash: attestation.scope_hash,
      });
    } catch (error) {
      persistedGoalStatus = 'needs_human';
      attestation.repair.status = 'needs_human';
      attestation.repair.enqueue_error = error.message;
      const enqueueFailure = await casGoalRow(admin, finalized, {
        status: 'needs_human',
        data: {
          ...(finalized.data || {}),
          prd_quality_attestation: attestation,
          prd_quality_validation: {
            version: 1,
            deliverable_profile: deliverableProfile,
            status: 'needs_human',
            artifact_hash: attestation.artifact_hash,
            scope_hash: attestation.scope_hash,
            threshold,
            started_at: startedAt,
            completed_at: completedAt,
          },
          prd_quality_repair: attestation.repair,
          failure_reason: `The ${prdProfile ? 'strict PRD' : 'AxWise deliverable'} repair could not be queued: ${error.message}`,
          recovery_action: 'Retry the goal after the worker queue is available.',
        },
      });
      if (!enqueueFailure) {
        return supersededValidationResult(
          admin,
          validationGoal,
          candidate,
          artifact,
          'goal_changed_after_validation'
        );
      }
      log.warn(req, 'goal.prd-quality.repair-enqueue-failed', {
        goalId: validationGoal.id,
        error: error.message,
      });
    }
  }

  const decision = prdCompletionAttestationDecision({
    goal: {
      ...validationGoal,
      data: { ...(validationGoal.data || {}), prd_quality_attestation: attestation },
    },
    artifact,
    attestation,
    threshold,
  });
  return {
    applicable: true,
    allowed: decision.allowed,
    reused: false,
    candidate,
    artifact,
    attestation,
    decision,
    goalStatus: persistedGoalStatus,
    deliverableProfile,
  };
}
