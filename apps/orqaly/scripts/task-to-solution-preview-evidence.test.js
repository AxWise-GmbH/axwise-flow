// Synthetic records test the audit's rejection rules only. They are never
// imported by the live audit and are not evidence of a deployed release.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { AXWISE_OPERATION_CONTRACT_VERSION } from '../shared/workflow-v2/contracts.js';
import {
  compileSolutionBlueprint,
  compileSolutionWorkflow,
} from '../server/workflow-v2/solution-compiler.js';
import { deterministicUuid } from '../server/workflow-v2/ids.js';
import { reviewSolutionBuildWorkflow } from '../server/workflow-v2/solution-build-service.js';
import {
  parseBuildId,
  parseAuditArguments,
  previewScope,
  safeTestPayload,
  verifyBuildRecords,
} from './task-to-solution-preview-evidence.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const agentId = '33333333-3333-4333-8333-333333333333';
const stamp = (n) => `2026-09-05T16:00:${String(n).padStart(2, '0')}.000Z`;
const scoped = { tenant_id: previewScope.tenantId, owner_user_id: previewScope.ownerUserId };
function example() {
  const instruction = 'Build a name and email webhook; ask for the output name.';
  const taskText = 'Prepare a contact-data webhook.';
  const sourceRun = {
    ...scoped,
    id: runId,
    request_payload: { request: taskText },
    request_hash: createHash('sha256').update(taskText).digest('hex'),
  };
  const source = {
    runId,
    taskHash: sourceRun.request_hash,
    taskText,
    title: taskText,
    authority: 'reference_only',
    artifacts: [],
  };
  source.contextHash = hash(source);
  const agent = {
    id: agentId,
    name: 'Workflow builder',
    profileVersion: 1,
    roleLabel: 'Automation designer',
    description: '',
    instructions: '',
  };
  const profile = {
    ...agent,
    profileHash: hash(agent),
    profileReference: { id: '44444444-4444-4444-8444-444444444444', contentHash: 'c'.repeat(64) },
  };
  const spec = {
    kind: 'webhook_transform_v1',
    fields: [
      { source: 'name', target: 'customer_name', transform: 'trim' },
      { source: 'email', target: 'email', transform: 'lowercase' },
    ],
  };
  const question = {
    id: 'name_output',
    kind: 'information',
    prompt: 'Which output field receives the name?',
    reason: 'Output contract required.',
  };
  const answer = { questionId: question.id, value: 'customer_name' };
  const compiled = compileSolutionWorkflow({ id, spec });
  const checked = reviewSolutionBuildWorkflow({ id, workflow: compiled.workflow });
  const review = {
    valid: checked.valid,
    workflowHash: checked.workflowHash,
    issues: [],
    summary: checked.summary,
    changes: checked.changes,
  };
  const build = {
    ...scoped,
    id,
    solution_id: id,
    agent_id: agentId,
    run_id: runId,
    instruction,
    source_snapshot: source,
    agent_snapshot: profile,
    status: 'completed',
    name: 'Contact webhook',
    purpose: 'Normalize contact fields',
    questions: [],
    answers: [answer],
    unsupported_capabilities: [],
    last_error: null,
    spec,
    review,
    workflow: compiled.workflow,
    workflow_hash: compiled.workflowHash,
    input_version: 2,
    row_version: 5,
    create_hash: hash({ runId, agentId, instruction }),
  };
  const attempts = [1, 2].map((version) => {
    const attemptId = deterministicUuid(id, 'design', String(version));
    const operationId = deterministicUuid(attemptId, 'axwise');
    const input = {
      type: 'PrepareSolutionV1',
      buildRequestId: id,
      inputVersion: version,
      instruction,
      agent: { ...agent, profileHash: profile.profileHash },
      source: {
        runId,
        taskHash: source.taskHash,
        title: source.title,
        taskText,
        contextHash: source.contextHash,
      },
      answers: version === 1 ? [] : [answer],
      draft: null,
      supportedCapabilities: ['webhook_transform_v1'],
    };
    const prepared = {
      schemaVersion: 'axwise.solution-preparation.v1',
      buildRequestId: id,
      inputVersion: version,
      name: build.name,
      purpose: build.purpose,
      explanation: 'Bounded contact design.',
      outcome: version === 1 ? 'needs_input' : 'candidate',
      spec: version === 1 ? null : spec,
      partialFields:
        version === 1 ? [{ source: 'name', target: null, transform: 'trim' }] : spec.fields,
      questions: version === 1 ? [question] : [],
      unsupportedCapabilities: [],
    };
    return {
      ...scoped,
      build_request_id: id,
      id: attemptId,
      operation_id: operationId,
      input_version: version,
      input_hash: hash(input),
      status: 'completed',
      result: prepared,
      dispatch_count: 1,
      updated_at: stamp(version === 1 ? 1 : 3),
      envelope: {
        operationId,
        operationType: 'PrepareSolutionV1',
        contractVersion: AXWISE_OPERATION_CONTRACT_VERSION,
        owner: {
          tenantId: previewScope.tenantId,
          userId: previewScope.ownerUserId,
          organizationId: null,
        },
        workflow: {
          runId,
          stageId: deterministicUuid(id, 'design-stage'),
          stageAttemptId: attemptId,
        },
        canonicalInputHash: hash(input),
        input,
      },
    };
  });
  const event = (kind, version, n, details) => ({
    ...scoped,
    id: deterministicUuid(id, kind),
    build_request_id: id,
    kind,
    input_version: version,
    created_at: stamp(n),
    details,
  });
  const events = [
    event('created', 1, 0, {
      sourceHash: source.contextHash,
      agentProfileHash: profile.profileHash,
    }),
    event('design_completed', 1, 1, {
      operationId: attempts[0].operation_id,
      outcome: 'needs_input',
      questions: [question],
    }),
    {
      ...event('answered', 2, 2, { question, answer, previousInputVersion: 1 }),
      request_key: 'answer_key_001',
      request_hash: 'b'.repeat(64),
    },
    event('design_completed', 2, 3, {
      operationId: attempts[1].operation_id,
      outcome: 'candidate',
      questions: [],
    }),
    event('reviewed', 2, 4, { review, workflowHash: build.workflow_hash }),
    event('handed_off', 2, 5, { solutionId: id, workflowHash: build.workflow_hash }),
  ];
  const solution = {
    ...scoped,
    id,
    build_request_id: id,
    agent_id: agentId,
    agent_snapshot: profile,
    workflow: build.workflow,
    workflow_hash: build.workflow_hash,
    spec,
    status: 'active',
    active_revision_id: null,
    environment_id: 'orqaly-customer-webhook-preview-002',
    created_at: stamp(5),
    approved_at: stamp(6),
    tested_at: stamp(9),
    deployment: {
      workflowId: 'RealProviderId',
      versionId: 'ActualVersionId',
      workflowHash: build.workflow_hash,
      verifiedAt: stamp(7),
    },
    create_key: `build_${id}`,
    create_hash: hash({
      agentId,
      name: build.name,
      purpose: build.purpose,
      spec,
      workflowHash: build.workflow_hash,
      buildRequestId: id,
    }),
  };
  const history = [
    {
      input: { name: ' Ada ', email: 'ADA@EXAMPLE.COM' },
      output: { customer_name: 'Ada', email: 'ada@example.com' },
      mode: 'test',
      execution_id: '1',
      created_at: stamp(8),
      completed_at: stamp(9),
    },
    {
      input: { name: ' Grace ', email: 'GRACE@EXAMPLE.COM' },
      output: { customer_name: 'Grace', email: 'grace@example.com' },
      mode: 'production',
      execution_id: '2',
      created_at: stamp(10),
      completed_at: stamp(11),
    },
  ].map((receipt, index) => ({
    ...scoped,
    ...receipt,
    id: deterministicUuid(id, 'invocation', String(index)),
    solution_id: id,
    revision_id: null,
    workflow_hash: build.workflow_hash,
    status: 'succeeded',
    error_code: null,
  }));
  return { buildId: id, build, sourceRun, artifacts: [], solution, attempts, events, history };
}

function pendingQuestion() {
  const records = example();
  const result = records.attempts[0].result;
  const blueprint = compileSolutionBlueprint({ id, fields: result.partialFields });
  Object.assign(records.build, {
    status: 'needs_input',
    solution_id: null,
    input_version: 1,
    row_version: 1,
    answers: [],
    questions: result.questions,
    spec: null,
    review: null,
    workflow: blueprint.workflow,
    workflow_hash: blueprint.workflowHash,
  });
  records.solution = null;
  records.attempts = records.attempts.slice(0, 1);
  records.events = records.events.slice(0, 2);
  records.history = [];
  return records;
}

describe('task-to-Solution read-only evidence validator', () => {
  it('validates complete pinned records without provider calls', () => {
    const result = verifyBuildRecords(example());
    expect(result.solutionId).toBe(id);
    expect(result.history.map((item) => item.output.customer_name)).toEqual(['Ada', 'Grace']);
    expect(result.questionAnswerEvidence).toHaveLength(1);
  });

  it.each([
    [
      'owner',
      (x) => {
        x.build.owner_user_id = 'user_other';
      },
    ],
    [
      'source',
      (x) => {
        x.sourceRun.request_payload.request = 'Changed request';
      },
    ],
    [
      'agent pin',
      (x) => {
        x.build.agent_snapshot.profileHash = '0'.repeat(64);
      },
    ],
    [
      'operation hash',
      (x) => {
        x.attempts[1].input_hash = '0'.repeat(64);
      },
    ],
    [
      'answered input',
      (x) => {
        x.attempts[1].envelope.input.answers = [];
        x.attempts[1].input_hash = hash(x.attempts[1].envelope.input);
        x.attempts[1].envelope.canonicalInputHash = x.attempts[1].input_hash;
      },
    ],
    [
      'questions evidence',
      (x) => {
        x.events = x.events.filter((e) => e.kind !== 'answered');
      },
    ],
    [
      'handoff snapshot',
      (x) => {
        x.solution.workflow = { changed: true };
      },
    ],
    [
      'handoff identity',
      (x) => {
        x.solution.id = runId;
      },
    ],
    [
      'old environment reuse',
      (x) => {
        x.solution.environment_id = 'orqaly-customer-webhook-preview-001';
      },
    ],
    [
      'missing production receipt',
      (x) => {
        x.history[1].status = 'outcome_unknown';
      },
    ],
    [
      'incorrect output',
      (x) => {
        x.history[1].output = { customer_name: 'Ada', email: 'grace@example.com' };
      },
    ],
    [
      'production before test',
      (x) => {
        x.history[1].created_at = stamp(8);
      },
    ],
  ])('rejects broken %s linkage', (_label, mutate) => {
    const records = example();
    mutate(records);
    expect(() => verifyBuildRecords(records)).toThrow();
  });

  it('prints only explicitly allowlisted nonsecret acceptance payloads', () => {
    expect(safeTestPayload({ name: ' Ada ', email: 'ADA@EXAMPLE.COM' })).toBeTruthy();
    expect(safeTestPayload({ name: 'Unknown customer' })).toBeNull();
    expect(safeTestPayload({ email: 'ada@customer-company.com' })).toBeNull();
    expect(safeTestPayload({ token: 'Ada' })).toBeNull();
    expect(safeTestPayload(null)).toBeNull();
  });

  it('requires exactly one explicit new UUID before any live connection', () => {
    expect(parseBuildId([id])).toBe(id);
    for (const args of [[], [id, runId], ['invalid'], ['2031decc-b21e-48b5-9bd5-3ed3d4dfd024']]) {
      expect(() => parseBuildId(args)).toThrow();
    }
  });

  it('parses authoring-only as an explicit mode, never as the default', () => {
    expect(parseAuditArguments([id])).toEqual({ buildId: id, authoringOnly: false });
    expect(parseAuditArguments(['--authoring-only', id])).toEqual({
      buildId: id,
      authoringOnly: true,
    });
    for (const args of [
      ['--authoring-only'],
      [id, '--authoring-only'],
      ['--unknown', id],
      ['--authoring-only', id, runId],
    ]) {
      expect(() => parseAuditArguments(args)).toThrow();
    }
  });

  it('audits a live-shaped needs_input checkpoint without inventing a Solution or execution', () => {
    const records = pendingQuestion();
    const result = verifyBuildRecords({ ...records, authoringOnly: true });
    expect(result).toMatchObject({
      auditScope: 'authoring_only',
      phase: 'awaiting_customer_information',
      solutionId: null,
      needsInputObserved: true,
      resumedCandidateObserved: false,
      handoffVerified: false,
      reviewVerified: false,
      runtimeVerified: false,
      deploymentVerified: false,
      executionVerified: false,
    });
    expect(result.pendingQuestions[0].id).toBe('name_output');
    expect(result.notVerified).toContain('activation');
    expect(() => verifyBuildRecords(records)).toThrow();
  });

  it('keeps the original model question valid after a pre-answer native layout save', () => {
    const records = pendingQuestion();
    records.build.input_version = 2;
    records.build.row_version = 2;
    records.build.workflow.nodes[0].position = [40, 80];
    records.build.workflow_hash = hash(records.build.workflow);
    records.events.push({
      ...scoped,
      id: deterministicUuid(id, 'saved'),
      build_request_id: id,
      input_version: 2,
      kind: 'saved',
      created_at: stamp(2),
      details: { workflow: records.build.workflow, workflowHash: records.build.workflow_hash },
    });
    const result = verifyBuildRecords({ ...records, authoringOnly: true });
    expect(result).toMatchObject({
      buildInputVersion: 2,
      nativeSaveCount: 1,
      phase: 'awaiting_customer_information',
    });
  });

  it('accepts resumed attempt version3 after a layout save, not only sequential design versions', () => {
    const records = example();
    records.build.input_version = 3;
    const attempt = records.attempts[1];
    attempt.input_version = 3;
    attempt.id = deterministicUuid(id, 'design', '3');
    attempt.operation_id = deterministicUuid(attempt.id, 'axwise');
    attempt.result.inputVersion = 3;
    Object.assign(attempt.envelope, { operationId: attempt.operation_id });
    attempt.envelope.workflow.stageAttemptId = attempt.id;
    attempt.envelope.input.inputVersion = 3;
    attempt.envelope.canonicalInputHash = hash(attempt.envelope.input);
    attempt.input_hash = attempt.envelope.canonicalInputHash;
    for (const event of records.events.filter((event) => event.input_version === 2)) {
      event.input_version = 3;
      if (event.kind === 'answered') event.details.previousInputVersion = 2;
      if (event.kind === 'design_completed') event.details.operationId = attempt.operation_id;
    }
    const result = verifyBuildRecords({ ...records, authoringOnly: true });
    expect(result.attempts.map((item) => item.inputVersion)).toEqual([1, 3]);
    expect(result.resumedCandidateObserved).toBe(true);
  });

  it.each(['draft', 'reviewed'])(
    'audits an unconfirmed %s without a runnable Solution',
    (status) => {
      const records = example();
      Object.assign(records.build, { status, solution_id: null });
      if (status === 'draft') records.build.review = null;
      records.solution = null;
      records.history = [];
      records.events = records.events.filter(
        (event) => event.kind !== 'handed_off' && (status !== 'draft' || event.kind !== 'reviewed')
      );
      const result = verifyBuildRecords({ ...records, authoringOnly: true });
      expect(result.handoffVerified).toBe(false);
      expect(result.runtimeVerified).toBe(false);
      expect(result.reviewVerified).toBe(status === 'reviewed');
    }
  );

  it('verifies the exact completed handoff while leaving deployment and execution unverified', () => {
    const records = example();
    Object.assign(records.solution, {
      status: 'draft',
      deployment: null,
      approved_at: null,
      tested_at: null,
      environment_id: null,
    });
    records.history = [];
    const result = verifyBuildRecords({ ...records, authoringOnly: true });
    expect(result).toMatchObject({
      phase: 'reviewed_solution_handoff',
      handoffVerified: true,
      reviewVerified: true,
      observedSolutionStatus: 'draft',
      runtimeVerified: false,
    });
    expect(result).not.toHaveProperty('deployment');
    expect(result).not.toHaveProperty('history');
    expect(() => verifyBuildRecords(records)).toThrow();
  });

  it('does not bypass source and handoff validation in authoring-only mode', () => {
    const changedSource = pendingQuestion();
    changedSource.build.source_snapshot.contextHash = '0'.repeat(64);
    expect(() => verifyBuildRecords({ ...changedSource, authoringOnly: true })).toThrow();
    const changedHandoff = example();
    changedHandoff.solution.workflow = { changed: true };
    expect(() => verifyBuildRecords({ ...changedHandoff, authoringOnly: true })).toThrow();
  });

  it('rejects an unconfirmed build with a premature Solution or execution row', () => {
    const records = pendingQuestion();
    records.history = example().history.slice(0, 1);
    expect(() => verifyBuildRecords({ ...records, authoringOnly: true })).toThrow();
    records.history = [];
    records.solution = example().solution;
    expect(() => verifyBuildRecords({ ...records, authoringOnly: true })).toThrow();
  });
});
