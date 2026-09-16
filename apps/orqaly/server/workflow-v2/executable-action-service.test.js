import { describe, expect, it, vi } from 'vitest';
import { createExecutableActionService } from './executable-action-service.js';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const RUN_ID = '20000000-0000-4000-8000-000000000002';
const AGENT_ID = '30000000-0000-4000-8000-000000000003';
const PLAN_ID = '40000000-0000-4000-8000-000000000004';
const WORKFLOW_ID = '50000000-0000-4000-8000-000000000005';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const USER_ID = 'user_preview1';

const bindingManifest = {
  descriptorBindings: [
    {
      descriptor: {
        contractVersion: '1.0',
        descriptorKey: 'operational_record_create_v1',
        schemaVersion: '1.0',
        contentHash: HASH_A,
      },
      executorBinding: {
        contractVersion: '1.0',
        bindingKey: 'tool_gateway_connector_v1',
        bindingVersion: '1.0',
        contentHash: HASH_B,
      },
      acceptedStepKinds: ['connector_write'],
    },
  ],
  bindings: [
    {
      contractVersion: '1.0',
      bindingKey: 'tool_gateway_connector_v1',
      bindingVersion: '1.0',
      contentHash: HASH_B,
      workflowVersionId: WORKFLOW_ID,
      toolGatewayAudience: 'https://tool-gateway.agentic.internal',
    },
  ],
};

const plan = {
  tasks: [
    {
      taskKind: 'core_draft',
      inputHash: HASH_C,
      agent: {
        id: AGENT_ID,
        name: 'Launch operator',
        capabilities: ['prd'],
        toolIds: [],
        qualityScoreMicros: 900_000,
        costPerRunCents: 20,
      },
    },
  ],
};

function databaseRow(action) {
  return {
    tenant_id: action.tenantId,
    id: action.id,
    workflow_run_id: action.runId,
    owner_user_id: action.ownerUserId,
    agent_id: action.agentId,
    agent_name: action.agentName,
    status: 'proposed',
    operation_key: action.operationKey,
    descriptor: action.descriptor,
    executor_binding: action.executorBinding,
    persona_version: action.personaVersion,
    plan_artifact_id: action.planArtifactId,
    plan_artifact_hash: action.planArtifactHash,
    task_input_hash: action.taskInputHash,
    canonical_input: action.canonicalInput,
    canonical_input_hash: action.canonicalInputHash,
    proposal_idempotency_key: action.proposalIdempotencyKey,
    proposal_hash: action.proposalHash,
    action_intent: action.actionIntent,
    action_intent_hash: action.actionIntentHash,
    approval_subject: action.approvalSubject,
    approval_binding_hash: action.approvalBindingHash,
    approval_expires_at: new Date(action.approvalExpiresAt),
    approval_decision: null,
    approval_decision_hash: null,
    approval_idempotency_key: null,
    approval_reason: null,
    approved_by_user_id: null,
    decided_at: null,
    step_id: action.stepId,
    effect_id: action.effectId,
    target_reference: action.targetReference,
    attempt_id: null,
    n8n_execution_reference: null,
    dispatch_receipt: null,
    receipt_hash: null,
    error_code: null,
    sanitized_error: null,
    started_at: null,
    execution_deadline_at: null,
    terminal_at: null,
    row_version: 0,
    created_at: new Date(action.createdAt),
    updated_at: new Date(action.createdAt),
  };
}

function repositoryFixture() {
  let row = null;
  return {
    resolveTenant: vi.fn(async () => TENANT_ID),
    loadExecutableActionRunContext: vi.fn(async () => ({
      run: { id: RUN_ID, ownerUserId: USER_ID, status: 'completed', request: 'Prepare launch' },
      plan: { artifactId: PLAN_ID, artifactHash: HASH_C, inputHash: HASH_A, payload: plan },
    })),
    insertExecutableAction: vi.fn(async (_tenantId, action) => {
      row = databaseRow(action);
      return { row, idempotent: false };
    }),
    loadLatestExecutableAction: vi.fn(async () => ({ runFound: true, row })),
    loadExecutableAction: vi.fn(async () => row),
    decideExecutableAction: vi.fn(async (_tenantId, decision) => {
      row = {
        ...row,
        status: decision.decision === 'approve' ? 'running' : 'rejected',
        approval_decision: decision.decision,
        approval_decision_hash: decision.decisionHash,
        approval_idempotency_key: decision.idempotencyKey,
        approval_reason: decision.reason,
        approved_by_user_id: decision.ownerUserId,
        decided_at: new Date(decision.decidedAt),
        attempt_id: decision.decision === 'approve' ? decision.attemptId : null,
        started_at: decision.decision === 'approve' ? new Date(decision.decidedAt) : null,
        execution_deadline_at:
          decision.decision === 'approve' ? new Date(decision.executionDeadlineAt) : null,
        terminal_at: decision.decision === 'reject' ? new Date(decision.decidedAt) : null,
        row_version: 1,
        updated_at: new Date(decision.decidedAt),
      };
      return {
        row,
        idempotent: false,
        dispatch: decision.decision === 'approve' ? { envelope: decision.envelope } : null,
      };
    }),
    completeExecutableAction: vi.fn(async (_tenantId, completion) => {
      row = {
        ...row,
        status: completion.status,
        n8n_execution_reference: completion.executionReference,
        dispatch_receipt: completion.receipt,
        receipt_hash: completion.receiptHash,
        error_code: completion.errorCode,
        sanitized_error: completion.sanitizedError,
        terminal_at: new Date(completion.terminalAt),
        updated_at: new Date(completion.terminalAt),
        row_version: 2,
      };
      return row;
    }),
    reconcileExecutableAction: vi.fn(async (_tenantId, _id, _owner, receiptHash) => {
      row = {
        ...row,
        status: 'succeeded',
        dispatch_receipt: row.recovery_receipt,
        receipt_hash: receiptHash,
        n8n_execution_reference: row.recovery_receipt.executorReference,
        row_version: row.row_version + 1,
      };
      return row;
    }),
    current: () => row,
  };
}

function terminalReceipt(envelope) {
  const recordId = '60000000-0000-4000-8000-000000000006';
  return {
    version: 'orqaly_dispatch_receipt_v1',
    contractVersion: '1.0',
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    runId: envelope.runId,
    stepId: envelope.stepId,
    attemptId: envelope.attemptId,
    descriptor: envelope.descriptor,
    executorBinding: envelope.executorBinding,
    status: 'succeeded',
    observedAt: '2026-09-04T12:00:02.000Z',
    executorReference: 'n8n-execution-42',
    effectId: envelope.effectId,
    gatewayEffectAttestation: {
      receiptHash: 'd'.repeat(64),
      canonicalInputHash: envelope.canonicalInputHash,
      signatureKeyId: 'preview-key-1',
      signature: 'signature_value_12345',
      observedAt: '2026-09-04T12:00:02.000Z',
      externalReferences: [
        { referenceType: 'idempotency_state', referenceValue: 'created' },
        {
          referenceType: 'operational_record_created_at',
          referenceValue: '2026-09-04T12:00:02.000Z',
        },
        { referenceType: 'operational_record_id', referenceValue: recordId },
      ],
    },
    errorCode: null,
    sanitizedError: null,
  };
}

function serviceFixture(executor) {
  const repository = repositoryFixture();
  let uuidCounter = 10;
  const service = createExecutableActionService({
    repository,
    n8nExecutor: executor,
    bindingManifest,
    planningSchema: { parse: (value) => value },
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    randomUUID: () => `70000000-0000-4000-8000-${String(uuidCounter++).padStart(12, '0')}`,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  return { service, repository };
}

async function propose(service) {
  return service.propose({ userId: USER_ID }, RUN_ID, {
    version: 'orqaly_executable_action_proposal_v1',
    idempotencyKey: 'preview-action-001',
    operation: 'operational_record_create_v1',
    input: { title: 'Configure provider', details: 'Record the completed setup.' },
  });
}

describe('WorkflowV2 executable action service', () => {
  it.each([true, false])(
    'recovers a committed result only after signature verification (%s)',
    async (valid) => {
      let storedReceipt;
      const executor = {
        dispatch: vi.fn(async (envelope) => {
          storedReceipt = terminalReceipt(envelope);
          throw Object.assign(new Error('response lost after commit'), {
            code: 'n8n_http_error',
            ambiguous: true,
          });
        }),
        verifyReceipt: vi.fn(async (receipt, identity) => {
          expect(identity).toMatchObject({
            organizationId: TENANT_ID,
            runId: RUN_ID,
            effectId: receipt.effectId,
            attemptId: receipt.attemptId,
            canonicalInputHash: receipt.gatewayEffectAttestation.canonicalInputHash,
          });
          if (!valid) throw new Error('gateway_attestation_signature_invalid');
          return receipt;
        }),
      };
      const { service, repository } = serviceFixture(executor);
      const proposed = await propose(service);
      await service.decide(
        { userId: USER_ID },
        proposed.aggregate.action.id,
        {
          version: 'orqaly_executable_action_decision_v1',
          idempotencyKey: 'recover-approval-001',
          decision: 'approve',
        },
        0
      );
      repository.current().recovery_receipt = storedReceipt;
      if (valid) {
        const result = await service.read({ userId: USER_ID }, RUN_ID);
        expect(result.action).toMatchObject({
          status: 'succeeded',
          rowVersion: 3,
          receipt: { output: { signatureVerified: true } },
        });
        expect(repository.reconcileExecutableAction).toHaveBeenCalledWith(
          TENANT_ID,
          proposed.aggregate.action.id,
          USER_ID,
          storedReceipt.gatewayEffectAttestation.receiptHash
        );
        expect(repository.current().error_code).toBe('n8n_http_error');
      } else {
        await expect(service.read({ userId: USER_ID }, RUN_ID)).rejects.toThrow(
          'gateway_attestation_signature_invalid'
        );
        expect(repository.reconcileExecutableAction).not.toHaveBeenCalled();
        expect(repository.current().status).toBe('outcome_unknown');
      }
      expect(executor.dispatch).toHaveBeenCalledTimes(1);
      expect(executor.verifyReceipt).toHaveBeenCalledTimes(1);
    }
  );

  it('binds the immutable Goal Agent and executes only after exact approval', async () => {
    let dispatchedEnvelope;
    let repository;
    const n8nExecutor = {
      dispatch: vi.fn(async (envelope) => {
        dispatchedEnvelope = envelope;
        expect(repository.current()).toMatchObject({
          status: 'running',
          execution_deadline_at: new Date('2026-09-04T12:01:30.000Z'),
          row_version: 1,
        });
        return terminalReceipt(envelope);
      }),
    };
    const fixture = serviceFixture(n8nExecutor);
    const { service } = fixture;
    repository = fixture.repository;
    const proposed = await propose(service);

    expect(proposed.aggregate.action).toMatchObject({
      status: 'proposed',
      agent: { id: AGENT_ID, name: 'Launch operator' },
      approval: {
        status: 'pending',
        presentation: {
          operation: { key: 'operational_record_create_v1', provider: 'orqaly_internal' },
          parameters: { title: 'Configure provider', details: 'Record the completed setup.' },
        },
      },
    });
    expect(n8nExecutor.dispatch).not.toHaveBeenCalled();

    const decided = await service.decide(
      { userId: USER_ID },
      proposed.aggregate.action.id,
      {
        version: 'orqaly_executable_action_decision_v1',
        idempotencyKey: 'approval-action-001',
        decision: 'approve',
      },
      proposed.aggregate.action.rowVersion
    );

    expect(dispatchedEnvelope).toMatchObject({
      organizationId: TENANT_ID,
      workspaceId: TENANT_ID,
      principalId: USER_ID,
      agentId: AGENT_ID,
      runId: RUN_ID,
      stepKind: 'connector_write',
      canonicalInput: { title: 'Configure provider', details: 'Record the completed setup.' },
      effectProfile: { externality: 'write', mutation: 'create' },
      idempotencyScope: 'logical_effect',
      connectionReferences: ['orqaly-internal-operational-record-v1'],
      deadline: '2026-09-04T12:01:30.000Z',
      limits: { maximumRuntimeSeconds: 30, maximumAttempts: 1 },
      gatewayGrant: {
        audience: 'https://tool-gateway.agentic.internal',
        expiresAt: '2026-09-04T12:01:25.000Z',
      },
    });
    expect(dispatchedEnvelope.targets[0].targetType).toBe('operational_record_store');
    expect(decided.aggregate.action).toMatchObject({
      status: 'succeeded',
      execution: {
        executor: 'self_hosted_n8n',
        workflowId: WORKFLOW_ID,
        executionReference: 'n8n-execution-42',
      },
      receipt: {
        status: 'succeeded',
        receiptHash: 'd'.repeat(64),
        output: {
          recordId: '60000000-0000-4000-8000-000000000006',
          createdAt: '2026-09-04T12:00:02.000Z',
          canonicalInputHash: dispatchedEnvelope.canonicalInputHash,
          receiptHash: 'd'.repeat(64),
          signatureKeyId: 'preview-key-1',
          signatureVerified: true,
          idempotencyState: 'created',
        },
        result: { summary: expect.stringContaining('Created operational record') },
      },
    });
  });

  it('binds approval and execution to the saved delegated Agent, not the drafting specialist', async () => {
    const n8nExecutor = { dispatch: vi.fn(async (envelope) => terminalReceipt(envelope)) };
    const { service, repository } = serviceFixture(n8nExecutor);
    const context = await repository.loadExecutableActionRunContext();
    const delegated = {
      id: '90000000-0000-4000-8000-000000000009',
      name: 'B2B Operations Agent',
      executionAgent: { personaVersion: 'saved-goal-persona-v1' },
    };
    repository.loadExecutableActionRunContext.mockResolvedValue({
      ...context,
      delegatedAgent: delegated,
    });
    const proposed = await propose(service);
    expect(proposed.aggregate.action.agent).toEqual({ id: delegated.id, name: delegated.name });
    expect(repository.current().approval_subject.agentId).toBe(delegated.id);
    await service.decide(
      { userId: USER_ID },
      proposed.aggregate.action.id,
      {
        version: 'orqaly_executable_action_decision_v1',
        idempotencyKey: 'delegated-agent-approval-001',
        decision: 'approve',
      },
      proposed.aggregate.action.rowVersion
    );
    expect(n8nExecutor.dispatch.mock.calls[0][0]).toMatchObject({
      agentId: delegated.id,
      personaVersion: { personaId: `workflow-agent:${delegated.id}` },
    });
  });

  it('rejects without dispatching', async () => {
    const n8nExecutor = { dispatch: vi.fn() };
    const { service } = serviceFixture(n8nExecutor);
    const proposed = await propose(service);
    const rejected = await service.decide(
      { userId: USER_ID },
      proposed.aggregate.action.id,
      {
        version: 'orqaly_executable_action_decision_v1',
        idempotencyKey: 'rejection-action-001',
        decision: 'reject',
        reason: 'Not yet.',
      },
      0
    );
    expect(rejected.aggregate.action.status).toBe('rejected');
    expect(n8nExecutor.dispatch).not.toHaveBeenCalled();
  });

  it('fails closed as outcome_unknown after an ambiguous write dispatch', async () => {
    const ambiguous = Object.assign(new Error('network ended after send'), {
      code: 'n8n_dispatch_failed',
      ambiguous: true,
    });
    const { service } = serviceFixture({ dispatch: vi.fn(async () => Promise.reject(ambiguous)) });
    const proposed = await propose(service);
    const result = await service.decide(
      { userId: USER_ID },
      proposed.aggregate.action.id,
      {
        version: 'orqaly_executable_action_decision_v1',
        idempotencyKey: 'approval-action-002',
        decision: 'approve',
      },
      0
    );
    expect(result.aggregate.action.status).toBe('outcome_unknown');
    expect(result.aggregate.action.error).toMatchObject({
      code: 'n8n_dispatch_failed',
      message: expect.stringContaining('manual reconciliation'),
    });
  });

  it('rejects a signed success that does not realize the descriptor output contract', async () => {
    const executor = {
      dispatch: vi.fn(async (envelope) => {
        const receipt = terminalReceipt(envelope);
        receipt.gatewayEffectAttestation.externalReferences =
          receipt.gatewayEffectAttestation.externalReferences.filter(
            (reference) => reference.referenceType !== 'operational_record_created_at'
          );
        return receipt;
      }),
    };
    const { service } = serviceFixture(executor);
    const proposed = await propose(service);

    const result = await service.decide(
      { userId: USER_ID },
      proposed.aggregate.action.id,
      {
        version: 'orqaly_executable_action_decision_v1',
        idempotencyKey: 'approval-action-output-invalid',
        decision: 'approve',
      },
      0
    );

    expect(result.aggregate.action).toMatchObject({
      status: 'outcome_unknown',
      receipt: null,
      error: {
        code: 'GATEWAY_RESULT_OUTPUT_INVALID',
        message: expect.stringContaining('required operational record output fields'),
      },
    });
  });
});
