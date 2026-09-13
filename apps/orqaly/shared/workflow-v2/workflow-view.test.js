// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AssistantMessageSchema, AssistantThreadSchema } from './assistant.js';
import { AssistantTurnEventSchema } from './assistant-events.js';
import { ASSISTANT_ROUTE_POLICY_VERSION } from './assistant-routing.js';
import { PublicWorkflowSnapshotSchema } from './contracts.js';
import {
  mergeLinkedWorkflows,
  projectAssistantWork,
  projectGoalWork,
  projectSolutionWork,
} from './workflow-view.js';

const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const digest = (character) => character.repeat(64);
const scope = { tenantId: id(1), ownerUserId: 'user_workflowfixture' };
const at = '2026-09-09T07:00:00.000Z';
const envelope = JSON.parse(
  readFileSync('shared/workflow-v2/fixtures/compile_scope_envelope_v2.json', 'utf8')
);

function thread() {
  return AssistantThreadSchema.parse({
    id: id(2),
    ...scope,
    ownerOrganizationId: null,
    title: 'Existing conversation',
    status: 'active',
    createdAt: at,
    updatedAt: at,
  });
}

function user({
  turnId = id(3),
  operationId = id(4),
  retryOfTurnId = null,
  route = 'AXWISE_ONE_SHOT',
  provenance = false,
} = {}) {
  return AssistantMessageSchema.parse({
    id: turnId,
    threadId: id(2),
    turnId,
    role: 'user',
    route,
    parts: [{ type: 'text', markdown: 'Compare official documentation.' }],
    axwiseOperationId: operationId,
    workflowRunId: null,
    retryOfTurnId,
    createdAt: at,
    ...(provenance
      ? {
          requestedIntent: 'research',
          resolvedRoute: route,
          routePolicyVersion: ASSISTANT_ROUTE_POLICY_VERSION,
          routeReasonCode: 'requested_research',
        }
      : {}),
  });
}

function response(request, outcome = 'completed', messageId = id(5)) {
  return AssistantMessageSchema.parse({
    id: messageId,
    threadId: request.threadId,
    turnId: request.turnId,
    role: 'assistant',
    route: request.route,
    axwiseOperationId: request.axwiseOperationId,
    workflowRunId: null,
    retryOfTurnId: null,
    createdAt: at,
    parts:
      outcome === 'completed'
        ? [
            {
              type: 'artifact',
              title: 'Research result',
              contentType: 'text/markdown',
              markdown: '# Findings\n\nA bounded report.',
            },
          ]
        : [
            {
              type: 'operation_status',
              operationId: request.axwiseOperationId,
              status: outcome,
              retryMode: outcome === 'failed' ? 'new_attempt' : 'none',
            },
          ],
  });
}

function event(request, type, sequence) {
  return AssistantTurnEventSchema.parse({
    id: id(100 + sequence),
    threadId: request.threadId,
    turnId: request.turnId,
    type,
    route: request.route,
    operationId: request.axwiseOperationId,
    retryOfTurnId: request.retryOfTurnId,
    sequence,
    occurredAt: at,
    payload: {},
  });
}

function goal() {
  return PublicWorkflowSnapshotSchema.parse({
    run: {
      id: envelope.workflow.runId,
      ...scope,
      ownerOrganizationId: null,
      mode: 'simple',
      status: 'completed_with_evidence_gaps',
      request: envelope.input.request,
      requestHash: envelope.canonicalInputHash,
      rowVersion: 7,
      evidenceReadiness: 'ready_with_gaps',
      finalArtifact: { artifactId: id(21), artifactHash: digest('a'), kind: 'final_markdown' },
    },
    stages: [
      {
        id: envelope.workflow.stageId,
        stageKey: 'compile_scope',
        kind: 'compile_scope',
        status: 'completed',
        rowVersion: 2,
        ordinal: 0,
        inputHash: envelope.canonicalInputHash,
        outputArtifact: { artifactId: id(20), artifactHash: digest('b'), kind: 'scope' },
      },
    ],
    attempts: [
      {
        id: envelope.workflow.stageAttemptId,
        stageId: envelope.workflow.stageId,
        attemptNumber: 1,
        status: 'succeeded',
        operationId: envelope.operationId,
        inputHash: envelope.canonicalInputHash,
        inputPayload: envelope.input,
        rowVersion: 2,
      },
    ],
    dependencies: [],
    approvals: [],
  });
}

function build(overrides = {}) {
  return {
    id: id(30),
    runId: envelope.workflow.runId,
    agentId: id(31),
    name: 'Saved preparation',
    instruction: 'Create a bounded automation.',
    purpose: 'A requested output, without a PRD prerequisite.',
    status: 'completed',
    rowVersion: 4,
    inputVersion: 1,
    workflowHash: digest('c'),
    solutionId: id(32),
    source: {
      runId: envelope.workflow.runId,
      taskHash: digest('d'),
      contextHash: digest('e'),
      authority: 'reference_only',
      artifacts: [],
      threadId: id(2),
      turnId: id(3),
    },
    operation: { id: id(33), status: 'succeeded', inputVersion: 1 },
    runnable: false,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function solution(overrides = {}) {
  return {
    id: id(32),
    buildRequestId: id(30),
    name: 'Saved automation',
    purpose: 'Requested work.',
    version: 2,
    revisionId: id(34),
    workflowHash: digest('f'),
    rowVersion: 9,
    status: 'active',
    runtimeActive: false,
    deployment: { receiptId: id(35) },
    lastError: 'REVISION_ACTIVATION_PENDING_VERIFICATION',
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('read-only user-facing Workflow projection', () => {
  it('keeps existing Goal snapshot identity, hashes, gaps and attempts without asserting success', () => {
    const snapshot = goal();
    const projected = projectGoalWork(snapshot);
    expect(projected.source).toEqual({ kind: 'goal_run', id: snapshot.run.id });
    expect(projected.status).toMatchObject({
      raw: 'completed_with_evidence_gaps',
      label: 'Completed with evidence gaps',
    });
    expect(projected.evidenceReadiness).toBe('ready_with_gaps');
    expect(projected.requestHash).toBe(envelope.canonicalInputHash);
    expect(projected.attempts[0]).toMatchObject({
      operationId: envelope.operationId,
      inputHash: envelope.canonicalInputHash,
    });
    expect(projected.attempts[0]).not.toHaveProperty('leaseToken');
    expect(projected).not.toHaveProperty('commands');
    expect(projected).not.toHaveProperty('allowedActions');
    expect(projected).not.toHaveProperty('verifiedSuccess');
  });

  it('does not assume final_markdown or a PRD-titled request establishes a PRD artifact type', () => {
    const projected = projectGoalWork(goal());
    expect(projected.objective).toContain('PRD');
    expect(projected.outputs.every((output) => output.artifactType === null)).toBe(true);
    expect(projected.inputs).toBeNull();
  });

  it('rejects ambiguous Goal stage/attempt identities and foreign stage links', () => {
    const snapshot = goal();
    expect(() =>
      projectGoalWork({ ...snapshot, stages: [...snapshot.stages, snapshot.stages[0]] })
    ).toThrow('duplicate_stage_identity');
    expect(() =>
      projectGoalWork({ ...snapshot, attempts: [...snapshot.attempts, snapshot.attempts[0]] })
    ).toThrow('duplicate_attempt_identity');
    expect(() =>
      projectGoalWork({ ...snapshot, attempts: [{ ...snapshot.attempts[0], stageId: id(99) }] })
    ).toThrow('attempt_stage_mismatch');
  });

  it('preserves canonical artifact references and loaded lineage without recalculating hashes', () => {
    const snapshot = goal();
    const reference = snapshot.run.finalArtifact;
    snapshot.stages.push({ ...snapshot.stages[0], id: id(22), outputArtifact: reference });
    const projected = projectGoalWork(snapshot, {
      artifactRecords: [
        {
          ...reference,
          contentType: 'text/markdown',
          inputHash: digest('e'),
          sourceArtifactIds: [id(20)],
        },
      ],
    });
    expect(projected.outputs).toHaveLength(2);
    expect(projected.outputs[0]).toEqual({
      reference: { family: 'canonical_artifact', runId: snapshot.run.id, ...reference },
      artifactType: null,
      contentType: 'text/markdown',
      inputHash: digest('e'),
      sourceArtifactIds: [id(20)],
    });
    expect(() =>
      projectGoalWork(snapshot, { artifactRecords: [{ ...reference, artifactHash: digest('f') }] })
    ).toThrow('artifact_record_mismatch');
    snapshot.stages[0].outputArtifact = { ...reference, artifactHash: digest('b') };
    expect(() => projectGoalWork(snapshot)).toThrow('conflicting_artifact_reference');
  });

  it.each(['DIRECT_ANSWER', 'DISCOVER', 'PROPOSE_GOAL', 'START_GOAL', 'CONTINUE_GOAL'])(
    'does not manufacture another Workflow for %s messages',
    (route) => {
      expect(projectAssistantWork({ thread: thread(), messages: [user({ route })] })).toEqual([]);
    }
  );

  it('uses an immutable message-part locator for Research, not a fabricated canonical artifact', () => {
    const request = user({ provenance: true });
    const [projected] = projectAssistantWork({
      thread: thread(),
      messages: [request, response(request)],
    });
    expect(projected.routing).toMatchObject({
      requestedIntent: 'research',
      resolvedRoute: 'AXWISE_ONE_SHOT',
    });
    expect(projected.status).toMatchObject({ raw: 'completed', basis: 'message' });
    expect(projected.outputs[0].reference).toEqual({
      family: 'assistant_message_part',
      threadId: id(2),
      turnId: id(3),
      messageId: id(5),
      partIndex: 0,
    });
    expect(projected.outputs[0].reference).not.toHaveProperty('artifactHash');
    expect(projected.outputs[0].reference).not.toHaveProperty('artifactId');
    expect(projected.evidenceReadiness).toBeNull();
    expect(projected.outputs[0].model).toBeNull();
  });

  it('keeps legacy routing unknown and a persisted request without outcome status unknown', () => {
    const [projected] = projectAssistantWork({ thread: thread(), messages: [user()] });
    expect(projected.routing.requestedIntent).toBeNull();
    expect(projected.status).toEqual({
      domain: 'assistant_operation',
      raw: null,
      label: 'Status unknown',
      basis: 'not_recorded',
    });
    expect(projected.outputs).toEqual([]);
  });

  it('rejects incomplete or mismatched route provenance instead of upgrading a legacy record', () => {
    const request = user();
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [{ ...request, requestedIntent: 'research' }],
      })
    ).toThrow('incomplete_route_provenance');
    const routed = user({ provenance: true });
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [{ ...routed, resolvedRoute: 'START_GOAL' }],
      })
    ).toThrow('route_provenance_mismatch');
  });

  it('folds exact retry links into one work item while retaining separate attempt identities', () => {
    const first = user();
    const retry = user({ turnId: id(6), operationId: id(7), retryOfTurnId: first.turnId });
    const [projected] = projectAssistantWork({
      thread: thread(),
      messages: [retry, response(retry, 'completed', id(8)), first, response(first, 'failed')],
    });
    expect(projected.source.id).toBe(first.turnId);
    expect(projected.attempts.map((attempt) => attempt.turnId)).toEqual([
      first.turnId,
      retry.turnId,
    ]);
    expect(projected.attempts.map((attempt) => attempt.status.raw)).toEqual([
      'failed',
      'completed',
    ]);
    expect(projected.outputs[0].reference.turnId).toBe(retry.turnId);
    expect(projected.lineageComplete).toBe(true);
  });

  it('preserves missing retry ancestry as a gap, and rejects cycles or competing retry children', () => {
    const missing = user({ retryOfTurnId: id(99) });
    const [partial] = projectAssistantWork({ thread: thread(), messages: [missing] });
    expect(partial.lineageComplete).toBe(false);
    expect(partial.issues).toContainEqual({ code: 'retry_parent_not_loaded', turnId: id(99) });
    const first = user({ retryOfTurnId: id(6) });
    const second = user({ turnId: id(6), operationId: id(7), retryOfTurnId: first.turnId });
    expect(() => projectAssistantWork({ thread: thread(), messages: [first, second] })).toThrow(
      'cyclic_retry_lineage'
    );
    first.retryOfTurnId = null;
    const branch = user({ turnId: id(9), operationId: id(10), retryOfTurnId: first.turnId });
    expect(() =>
      projectAssistantWork({ thread: thread(), messages: [first, second, branch] })
    ).toThrow('ambiguous_retry_branch');
  });

  it('lets terminal recorded outcomes defeat later stale progress, without inventing a missing result', () => {
    const request = user();
    const events = [event(request, 'completed', 2), event(request, 'running', 3)];
    const [recorded] = projectAssistantWork({
      thread: thread(),
      messages: [request, response(request)],
      events,
    });
    expect(recorded.status).toMatchObject({ raw: 'completed', basis: 'message' });
    const [partial] = projectAssistantWork({ thread: thread(), messages: [request], events });
    expect(partial.status).toMatchObject({ raw: 'completed', basis: 'event' });
    expect(partial.status.label).toBe('Completion event recorded');
    expect(partial.outputs).toEqual([]);
    expect(partial.issues).toContainEqual({ code: 'terminal_result_not_recorded' });
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [request, response(request)],
        events: [event(request, 'failed', 1)],
      })
    ).toThrow('conflicting_terminal_status');
  });

  it.each(['submitted', 'input_requested', 'approval_requested', 'cancel_requested', 'cancelled'])(
    'preserves recorded %s lifecycle labels without command affordances',
    (type) => {
      const request = user();
      const [projected] = projectAssistantWork({
        thread: thread(),
        messages: [request],
        events: [event(request, type, 1)],
      });
      expect(projected.status.raw).toBe(type);
      expect(projected).not.toHaveProperty('allowedActions');
    }
  );

  it('rejects mismatched, duplicate, orphan or transient assistant records', () => {
    const request = user();
    const reply = response(request);
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [request, { ...reply, axwiseOperationId: id(99) }],
      })
    ).toThrow('assistant_response_identity_mismatch');
    expect(() => projectAssistantWork({ thread: thread(), messages: [reply] })).toThrow(
      'assistant_user_not_loaded'
    );
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [request, { ...reply, persisted: false }],
      })
    ).toThrow('persisted_messages_required');
    // Real send/resume pendingMessage has no persisted flag inside the message.
    for (const pending of ['accepted', 'running', 'cancel_requested']) {
      expect(() =>
        projectAssistantWork({ thread: thread(), messages: [request, response(request, pending)] })
      ).toThrow('persisted_terminal_message_required');
    }
    expect(() => projectAssistantWork({ thread: thread(), messages: [request, request] })).toThrow(
      'duplicate_message_identity'
    );
    expect(() =>
      projectAssistantWork({ thread: thread(), messages: [{ ...request, threadId: id(99) }] })
    ).toThrow('thread_identity_mismatch');
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [request],
        events: [{ ...event(request, 'running', 1), operationId: id(99) }],
      })
    ).toThrow('event_identity_mismatch');
    expect(() =>
      projectAssistantWork({
        thread: thread(),
        messages: [request],
        events: [event(request, 'running', 1), event(request, 'completed', 1)],
      })
    ).toThrow('ambiguous_event_sequence');
  });

  it('keeps an Automation draft and its source refs separate from runtime readiness', () => {
    const source = build();
    source.source.artifacts.push(goal().run.finalArtifact);
    const projected = projectSolutionWork({ scope, build: source });
    expect(projected.outputs[0]).toMatchObject({
      artifactType: 'automation',
      reference: {
        family: 'automation',
        kind: 'build_draft',
        buildRequestId: source.id,
        workflowHash: source.workflowHash,
        rowVersion: source.rowVersion,
      },
    });
    expect(projected.inputs[0].family).toBe('canonical_artifact');
    expect(projected.sourceContext.authority).toBe('reference_only');
    expect(projected).not.toHaveProperty('runnable');
    expect(projected).not.toHaveProperty('runtime');
  });

  it('does not call Research request creation an authoritative lifecycle update time', () => {
    const request = user();
    const observed = { ...event(request, 'running', 1), occurredAt: '2026-09-09T07:30:00.000Z' };
    const [projected] = projectAssistantWork({
      thread: thread(),
      messages: [request],
      events: [observed],
    });
    expect(projected.createdAt).toBe(at);
    expect(projected.updatedAt).toBeNull();
    expect(projected.attempts[0].createdAt).toBe(at);
  });

  it('keeps actual revision hashes and uncertain execution receipts instead of declaring activation or success', () => {
    const value = solution();
    const revision = {
      id: value.revisionId,
      solutionId: value.id,
      version: value.version,
      workflowHash: value.workflowHash,
      rowVersion: 2,
      status: 'active',
    };
    const invocation = {
      id: id(40),
      status: 'outcome_unknown',
      workflowHash: digest('c'),
      revisionId: id(41),
      executionId: null,
      mode: 'test',
    };
    const projected = projectSolutionWork({
      scope,
      solution: value,
      revisions: [revision],
      invocations: [invocation],
    });
    expect(projected.outputs).toHaveLength(1);
    expect(projected.outputs[0].reference).toMatchObject({
      family: 'automation',
      kind: 'solution_revision',
      solutionId: value.id,
      revisionId: value.revisionId,
      workflowHash: value.workflowHash,
      version: 2,
      rowVersion: null,
    });
    expect(projected.runtime).toEqual({
      runtimeActive: false,
      deploymentRecorded: true,
      lastError: value.lastError,
    });
    expect(projected.status.label).toBe('Recorded active');
    expect(projected.outputs[0].status.label).toBe('Recorded active');
    expect(projected.receipts[0]).toMatchObject({
      revisionId: id(41),
      workflowHash: digest('c'),
      status: { raw: 'outcome_unknown' },
      executionId: null,
      revisionContext: 'not_loaded',
      solutionBinding: 'caller_read_context',
    });
    expect(() =>
      projectSolutionWork({
        scope,
        solution: value,
        revisions: [{ ...revision, workflowHash: digest('a') }],
      })
    ).toThrow('conflicting_revision_reference');
    expect(() =>
      projectSolutionWork({
        scope,
        solution: value,
        revisions: [{ ...revision, solutionId: id(99) }],
      })
    ).toThrow('revision_solution_mismatch');
  });

  it('rejects foreign receipt identity and loaded revision/hash conflicts without rebinding older receipts', () => {
    const value = solution();
    const invocation = {
      id: id(40),
      solutionId: value.id,
      revisionId: value.revisionId,
      workflowHash: value.workflowHash,
      status: 'succeeded',
    };
    const project = (receipt, revisions = []) =>
      projectSolutionWork({ scope, solution: value, invocations: [receipt], revisions });
    expect(project(invocation).receipts[0]).toMatchObject({
      solutionBinding: 'supplied_identity',
      revisionContext: 'matched_loaded_reference',
    });
    expect(() => project({ ...invocation, solutionId: id(99) })).toThrow(
      'invocation_solution_mismatch'
    );
    expect(() => project({ ...invocation, ownerUserId: 'user_other' })).toThrow(
      'invocation_scope_mismatch'
    );
    expect(() => project({ ...invocation, tenantId: id(99) })).toThrow('invocation_scope_mismatch');
    expect(() => project({ ...invocation, workflowHash: digest('a') })).toThrow(
      'invocation_revision_hash_mismatch'
    );
    expect(() => project({ ...invocation, revisionId: '' })).toThrow('identity_required');
    expect(project({ ...invocation, workflowHash: null }).receipts[0].revisionContext).toBe(
      'hash_not_recorded'
    );
    const older = {
      id: id(41),
      solutionId: value.id,
      version: 1,
      workflowHash: digest('c'),
      status: 'superseded',
    };
    const oldReceipt = { ...invocation, revisionId: older.id, workflowHash: older.workflowHash };
    expect(project(oldReceipt).receipts[0].revisionContext).toBe('not_loaded');
    expect(project(oldReceipt, [older]).receipts[0].revisionContext).toBe(
      'matched_loaded_reference'
    );
    expect(() => project({ ...oldReceipt, workflowHash: value.workflowHash }, [older])).toThrow(
      'invocation_revision_hash_mismatch'
    );
  });

  it('joins only explicit Goal→Build→Solution links and preserves every child ledger status', () => {
    const goalView = projectGoalWork(goal());
    const buildView = projectSolutionWork({ scope, build: build() });
    const solutionView = projectSolutionWork({ scope, solution: solution() });
    const secondBuild = projectSolutionWork({
      scope,
      build: build({ id: id(50), solutionId: null, status: 'needs_input' }),
    });
    const [merged] = mergeLinkedWorkflows([solutionView, secondBuild, buildView, goalView]);
    expect(merged.id).toBe(goalView.id);
    expect(merged.status.raw).toBe('completed_with_evidence_gaps');
    expect(merged.children).toHaveLength(2);
    expect(merged.children.find((item) => item.id === buildView.id).children[0]).toEqual(
      solutionView
    );
    expect(merged.children.find((item) => item.id === secondBuild.id).status.raw).toBe(
      'needs_input'
    );
  });

  it('keeps unresolved or legacy links explicit instead of manufacturing a PRD or chat parent', () => {
    const value = solution({ buildRequestId: null });
    const [standalone] = mergeLinkedWorkflows([projectSolutionWork({ scope, solution: value })]);
    expect(standalone.children).toEqual([]);
    expect(standalone.inputs).toBeNull();
    expect(standalone.links.goalRunId).toBeNull();
    const [unresolved] = mergeLinkedWorkflows([projectSolutionWork({ scope, build: build() })]);
    expect(unresolved.issues).toContainEqual({
      code: 'goal_parent_not_loaded',
      id: envelope.workflow.runId,
    });
  });

  it('namespaces identical raw IDs and refuses conflicting duplicates or mixed scopes', () => {
    const goalView = projectGoalWork(goal());
    const saved = projectSolutionWork({
      scope,
      solution: solution({ id: goalView.source.id, buildRequestId: null }),
    });
    expect(mergeLinkedWorkflows([saved, goalView])).toHaveLength(2);
    expect(saved.id).not.toBe(goalView.id);
    expect(mergeLinkedWorkflows([goalView, structuredClone(goalView)])).toHaveLength(1);
    expect(() =>
      mergeLinkedWorkflows([goalView, { ...goalView, title: 'Conflicting snapshot' }])
    ).toThrow('ambiguous_duplicate_projection');
    const other = projectSolutionWork({
      scope: { ...scope, ownerUserId: 'user_other' },
      solution: solution(),
    });
    expect(() => mergeLinkedWorkflows([goalView, other])).toThrow('mixed_scope');
    expect(() => projectSolutionWork({ solution: solution() })).toThrow('identity_required');
  });

  it('fails closed on conflicting existing Solution linkage and ambiguous adapter input', () => {
    const parent = projectSolutionWork({ scope, build: build({ solutionId: id(99) }) });
    const child = projectSolutionWork({ scope, solution: solution() });
    expect(() => mergeLinkedWorkflows([parent, child])).toThrow('conflicting_solution_link');
    expect(() => projectSolutionWork({ scope, build: build(), solution: solution() })).toThrow(
      'one_solution_backing_required'
    );
    expect(() =>
      projectSolutionWork({ scope, build: build({ source: { runId: id(99) } }) })
    ).toThrow('source_run_mismatch');
    expect(() => projectSolutionWork({ scope, solution: solution({ tenantId: id(99) }) })).toThrow(
      'scope_mismatch'
    );
  });

  it('requires view identity to match its explicit backing rather than trusting a supplied display ID', () => {
    const projected = projectGoalWork(goal());
    expect(() => mergeLinkedWorkflows([{ ...projected, id: 'solution:forged' }])).toThrow(
      'projection_identity_mismatch'
    );
    expect(() =>
      mergeLinkedWorkflows([{ ...projected, source: { kind: 'unknown', id: id(99) } }])
    ).toThrow('source_kind_required');
  });

  it.each(['future_status', '__proto__', 'toString'])(
    'keeps unknown status %s serializable without inherited labels',
    (raw) => {
      const projected = projectSolutionWork({ scope, solution: solution({ status: raw }) });
      expect(projected.status).toMatchObject({ raw, label: 'Status unknown' });
      expect(JSON.parse(JSON.stringify(projected))).toEqual(projected);
    }
  );

  it('does not mutate source DTOs or share mutable nested view data', () => {
    const snapshot = freeze(goal());
    const sourceBuild = freeze(build());
    const sourceSolution = freeze(solution());
    const request = user();
    const assistant = freeze({
      thread: thread(),
      messages: [request, response(request)],
      events: [],
    });
    const before = JSON.stringify([snapshot, sourceBuild, sourceSolution, assistant]);
    const views = [
      projectGoalWork(snapshot),
      projectSolutionWork({ scope, build: sourceBuild }),
      projectSolutionWork({ scope, solution: sourceSolution }),
      ...projectAssistantWork(assistant),
    ];
    const merged = mergeLinkedWorkflows(freeze(views));
    expect(JSON.parse(JSON.stringify(merged))).toEqual(merged);
    merged[0].title = 'Presentation only';
    expect(JSON.stringify([snapshot, sourceBuild, sourceSolution, assistant])).toBe(before);
    expect(views[0].title).toBe(snapshot.run.request);
  });

  it('rejects non-JSON projection additions instead of silently dropping them', () => {
    const projected = projectGoalWork(goal());
    expect(() => mergeLinkedWorkflows([{ ...projected, unexpected: () => null }])).toThrow(
      'json_value_required'
    );
    expect(() => mergeLinkedWorkflows([{ ...projected, unexpected: new Date(at) }])).toThrow(
      'plain_json_required'
    );
    const cyclic = { ...projected };
    cyclic.unexpected = cyclic;
    expect(() => mergeLinkedWorkflows([cyclic])).toThrow('json_value_required');
  });
});
