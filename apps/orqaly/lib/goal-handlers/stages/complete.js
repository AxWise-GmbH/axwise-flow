/**
 * Stage 7d: Complete Goal
 *
 * Updates project status, generates final report to KB,
 * marks goal completed, and notifies the user.
 *
 * Extracted from goal-orchestrator.js — preserves original behavior.
 */
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { orgScopeFromGoal } from '../../_shared/kb-scope.js';
import { resolveAcceptedNativeGoalAuthority } from '../../_shared/native-goal-authority.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  notifyGoalEvent,
  enqueueGoalAction,
} from '../_helpers.js';
import { archiveGoalMessages } from '../goal-messaging.js';
import { maybeSpawnContinuation } from '../loop-continuation.js';
import { indexCompletedGoal } from '../../memory/index-goal.js';
import { reportOrEnqueueGoalOutcome } from '../../integrations/axwise/outcome-delivery.js';
import { resolveGoalStageLlm } from '../goal-stage-llm.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import {
  currentGoalDocuments,
  goalDocumentAttemptMetadata,
} from '../../_shared/goal-document-attempt.js';
import {
  QUALITY_DELIVERABLE_PROFILES,
  isPrdDeliverableProfile,
  isQualityGateApplicableGoal,
  isStrictPrdQualityGoal,
  prdArtifactHash,
  prdCompletionAttestationDecision,
  resolveCanonicalPrdQualityContext,
  resolveDeliverableProfile,
} from '../../quality/prd-quality-gate.js';
import {
  ensureStrictPrdCompletionAttestation,
  loadStrictPrdCandidates,
} from './prd-quality-validation.js';

const log = createLogger('goal-stage:complete');

const EXPLICIT_CODE_FENCE_RE =
  /```(?:javascript|js|typescript|ts|tsx|jsx|python|py|bash|sh|shell|sql|html|css|scss|json|yaml|yml|xml|java|go|rust|ruby|php|c|cpp|csharp)\b/i;

export function isCodeDeliverable(output, deliverableType) {
  const type = String(deliverableType || '').toLowerCase();
  return type === 'code' || type === 'repo' || EXPLICIT_CODE_FENCE_RE.test(String(output || ''));
}

const FINAL_MARKDOWN_TASK_TITLE =
  /^(?:compil(?:e|ing)|consolidat(?:e|ion)|synthesi[sz](?:e|ing|s)|assemble|final(?:i[sz]e|\b)|latest\b|author\s+(?:the\s+)?(?:full|complete|final)|deliver\s+(?:the\s+)?(?:complete|final|master)|.+\b(?:final|master|synthesis)\b)/i;

export function singleMarkdownArtifactContract(goal) {
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  const text = nativeAuthority.native ? '' : `${goal?.title || ''}\n${goal?.description || ''}`;
  const canonical = resolveCanonicalPrdQualityContext(goal);
  const canonicalDeliverable = canonical.scope_packet?.deliverable;
  const canonicalPresentation = String(canonicalDeliverable?.presentation || '').toLowerCase();
  const canonicalType = String(canonicalDeliverable?.type || '').toLowerCase();
  const canonicalOneMarkdown =
    isQualityGateApplicableGoal(goal, null, canonical) &&
    Number(canonicalDeliverable?.count) === 1 &&
    (['markdown_artifact', 'artifact_only'].includes(canonicalPresentation) ||
      (!canonicalPresentation &&
        /(?:markdown|document|report|brief|plan|summary)/i.test(canonicalType)));
  const required =
    isStrictPrdQualityGoal(goal) ||
    canonicalOneMarkdown ||
    /\b(?:exactly|only)\s+one\s+(?:self-contained\s+)?markdown\s+(?:file|document)\b/i.test(text) ||
    /\bas\s+one\s+markdown\s+file\b/i.test(text);
  const prefixMatch = text.match(/\bbeginning exactly\s+[“"']([^”"'\n]+)[”"']/i);
  return {
    required,
    requiredPrefix: nativeAuthority.native
      ? String(canonicalDeliverable?.title_prefix || '').trim() || null
      : prefixMatch?.[1]?.trim() || null,
  };
}

/** Keep specialist notes internal when the user explicitly requested one file. */
export function selectCompletionDeliverables(goal, deliverables) {
  const contract = singleMarkdownArtifactContract(goal);
  if (!contract.required || !Array.isArray(deliverables) || deliverables.length <= 1) {
    return deliverables;
  }

  const candidates = completionDeliverableCandidates(goal, deliverables);
  if (!candidates.length) return deliverables;

  return [
    candidates.toSorted(
      (a, b) =>
        Number(
          Boolean(contract.requiredPrefix) &&
            String(b?.output || '')
              .trimStart()
              .startsWith(contract.requiredPrefix)
        ) -
          Number(
            Boolean(contract.requiredPrefix) &&
              String(a?.output || '')
                .trimStart()
                .startsWith(contract.requiredPrefix)
          ) ||
        Number(FINAL_MARKDOWN_TASK_TITLE.test(String(b?.title || ''))) -
          Number(FINAL_MARKDOWN_TASK_TITLE.test(String(a?.title || ''))) ||
        Number(b?.phase_index || 0) - Number(a?.phase_index || 0) ||
        String(b?.output || '').length - String(a?.output || '').length ||
        String(a?.id || '').localeCompare(String(b?.id || ''))
    )[0],
  ];
}

/**
 * Return the exposed final-artifact identity set before the one-file selector
 * chooses a winner. Specialist notes from earlier phases remain internal, but
 * two final candidates in the same canonical slot remain visible to the
 * completion guard instead of being silently collapsed to one.
 */
export function completionDeliverableCandidates(goal, deliverables) {
  const contract = singleMarkdownArtifactContract(goal);
  if (!contract.required || !Array.isArray(deliverables) || deliverables.length <= 1) {
    return Array.isArray(deliverables) ? deliverables : [];
  }

  const markdown = deliverables.filter(
    (item) => String(item?.deliverable_type || 'markdown').toLowerCase() === 'markdown'
  );
  const exact = contract.requiredPrefix
    ? markdown.filter((item) =>
        String(item?.output || '')
          .trimStart()
          .startsWith(contract.requiredPrefix)
      )
    : [];
  const explicitlyFinal = markdown.filter((item) =>
    FINAL_MARKDOWN_TASK_TITLE.test(String(item?.title || ''))
  );
  const phaseIndexes = markdown.map((item) => Number(item?.phase_index)).filter(Number.isFinite);
  const finalPhaseIndex = phaseIndexes.length ? Math.max(...phaseIndexes) : null;
  const sameFinalPhase =
    finalPhaseIndex === null
      ? []
      : markdown.filter((item) => Number(item?.phase_index) === finalPhaseIndex);

  // Selection may still prefer the exact-prefix artifact, but the count guard
  // must see every candidate that independently claims the canonical final
  // slot. Otherwise one exact artifact can hide a concurrent/malformed final
  // task merely because that duplicate missed the required prefix.
  const candidateSet = new Set([...exact, ...explicitlyFinal, ...sameFinalPhase]);
  return candidateSet.size ? markdown.filter((item) => candidateSet.has(item)) : markdown;
}

export function completionCandidateIdentitySet(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      id: candidate?.id == null ? null : String(candidate.id),
      artifact_hash: prdArtifactHash(candidate?.output || ''),
    }))
    .toSorted(
      (left, right) =>
        String(left.id || '').localeCompare(String(right.id || '')) ||
        left.artifact_hash.localeCompare(right.artifact_hash)
    );
}

/**
 * Bind the exact terminal quality candidate into the user-facing deliverable
 * shape. Metadata from the earlier task read is reused only when it names the
 * same immutable candidate bytes; otherwise the display record is rebuilt
 * from the candidate that the terminal RPC will freeze.
 */
export function bindQualityCompletionDeliverable(candidate, existingDeliverables = []) {
  const candidateId = candidate?.id == null ? '' : String(candidate.id);
  const output = String(candidate?.output || '');
  if (!candidateId || !output.trim()) return null;

  const artifactHash = prdArtifactHash(output);
  const existing = (Array.isArray(existingDeliverables) ? existingDeliverables : []).find(
    (deliverable) =>
      String(deliverable?.id || '') === candidateId &&
      prdArtifactHash(deliverable?.output || '') === artifactHash
  );
  const taskData = candidate.task_data || {};
  const toolLog = Array.isArray(taskData.toolLog) ? taskData.toolLog : [];
  const deliverableType = candidate.deliverable_type || taskData.deliverable_type || 'markdown';

  return {
    category: 'general',
    categoryIcon: '📄',
    categoryLabel: 'Document',
    agent_name: null,
    agent_id: null,
    urls: [],
    primary_url: null,
    has_url: false,
    tools_used: toolLog.length,
    tool_names: toolLog.map((item) => item.name || item.tool || 'unknown').slice(0, 10),
    ...existing,
    id: candidateId,
    title: candidate.title || existing?.title || 'Final deliverable',
    quality_score: candidate.quality_score ?? taskData.quality_score ?? null,
    quality_score_kind: candidate.quality_score_kind || taskData.quality_score_kind || 'structural',
    task_description: taskData.description || candidate.title || 'Final deliverable',
    required_role: taskData.required_role || null,
    acceptance_criteria: taskData.acceptance_criteria || [],
    output,
    output_preview: output.slice(0, 300),
    artifact_hash: artifactHash,
    cost: taskData.llmCost,
    phase_index: candidate.phase_index ?? taskData.phase_index,
    has_code: isCodeDeliverable(output, deliverableType),
    created_at: taskData.executedAt || null,
    updated_at: candidate.updated_at || null,
    deliverable_type: deliverableType,
  };
}

export function finalCompletionArtifactDecision({
  goal,
  candidates,
  attestedCandidates = null,
  attestedCandidate,
  attestation,
}) {
  const exposedCandidates = completionDeliverableCandidates(goal, candidates);
  const selectedCandidates = selectCompletionDeliverables(goal, candidates) || [];
  const currentCandidate = selectedCandidates[0] || null;
  const canonicalCount = Number(
    resolveCanonicalPrdQualityContext(goal).scope_packet?.deliverable?.count
  );
  const expectedCount =
    Number.isInteger(canonicalCount) && canonicalCount > 0
      ? canonicalCount
      : singleMarkdownArtifactContract(goal).required
        ? 1
        : null;
  const reasons = [];
  const currentCandidateSet = completionCandidateIdentitySet(candidates);
  if (Array.isArray(attestedCandidates)) {
    if (attestedCandidates.length !== currentCandidateSet.length) {
      reasons.push('completion_done_candidate_count_changed');
    } else if (JSON.stringify(attestedCandidates) !== JSON.stringify(currentCandidateSet)) {
      reasons.push('completion_done_candidate_identity_changed');
    }
  }
  if (expectedCount !== null && exposedCandidates.length !== expectedCount) {
    reasons.push('completion_artifact_count_changed');
  }
  const attestedCandidateId = attestedCandidate?.id || attestation?.repair?.task_id || null;
  if (
    attestedCandidateId &&
    currentCandidate?.id &&
    String(attestedCandidateId) !== String(currentCandidate.id)
  ) {
    reasons.push('completion_artifact_identity_changed');
  }
  const artifactHash = prdArtifactHash(currentCandidate?.output || '');
  if (attestation?.artifact_hash && attestation.artifact_hash !== artifactHash) {
    reasons.push('completion_artifact_hash_changed');
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    expected_count: expectedCount,
    current_count: exposedCandidates.length,
    candidate_id: currentCandidate?.id || null,
    artifact_hash: artifactHash,
    attested_candidate_set: attestedCandidates,
    current_candidate_set: currentCandidateSet,
    selectedCandidates,
    exposedCandidates,
  };
}

export function shouldEnqueuePostCompletionOsjaReview({
  qualityApplicable = false,
  goalCost = 0,
  minimumCost = 0,
} = {}) {
  return !qualityApplicable && Number(goalCost) >= Number(minimumCost);
}

function persistedDeliverableProfile(attestation) {
  return attestation?.deliverable_profile || QUALITY_DELIVERABLE_PROFILES.GENERIC_PRD;
}

export function strictPrdRetrospective(attestation, phases = []) {
  const completedPhases = phases.filter((phase) => phase.status === 'completed').length;
  const failedPhases = phases.filter((phase) => phase.status === 'failed').length;
  if (!isPrdDeliverableProfile(persistedDeliverableProfile(attestation))) {
    return {
      source: 'prd_quality_attestation',
      what_worked: `The exact deliverable passed its canonical AxWise quality attestation at ${attestation.score}/${attestation.threshold}.`,
      what_failed:
        failedPhases > 0
          ? `${failedPhases} execution phase(s) failed before the attested deliverable was completed.`
          : 'No quality-attestation blocker remained at completion.',
      cost_analysis:
        'No extra retrospective model call was made; the final deliverable and its attestation are the handoff record.',
      agent_performance: `${completedPhases}/${phases.length} phases completed before final attestation.`,
      lessons_learned:
        attestation.open_decision_count > 0
          ? `${attestation.open_decision_count} explicitly open decision(s) remain visible for follow-up.`
          : 'The deliverable closed without an explicitly open decision.',
      efficiency_score: attestation.score,
    };
  }
  return {
    source: 'prd_quality_attestation',
    what_worked: `The exact PRD artifact passed at ${attestation.score}/${attestation.threshold} with ${attestation.requirement_count} traced requirements, ${attestation.linked_test_count} linked tests, and ${attestation.section_count} sections.`,
    what_failed:
      failedPhases > 0
        ? `${failedPhases} execution phase(s) failed before the attested artifact was completed.`
        : 'No attestation blocker remained at completion.',
    cost_analysis:
      'No extra retrospective model call was made; the final PRD and its attestation are the handoff record.',
    agent_performance: `${completedPhases}/${phases.length} phases completed before final attestation.`,
    lessons_learned:
      attestation.open_decision_count > 0
        ? `${attestation.open_decision_count} explicitly open decision(s) remain visible for implementation planning.`
        : 'The PRD closed without an explicitly open decision.',
    efficiency_score: attestation.score,
  };
}

export function strictPrdOverviewBody(goal, deliverables, attestation) {
  if (!isPrdDeliverableProfile(persistedDeliverableProfile(attestation))) {
    const openDecisionNote =
      attestation.open_decision_count > 0
        ? `${attestation.open_decision_count} open decision(s) remain explicitly recorded in the deliverable.`
        : 'No explicitly open decision remains in the attested deliverable.';
    return {
      tagline: 'Attested Deliverable',
      one_liner: `${goal.title} — exact-artifact quality ${attestation.score}/100.`,
      summary: `The final deliverable passed deterministic and semantic validation against its canonical AxWise scope and bound artifact hashes. ${openDecisionNote}`,
      objectives_met: [
        `Bound one final deliverable to scope ${attestation.scope_hash.slice(0, 12)}…`,
        `Passed the ${attestation.threshold}/100 quality threshold at ${attestation.score}/100.`,
        'Validated the applicable boundary, authorization, tenancy, hash, and factuality invariants.',
      ],
      deliverables: (deliverables || []).map((item) => ({
        type: 'report',
        title: item.title,
        url: item.primary_url || null,
        description: `Attested deliverable (${attestation.artifact_hash.slice(0, 12)}…).`,
      })),
      next_steps: [
        ...(attestation.open_decision_count > 0
          ? ['Resolve the explicitly open decisions before affected follow-up work.']
          : []),
        'Use the attested deliverable as the canonical handoff for the approved work.',
        'Keep the scope and artifact hashes with any authorized execution evidence.',
      ],
      risks_or_gaps:
        attestation.open_decision_count > 0
          ? [`${attestation.open_decision_count} open decision(s) require owner resolution.`]
          : [],
      tech_stack: { frontend: null, backend: null, database: null, hosting: null, other: [] },
      design_notes: {
        principles: ['Use the attested deliverable as the canonical work contract.'],
        target_devices: [],
        ux_considerations: [],
      },
      roadmap: [
        {
          title: 'Resolve open decisions',
          description:
            attestation.open_decision_count > 0
              ? 'Assign an owner and record each decision before dependent work begins.'
              : 'No open decision is currently recorded; keep material decisions explicit if scope changes.',
          impact: 'high',
          effort: 'small',
          category: 'operations',
          timeframe: 'before follow-up execution',
        },
        {
          title: 'Execute the approved handoff',
          description:
            'Follow the canonical deliverable and preserve authorization evidence for any requested external action.',
          impact: 'high',
          effort: 'medium',
          category: 'operations',
          timeframe: 'next phase',
        },
      ],
    };
  }
  const openDecisionNote =
    attestation.open_decision_count > 0
      ? `${attestation.open_decision_count} open decision(s) remain explicitly recorded in the PRD.`
      : 'No explicitly open decision remains in the attested artifact.';
  return {
    tagline: 'Attested PRD',
    one_liner: `${goal.title} — exact-artifact quality ${attestation.score}/100.`,
    summary: `The final implementation PRD passed deterministic and semantic validation against its bound scope and artifact hashes. It traces ${attestation.requirement_count} requirements to ${attestation.linked_test_count} acceptance tests across ${attestation.section_count} sections. ${openDecisionNote}`,
    objectives_met: [
      `Bound one final Markdown artifact to scope ${attestation.scope_hash.slice(0, 12)}…`,
      `Passed the ${attestation.threshold}/100 strict quality threshold at ${attestation.score}/100.`,
      `Linked ${attestation.linked_test_count} acceptance tests to normative requirements.`,
    ],
    deliverables: (deliverables || []).map((item) => ({
      type: 'report',
      title: item.title,
      url: item.primary_url || null,
      description: `Attested Markdown PRD (${attestation.artifact_hash.slice(0, 12)}…).`,
    })),
    next_steps: [
      ...(attestation.open_decision_count > 0
        ? ['Resolve the explicitly open decisions before implementing affected requirements.']
        : []),
      'Implement against the traced requirement and acceptance-test IDs in the PRD.',
      'Keep the scope and artifact hashes with the engineering handoff.',
    ],
    risks_or_gaps:
      attestation.open_decision_count > 0
        ? [`${attestation.open_decision_count} open decision(s) require owner resolution.`]
        : [],
    tech_stack: { frontend: null, backend: null, database: null, hosting: null, other: [] },
    design_notes: {
      principles: ['Use the attested PRD as the canonical implementation contract.'],
      target_devices: [],
      ux_considerations: [],
    },
    roadmap: [
      {
        title: 'Resolve open PRD decisions',
        description:
          attestation.open_decision_count > 0
            ? 'Assign an owner and record a decision against each open ID before its dependent implementation begins.'
            : 'No open decision is currently recorded; keep decision IDs explicit if scope changes.',
        impact: 'high',
        effort: 'small',
        category: 'product',
        timeframe: 'before implementation',
      },
      {
        title: 'Implement traced acceptance slices',
        description:
          'Deliver requirement-to-test slices in the order defined by the PRD and preserve the IDs in code and test evidence.',
        impact: 'high',
        effort: 'large',
        category: 'technical',
        timeframe: 'implementation',
      },
    ],
  };
}

export async function updateStrictPrdSnapshot(
  admin,
  snapshot,
  updates,
  expectedStatus = snapshot.status
) {
  if (!Number.isSafeInteger(snapshot?.row_version) || snapshot.row_version < 0) {
    throw new Error('Attested-deliverable state transition requires an integer goal row_version');
  }
  const updatedAt = new Date().toISOString();
  let query = admin
    .from('goals')
    .update({ ...updates, updated_at: updatedAt })
    .eq('id', snapshot.id)
    .eq('status', expectedStatus)
    .eq('row_version', snapshot.row_version);
  if (snapshot.updated_at) query = query.eq('updated_at', snapshot.updated_at);
  const { data, error } = await query
    .select('id, status, data, updated_at, row_version')
    .maybeSingle();
  if (error) throw new Error(`Attested-deliverable state transition failed: ${error.message}`);
  return data || null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function completedQualityGoalMatches(goal, snapshot, completionUpdates) {
  return (
    goal?.id === snapshot.id &&
    goal.status === 'completed' &&
    Number.isSafeInteger(goal.row_version) &&
    goal.row_version === snapshot.row_version + 1 &&
    canonicalJson(goal.data ?? null) === canonicalJson(completionUpdates.data ?? null) &&
    canonicalJson(goal.retrospective ?? null) ===
      canonicalJson(completionUpdates.retrospective ?? null)
  );
}

/**
 * Atomically freeze and complete an attested quality deliverable. The database
 * owns the final CAS and artifact re-check; this client helper deliberately has
 * no direct-update fallback because a partial completion would make the
 * attestation mutable again.
 */
export async function completeQualityGoalRevision(
  admin,
  {
    snapshot,
    completionUpdates,
    completionUpdatedAt,
    candidateId,
    candidateArtifact,
    candidateSet,
    attestation,
  }
) {
  if (!Number.isSafeInteger(snapshot?.row_version) || snapshot.row_version < 0) {
    throw new Error('Atomic quality completion requires an integer goal row_version');
  }

  const { data, error } = await admin.rpc('complete_quality_goal_revision', {
    p_goal_id: snapshot.id,
    p_user_id: snapshot.user_id,
    p_expected_status: 'pending_validation',
    p_expected_updated_at: snapshot.updated_at,
    p_expected_row_version: snapshot.row_version,
    p_expected_data: snapshot.data ?? null,
    p_expected_plan: snapshot.plan ?? null,
    p_completion_data: completionUpdates.data,
    p_completion_retrospective: completionUpdates.retrospective ?? null,
    p_completion_updated_at: completionUpdatedAt,
    p_candidate_id: candidateId,
    p_candidate_artifact: candidateArtifact,
    p_candidate_set: candidateSet,
    p_attestation: attestation,
  });
  if (error) {
    // The request may have committed before its HTTP response was lost. Adopt
    // only the exact frozen completion; any ambiguity remains a hard failure
    // and is retried by the worker without a direct-update escape hatch.
    try {
      const committedGoal = await loadGoal(admin, snapshot.id);
      if (completedQualityGoalMatches(committedGoal, snapshot, completionUpdates)) {
        return {
          status: 'already_completed',
          goal: committedGoal,
          recovered_from_rpc_error: true,
        };
      }
    } catch {
      // Preserve the original RPC failure below when the recovery read fails.
    }
    throw new Error(`Atomic attested-deliverable completion failed: ${error.message}`);
  }

  const result = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (!['completed', 'already_completed', 'conflict'].includes(result?.status)) {
    throw new Error('Atomic attested-deliverable completion returned an invalid result');
  }
  if (
    result.status !== 'conflict' &&
    !completedQualityGoalMatches(result.goal, snapshot, completionUpdates)
  ) {
    throw new Error('Atomic attested-deliverable completion returned an invalid goal snapshot');
  }
  return result;
}

export async function handle(admin, payload, req) {
  const latestGoal = await loadGoal(admin, payload.goalId);
  const completionAuthority = resolveAcceptedNativeGoalAuthority(latestGoal);
  if (completionAuthority.native && !completionAuthority.ready) {
    return {
      type: 'orchestrate-goal',
      action: 'complete',
      goalId: latestGoal.id,
      status: 'native_scope_blocked',
      reasons: completionAuthority.reasons,
    };
  }
  const completionGoalLabel = completionAuthority.native
    ? completionAuthority.packet.intent?.objective ||
      completionAuthority.packet.deliverable?.title_prefix ||
      'Accepted native goal'
    : latestGoal.title;
  const completionGoalDescription = completionAuthority.native
    ? completionAuthority.packet.intent?.desired_outcome || ''
    : latestGoal.description || '';
  const completionStrategy = completionAuthority.native
    ? 'Execute the accepted AxWise scope through the current materialization attempt.'
    : latestGoal.plan?.strategy || 'N/A';
  const phases = latestGoal.plan?.phases || [];
  let goalData = latestGoal.data || {};

  // ── Pipeline-drift guard ──
  // Refuse to mark a goal "completed" if no real work ran. Previously,
  // execute-phase.js:22 would enqueue `complete` whenever phaseIndex >=
  // phases.length — which is trivially true when phases.length === 0
  // (feasibility paused pre-planning, resume drift, etc). The goal would
  // then be stamped completed with zero deliverables, empty pipeline tab,
  // and $0.00 cost. Now we fail-fast with a clear reason instead.
  const hasAnyExecutedPhase = phases.some(
    (p) =>
      p.status === 'completed' ||
      p.status === 'done' ||
      p.status === 'passed' ||
      p.status === 'failed'
  );
  if (phases.length === 0 || !hasAnyExecutedPhase) {
    log.warn(req, 'goal.complete.refused-empty-pipeline', {
      goalId: latestGoal.id,
      phaseCount: phases.length,
      phaseStatuses: phases.map((p) => p.status),
    });
    await updateGoal(admin, latestGoal.id, {
      status: 'failed',
      data: {
        ...(latestGoal.data || {}),
        failure_reason: `Completion triggered without any executed phases — pipeline drift. Phase count: ${phases.length}. This usually means feasibility paused the goal pre-planning and the resume path didn't restart pm-planning. Retry the goal to run the pipeline from scratch.`,
        failed_at: new Date().toISOString(),
      },
    });
    await logGoalEvent(admin, latestGoal.id, 'goal_failed', {
      reason: 'pipeline_drift_empty_complete',
      phaseCount: phases.length,
    });
    return {
      type: 'orchestrate-goal',
      action: 'complete',
      goalId: latestGoal.id,
      status: 'refused_empty',
      phaseCount: phases.length,
    };
  }

  // ── Failed-subtask gate ──
  // The completion path historically swallowed failed children: a goal with
  // task-1c1 'Build Landing Page' status=failed AND empty output would still
  // mark the parent goal status=completed. The frontend then showed a
  // 'completed' badge with no real deliverable.
  // We surface the failure count in goal.data.failed_task_count so the UI
  // can warn, and we tag the goal-report so retrospectives are honest.
  // We do NOT block completion at this stage — the pipeline has already
  // moved through every other phase, and reverting here would deadlock.
  // Future fix: gate this earlier in evaluate-phase or iterate so a phase
  // can't move to 'complete' until all tasks are done or explicitly skipped.
  let failedTaskCount = 0;
  let failedTaskTitles = [];
  try {
    const { data: failedTasks } = await admin
      .from('team_tasks')
      .select('id, title, status, materialization_attempt, data')
      .eq('goal_id', latestGoal.id)
      .eq('user_id', latestGoal.user_id)
      .eq('status', 'failed');
    const currentFailedTasks = currentGoalTaskAttempt(latestGoal, failedTasks || []);
    if (currentFailedTasks.length) {
      failedTaskCount = currentFailedTasks.length;
      failedTaskTitles = currentFailedTasks.map((t) => t.title).slice(0, 10);
      log.warn(req, 'goal.complete.failed-tasks-detected', {
        goalId: latestGoal.id,
        failedTaskCount,
        failedTaskTitles,
      });
      const existingData = latestGoal.data ?? {};
      const updatedData = {
        ...existingData,
        failed_task_count: failedTaskCount,
        failed_task_titles: failedTaskTitles,
        completion_quality_warning: `${failedTaskCount} subtask(s) failed before completion. Real deliverable coverage may be incomplete.`,
      };
      await updateGoal(admin, latestGoal.id, { data: updatedData });
      // refresh the in-memory copy so the rest of this function sees the warning
      latestGoal.data = updatedData;
    }
  } catch (failedCheckErr) {
    log.warn(req, 'goal.complete.failed-task-check-error', { error: failedCheckErr.message });
  }

  // The failed-task annotation above may itself advance updated_at. Refresh
  // quality-gated deliverables before acquiring the validation CAS reservation so the
  // reservation reflects the exact current goal row instead of the initial
  // completion-job snapshot.
  if (isQualityGateApplicableGoal(latestGoal)) {
    Object.assign(latestGoal, await loadGoal(admin, latestGoal.id));
    goalData = latestGoal.data || goalData;
  }

  // Applicable PRDs and canonical AxWise textual deliverables remain visibly
  // pending until deterministic and semantic checks attest the exact artifact
  // and approved scope. Unrelated workflows and unsupported modalities bypass.
  let attestedCompletionCandidates = null;
  let selectedValidationCandidates = null;
  if (isQualityGateApplicableGoal(latestGoal)) {
    const allValidationCandidates = await loadStrictPrdCandidates(
      admin,
      latestGoal,
      (_goal, candidates) => candidates
    );
    attestedCompletionCandidates = completionCandidateIdentitySet(allValidationCandidates);
    selectedValidationCandidates = selectCompletionDeliverables(
      latestGoal,
      allValidationCandidates
    );
  }
  const prdValidation = await ensureStrictPrdCompletionAttestation(admin, latestGoal, {
    req,
    ...(Array.isArray(selectedValidationCandidates)
      ? { candidates: selectedValidationCandidates }
      : { selectDeliverables: selectCompletionDeliverables }),
  });
  const qualityDeliverableProfile =
    prdValidation.deliverableProfile ||
    prdValidation.attestation?.deliverable_profile ||
    resolveDeliverableProfile(latestGoal);
  const qualityProfileIsPrd = isPrdDeliverableProfile(qualityDeliverableProfile);
  if (prdValidation.applicable && prdValidation.superseded) {
    return {
      type: 'orchestrate-goal',
      action: 'complete',
      goalId: latestGoal.id,
      status: prdValidation.goalStatus || 'state_changed',
      reasons: prdValidation.decision?.reasons || ['validation_superseded'],
    };
  }
  if (prdValidation.applicable) {
    goalData = {
      ...(latestGoal.data || {}),
      prd_quality_attestation: prdValidation.attestation,
      prd_quality_validation: {
        version: 1,
        deliverable_profile: qualityDeliverableProfile,
        status: prdValidation.attestation.status,
        artifact_hash: prdValidation.attestation.artifact_hash,
        scope_hash: prdValidation.attestation.scope_hash,
        threshold: prdValidation.attestation.threshold,
        completed_at: prdValidation.attestation.generated_at,
      },
      ...(prdValidation.attestation.status === 'failed'
        ? { prd_quality_repair: prdValidation.attestation.repair }
        : { prd_quality_repair: null }),
    };
    latestGoal.data = goalData;
    latestGoal.status =
      prdValidation.goalStatus === 'needs_human' ? 'needs_human' : 'pending_validation';

    if (!prdValidation.allowed) {
      log.warn(req, 'goal.complete.refused-prd-quality', {
        goalId: latestGoal.id,
        score: prdValidation.attestation.score,
        threshold: prdValidation.attestation.threshold,
        reasons: prdValidation.decision.reasons,
      });
      return {
        type: 'orchestrate-goal',
        action: 'complete',
        goalId: latestGoal.id,
        status: latestGoal.status,
        quality_attestation: {
          deliverable_profile: qualityDeliverableProfile,
          status: prdValidation.attestation.status,
          score: prdValidation.attestation.score,
          semantic_score: prdValidation.attestation.semantic_score,
          structural_score: prdValidation.attestation.structural_score,
          threshold: prdValidation.attestation.threshold,
          requirement_count: prdValidation.attestation.requirement_count,
          linked_test_count: prdValidation.attestation.linked_test_count,
          section_count: prdValidation.attestation.section_count,
          open_decision_count: prdValidation.attestation.open_decision_count,
          artifact_hash: prdValidation.attestation.artifact_hash,
          scope_hash: prdValidation.attestation.scope_hash,
        },
        repair: prdValidation.attestation.repair,
      };
    }
  }

  // Generate final report → KB
  try {
    const phaseSummaries = phases
      .map((p, i) => {
        const pc = (goalData.phase_costs || {})[i] || {};
        return `## Phase ${i + 1}: ${completionAuthority.native ? `Accepted work phase ${i + 1}` : p.name}\n- Status: ${p.status}\n- Duration: ${p.duration_ms ? `${Math.round(p.duration_ms / 60000)}min` : 'N/A'}\n- Quality: ${p.quality_score || 'N/A'}/100\n- Cost: $${(pc.total || 0).toFixed(4)}\n- Tasks: ${pc.tasks_completed || 0}/${pc.tasks_total || 0}`;
      })
      .join('\n\n');

    const report = [
      `# Goal Report: ${completionGoalLabel}`,
      `**Strategy:** ${completionStrategy}`,
      `**Status:** Completed`,
      `**Total Cost:** $${Number(latestGoal.spent_usd || 0).toFixed(4)}`,
      `**Budget:** $${Number(latestGoal.budget_usd || 0).toFixed(4)}`,
      `**Iterations:** ${latestGoal.iteration}`,
      `**Confidence:** ${latestGoal.confidence_score || 'N/A'}%`,
      '',
      phaseSummaries,
      '',
      '## Financial Summary',
      `- Budget: $${Number(latestGoal.budget_usd || 0).toFixed(2)}`,
      `- Spent: $${Number(latestGoal.spent_usd || 0).toFixed(2)}`,
      `- Remaining: $${(Number(latestGoal.budget_usd || 0) - Number(latestGoal.spent_usd || 0)).toFixed(2)}`,
    ].join('\n');

    await admin.from('knowledge_documents').insert({
      user_id: latestGoal.user_id,
      title: `Final Report: ${completionGoalLabel}`,
      content: report,
      source: 'goal-orchestrator',
      category: 'goal-report',
      owner_type: 'user',
      owner_id: latestGoal.user_id,
      content_type: 'note',
      tags: ['goal', 'report', 'final'],
      is_pinned: true,
      metadata: {
        goal_id: latestGoal.id,
        ...goalDocumentAttemptMetadata(latestGoal),
        project_id: latestGoal.project_id,
        total_cost: Number(latestGoal.spent_usd || 0),
      },
      ...orgScopeFromGoal(latestGoal),
    });
  } catch (err) {
    log.warn(req, 'goal.report.failed', { error: err.message });
  }

  // Generate retrospective (self-improvement loop)
  let retrospective = prdValidation.applicable
    ? strictPrdRetrospective(prdValidation.attestation, phases)
    : completionAuthority.native
      ? {
          what_worked: 'The accepted AxWise scope was executed through its current work attempt.',
          what_failed: failedTaskCount
            ? `${failedTaskCount} current-attempt task(s) failed.`
            : 'No current-attempt task failures were recorded.',
          cost_analysis: 'See the persisted goal financial events for exact usage.',
          agent_performance: 'See current-attempt agent reports.',
          lessons_learned: 'Any correction requires a new accepted AxWise scope and work attempt.',
          efficiency_score: null,
        }
      : null;
  if (!prdValidation.applicable && !completionAuthority.native)
    try {
      const retroResult = await executeLlmTracked({
        prompt: [
          'Generate a retrospective for this completed goal:',
          `Goal: ${latestGoal.title}`,
          `Strategy: ${latestGoal.plan?.strategy || 'N/A'}`,
          `Total cost: $${Number(latestGoal.spent_usd || 0).toFixed(2)} of $${Number(latestGoal.budget_usd || 0).toFixed(2)} budget`,
          `Iterations: ${latestGoal.iteration}`,
          `Phases: ${phases.length} (${phases.filter((p) => p.status === 'completed').length} completed, ${phases.filter((p) => p.status === 'failed').length} failed)`,
          '',
          'Phase details:',
          phases
            .map(
              (p, i) =>
                `Phase ${i + 1} "${p.name}": status=${p.status}, quality=${p.quality_score || 'N/A'}, duration=${p.duration_ms ? Math.round(p.duration_ms / 60000) + 'min' : 'N/A'}`
            )
            .join('\n'),
          '',
          'Respond with JSON: { "what_worked": "...", "what_failed": "...", "cost_analysis": "estimated vs actual, efficiency notes", "agent_performance": "per-agent notes if available", "lessons_learned": "key takeaways for future goals", "efficiency_score": 0-100 }',
        ].join('\n'),
        systemPrompt:
          'You are a project retrospective analyst. Be concise and actionable. Focus on what can be improved next time.',
        ...resolveGoalStageLlm(),
        temperature: 0.3,
        maxTokens: 600,
        jsonMode: true,
        req,
        usage: {
          admin,
          userId: latestGoal.user_id,
          goalId: latestGoal.id,
          organizationId: latestGoal.org_id,
          teamId: latestGoal.agent_team_id || latestGoal.team_id,
          consiliumId: latestGoal.concilium_id,
          source: 'goal-complete',
          operation: 'retrospective',
          description: `Goal retrospective: ${latestGoal.title}`,
        },
      });
      retrospective = parseLlmJson(retroResult.content);
    } catch (err) {
      log.warn(req, 'goal.retrospective.failed', { error: err.message });
    }

  // Update velocity data (self-improvement)
  try {
    const category = latestGoal.parsed_category || 'general';
    const { data: existing } = await admin
      .from('goal_velocity')
      .select('id, avg_tokens_per_task, avg_duration_seconds, success_rate, sample_count')
      .eq('user_id', latestGoal.user_id)
      .eq('goal_category', category)
      .eq('task_type', 'general')
      .maybeSingle();

    const totalTasks = phases.reduce((s, p) => s + (p.jobs?.length || 0), 0);
    const avgCostPerTask =
      totalTasks > 0 ? (Number(latestGoal.spent_usd || 0) / totalTasks) * 5000 : 0; // rough token estimate
    const goalDuration =
      latestGoal.updated_at && latestGoal.created_at
        ? (new Date(latestGoal.updated_at).getTime() - new Date(latestGoal.created_at).getTime()) /
          1000
        : 0;
    const avgDurationPerTask = totalTasks > 0 ? goalDuration / totalTasks : 0;
    const successRate =
      phases.filter((p) => p.status === 'completed').length / Math.max(phases.length, 1);

    if (existing) {
      const n = existing.sample_count || 0;
      await admin
        .from('goal_velocity')
        .update({
          avg_tokens_per_task: ((existing.avg_tokens_per_task || 0) * n + avgCostPerTask) / (n + 1),
          avg_duration_seconds: Math.round(
            ((existing.avg_duration_seconds || 0) * n + avgDurationPerTask) / (n + 1)
          ),
          success_rate: ((existing.success_rate || 0) * n + successRate) / (n + 1),
          sample_count: n + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await admin.from('goal_velocity').insert({
        user_id: latestGoal.user_id,
        goal_category: category,
        task_type: 'general',
        avg_tokens_per_task: avgCostPerTask,
        avg_duration_seconds: Math.round(avgDurationPerTask),
        success_rate: successRate,
        sample_count: 1,
      });
    }
  } catch (err) {
    log.warn(req, 'goal.velocity-update.failed', { error: err.message });
  }

  // Update agent performance
  try {
    if (latestGoal.team_id) {
      const { data: members } = await admin
        .from('concilium_team_members')
        .select('member_id')
        .eq('team_id', latestGoal.team_id);
      for (const m of members || []) {
        const { data: existing } = await admin
          .from('agent_performance')
          .select(
            'id, tasks_completed, tasks_failed, avg_quality_score, sample_count:tasks_completed'
          )
          .eq('agent_id', m.member_id)
          .eq('task_type', 'general')
          .maybeSingle();

        const completedPhases = phases.filter((p) => p.status === 'completed').length;
        const failedPhases = phases.filter((p) => p.status === 'failed').length;
        const avgQuality =
          phases.reduce((s, p) => s + (p.quality_score || 0), 0) / Math.max(phases.length, 1);

        if (existing) {
          await admin
            .from('agent_performance')
            .update({
              tasks_completed: (existing.tasks_completed || 0) + completedPhases,
              tasks_failed: (existing.tasks_failed || 0) + failedPhases,
              avg_quality_score:
                ((existing.avg_quality_score || 0) * (existing.tasks_completed || 0) + avgQuality) /
                ((existing.tasks_completed || 0) + 1),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await admin.from('agent_performance').insert({
            agent_id: m.member_id,
            task_type: 'general',
            tasks_completed: completedPhases,
            tasks_failed: failedPhases,
            avg_quality_score: avgQuality,
          });
        }
      }
    }
  } catch (err) {
    log.warn(req, 'goal.agent-perf-update.failed', { error: err.message });
  }

  // Store retrospective in KB
  if (retrospective) {
    try {
      await admin.from('knowledge_documents').insert({
        user_id: latestGoal.user_id,
        title: `Retrospective: ${completionGoalLabel}`,
        content: JSON.stringify(retrospective, null, 2),
        source: 'goal-orchestrator',
        category: 'goal-retrospective',
        owner_type: 'user',
        owner_id: latestGoal.user_id,
        content_type: 'note',
        tags: ['goal', 'retrospective'],
        is_pinned: false,
        metadata: {
          goal_id: latestGoal.id,
          ...goalDocumentAttemptMetadata(latestGoal),
        },
        ...orgScopeFromGoal(latestGoal),
      });
    } catch (err) {
      log.warn(req, 'goal.retro-kb.failed', { error: err.message });
    }
  }

  // Generate deliverables from completed tasks
  let deliverables = [];
  let deploymentUrl = null;
  try {
    const { data: allTasks } = await admin
      .from('team_tasks')
      .select('id, title, status, assigned_to, agent_id, materialization_attempt, data, updated_at')
      .eq('goal_id', latestGoal.id)
      .eq('user_id', latestGoal.user_id);

    const categorizeTask = (title, role) => {
      const t = (title + ' ' + (role || '')).toLowerCase();
      if (/research|analy|market|survey|competi/.test(t))
        return { cat: 'research', icon: '🔍', label: 'Research Report' };
      if (/business plan|plan|strateg/.test(t))
        return { cat: 'plan', icon: '📋', label: 'Business Plan' };
      if (/marketing|campaign|social|advertis|promot/.test(t))
        return { cat: 'marketing', icon: '📣', label: 'Marketing Strategy' };
      if (/financ|budget|project|profit|revenue|cost/.test(t))
        return { cat: 'financial', icon: '💰', label: 'Financial Report' };
      if (/design|website|build|develop|app/.test(t))
        return { cat: 'technical', icon: '🌐', label: 'Technical' };
      if (/image|logo|visual|graphic/.test(t))
        return { cat: 'visual', icon: '🎨', label: 'Visual Assets' };
      if (/code|implement|program/.test(t)) return { cat: 'code', icon: '💻', label: 'Code' };
      return { cat: 'general', icon: '📄', label: 'Document' };
    };

    // Filter out placeholder garbage that agents sometimes ship as a URL.
    // Diagnostic found ASSET_URL: https://... (Note: ...) being marked as a
    // valid deliverable. These are NOT real URLs.
    const isPlaceholderUrl = (u) => {
      if (!u) return true;
      if (/^https?:\/\/\.{3}/.test(u)) return true; // literal https://...
      if (/^https?:\/\/(?:example\.com|domain\.tld|yoursite\.com)/i.test(u)) return true;
      if (/\(note:/i.test(u)) return true;
      return false;
    };

    const extractUrls = (text) => {
      if (!text) return [];
      const matches = text.match(/https?:\/\/[^\s)>\]]+/g);
      if (!matches) return [];
      // Strip trailing punctuation (markdown link rot) and dedupe + filter placeholders
      const cleaned = matches
        .map((u) => u.replace(/[.,;:!?)\]>]+$/, ''))
        .filter((u) => !isPlaceholderUrl(u));
      return [...new Set(cleaned)];
    };

    // Per-deliverable primary URL extraction. Looks for explicit markers FIRST
    // (most reliable — agents are instructed to emit these), then falls back
    // to host-based heuristics.
    const extractPrimaryUrl = (text) => {
      if (!text) return null;
      // Explicit markers, in priority order
      const markerPatterns = [
        /DEPLOYMENT_URL:\s*(https?:\/\/[^\s)>\]]+)/i,
        /ASSET_URL:\s*(https?:\/\/[^\s)>\]]+)/i,
        /IMAGE_URL:\s*(https?:\/\/[^\s)>\]]+)/i,
        /PDF_URL:\s*(https?:\/\/[^\s)>\]]+)/i,
        /pdfUrl[":\s]+(https?:\/\/[^\s")>\]]+)/i,
        /imageUrl[":\s]+(https?:\/\/[^\s")>\]]+)/i,
      ];
      for (const re of markerPatterns) {
        const m = text.match(re);
        if (m) {
          const u = m[1].replace(/[.,;:!?)\]>]+$/, '');
          if (!isPlaceholderUrl(u)) return u;
        }
      }
      // Fall back to first non-placeholder URL
      const all = extractUrls(text);
      return all[0] || null;
    };

    // Extract a deployment URL from agent output.
    //
    // Restricted to hosts we actually deploy to (Cloudflare Workers/Pages,
    // GitHub Pages) so models can't hallucinate a plausible Vercel/Netlify
    // URL and have the pipeline store it as if real. Previously, Opus via
    // text-only Agent SDK (no tool access) would write "Deployed to
    // https://whiterix-landing.vercel.app" in its markdown — the old regex
    // matched .vercel.app and stored it, even though nothing was deployed.
    //
    // Priority order:
    //   1. DEPLOYMENT_URL marker on a workers.dev/pages.dev/github.io host
    //   2. Bare *.workers.dev — our Cloudflare Workers deploy target
    //   3. Bare *.pages.dev — Cloudflare Pages
    //   4. Bare *.github.io — GitHub Pages fallback
    // URLs on *.vercel.app / *.netlify.app are IGNORED because we don't
    // deploy to those hosts from the pipeline.
    const isRealDeployHost = (u) =>
      /\.(workers\.dev|pages\.dev|github\.io)(\/|$|\?)/i.test(u || '');
    const extractDeploymentUrl = (text) => {
      if (!text) return null;
      const marker = text.match(/DEPLOYMENT_URL:\s*(https?:\/\/[^\s)>\]]+)/i);
      if (marker && isRealDeployHost(marker[1])) return marker[1];
      const workers = text.match(/https?:\/\/[\w.-]+\.workers\.dev\/?[^\s)>\]]*/);
      if (workers) return workers[0];
      const pages = text.match(/https?:\/\/[\w.-]+\.pages\.dev\/?[^\s)>\]]*/);
      if (pages) return pages[0];
      const gh = text.match(/https?:\/\/[\w.-]+\.github\.io\/[^\s)>\]]*/);
      if (gh) return gh[0];
      return null;
    };

    const doneTasks = currentGoalTaskAttempt(latestGoal, allTasks || []).filter(
      (task) => task.status === 'done' && task.data?.output
    );

    // Find the deployment URL from any task output (DevOps Engineer is the usual source)
    // Note: deploymentUrl is hoisted outside the try block so it's accessible
    // when we update the goal record below.
    for (const t of doneTasks) {
      const url = extractDeploymentUrl(t.data?.output);
      if (url) {
        deploymentUrl = url;
        break;
      }
    }
    deliverables = doneTasks.map((task) => {
      const cat = categorizeTask(task.title, task.data?.required_role);
      const toolLog = Array.isArray(task.data?.toolLog) ? task.data.toolLog : [];
      const taskOutput = task.data?.output || '';
      const allUrls = extractUrls(taskOutput);
      const primaryUrl = extractPrimaryUrl(taskOutput);
      return {
        id: task.id,
        title: task.title,
        category: cat.cat,
        categoryIcon: cat.icon,
        categoryLabel: cat.label,
        agent_name: task.assigned_to,
        agent_id: task.agent_id,
        quality_score: task.data?.quality_score,
        quality_score_kind: task.data?.quality_score_kind || 'structural',
        task_description: task.data?.description || task.title,
        required_role: task.data?.required_role || null,
        acceptance_criteria: task.data?.acceptance_criteria || [],
        output: taskOutput,
        output_preview: taskOutput.slice(0, 300),
        cost: task.data?.llmCost,
        phase_index: task.data?.phase_index,
        urls: allUrls,
        // NEW structured URL fields so the UI can render proper "View Live"
        // buttons without re-parsing the markdown body. Diagnostic showed
        // every previous deliverable had hasURL=false because nothing was
        // populating these.
        primary_url: primaryUrl,
        has_url: !!primaryUrl,
        has_code: isCodeDeliverable(taskOutput, task.data?.deliverable_type),
        created_at: task.data?.executedAt,
        updated_at: task.updated_at || null,
        // Surface tool usage so the UI can show "real artifact vs prose" chips
        deliverable_type: task.data?.deliverable_type || 'markdown',
        tools_used: toolLog.length,
        tool_names: toolLog.map((t) => t.name || t.tool || 'unknown').slice(0, 10),
      };
    });
    deliverables = selectCompletionDeliverables(latestGoal, deliverables);
  } catch (err) {
    log.warn(req, 'goal.deliverables.failed', { error: err.message });
  }

  // Save per-agent performance reports to KB
  try {
    const { data: allTasks } = await admin
      .from('team_tasks')
      .select('id, title, status, assigned_to, agent_id, materialization_attempt, data')
      .eq('goal_id', latestGoal.id)
      .eq('user_id', latestGoal.user_id);
    const agentMap = {};
    for (const t of currentGoalTaskAttempt(latestGoal, allTasks || [])) {
      const name = t.assigned_to || 'Unknown';
      if (!agentMap[name])
        agentMap[name] = {
          name,
          agentId: t.agent_id,
          tasks: 0,
          completed: 0,
          failed: 0,
          cost: 0,
          tokens: 0,
          quality: [],
        };
      agentMap[name].tasks++;
      if (t.status === 'done') agentMap[name].completed++;
      if (t.status === 'failed') agentMap[name].failed++;
      agentMap[name].cost += Number(t.data?.llmCost || 0);
      agentMap[name].tokens += Number(t.data?.llmTotalTokens || 0);
      if (t.data?.quality_score) agentMap[name].quality.push(t.data.quality_score);
    }
    for (const ag of Object.values(agentMap)) {
      const avgQ =
        ag.quality.length > 0
          ? Math.round(ag.quality.reduce((a, b) => a + b, 0) / ag.quality.length)
          : null;
      const report = [
        `# Agent Report: ${ag.name}`,
        `**Goal:** ${completionGoalLabel}`,
        `**Tasks:** ${ag.completed}/${ag.tasks} completed, ${ag.failed} failed`,
        `**Cost:** $${ag.cost.toFixed(4)}`,
        `**Tokens:** ${ag.tokens.toLocaleString()}`,
        avgQ != null ? `**Avg Quality:** ${avgQ}/100` : '',
        `**Success Rate:** ${ag.tasks > 0 ? Math.round((ag.completed / ag.tasks) * 100) : 0}%`,
      ]
        .filter(Boolean)
        .join('\n');
      await admin.from('knowledge_documents').insert({
        user_id: latestGoal.user_id,
        title: `Agent Report: ${ag.name} — ${completionGoalLabel}`,
        content: report,
        source: 'goal-orchestrator',
        category: 'agent-report',
        owner_type: ag.agentId ? 'agent' : 'user',
        owner_id: ag.agentId || latestGoal.user_id,
        content_type: 'note',
        tags: ['agent', 'report', 'goal-completion'],
        metadata: {
          goal_id: latestGoal.id,
          ...goalDocumentAttemptMetadata(latestGoal),
          agent_id: ag.agentId,
          agent_name: ag.name,
          tasks: ag.tasks,
          completed: ag.completed,
          cost: ag.cost,
          tokens: ag.tokens,
          avg_quality: avgQ,
        },
        ...orgScopeFromGoal(latestGoal),
      });
    }
  } catch (err) {
    log.warn(req, 'goal.agent-reports.failed', { error: err.message });
  }

  // ── Generate project_overview document (LLM body + Roadmap Strategist) ──
  // Produces a polished handoff document rendered in the Result tab.
  // Two LLM calls:
  //   1. Document body (tagline, summary, tech_stack, design_notes, key_links)
  //   2. Roadmap Strategist (5-10 strategic recommendations)
  // Plus server-side fields: KB doc list, owner email, team members.
  let projectOverview = null;
  try {
    // Concatenate deliverable outputs as context (cap at 12k chars)
    const deliverableContext = (deliverables || [])
      .map((d) => `--- ${d.title} (${d.agent_name}) ---\n${(d.output || '').slice(0, 2000)}`)
      .join('\n\n')
      .slice(0, 12000);

    // Quality-gated deliverables already contain their handoff, risks and next
    // steps. Reuse the exact-artifact attestation instead of paying for
    // paraphrase calls that add latency and can introduce contradictions.
    let docBody = prdValidation.applicable
      ? strictPrdOverviewBody(
          { ...latestGoal, title: completionGoalLabel },
          deliverables,
          prdValidation.attestation
        )
      : completionAuthority.native
        ? {
            one_liner:
              completionAuthority.packet.intent?.desired_outcome ||
              completionAuthority.packet.intent?.objective ||
              '',
            tagline: completionAuthority.packet.deliverable?.title_prefix || '',
            summary: completionAuthority.packet.intent?.objective || '',
            objectives_met: completionAuthority.packet.admission?.success_criteria || [],
            deliverables: (deliverables || []).map((item) => ({
              type: item.deliverable_type || 'other',
              title: item.title,
              url: item.primary_url || null,
              description: item.task_description || '',
            })),
            tech_stack: { frontend: null, backend: null, database: null, hosting: null, other: [] },
            design_notes: { principles: [], target_devices: [], ux_considerations: [] },
            next_steps: [],
            risks_or_gaps: failedTaskCount
              ? [`${failedTaskCount} current-attempt task(s) failed.`]
              : [],
            key_links: { github: null, design_prototype: null },
            roadmap: [],
          }
        : null;
    if (!prdValidation.applicable && !completionAuthority.native)
      try {
        const docResult = await executeLlmTracked({
          prompt: [
            `Goal title: ${latestGoal.title}`,
            `Goal description: ${latestGoal.description || 'none'}`,
            `Strategy: ${latestGoal.plan?.strategy || 'none'}`,
            `Deployment URL: ${deploymentUrl || 'none'}`,
            '',
            "Deliverables (each agent's output):",
            deliverableContext || '(none)',
            '',
            'Respond with this exact JSON shape (every field is required — use empty string / empty array / null explicitly if unknown):',
            '{',
            '  "one_liner": "single-sentence pitch, max 90 chars, punchy, no jargon",',
            '  "tagline": "2-3 word headline, like a product tagline",',
            '  "summary": "4-6 sentence paragraph. Cover: the problem this project solves, the target audience (be specific — demographics, use case, region if applicable), the key features that were built and why each matters, the value proposition in user-facing terms, and how the deliverable is ready to use. Plain prose, no markdown, no bullets. Write as if briefing a stakeholder who has 30 seconds to read it.",',
            '  "objectives_met": ["concrete outcome sentence 1", "concrete outcome sentence 2", "..."],',
            '  "deliverables": [{ "type": "landing_page|report|code|asset|other", "title": "human-readable name", "url": "https://... or null", "description": "1 sentence" }],',
            '  "tech_stack": { "frontend": null, "backend": null, "database": null, "hosting": null, "other": [] },',
            '  "design_notes": { "principles": [], "target_devices": [], "ux_considerations": [] },',
            '  "next_steps": ["actionable, specific next action 1", "actionable, specific next action 2", "..."],',
            '  "risks_or_gaps": ["honest gap or risk 1", "honest gap or risk 2"],',
            '  "key_links": { "github": null, "design_prototype": null }',
            '}',
            '',
            'Rules:',
            '- Extract URLs from deliverables when possible. Do not invent URLs.',
            '- objectives_met: 3-6 bullets max. Must be concrete things that shipped, not generic.',
            '- deliverables: include the live landing page if deployment_url is set; each agent output that represents a real artifact (report, spec doc, code) becomes an entry.',
            '- next_steps: 3-6 bullets. Be specific (e.g. "Add Meta Pixel to track signups", not "Add analytics").',
            '- risks_or_gaps: honest. Empty array if none.',
            '- key_links.github: only set if a real github.com/owner/repo URL is in the deliverables',
            '- key_links.design_prototype: only set if a real Figma/Sketch/XD/wireframe URL is in the deliverables. Otherwise null.',
            '- tech_stack fields: null if not mentioned. Empty array for `other` if nothing.',
            '- design_notes arrays: empty if nothing applies',
          ].join('\n'),
          systemPrompt:
            'You are a senior product/engineering documentation expert writing a stakeholder-facing project summary. Output ONLY valid JSON matching the requested shape. No markdown, no explanation, no preamble. Be specific and concrete — this summary is read by real users who need to understand what was built and what to do next.',
          ...resolveGoalStageLlm(),
          temperature: 0.3,
          maxTokens: 2800,
          jsonMode: true,
          req,
          usage: {
            admin,
            userId: latestGoal.user_id,
            goalId: latestGoal.id,
            organizationId: latestGoal.org_id,
            teamId: latestGoal.agent_team_id || latestGoal.team_id,
            consiliumId: latestGoal.concilium_id,
            source: 'goal-complete',
            operation: 'project-overview',
            description: `Project overview body: ${latestGoal.title}`,
          },
        });
        docBody = parseLlmJson(docResult.content);
      } catch (err) {
        log.warn(req, 'goal.project-overview.body-failed', { error: err.message });
      }

    // Step 2: Roadmap Strategist LLM call (legacy/non-strict workflows only)
    let roadmap = prdValidation.applicable || completionAuthority.native ? docBody.roadmap : [];
    if (!prdValidation.applicable && !completionAuthority.native)
      try {
        const roadmapResult = await executeLlmTracked({
          prompt: [
            'Project context:',
            `- Title: ${latestGoal.title}`,
            `- Description: ${latestGoal.description || 'none'}`,
            `- Deployment: ${deploymentUrl || 'not deployed'}`,
            `- Phases completed: ${phases.filter((p) => p.status === 'completed').length}/${phases.length}`,
            '',
            'Deliverables produced by the team:',
            deliverableContext || '(none)',
            '',
            'Produce a strategic roadmap of 5-10 ranked next steps. Output ONLY a JSON array. Each item has: title (max 80 chars), description (2-4 sentences), impact (high|medium|low), effort (small|medium|large), category (business|product|technical|growth), timeframe (e.g. "1 week", "1 month").',
            '',
            'Rank by impact-to-effort ratio. Highest leverage first. Be specific and actionable. No generic advice.',
          ].join('\n'),
          systemPrompt:
            'You are the Roadmap Strategist — a senior product/business strategist. Output ONLY a valid JSON array of recommendations. No markdown, no preamble.',
          ...resolveGoalStageLlm(),
          temperature: 0.5,
          maxTokens: 2500,
          jsonMode: true,
          req,
          usage: {
            admin,
            userId: latestGoal.user_id,
            goalId: latestGoal.id,
            organizationId: latestGoal.org_id,
            teamId: latestGoal.agent_team_id || latestGoal.team_id,
            consiliumId: latestGoal.concilium_id,
            source: 'goal-complete',
            operation: 'roadmap',
            description: `Roadmap strategist: ${latestGoal.title}`,
          },
        });
        const parsed = parseLlmJson(roadmapResult.content);
        // The LLM might return { items: [...] } or just [...]
        roadmap = Array.isArray(parsed) ? parsed : parsed?.items || parsed?.roadmap || [];
      } catch (err) {
        log.warn(req, 'goal.project-overview.roadmap-failed', { error: err.message });
      }

    // Step 3: Server-side fields — KB documents query
    let docsList = [];
    try {
      const { data: kbDocs } = await admin
        .from('knowledge_documents')
        .select('id, title, category, metadata')
        .filter('metadata->>goal_id', 'eq', latestGoal.id)
        .order('created_at', { ascending: true })
        .limit(200);
      docsList = currentGoalDocuments(latestGoal, kbDocs || [])
        .slice(0, 20)
        .map((d) => ({ id: d.id, title: d.title, category: d.category }));
    } catch (err) {
      log.warn(req, 'goal.project-overview.kb-docs-failed', { error: err.message });
    }

    // Step 4: Owner email lookup
    let ownerEmail = null;
    try {
      const { data: userRow } = await admin.auth.admin.getUserById(latestGoal.user_id);
      ownerEmail = userRow?.user?.email || null;
    } catch (err) {
      log.warn(req, 'goal.project-overview.owner-lookup-failed', { error: err.message });
    }

    // Step 5: Team members from deliverables
    const teamMembers = [...new Set((deliverables || []).map((d) => d.agent_name).filter(Boolean))];

    // If a landing_pages row for this goal has a GitHub repo attached
    // (created server-side by landing-pages-tool), promote that URL to
    // key_links.github. More reliable than asking the LLM to extract it.
    let deterministicGithubUrl = null;
    try {
      const { data: lpRow } = await admin
        .from('landing_pages')
        .select('data')
        .eq('goal_id', latestGoal.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lpRow?.data?.github?.repo_url) deterministicGithubUrl = lpRow.data.github.repo_url;
    } catch {
      /* non-critical */
    }

    // Assemble the project overview object
    projectOverview = {
      tagline: docBody?.tagline || completionGoalDescription.slice(0, 80) || completionGoalLabel,
      one_liner: docBody?.one_liner || null,
      summary:
        docBody?.summary ||
        'Project Overview generation failed — see Work Log tab for raw deliverables.',
      objectives_met: Array.isArray(docBody?.objectives_met) ? docBody.objectives_met : [],
      deliverables: Array.isArray(docBody?.deliverables) ? docBody.deliverables : [],
      next_steps: Array.isArray(docBody?.next_steps) ? docBody.next_steps : [],
      risks_or_gaps: Array.isArray(docBody?.risks_or_gaps) ? docBody.risks_or_gaps : [],
      tech_stack: docBody?.tech_stack || {
        frontend: null,
        backend: null,
        database: null,
        hosting: null,
        other: [],
      },
      design_notes: docBody?.design_notes || {
        principles: [],
        target_devices: [],
        ux_considerations: [],
      },
      key_links: {
        live: deploymentUrl || null,
        github: deterministicGithubUrl || docBody?.key_links?.github || null,
        design_prototype: docBody?.key_links?.design_prototype || null,
        docs: docsList,
      },
      ownership: {
        owner_email: ownerEmail,
        team_members: teamMembers,
      },
      roadmap,
      version: (latestGoal.iteration || 0) + 1,
      generated_at: new Date().toISOString(),
    };

    log.info(req, 'goal.project-overview.generated', {
      goalId: latestGoal.id,
      hasBody: !!docBody,
      roadmapItems: roadmap.length,
      docsCount: docsList.length,
    });

    // An exact-artifact attestation is more useful than another generated
    // paraphrase of the same handoff.
    if (prdValidation.applicable) {
      projectOverview.team_lead_note = qualityProfileIsPrd
        ? `The exact PRD artifact passed at ${prdValidation.attestation.score}/${prdValidation.attestation.threshold}; implementation should follow its requirement and acceptance-test IDs.`
        : `The exact deliverable passed its canonical AxWise quality attestation at ${prdValidation.attestation.score}/${prdValidation.attestation.threshold}; follow the approved handoff and retain authorization evidence for any external action.`;
    } else if (completionAuthority.native) {
      projectOverview.team_lead_note =
        'This handoff reflects the accepted AxWise scope and its exact current work attempt.';
    } else
      try {
        const rexNote = await executeLlmTracked({
          ...resolveGoalStageLlm(),
          temperature: 0.5,
          maxTokens: 300,
          systemPrompt: `You are Rex, the Team Lead. You just finished leading your team through a goal. Write a short sign-off note (2-4 sentences) for the project handoff. Tone: confident, concise, credits the team by name, flags any follow-up worth watching. First person as Rex. No preamble, no bullets — just the note.`,
          prompt: [
            `Goal: ${latestGoal.title}`,
            `Team: ${teamMembers.join(', ') || 'solo'}`,
            `Deployment: ${deploymentUrl || 'none'}`,
            `Deliverables: ${deliverables.length}`,
            '',
            'Key outputs:',
            deliverables
              .slice(0, 5)
              .map((d) => `- ${d.title}: ${(d.output || '').slice(0, 200)}`)
              .join('\n'),
          ].join('\n'),
          req,
          usage: {
            admin,
            userId: latestGoal.user_id,
            goalId: latestGoal.id,
            organizationId: latestGoal.org_id,
            teamId: latestGoal.agent_team_id || latestGoal.team_id,
            consiliumId: latestGoal.concilium_id,
            source: 'goal-complete',
            operation: 'team-lead-note',
            description: `Team lead sign-off: ${latestGoal.title}`,
          },
        });
        projectOverview.team_lead_note = (rexNote.content || '').trim();
      } catch (noteErr) {
        log.warn(req, 'goal.team-lead-note.failed', { error: noteErr.message });
        projectOverview.team_lead_note = null;
      }
  } catch (err) {
    log.warn(req, 'goal.project-overview.failed', { error: err.message });
  }

  let strictCompletionSnapshot = null;
  let strictCompletionBinding = null;
  // Re-read immediately before the terminal transition. A scope approval or
  // final artifact can change while the critic and completion summaries are
  // running; only the attestation bound to the exact current hashes may close
  // an applicable quality-gated goal.
  if (prdValidation.applicable) {
    const currentGoal = await loadGoal(admin, latestGoal.id);
    const currentDoneCandidates = await loadStrictPrdCandidates(
      admin,
      currentGoal,
      (_goal, candidates) => candidates
    );
    const artifactSetDecision = finalCompletionArtifactDecision({
      goal: currentGoal,
      candidates: currentDoneCandidates,
      attestedCandidates: attestedCompletionCandidates,
      attestedCandidate: prdValidation.candidate,
      attestation: prdValidation.attestation,
    });
    const currentFinalCandidates = artifactSetDecision.selectedCandidates;
    const finalArtifact = currentFinalCandidates[0]?.output || '';
    const completionDecision = prdCompletionAttestationDecision({
      goal: currentGoal,
      artifact: finalArtifact,
    });
    const qualityDeliverable = bindQualityCompletionDeliverable(
      currentFinalCandidates[0],
      deliverables
    );
    const qualityDeliverableReasons = [];
    if (!qualityDeliverable) {
      qualityDeliverableReasons.push('completion_ui_deliverable_missing');
    } else {
      if (qualityDeliverable.id !== String(artifactSetDecision.candidate_id || '')) {
        qualityDeliverableReasons.push('completion_ui_deliverable_identity_mismatch');
      }
      if (qualityDeliverable.artifact_hash !== artifactSetDecision.artifact_hash) {
        qualityDeliverableReasons.push('completion_ui_deliverable_hash_mismatch');
      }
    }
    const completionRefusalReasons = [
      ...artifactSetDecision.reasons,
      ...completionDecision.reasons,
      ...qualityDeliverableReasons,
    ].filter((reason, index, values) => values.indexOf(reason) === index);
    if (
      !artifactSetDecision.allowed ||
      !completionDecision.allowed ||
      qualityDeliverableReasons.length > 0
    ) {
      const pendingRow = await updateStrictPrdSnapshot(admin, currentGoal, {
        status: 'pending_validation',
        data: {
          ...(currentGoal.data || {}),
          prd_quality_validation: {
            ...(currentGoal.data?.prd_quality_validation || {}),
            deliverable_profile: qualityDeliverableProfile,
            status: 'stale_or_failed',
            refusal_reasons: completionRefusalReasons,
            candidate_id: artifactSetDecision.candidate_id,
            candidate_count: artifactSetDecision.current_count,
            expected_candidate_count: artifactSetDecision.expected_count,
            artifact_hash: artifactSetDecision.artifact_hash,
            attested_candidate_set: artifactSetDecision.attested_candidate_set,
            current_candidate_set: artifactSetDecision.current_candidate_set,
            checked_at: new Date().toISOString(),
          },
        },
      });
      if (!pendingRow) {
        return {
          type: 'orchestrate-goal',
          action: 'complete',
          goalId: latestGoal.id,
          status: 'state_changed',
          reasons: ['goal_changed_before_revalidation_queue'],
        };
      }
      await logGoalEvent(admin, latestGoal.id, 'prd_quality_completion_refused', {
        deliverable_profile: qualityDeliverableProfile,
        reasons: completionRefusalReasons,
        candidate_id: artifactSetDecision.candidate_id,
        candidate_count: artifactSetDecision.current_count,
        expected_candidate_count: artifactSetDecision.expected_count,
        artifact_hash: artifactSetDecision.artifact_hash,
        attested_candidate_set: artifactSetDecision.attested_candidate_set,
        current_candidate_set: artifactSetDecision.current_candidate_set,
        scope_hash: completionDecision.scope_hash,
        score: completionDecision.score,
        threshold: completionDecision.threshold,
      });
      try {
        await enqueueGoalAction(admin, 'complete', latestGoal.id);
      } catch (error) {
        const failedRow = await updateStrictPrdSnapshot(admin, pendingRow, {
          status: 'needs_human',
          data: {
            ...(pendingRow.data || {}),
            failure_reason: `${qualityProfileIsPrd ? 'Strict PRD' : 'Deliverable'} revalidation could not be queued: ${error.message}`,
            recovery_action: 'Retry completion after the worker queue is available.',
          },
        });
        if (!failedRow) {
          return {
            type: 'orchestrate-goal',
            action: 'complete',
            goalId: latestGoal.id,
            status: 'state_changed',
            reasons: [...completionRefusalReasons, 'goal_changed_after_revalidation_refusal'],
          };
        }
        return {
          type: 'orchestrate-goal',
          action: 'complete',
          goalId: latestGoal.id,
          status: 'needs_human',
          reasons: [...completionRefusalReasons, 'revalidation_enqueue_failed'],
        };
      }
      return {
        type: 'orchestrate-goal',
        action: 'complete',
        goalId: latestGoal.id,
        status: 'pending_validation',
        reasons: completionRefusalReasons,
      };
    }
    deliverables = [qualityDeliverable];
    const exactOverview = strictPrdOverviewBody(
      currentGoal,
      deliverables,
      prdValidation.attestation
    );
    projectOverview = {
      ...exactOverview,
      ...(projectOverview || {}),
      deliverables: exactOverview.deliverables,
    };
    goalData = {
      ...(currentGoal.data || goalData),
      prd_quality_validation: {
        ...(currentGoal.data?.prd_quality_validation || {}),
        candidate_id: artifactSetDecision.candidate_id,
        candidate_count: artifactSetDecision.current_count,
        expected_candidate_count: artifactSetDecision.expected_count,
        artifact_hash: artifactSetDecision.artifact_hash,
        candidate_set: artifactSetDecision.current_candidate_set,
        completion_checked_at: new Date().toISOString(),
      },
    };
    latestGoal.data = goalData;
    strictCompletionSnapshot = currentGoal;
    strictCompletionBinding = {
      candidateId: artifactSetDecision.candidate_id,
      candidateArtifact: finalArtifact,
      candidateSet: artifactSetDecision.current_candidate_set,
    };
  }

  // Mark goal completed
  const completionUpdatedAt = new Date().toISOString();
  const completionUpdates = {
    status: 'completed',
    retrospective,
    data: {
      ...goalData,
      completed_at: completionUpdatedAt,
      total_cost: Number(latestGoal.spent_usd || 0),
      deliverables,
      deployment_url: deploymentUrl,
      project_overview: projectOverview,
    },
  };
  if (strictCompletionSnapshot) {
    const completionResult = await completeQualityGoalRevision(admin, {
      snapshot: strictCompletionSnapshot,
      completionUpdates,
      completionUpdatedAt,
      candidateId: strictCompletionBinding.candidateId,
      candidateArtifact: strictCompletionBinding.candidateArtifact,
      candidateSet: strictCompletionBinding.candidateSet,
      attestation: prdValidation.attestation,
    });
    if (completionResult.status === 'conflict') {
      return {
        type: 'orchestrate-goal',
        action: 'complete',
        goalId: latestGoal.id,
        status: 'state_changed',
        reasons: [completionResult.reason || 'goal_changed_before_terminal_transition'],
      };
    }
  } else {
    await updateGoal(admin, latestGoal.id, completionUpdates);
  }

  // Project completion follows the terminal goal transition. In particular,
  // a quality-gated deliverable that remains pending validation must never
  // make its parent project look completed.
  if (latestGoal.project_id) {
    try {
      await admin
        .from('projects')
        .update({
          status: 'Completed',
          data: {
            goal_id: latestGoal.id,
            total_cost: Number(latestGoal.spent_usd || 0),
            phases_completed: phases.filter((p) => p.status === 'completed').length,
            total_phases: phases.length,
            iterations: latestGoal.iteration,
            completed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', latestGoal.project_id);
    } catch (err) {
      log.warn(req, 'goal.project-complete.failed', { error: err.message });
    }
  }

  // Phase 4 delivery is durable but independent: an immediate AxWise outage
  // creates an internal retry job and never changes Orqaly's completed result.
  try {
    const completedGoal = await loadGoal(admin, latestGoal.id);
    const delivery = await reportOrEnqueueGoalOutcome(admin, completedGoal);
    if (delivery.status === 'queued') {
      log.warn(req, 'goal.axwise-outcome.queued', {
        goalId: latestGoal.id,
        retryJobId: delivery.jobId,
        reused: delivery.reused,
      });
    }
  } catch (err) {
    log.warn(req, 'goal.axwise-outcome.failed', {
      goalId: latestGoal.id,
      error: err.message,
    });
  }

  // Log deployment URL prominently if present
  if (deploymentUrl) {
    await logGoalEvent(admin, latestGoal.id, 'deployment_published', { url: deploymentUrl });
    log.info(req, 'goal.deployment-published', { goalId: latestGoal.id, url: deploymentUrl });
  }

  // Archive goal messages (room closed after completion)
  await archiveGoalMessages(admin, latestGoal.id);

  await logGoalEvent(admin, latestGoal.id, 'goal_completed', {
    totalCost: Number(latestGoal.spent_usd || 0),
    phases: phases.length,
    iterations: latestGoal.iteration,
    projectId: latestGoal.project_id,
  });
  await notifyGoalEvent(admin, latestGoal, 'goal_completed', {
    feedback: `Completed! ${phases.length} phases, $${Number(latestGoal.spent_usd || 0).toFixed(2)} spent.`,
  });

  // Phase 2: index this completed goal into semantic memory so future
  // goals (same chain, or same business_type elsewhere) can retrieve
  // relevant prior context. Reload first because data.project_overview
  // was just written above.
  let freshGoal = latestGoal;
  try {
    freshGoal = await loadGoal(admin, latestGoal.id);
    await indexCompletedGoal(admin, freshGoal);
  } catch (err) {
    log.warn(req, 'goal.memory.index-failed', { goalId: latestGoal.id, error: err.message });
  }

  // Loop continuation: if the user flipped the Loop switch on, automatically
  // spawn the next goal in the chain seeded with this goal's strategic
  // outputs (next_steps + risks_or_gaps + roadmap), and schedule the
  // parent's deliverables to be refined with the new direction. The helper
  // is idempotent and safely no-ops when the loop is off, paused, or
  // already-spawned.
  try {
    await maybeSpawnContinuation(admin, freshGoal, projectOverview, { req });
  } catch (err) {
    log.warn(req, 'goal.loop.spawn-failed', { goalId: latestGoal.id, error: err.message });
  }

  // Post completion message
  const { systemAlert } = await import('../goal-messaging.js');
  await systemAlert(
    admin,
    latestGoal.id,
    `Goal completed! ${phases.length} phases, ${latestGoal.iteration} iterations, $${Number(latestGoal.spent_usd || 0).toFixed(2)} total cost.`
  );

  // Theory Mode: generate detailed projections based on actual deliverables
  if (latestGoal.theory_mode) {
    try {
      const { generateDetailedProjection } = await import('./theory-projection.js');
      await generateDetailedProjection(admin, latestGoal, req);
      log.info(req, 'goal.theory-detailed.done', { goalId: latestGoal.id });
    } catch (err) {
      log.warn(req, 'goal.theory-detailed.failed', { goalId: latestGoal.id, error: err.message });
    }
  }

  // Trigger Osja post-completion review (cost-gated — skip cheap goals).
  // Osja compares each deliverable against the Library Universe and emits an
  // upgrade/keep verdict, auto-promoting library-grade outputs back into the
  // library. Threshold defaults to $0.001 — diagnostic confirmed real test
  // goals cost ~$0.0015–0.003 each, so the previous $1 threshold meant
  // Osja never ran on any of the last 10 completed goals. Lowered so every
  // non-trivial goal triggers a review. Override via OSJA_MIN_GOAL_COST_USD.
  const OSJA_MIN_COST = Number(process.env.OSJA_MIN_GOAL_COST_USD ?? 0.001);
  const goalCost = Number(latestGoal.spent_usd || 0);
  if (
    shouldEnqueuePostCompletionOsjaReview({
      qualityApplicable: prdValidation.applicable,
      goalCost,
      minimumCost: OSJA_MIN_COST,
    })
  ) {
    try {
      if (completionAuthority.native) {
        await enqueueGoalAction(admin, 'osja-review', latestGoal.id, {
          scopeHash: completionAuthority.packet.scope_hash,
        });
      } else {
        await enqueueGoalAction(admin, 'osja-review', latestGoal.id);
      }
      log.info(req, 'goal.osja-review.enqueued', { goalId: latestGoal.id, cost: goalCost });
    } catch (err) {
      log.warn(req, 'goal.osja-review.enqueue-failed', { error: err.message });
    }
  } else if (prdValidation.applicable) {
    log.info(req, 'goal.osja-review.skipped-immutable-attestation', {
      goalId: latestGoal.id,
      cost: goalCost,
      artifactHash: prdValidation.attestation?.artifact_hash || null,
    });
  } else {
    log.info(req, 'goal.osja-review.skipped-cheap', {
      goalId: latestGoal.id,
      cost: goalCost,
      threshold: OSJA_MIN_COST,
    });
  }

  return {
    type: 'orchestrate-goal',
    action: 'complete',
    goalId: latestGoal.id,
    totalCost: Number(latestGoal.spent_usd || 0),
    projectId: latestGoal.project_id,
  };
}
