// Read-only evidence from the approved preview. No model fixtures, provider
// execution, service updates, grants, or database writes occur in this script.
// Only the existing API database credential (version 2) is read, in memory.
//
// Minimal operator procedure (from this repository; no secret shell variables):
// 1. Use the already-authorized Google login. Leave local port 19485 free.
// 2. Copy the one new Build Request UUID from its Orqaly workspace URL.
// 3. Inspect authoring before deployment:
//      node scripts/task-to-solution-preview-evidence.mjs --authoring-only BUILD_UUID
//    This can verify needs_input, a draft/review, or an exact completed handoff.
//    It deliberately cannot attest deployment, execution, activation, or UI.
// 4. Only after explicit deployment approval and real test/production runs:
//      node scripts/task-to-solution-preview-evidence.mjs BUILD_UUID
// 5. After edits/review/handoff, rerun to capture the final persisted checkpoint.
//    Each run uses a read-only repeatable snapshot. A concurrent edit can make
//    its status differ from the UI without proving a persistence failure.
// The script starts/stops only its own proxy, rolls back every read transaction,
// and emits IDs/hashes plus allowlisted nonsecret acceptance payloads. Never run
// a separate secret-printing command or copy credentials into a shell/log/chat.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import {
  AxWiseOperationEnvelopeSchema,
  PrepareSolutionResponseV1Schema,
} from '../shared/workflow-v2/contracts.js';
import {
  containsSolutionBuildSecret,
  requestsSolutionBuildSecret,
} from '../shared/workflow-v2/solution-build-secrets.js';
import {
  compileSolutionWorkflow,
  expectedSolutionOutput,
} from '../server/workflow-v2/solution-compiler.js';
import { reviewSolutionBuildWorkflow } from '../server/workflow-v2/solution-build-service.js';
import { deterministicUuid } from '../server/workflow-v2/ids.js';

const project = 'axwise-v2-preview-001';
const port = 19485;
export const previewScope = Object.freeze({
  tenantId: 'c1b26d36-721b-5d8c-8d4c-180050ee9b94',
  ownerUserId: 'user_2vHlB9JhH4FazWsgKYENFIeAnMu',
});
const oldSolutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const smsRunId = '837fdcaf-3536-5901-b044-94faf03d7a7b';
const originalHash = 'd2bab7be7a2cff3f3826e9eb8ba1fce8ddd54630dc8e9dabac17faf3215a31f0';
const rejectedHash = '4ba1b8080602229e2b6d6c8d3d049210b6c60ed5b46857dfe7b359c568091504';
const activeHash = 'cc0090502d6e4c1a96371a16890c7ded3bd7d5a727e7d66ace0cc7637e3fb499';
const artifactHash = '3d88e4bd299f1a1f3560aa705664fb46f9bf1cb93463c86522cc0c61feeecf5a';
// Captured read-only 2026-09-05T16:43:56.392Z before the fresh acceptance test.
// This is a pre-acceptance, not pre-release, request baseline. The exact final
// artifact and native v3/history baselines were recorded by the earlier release.
const smsPreAcceptanceRequestHash =
  '3b12b341ca9ea2c3b5605eee4f1d91986422cbfd32159ccd709e35c4bb7814c1';
const textHash = (text) => createHash('sha256').update(text).digest('hex');
const same = (actual, expected, code) => assert.equal(hash(actual), hash(expected), code);
const at = (value) => new Date(value).getTime();
const identifier = (value) => z.uuid().parse(value);

export function parseBuildId(args) {
  assert.equal(args.length, 1, 'one_explicit_build_id_required');
  const id = identifier(args[0]);
  assert.notEqual(id, oldSolutionId, 'existing_solution_not_new_acceptance');
  return id;
}

export function parseAuditArguments(args) {
  const authoringOnly = args[0] === '--authoring-only';
  return { buildId: parseBuildId(authoringOnly ? args.slice(1) : args), authoringOnly };
}

// Do not emit arbitrary user/model data. Even benign-looking free text is
// hashed unless it belongs to the explicitly planned nonsecret acceptance.
export function safeTestPayload(value) {
  const fields = new Set(['name', 'email', 'customer_name', 'contactEmail', 'contact_email']);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 5) return null;
  if (
    entries.some(
      ([key, item]) =>
        !fields.has(key) ||
        typeof item !== 'string' ||
        !/^(?:\s*(?:ada|grace|alice|bob)\s*|(?:ada|grace|alice|bob)@example\.com)$/i.test(item)
    )
  )
    return null;
  return value;
}

export function verifyBuildRecords({
  buildId,
  build,
  sourceRun,
  artifacts,
  solution,
  attempts,
  events,
  history,
  authoringOnly = false,
}) {
  identifier(buildId);
  assert.notEqual(buildId, oldSolutionId);
  assert(build && sourceRun, 'build_source_required');
  const handedOff = build.status === 'completed';
  if (!authoringOnly || handedOff) assert(solution, 'completed_solution_required');
  for (const record of [build, solution, sourceRun, ...attempts, ...events, ...history].filter(
    Boolean
  )) {
    assert.equal(record.tenant_id, previewScope.tenantId, 'record_tenant_mismatch');
    assert.equal(record.owner_user_id, previewScope.ownerUserId, 'record_owner_mismatch');
  }
  assert.equal(build.id, buildId);
  if (handedOff) {
    assert.equal(build.solution_id, buildId, 'build_handoff_id_mismatch');
    assert.equal(solution.id, buildId);
    assert.equal(solution.build_request_id, buildId);
    assert.equal(build.questions.length, 0, 'unanswered_questions');
  } else {
    assert(authoringOnly, 'build_not_handed_off');
    assert(
      ['needs_input', 'draft', 'reviewed'].includes(build.status),
      'authoring_checkpoint_not_ready'
    );
    assert.equal(build.solution_id, null, 'unconfirmed_build_has_solution_pointer');
    assert(solution == null, 'unconfirmed_build_has_solution');
    assert.equal(history.length, 0, 'unconfirmed_build_has_execution_history');
  }
  assert.equal(build.unsupported_capabilities.length, 0);
  assert.equal(build.last_error, null);
  assert.equal(build.source_snapshot.authority, 'reference_only');
  assert.equal(build.run_id, sourceRun.id);
  assert.equal(build.source_snapshot.runId, sourceRun.id);
  assert.equal(build.source_snapshot.taskHash, sourceRun.request_hash);
  assert.equal(
    textHash(sourceRun.request_payload.request),
    sourceRun.request_hash,
    'source_request_hash_mismatch'
  );
  assert.equal(build.source_snapshot.taskText, sourceRun.request_payload.request.slice(0, 24000));
  assert.equal(build.source_snapshot.title, build.source_snapshot.taskText.slice(0, 500));
  const { contextHash, ...sourceSnapshot } = build.source_snapshot;
  assert.equal(hash(sourceSnapshot), contextHash, 'source_context_hash_mismatch');
  for (const reference of build.source_snapshot.artifacts) {
    const artifact = artifacts.find((item) => item.id === reference.artifactId);
    assert(artifact, 'source_artifact_pin_missing');
    assert.equal(artifact.content_hash, reference.artifactHash);
    assert.equal(artifact.kind, reference.kind);
    assert.equal(textHash(artifact.canonical_content), reference.artifactHash);
  }
  const { profileHash, profileReference, ...agent } = build.agent_snapshot;
  assert.equal(agent.id, build.agent_id);
  if (solution) assert.equal(agent.id, solution.agent_id);
  assert.equal(hash(agent), profileHash, 'agent_snapshot_hash_mismatch');
  identifier(profileReference.id);
  assert.match(profileReference.contentHash, /^[a-f0-9]{64}$/);
  if (solution) same(solution.agent_snapshot, build.agent_snapshot, 'handoff_agent_pin_changed');
  const createCommands = [
    { runId: build.run_id, instruction: build.instruction },
    { runId: build.run_id, agentId: build.agent_id, instruction: build.instruction },
  ];
  assert(
    createCommands.some((command) => hash(command) === build.create_hash),
    'build_instruction_identity_changed'
  );
  assert(
    !containsSolutionBuildSecret(
      JSON.stringify([
        build.instruction,
        build.agent_snapshot,
        build.source_snapshot,
        build.answers,
      ])
    ),
    'audit_secret_in_build_data'
  );

  assert(attempts.length >= (authoringOnly ? 1 : 2), 'design_attempts_required');
  const answeredEvents = events.filter((event) => event.kind === 'answered');
  if (!authoringOnly) assert(answeredEvents.length > 0, 'persisted_answer_required');
  const latestAnswers = new Map();
  let sawQuestion = false;
  let sawCandidate = false;
  const attemptEvidence = [];
  for (const attempt of attempts) {
    assert.equal(attempt.build_request_id, buildId);
    assert(attempt.input_version <= build.input_version);
    assert.equal(attempt.id, deterministicUuid(buildId, 'design', String(attempt.input_version)));
    assert.equal(attempt.operation_id, deterministicUuid(attempt.id, 'axwise'));
    const envelope = AxWiseOperationEnvelopeSchema.parse(attempt.envelope);
    assert.equal(envelope.operationType, 'PrepareSolutionV1');
    assert.equal(envelope.operationId, attempt.operation_id);
    assert.equal(envelope.canonicalInputHash, attempt.input_hash);
    assert.equal(hash(envelope.input), attempt.input_hash, 'design_input_hash_mismatch');
    assert.equal(envelope.owner.tenantId, previewScope.tenantId);
    assert.equal(envelope.owner.userId, previewScope.ownerUserId);
    assert.equal(envelope.owner.organizationId, null);
    assert.equal(envelope.workflow.runId, build.run_id);
    assert.equal(envelope.workflow.stageId, deterministicUuid(buildId, 'design-stage'));
    assert.equal(envelope.workflow.stageAttemptId, attempt.id);
    assert.equal(envelope.input.buildRequestId, buildId);
    assert.equal(envelope.input.inputVersion, attempt.input_version);
    assert.equal(envelope.input.instruction, build.instruction);
    same(envelope.input.agent, { ...agent, profileHash }, 'design_agent_pin_changed');
    same(
      envelope.input.source,
      {
        runId: build.run_id,
        taskHash: sourceRun.request_hash,
        title: build.source_snapshot.title,
        taskText: build.source_snapshot.taskText,
        contextHash,
      },
      'design_source_pin_changed'
    );
    const expectedAnswers = new Map();
    for (const event of answeredEvents.filter(
      (event) => event.input_version <= attempt.input_version
    )) {
      expectedAnswers.delete(event.details.answer.questionId);
      expectedAnswers.set(event.details.answer.questionId, event.details.answer);
    }
    same(
      envelope.input.answers,
      [...expectedAnswers.values()],
      'answer_not_resumed_in_model_input'
    );
    assert(!containsSolutionBuildSecret(JSON.stringify(envelope.input)), 'audit_secret_in_attempt');
    let outcome = null;
    if (attempt.status === 'completed') {
      assert(attempt.dispatch_count >= 1, 'design_not_dispatched');
      const prepared = PrepareSolutionResponseV1Schema.parse(attempt.result);
      assert.equal(prepared.buildRequestId, buildId);
      assert.equal(prepared.inputVersion, attempt.input_version);
      assert(!containsSolutionBuildSecret(JSON.stringify(prepared)), 'audit_secret_in_result');
      assert(
        !prepared.questions.some((q) => requestsSolutionBuildSecret(`${q.prompt}\n${q.reason}`)),
        'credential_question_not_supported'
      );
      const completedEvent = events.find(
        (event) =>
          event.kind === 'design_completed' &&
          event.input_version === attempt.input_version &&
          event.details.operationId === attempt.operation_id
      );
      assert(completedEvent, 'design_completion_event_missing');
      assert.equal(completedEvent.details.outcome, prepared.outcome);
      same(completedEvent.details.questions, prepared.questions, 'durable_question_changed');
      outcome = prepared.outcome;
      sawQuestion ||= outcome === 'needs_input';
      sawCandidate ||= outcome === 'candidate';
    }
    attemptEvidence.push({
      id: attempt.id,
      operationId: attempt.operation_id,
      inputVersion: attempt.input_version,
      inputHash: attempt.input_hash,
      status: attempt.status,
      outcome,
      // This counter includes worker polling/lease claims, not just model calls.
      workerClaimCount: attempt.dispatch_count,
      answeredQuestionIds: envelope.input.answers.map((answer) => answer.questionId),
    });
  }
  if (!authoringOnly) assert(sawQuestion && sawCandidate, 'live_question_then_candidate_required');
  for (const event of answeredEvents) {
    const { question, answer, previousInputVersion } = event.details;
    assert.equal(question.id, answer.questionId);
    assert.equal(question.kind, 'information');
    assert.equal(event.input_version, previousInputVersion + 1);
    const questionAttempt = attempts.find(
      (attempt) =>
        attempt.status === 'completed' &&
        attempt.input_version <= previousInputVersion &&
        at(attempt.updated_at) <= at(event.created_at) &&
        attempt.result?.questions?.some((q) => hash(q) === hash(question))
    );
    assert(questionAttempt, 'answer_not_bound_to_prior_question');
    assert.match(event.request_hash, /^[a-f0-9]{64}$/);
    assert(event.request_key, 'answer_idempotency_missing');
    latestAnswers.delete(answer.questionId);
    latestAnswers.set(answer.questionId, answer);
  }
  same(build.answers, [...latestAnswers.values()], 'current_answers_not_event_bound');
  const created = events.find((event) => event.kind === 'created');
  assert(created && created.input_version === 1);
  assert.equal(created.details.sourceHash, contextHash);
  assert.equal(created.details.agentProfileHash, profileHash);
  for (const event of events) {
    assert.equal(event.build_request_id, buildId);
    assert(event.input_version <= build.input_version);
    if (event.kind === 'saved')
      assert.equal(
        hash(event.details.workflow),
        event.details.workflowHash,
        'native_save_hash_mismatch'
      );
  }

  const commonEvidence = {
    buildRequestId: buildId,
    solutionId: solution?.id ?? null,
    buildStatus: build.status,
    source: {
      runId: build.run_id,
      taskHash: sourceRun.request_hash,
      contextHash,
      artifactHashes: build.source_snapshot.artifacts.map((item) => item.artifactHash),
      authority: 'reference_only',
    },
    agent: { id: agent.id, profileVersion: agent.profileVersion, profileHash, profileReference },
    buildInputVersion: build.input_version,
    buildRowVersion: build.row_version,
    instructionHash: textHash(build.instruction),
    answersHash: hash(build.answers),
    questionAnswerEvidence: answeredEvents.map((event) => ({
      eventId: event.id,
      questionId: event.details.question.id,
      questionHash: hash(event.details.question),
      answerHash: hash(event.details.answer),
      inputVersion: event.input_version,
    })),
    attempts: attemptEvidence,
    needsInputObserved: sawQuestion,
    resumedCandidateObserved: attempts.some(
      (attempt) =>
        attempt.status === 'completed' &&
        attempt.result?.outcome === 'candidate' &&
        attempt.envelope.input.answers.length > 0
    ),
    nativeSaveCount: events.filter((event) => event.kind === 'saved').length,
    workflowHash: build.workflow_hash,
  };
  const authoringEvidence = (phase, handoffEventId = null) => ({
    ...commonEvidence,
    auditScope: 'authoring_only',
    phase,
    handoffVerified: handedOff,
    handoffEventId,
    pendingQuestions: build.questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      questionHash: hash(question),
    })),
    nativeSnapshotVerified: true,
    reviewVerified: build.review?.valid === true,
    observedSolutionStatus: solution?.status ?? null,
    runtimeVerified: false,
    deploymentVerified: false,
    executionVerified: false,
    notVerified: [
      'deployment',
      'test_execution',
      'activation',
      'production_execution',
      'browser_canvas_rendering',
    ],
    evidenceBoundary:
      'Authoring-only database evidence: persisted AxWise design results, source/Agent pins, questions, answers, native snapshots and any reviewed handoff. This does not verify deployment, runtime execution, activation, or browser rendering. No new model or workflow call is made.',
  });

  assert.equal(hash(build.workflow), build.workflow_hash);
  if (authoringOnly && !handedOff) {
    assert(build.workflow && Array.isArray(build.workflow.nodes), 'native_draft_required');
    assert(
      !containsSolutionBuildSecret(JSON.stringify(build.workflow)),
      'audit_secret_in_native_draft'
    );
    if (build.status === 'needs_input') {
      assert(build.questions.length > 0 && sawQuestion, 'needs_input_without_live_questions');
      for (const question of build.questions) {
        assert(
          attempts.some(
            (attempt) =>
              attempt.status === 'completed' &&
              attempt.result?.questions.some((issued) => hash(issued) === hash(question))
          ),
          'pending_question_not_design_bound'
        );
      }
      assert.equal(build.review, null, 'pending_question_has_review');
    } else assert.equal(build.questions.length, 0, 'draft_has_unanswered_questions');
    if (build.status === 'reviewed' || build.review?.valid === true) {
      const checked = reviewSolutionBuildWorkflow({ id: buildId, workflow: build.workflow });
      assert.equal(checked.valid, true);
      assert.equal(build.review?.valid, true);
      assert.equal(build.review.workflowHash, build.workflow_hash);
      assert.equal(checked.workflowHash, build.workflow_hash);
      same(checked.spec, build.spec, 'reviewed_spec_mismatch');
    }
    assert(
      !events.some((event) => event.kind === 'handed_off'),
      'unconfirmed_build_has_handoff_event'
    );
    return authoringEvidence(
      build.status === 'needs_input'
        ? 'awaiting_customer_information'
        : build.status === 'reviewed'
          ? 'reviewed_not_handed_off'
          : 'draft_not_reviewed'
    );
  }
  assert.equal(build.review.valid, true);
  assert.equal(build.review.workflowHash, build.workflow_hash);
  const checked = reviewSolutionBuildWorkflow({ id: buildId, workflow: build.workflow });
  assert.equal(checked.valid, true, 'initial_workflow_not_validated');
  assert.equal(checked.workflowHash, build.workflow_hash);
  same(checked.spec, build.spec, 'reviewed_spec_mismatch');
  same(solution.workflow, build.workflow, 'handoff_native_snapshot_changed');
  same(solution.spec, build.spec, 'handoff_spec_changed');
  assert.equal(solution.workflow_hash, build.workflow_hash);
  assert.equal(solution.create_key, `build_${buildId}`);
  assert.equal(
    solution.create_hash,
    hash({
      agentId: build.agent_id,
      name: build.name,
      purpose: build.purpose,
      spec: build.spec,
      workflowHash: build.workflow_hash,
      buildRequestId: buildId,
    })
  );
  const handoffs = events.filter((event) => event.kind === 'handed_off');
  assert.equal(handoffs.length, 1, 'single_atomic_handoff_required');
  const handoff = handoffs[0];
  assert.equal(handoff.input_version, build.input_version);
  assert.equal(handoff.details.solutionId, buildId);
  assert.equal(handoff.details.workflowHash, build.workflow_hash);
  assert(
    events.some(
      (event) =>
        event.kind === 'reviewed' &&
        event.details.review.valid === true &&
        event.details.workflowHash === build.workflow_hash &&
        at(event.created_at) <= at(handoff.created_at)
    ),
    'review_before_handoff_required'
  );

  if (authoringOnly) return authoringEvidence('reviewed_solution_handoff', handoff.id);

  assert.equal(solution.status, 'active', 'new_solution_not_active');
  assert.equal(solution.active_revision_id, null, 'first_release_only_audit');
  assert.equal(
    solution.environment_id,
    'orqaly-customer-webhook-preview-002',
    'new_isolated_environment_required'
  );
  assert(
    solution.approved_at && solution.tested_at && solution.deployment,
    'deployment_approval_and_test_required'
  );
  assert.equal(solution.deployment.workflowHash, build.workflow_hash);
  assert.match(solution.deployment.workflowId, /^[A-Za-z0-9_-]{1,128}$/);
  assert.match(solution.deployment.versionId, /^[A-Za-z0-9_-]{1,128}$/);
  assert(at(solution.created_at) <= at(handoff.created_at));
  assert(
    at(solution.approved_at) >= at(handoff.created_at),
    'handoff_did_not_separately_authorize_deploy'
  );
  assert(at(solution.deployment.verifiedAt) >= at(solution.approved_at));
  assert(at(solution.tested_at) >= at(solution.deployment.verifiedAt));
  const receipts = history.filter((item) => item.status === 'succeeded');
  const tests = receipts.filter((item) => item.mode === 'test');
  const production = receipts.filter((item) => item.mode === 'production');
  assert(tests.length && production.length, 'actual_test_and_production_receipts_required');
  assert.equal(
    new Set(receipts.map((item) => item.execution_id)).size,
    receipts.length,
    'duplicate_execution_receipt'
  );
  for (const receipt of history) {
    assert.equal(receipt.solution_id, buildId);
    assert.equal(receipt.revision_id, null);
    assert.equal(receipt.workflow_hash, build.workflow_hash);
    if (receipt.status !== 'succeeded') continue;
    assert.match(receipt.execution_id, /^[1-9][0-9]{0,30}$/);
    assert.equal(receipt.error_code, null);
    same(
      receipt.output,
      expectedSolutionOutput(solution.spec, receipt.input),
      'runtime_output_mismatch'
    );
    assert(at(receipt.created_at) >= at(solution.deployment.verifiedAt));
    assert(at(receipt.completed_at) >= at(receipt.created_at));
    if (receipt.mode === 'production')
      assert(
        tests.some((test) => at(test.completed_at) <= at(receipt.created_at)),
        'production_precedes_successful_test'
      );
  }
  assert(
    tests.some((test) => production.some((run) => hash(test.output) !== hash(run.output))),
    'distinct_real_outputs_required'
  );
  return {
    ...commonEvidence,
    auditScope: 'full_release',
    status: solution.status,
    handoffEventId: handoff.id,
    runtimeVerified: true,
    environmentId: solution.environment_id,
    deployment: solution.deployment,
    approvedAt: solution.approved_at,
    testedAt: solution.tested_at,
    history: history.map((item) => ({
      id: item.id,
      mode: item.mode,
      status: item.status,
      executionId: item.execution_id,
      workflowHash: item.workflow_hash,
      inputHash: hash(item.input),
      outputHash: item.output === null ? null : hash(item.output),
      input: safeTestPayload(item.input),
      output: safeTestPayload(item.output),
      createdAt: item.created_at,
      completedAt: item.completed_at,
    })),
    evidenceBoundary:
      'Persisted live AxWise operation results and n8n invocation/version receipts. This audit issues no new model or workflow execution and does not read the separate AxWise database.',
  };
}

async function readPreservation(db) {
  const p = [previewScope.tenantId, previewScope.ownerUserId, oldSolutionId];
  const solution = (
    await db.query(
      'SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
      p
    )
  ).rows[0];
  assert(solution && solution.status === 'active', 'old_solution_missing_or_changed');
  assert.equal(solution.workflow_hash, originalHash);
  assert.equal(hash(solution.workflow), originalHash);
  assert.equal(
    compileSolutionWorkflow({ id: oldSolutionId, spec: solution.spec }).workflowHash,
    originalHash
  );
  assert.equal(solution.deployment.workflowId, 'HJy9MlaOleeP8Kj4');
  assert.equal(solution.deployment.workflowHash, originalHash);
  assert.equal(solution.environment_id, 'orqaly-customer-webhook-preview-001');
  const revisions = (
    await db.query(
      'SELECT * FROM orqaly.solution_revisions WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY version LIMIT 100',
      p
    )
  ).rows;
  const rejected = revisions.find((item) => item.version === 2);
  const active = revisions.find((item) => item.version === 3);
  assert(rejected && active, 'old_revisions_missing');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.workflow_hash, rejectedHash);
  assert.equal(hash(rejected.workflow), rejectedHash);
  assert.equal(rejected.approved_at, null);
  assert.equal(rejected.deployment, null);
  assert.equal(active.status, 'active');
  assert.equal(solution.active_revision_id, active.id);
  assert.equal(revisions.filter((item) => item.status === 'active').length, 1);
  assert.equal(active.workflow_hash, activeHash);
  assert.equal(hash(active.workflow), activeHash);
  assert.equal(active.approved_workflow_hash, activeHash);
  assert.equal(active.review.workflowHash, activeHash);
  assert.equal(active.review.valid, true);
  assert.equal(active.base_revision_id, null);
  assert(active.approved_at && active.tested_at);
  assert.equal(active.deployment.workflowHash, activeHash);
  assert.equal(active.deployment.workflowId, 'C4F8IAhej7UFWnsB');
  assert.equal(active.deployment.versionId, '98c4201c-040d-4e3b-ad1f-02ada1a81711');
  const events = (
    await db.query(
      'SELECT * FROM orqaly.solution_revision_events WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY created_at,id LIMIT 500',
      p
    )
  ).rows;
  assert(
    events.some(
      (event) =>
        event.revision_id === rejected.id &&
        event.kind === 'rejected' &&
        event.workflow_hash === rejectedHash
    )
  );
  assert(
    !events.some(
      (event) =>
        event.revision_id === rejected.id &&
        ['approved', 'deploying', 'deployed', 'tested', 'activated'].includes(event.kind)
    )
  );
  const activeEvents = events.filter((event) => event.revision_id === active.id);
  let index = -1;
  for (const kind of ['reviewed', 'approved', 'deploying', 'deployed', 'tested', 'activated']) {
    const next = activeEvents.findIndex(
      (event, pos) => pos > index && event.kind === kind && event.workflow_hash === activeHash
    );
    assert(next > index, 'old_release_event_order_changed');
    index = next;
  }
  const history = (
    await db.query(
      'SELECT * FROM orqaly.solution_invocations WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY created_at,id LIMIT 100',
      p
    )
  ).rows;
  assert.equal(history.length, 6, 'old_history_count_changed');
  const receipts = history.filter((item) => item.status === 'succeeded');
  same(
    receipts.map((item) => item.execution_id),
    ['1', '2', '3', '4', '5'],
    'old_receipts_changed'
  );
  for (const item of receipts) {
    const original = ['1', '2', '3'].includes(item.execution_id);
    assert.equal(item.workflow_hash, original ? originalHash : activeHash);
    assert.equal(item.revision_id, original ? null : active.id);
    same(
      item.output,
      expectedSolutionOutput(original ? solution.spec : active.spec, item.input),
      'old_output_changed'
    );
  }
  const test = receipts.find((item) => item.execution_id === '4');
  const production = receipts.find((item) => item.execution_id === '5');
  assert.equal(test.mode, 'test');
  assert.equal(production.mode, 'production');
  for (const [item, name] of [
    [test, 'ALICE'],
    [production, 'BOB'],
  ]) {
    assert.equal(item.output.customer_name.trim(), name);
    assert(/^ +[A-Z]+ +$/.test(item.output.customer_name));
    assert.equal(item.output.email, item.input.email.toLowerCase());
  }
  assert(
    activeEvents.some(
      (event) =>
        event.kind === 'tested' &&
        event.details.executionId === '4' &&
        event.details.invocationId === test.id
    )
  );
  const unknown = history.filter((item) => item.status === 'outcome_unknown');
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].execution_id, null);
  assert.equal(unknown[0].output, null);
  assert.equal(unknown[0].workflow_hash, originalHash);
  assert(at(unknown[0].created_at) < at(test.created_at));
  const original = (
    await db.query(
      `SELECT r.id,r.request_hash,r.request_payload,r.final_artifact_id,a.content_hash,a.canonical_content
    FROM orqaly.workflow_runs r JOIN orqaly.artifacts a ON a.tenant_id=r.tenant_id AND a.run_id=r.id AND a.id=r.final_artifact_id
    WHERE r.tenant_id=$1 AND r.owner_user_id=$2 AND r.id=$3`,
      [previewScope.tenantId, previewScope.ownerUserId, smsRunId]
    )
  ).rows[0];
  assert(original, 'sms_goal_or_artifact_missing');
  assert.equal(textHash(original.canonical_content), artifactHash);
  assert.equal(original.content_hash, artifactHash);
  assert.equal(textHash(original.request_payload.request), original.request_hash);
  if (smsPreAcceptanceRequestHash !== null)
    assert.equal(
      original.request_hash,
      smsPreAcceptanceRequestHash,
      'sms_request_changed_since_pre_acceptance'
    );
  return {
    oldSolutionId,
    originalWorkflowHash: originalHash,
    activeRevisionId: active.id,
    activeVersion: 3,
    activeWorkflowHash: activeHash,
    historyCount: history.length,
    successfulExecutionIds: receipts.map((item) => item.execution_id),
    preservedUnknownCount: 1,
    smsRunId,
    smsFinalArtifactId: original.final_artifact_id,
    smsArtifactHash: artifactHash,
    smsRequestHash: original.request_hash,
    requestBaseline:
      smsPreAcceptanceRequestHash === null
        ? 'captured_now_not_pre_release'
        : 'read_only_pre_acceptance_checkpoint',
  };
}

async function ensureFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('audit_port_not_free')));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

export async function runPreviewAudit({
  buildId = null,
  checkpointOnly = false,
  authoringOnly = false,
} = {}) {
  if (!checkpointOnly) parseBuildId([buildId]);
  let proxy,
    client,
    proxyFailed = false;
  let stage = 'owned_proxy_connect';
  try {
    await ensureFreePort();
    const secret = execFileSync(
      'gcloud',
      [
        'secrets',
        'versions',
        'access',
        '2',
        '--secret=orqaly-v2-preview-001-db-api-url',
        `--project=${project}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    const url = new URL(secret.replace('@/', '@localhost/'));
    url.hostname = '127.0.0.1';
    url.port = String(port);
    url.searchParams.delete('host');
    url.searchParams.delete('sslmode');
    proxy = spawn(
      'cloud-sql-proxy',
      [
        `${project}:europe-west4:orqaly-v2-preview-001-pg`,
        '--gcloud-auth',
        '--address=127.0.0.1',
        `--port=${port}`,
      ],
      { stdio: 'ignore' }
    );
    proxy.once('error', () => {
      proxyFailed = true;
    });
    for (let n = 0; n < 40; n++) {
      await delay(250);
      assert(!proxyFailed && proxy.exitCode === null, 'audit_owned_proxy_failed');
      const candidate = new pg.Client({
        connectionString: url.href,
        connectionTimeoutMillis: 1000,
      });
      try {
        await candidate.connect();
        client = candidate;
        break;
      } catch {
        await candidate.end().catch(() => {});
      }
    }
    assert(client && !proxyFailed && proxy.exitCode === null, 'audit_database_unavailable');
    async function readOnly(tenant, owner, fn) {
      let primaryError;
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query(
          "SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
          [tenant, owner]
        );
        return await fn(client);
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        try {
          await client.query('ROLLBACK');
        } catch (error) {
          if (!primaryError) throw error;
        }
      }
    }
    const result = await readOnly(previewScope.tenantId, previewScope.ownerUserId, async (db) => {
      stage = 'api_role_read_only';
      const boundary = (
        await db.query(
          "SELECT pg_has_role(current_user,'orqaly_api','member') AS api_member,current_setting('transaction_read_only') AS read_only"
        )
      ).rows[0];
      assert.equal(boundary.api_member, true);
      assert.equal(boundary.read_only, 'on');
      stage = 'preservation_checkpoint';
      const preservation = await readPreservation(db);
      if (checkpointOnly)
        return {
          readOnly: true,
          checkpointOnly: true,
          capturedAt: new Date().toISOString(),
          preservation,
        };
      stage = 'new_build_scope_and_records';
      const params = [previewScope.tenantId, previewScope.ownerUserId, buildId];
      const build = (
        await db.query(
          'SELECT * FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
          params
        )
      ).rows[0];
      assert(build, 'build_not_found_in_exact_owner_scope');
      const solution = (
        await db.query(
          'SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
          params
        )
      ).rows[0];
      const attempts = (
        await db.query(
          'SELECT * FROM orqaly.solution_build_attempts WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 ORDER BY input_version LIMIT 100',
          params
        )
      ).rows;
      const events = (
        await db.query(
          'SELECT * FROM orqaly.solution_build_events WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 ORDER BY created_at,id LIMIT 500',
          params
        )
      ).rows;
      const history = (
        await db.query(
          'SELECT * FROM orqaly.solution_invocations WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY created_at,id LIMIT 100',
          params
        )
      ).rows;
      assert(
        attempts.length < 100 && events.length < 500 && history.length < 100,
        'bounded_audit_result_limit'
      );
      const sourceParams = [previewScope.tenantId, previewScope.ownerUserId, build.run_id];
      const sourceRun = (
        await db.query(
          'SELECT * FROM orqaly.workflow_runs WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
          sourceParams
        )
      ).rows[0];
      const artifacts = (
        await db.query(
          `SELECT a.id,a.kind,a.content_hash,a.canonical_content FROM orqaly.artifacts a
        JOIN orqaly.workflow_runs r ON r.tenant_id=a.tenant_id AND r.id=a.run_id
        WHERE r.tenant_id=$1 AND r.owner_user_id=$2 AND r.id=$3 AND a.id=ANY($4::uuid[])`,
          [...sourceParams, build.source_snapshot.artifacts.map((item) => item.artifactId)]
        )
      ).rows;
      stage = 'live_build_to_solution_evidence';
      return {
        readOnly: true,
        preservation,
        ...verifyBuildRecords({
          buildId,
          build,
          sourceRun,
          artifacts,
          solution,
          attempts,
          events,
          history,
          authoringOnly,
        }),
      };
    });
    if (checkpointOnly) return result;
    stage = 'tenant_and_owner_rls_denial';
    for (const [tenant, owner] of [
      [randomUUID(), previewScope.ownerUserId],
      [previewScope.tenantId, 'user_evidenceAnotherOwner'],
    ]) {
      const denied = await readOnly(tenant, owner, async (db) => {
        const params = [previewScope.tenantId, previewScope.ownerUserId, buildId];
        const counts = [];
        for (const table of [
          'solution_build_requests',
          'solution_build_attempts',
          'solution_build_events',
        ]) {
          const idColumn = table === 'solution_build_requests' ? 'id' : 'build_request_id';
          counts.push(
            (
              await db.query(
                `SELECT id FROM orqaly.${table} WHERE tenant_id=$1 AND owner_user_id=$2 AND ${idColumn}=$3`,
                params
              )
            ).rowCount
          );
        }
        return counts;
      });
      same(denied, [0, 0, 0], 'build_rls_leak');
    }
    return {
      verified: true,
      ...result,
      checks: [
        'existing_api_role_read_only_repeatable_transactions',
        'source_agent_instruction_and_answers_pinned_to_operation_hashes',
        ...(authoringOnly
          ? [
              'authoring_checkpoint_only_runtime_deliberately_not_verified',
              ...(result.handoffVerified
                ? ['exact_reviewed_native_snapshot_handed_off_once']
                : ['unconfirmed_build_has_no_solution_or_execution_history']),
            ]
          : [
              'durable_question_then_resumed_candidate',
              'exact_reviewed_native_snapshot_handed_off_once',
              'separate_approval_isolated002_deployment_test_production',
              'actual_persisted_execution_receipts_match_exact_version_and_spec',
            ]),
        'other_owner_and_tenant_build_reads_denied',
        'original_sms_artifact_and_old_solution_v3_six_history_rows_preserved',
      ],
    };
  } catch (error) {
    // Never forward raw database, URL, process, assertion payload, or model errors.
    throw Object.assign(new Error('read_only_preview_audit_failed'), {
      stage,
      safeCode:
        typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : 'TASK_SOLUTION_AUDIT_FAILED',
    });
  } finally {
    await client?.end().catch(() => {});
    proxy?.kill('SIGTERM');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseAuditArguments(process.argv.slice(2));
    console.log(JSON.stringify(await runPreviewAudit(options), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        verified: false,
        readOnly: true,
        stage: error.stage || 'explicit_build_id',
        code: error.safeCode || 'TASK_SOLUTION_AUDIT_FAILED',
        credentialsLogged: false,
      })
    );
    process.exitCode = 1;
  }
}
