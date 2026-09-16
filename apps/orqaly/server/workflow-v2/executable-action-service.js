import crypto from 'node:crypto';
import { z } from 'zod';
import { PlanningResultSchema } from '../../shared/workflow-v2/contracts.js';
import {
  ExecutableActionAggregateSchema,
  ExecutableActionDecisionSchema,
  ExecutableActionProposalSchema,
  OperationalRecordExecutionOutputSchema,
} from '../../shared/workflow-v2/executable-actions.js';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  ExecutionEnvelopeV1Schema,
  gatewayGrantScopeV1Hash,
} from '../../services/agentic-control-plane/src/domain/runtime-contracts.js';

const UuidSchema = z.string().uuid();
const TERMINAL_RECEIPT_STATUSES = new Set(['succeeded', 'failed', 'outcome_unknown']);
const OPERATION_KEY = 'operational_record_create_v1';
const EXECUTION_POLICY = Object.freeze({
  version: 'orqaly_operational_record_execution_policy_v1',
  exactApprovalRequired: true,
  maximumAttempts: 1,
  reconciliation: 'manual_on_ambiguous_dispatch',
  destination: 'orqaly_internal_cloud_sql',
});

export class ExecutableActionError extends Error {
  constructor(code, message, status = 409, options = undefined) {
    super(message, options);
    this.name = 'ExecutableActionError';
    this.code = code;
    this.status = status;
  }
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function addMilliseconds(value, milliseconds) {
  return new Date(new Date(value).valueOf() + milliseconds).toISOString();
}

function hashOpaqueReference(reference) {
  return crypto.createHash('sha256').update(reference, 'utf8').digest('hex');
}

function bindingReference(binding) {
  return {
    contractVersion: binding.contractVersion,
    bindingKey: binding.bindingKey,
    bindingVersion: binding.bindingVersion,
    contentHash: binding.contentHash,
  };
}

function selectOperationBinding(manifest) {
  if (!manifest) return null;
  const entries = manifest.descriptorBindings.filter(
    (entry) =>
      entry.descriptor.descriptorKey === OPERATION_KEY &&
      entry.acceptedStepKinds.includes('connector_write')
  );
  if (entries.length !== 1) {
    throw new ExecutableActionError(
      'EXECUTION_BINDING_INVALID',
      'the operational record action must have exactly one pinned n8n binding',
      503
    );
  }
  const entry = entries[0];
  const binding = manifest.bindings.find(
    (candidate) =>
      candidate.bindingKey === entry.executorBinding.bindingKey &&
      candidate.bindingVersion === entry.executorBinding.bindingVersion &&
      candidate.contentHash === entry.executorBinding.contentHash
  );
  if (!binding) {
    throw new ExecutableActionError(
      'EXECUTION_BINDING_INVALID',
      'the pinned n8n binding is not registered',
      503
    );
  }
  return { descriptor: entry.descriptor, executorBinding: bindingReference(binding), binding };
}

function approvalPresentation(input, targetReference) {
  return {
    title: 'Create an operational record',
    summary: `Allow this Agent to create one tenant-scoped record named “${input.title}”.`,
    operation: { key: OPERATION_KEY, provider: 'orqaly_internal' },
    target: { type: 'operational_record_store', reference: targetReference },
    parameters: input,
    sideEffects: [
      'Creates one durable record in this Orqaly workspace.',
      'Does not contact a third party, send a message, or create a recurring job.',
    ],
  };
}

function receiptReferences(attestation) {
  return (attestation?.externalReferences || []).map((reference) => ({
    type: reference.referenceType,
    value: reference.referenceValue,
  }));
}

function referenceValue(attestation, type) {
  return attestation?.externalReferences?.find((reference) => reference.referenceType === type)
    ?.referenceValue;
}

function verifiedDescriptorOutput(receipt) {
  const attestation = receipt?.gatewayEffectAttestation;
  if (!attestation || receipt.status !== 'succeeded') return null;
  const parsed = OperationalRecordExecutionOutputSchema.safeParse({
    recordId: referenceValue(attestation, 'operational_record_id'),
    createdAt: referenceValue(attestation, 'operational_record_created_at'),
    canonicalInputHash: attestation.canonicalInputHash,
    receiptHash: attestation.receiptHash,
    signatureKeyId: attestation.signatureKeyId,
    signatureVerified: true,
    idempotencyState: referenceValue(attestation, 'idempotency_state'),
  });
  return parsed.success ? parsed.data : null;
}

function publicReceipt(row) {
  const receipt = row.dispatch_receipt;
  const attestation = receipt?.gatewayEffectAttestation;
  if (!attestation || receipt.status !== row.status) return null;
  const output = verifiedDescriptorOutput(receipt);
  const recordId = output?.recordId;
  const idempotencyState = output?.idempotencyState;
  const resultSummary =
    receipt.status === 'succeeded'
      ? `${idempotencyState === 'replayed' ? 'Reused' : 'Created'} operational record ${recordId || row.target_reference}.`
      : receipt.status === 'failed'
        ? 'The Gateway verified that the action failed.'
        : 'The Gateway could not determine the final effect.';
  return {
    status: receipt.status,
    receiptHash: attestation.receiptHash,
    signatureKeyId: attestation.signatureKeyId,
    signature: attestation.signature,
    observedAt: attestation.observedAt,
    externalReferences: receiptReferences(attestation),
    output,
    result: { summary: resultSummary },
  };
}

function rowToAggregate(row) {
  const approvalStatus =
    row.approval_decision === 'approve'
      ? 'approved'
      : row.approval_decision === 'reject'
        ? 'rejected'
        : 'pending';
  const hasExecution = row.attempt_id !== null;
  return ExecutableActionAggregateSchema.parse({
    version: 'orqaly_executable_action_aggregate_v1',
    action: {
      id: row.id,
      runId: row.workflow_run_id,
      status: row.status,
      rowVersion: Number(row.row_version),
      ...(row.recovery === 'confirmed_not_applied' ? { recovery: row.recovery } : {}),
      agent: { id: row.agent_id, name: row.agent_name },
      approval: {
        status: approvalStatus,
        bindingHash: row.approval_binding_hash,
        expiresAt: iso(row.approval_expires_at),
        presentation: row.approval_subject.presentation,
      },
      execution: hasExecution
        ? {
            executor: 'self_hosted_n8n',
            workflowId: row.executor_binding.workflowVersionId,
            workflowVersion: row.executor_binding.bindingVersion,
            ...(row.n8n_execution_reference
              ? { executionReference: row.n8n_execution_reference }
              : {}),
            ...(row.started_at ? { startedAt: iso(row.started_at) } : {}),
            ...(row.terminal_at ? { terminalAt: iso(row.terminal_at) } : {}),
          }
        : null,
      receipt: publicReceipt(row),
      error: row.error_code
        ? {
            code: row.error_code,
            message: row.sanitized_error || 'Execution did not complete.',
          }
        : null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    },
  });
}

function assertPersistedActionIntegrity(row) {
  const checks = [
    [
      canonicalJsonSha256(row.canonical_input),
      row.canonical_input_hash,
      'ACTION_INPUT_HASH_MISMATCH',
    ],
    [canonicalJsonSha256(row.action_intent), row.action_intent_hash, 'ACTION_INTENT_HASH_MISMATCH'],
    [
      canonicalJsonSha256(row.approval_subject),
      row.approval_binding_hash,
      'ACTION_APPROVAL_HASH_MISMATCH',
    ],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) {
      throw new ExecutableActionError(
        code,
        'stored execution authority failed integrity checks',
        409
      );
    }
  }
}

function providerResultIsComplete(receipt) {
  if (receipt.status !== 'succeeded') return true;
  return verifiedDescriptorOutput(receipt) !== null;
}

function completionFromReceipt(receipt, common, terminalAt) {
  if (!TERMINAL_RECEIPT_STATUSES.has(receipt.status)) {
    return {
      ...common,
      status: 'outcome_unknown',
      executionReference: receipt.executorReference,
      receipt: null,
      receiptHash: null,
      errorCode: 'N8N_NON_TERMINAL_RECEIPT',
      sanitizedError: 'n8n did not return a final signed result; manual reconciliation is required',
      terminalAt,
    };
  }
  if (!providerResultIsComplete(receipt)) {
    return {
      ...common,
      status: 'outcome_unknown',
      executionReference: receipt.executorReference,
      receipt,
      receiptHash: receipt.gatewayEffectAttestation.receiptHash,
      errorCode: 'GATEWAY_RESULT_OUTPUT_INVALID',
      sanitizedError: 'the signed result omitted required operational record output fields',
      terminalAt,
    };
  }
  return {
    ...common,
    status: receipt.status,
    executionReference: receipt.executorReference,
    receipt,
    receiptHash: receipt.gatewayEffectAttestation.receiptHash,
    errorCode: receipt.errorCode,
    sanitizedError: receipt.sanitizedError,
    terminalAt,
  };
}

export function createExecutableActionService({
  repository,
  n8nExecutor = null,
  bindingManifest = null,
  now = () => new Date(),
  randomUUID = () => crypto.randomUUID(),
  randomBytes = (size) => crypto.randomBytes(size),
  planningSchema = PlanningResultSchema,
} = {}) {
  const selectedBinding = bindingManifest ? selectOperationBinding(bindingManifest) : null;

  function requireConfigured() {
    if (!n8nExecutor || !selectedBinding) {
      throw new ExecutableActionError(
        'EXECUTION_NOT_CONFIGURED',
        'self-hosted n8n execution is not configured',
        503
      );
    }
  }

  async function identity(auth) {
    if (!auth?.userId) {
      throw new ExecutableActionError('UNAUTHENTICATED', 'sign-in required', 401);
    }
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    if (!tenantId) {
      throw new ExecutableActionError('TENANT_NOT_BOUND', 'identity has no tenant', 403);
    }
    return { tenantId, userId: auth.userId };
  }

  async function read(auth, rawRunId) {
    const runId = UuidSchema.parse(rawRunId);
    const owner = await identity(auth);
    const result = await repository.loadLatestExecutableAction(
      owner.tenantId,
      runId,
      owner.userId,
      iso(now())
    );
    if (!result.runFound) {
      throw new ExecutableActionError('RUN_NOT_FOUND', 'workflow run not found', 404);
    }
    if (result.row?.recovery_receipt && typeof n8nExecutor?.verifyReceipt === 'function') {
      const row = result.row;
      assertPersistedActionIntegrity(row);
      const receipt = await n8nExecutor.verifyReceipt(row.recovery_receipt, {
        organizationId: row.tenant_id,
        workspaceId: row.tenant_id,
        runId: row.workflow_run_id,
        stepId: row.step_id,
        attemptId: row.attempt_id,
        effectId: row.effect_id,
        descriptor: row.descriptor,
        executorBinding: bindingReference(row.executor_binding),
        canonicalInputHash: row.canonical_input_hash,
      });
      if (receipt.status !== 'succeeded' || !providerResultIsComplete(receipt)) {
        throw new ExecutableActionError(
          'RECONCILIATION_RECEIPT_INVALID',
          'stored receipt cannot prove success'
        );
      }
      result.row = await repository.reconcileExecutableAction(
        owner.tenantId,
        row.id,
        owner.userId,
        receipt.gatewayEffectAttestation.receiptHash
      );
    }
    return result.row
      ? rowToAggregate(result.row)
      : ExecutableActionAggregateSchema.parse({
          version: 'orqaly_executable_action_aggregate_v1',
          action: null,
        });
  }

  async function propose(auth, rawRunId, rawProposal) {
    requireConfigured();
    const runId = UuidSchema.parse(rawRunId);
    const proposal = ExecutableActionProposalSchema.parse(rawProposal);
    const owner = await identity(auth);
    const context = await repository.loadExecutableActionRunContext(
      owner.tenantId,
      runId,
      owner.userId
    );
    if (!context) {
      throw new ExecutableActionError('RUN_NOT_FOUND', 'workflow run not found', 404);
    }
    if (!['completed', 'completed_with_evidence_gaps'].includes(context.run.status)) {
      throw new ExecutableActionError(
        'RUN_NOT_EXECUTABLE',
        'the Goal must finish before its Agent can execute this action'
      );
    }
    if (!context.plan) {
      throw new ExecutableActionError(
        'RUN_PLAN_NOT_FOUND',
        'the Goal has no immutable Agent plan to authorize execution'
      );
    }
    const plan = planningSchema.parse(context.plan.payload);
    const task = plan.tasks.find((candidate) => candidate.taskKind === 'core_draft');
    if (!task) {
      throw new ExecutableActionError(
        'RUN_EXECUTOR_AGENT_NOT_FOUND',
        'the Goal plan has no executor Agent'
      );
    }

    const createdAt = iso(now());
    const actionId = randomUUID();
    const stepId = randomUUID();
    const effectId = randomUUID();
    const targetReference = `operational-record:${effectId}`;
    const canonicalInput = proposal.input;
    const canonicalInputHash = canonicalJsonSha256(canonicalInput);
    // The specialist drafting the plan is not the customer's delegated Agent.
    // Preserve the saved Goal-scoped identity and its immutable persona snapshot.
    const executorAgent = context.delegatedAgent || task.agent;
    const personaIdentity = {
      version: 'orqaly_workflow_agent_persona_v1',
      agent: executorAgent,
      planArtifactId: context.plan.artifactId,
      planArtifactHash: context.plan.artifactHash,
      taskInputHash: task.inputHash,
    };
    const personaVersion = {
      contractVersion: '1.0',
      personaId: `workflow-agent:${executorAgent.id}`,
      personaVersion: '1.0',
      contentHash: canonicalJsonSha256(personaIdentity),
    };
    const actionIntent = {
      version: 'orqaly_workflow_executable_action_intent_v1',
      organizationId: owner.tenantId,
      workspaceId: owner.tenantId,
      principalId: owner.userId,
      actionIntentId: actionId,
      runId,
      stepId,
      effectId,
      stepKind: 'connector_write',
      operation: proposal.operation,
      descriptor: selectedBinding.descriptor,
      executorBinding: selectedBinding.executorBinding,
      agentId: executorAgent.id,
      personaVersion,
      planArtifact: {
        id: context.plan.artifactId,
        hash: context.plan.artifactHash,
        taskInputHash: task.inputHash,
      },
      canonicalInput,
      canonicalInputHash,
      target: {
        targetType: 'operational_record_store',
        targetReference,
        targetHash: null,
      },
      idempotency: {
        scope: 'logical_effect',
        key: `${runId}:${proposal.idempotencyKey}`,
      },
      policyDigest: canonicalJsonSha256(EXECUTION_POLICY),
      createdAt,
    };
    const actionIntentHash = canonicalJsonSha256(actionIntent);
    const approvalExpiresAt = addMilliseconds(createdAt, 30 * 60_000);
    const presentation = approvalPresentation(canonicalInput, targetReference);
    const approvalSubject = {
      version: 'orqaly_workflow_exact_action_approval_v1',
      actionIntentId: actionId,
      actionIntentHash,
      operation: proposal.operation,
      canonicalInput,
      canonicalInputHash,
      target: actionIntent.target,
      agentId: executorAgent.id,
      personaVersion,
      policyDigest: actionIntent.policyDigest,
      presentation,
      expiresAt: approvalExpiresAt,
    };
    const approvalBindingHash = canonicalJsonSha256(approvalSubject);
    const result = await repository.insertExecutableAction(owner.tenantId, {
      tenantId: owner.tenantId,
      id: actionId,
      runId,
      ownerUserId: owner.userId,
      agentId: executorAgent.id,
      agentName: executorAgent.name,
      operationKey: proposal.operation,
      descriptor: selectedBinding.descriptor,
      executorBinding: {
        ...selectedBinding.executorBinding,
        workflowVersionId: selectedBinding.binding.workflowVersionId,
      },
      personaVersion,
      planArtifactId: context.plan.artifactId,
      planArtifactHash: context.plan.artifactHash,
      taskInputHash: task.inputHash,
      canonicalInput,
      canonicalInputHash,
      proposalIdempotencyKey: proposal.idempotencyKey,
      proposalHash: canonicalJsonSha256(proposal),
      actionIntent,
      actionIntentHash,
      approvalSubject,
      approvalBindingHash,
      approvalExpiresAt,
      stepId,
      effectId,
      targetReference,
      createdAt,
    });
    assertPersistedActionIntegrity(result.row);
    return { aggregate: rowToAggregate(result.row), idempotent: result.idempotent };
  }

  function executionEnvelope(row, owner, decisionTime, grantReference, attemptId) {
    assertPersistedActionIntegrity(row);
    const grantIssuedAt = iso(decisionTime);
    // Transport authority includes Cloud Run scale-to-zero startup headroom.
    // The n8n workflow itself remains bounded to 30 seconds and one tool call.
    const deadline = addMilliseconds(grantIssuedAt, 90_000);
    const grantExpiresAt = addMilliseconds(grantIssuedAt, 85_000);
    const envelope = {
      version: 'orqaly_execution_envelope_v1',
      contractVersion: '1.0',
      canonicalization: 'rfc8785_v1',
      organizationId: owner.tenantId,
      workspaceId: owner.tenantId,
      principalId: owner.userId,
      agentId: row.agent_id,
      personaVersion: row.persona_version,
      runId: row.workflow_run_id,
      stepId: row.step_id,
      attemptId,
      stepKind: 'connector_write',
      descriptor: row.descriptor,
      executorBinding: bindingReference(row.executor_binding),
      canonicalInput: row.canonical_input,
      canonicalInputHash: row.canonical_input_hash,
      effectProfile: { externality: 'write', mutation: 'create', flags: [] },
      dataEgressProfile: {
        mode: 'internal_only',
        destinationClasses: ['orqaly_private_tool_gateway'],
        providerClasses: [],
        regionClasses: ['eu'],
        permittedInputClassifications: ['internal'],
        permittedOutputClassifications: ['internal'],
        redactionRequired: false,
        dlpRequired: false,
        providerRetentionPolicyRequired: false,
        providerTrainingPolicyRequired: false,
      },
      sealedContextReferences: [],
      artifactReferences: [
        {
          referenceId: `artifact:${row.plan_artifact_id}`,
          contentHash: row.plan_artifact_hash,
          mediaType: 'application/json',
        },
      ],
      limits: {
        maximumTurns: 1,
        maximumTokens: 1,
        maximumToolCalls: 1,
        maximumRuntimeSeconds: 30,
        maximumAttempts: 1,
        maximumCostMinor: 0,
        currency: 'EUR',
      },
      issuedAt: grantIssuedAt,
      deadline,
      callbackReference: `workflow-v2-action:${row.id}`,
      policyDigest: row.action_intent.policyDigest,
      actionIntentId: row.id,
      actionIntentHash: row.action_intent_hash,
      approvalBindingHash: row.approval_binding_hash,
      idempotencyScope: row.action_intent.idempotency.scope,
      idempotencyKey: row.action_intent.idempotency.key,
      effectId: row.effect_id,
      targets: [row.action_intent.target],
      externalPreconditions: [],
      connectionReferences: ['orqaly-internal-operational-record-v1'],
      gatewayGrant: {
        version: 'orqaly_gateway_grant_reference_v1',
        reference: grantReference,
        scopeHash: '0'.repeat(64),
        audience: selectedBinding.binding.toolGatewayAudience,
        issuedAt: grantIssuedAt,
        expiresAt: grantExpiresAt,
      },
    };
    envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
    return ExecutionEnvelopeV1Schema.parse(envelope);
  }

  async function decide(auth, rawActionId, rawDecision, expectedRowVersion) {
    requireConfigured();
    const actionId = UuidSchema.parse(rawActionId);
    const decision = ExecutableActionDecisionSchema.parse(rawDecision);
    if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 0) {
      throw new ExecutableActionError(
        'IF_MATCH_REQUIRED',
        'an exact action row version is required',
        428
      );
    }
    const owner = await identity(auth);
    const decidedAt = iso(now());
    const row = await repository.loadExecutableAction(
      owner.tenantId,
      actionId,
      owner.userId,
      decidedAt
    );
    if (!row) {
      throw new ExecutableActionError('EXECUTABLE_ACTION_NOT_FOUND', 'action not found', 404);
    }
    assertPersistedActionIntegrity(row);
    const decisionHash = canonicalJsonSha256({
      ...decision,
      actionId,
      approvalBindingHash: row.approval_binding_hash,
    });
    const attemptId = randomUUID();
    const grantId = randomUUID();
    const grantReference = `ggr_${randomBytes(32).toString('base64url')}`;
    const envelope =
      decision.decision === 'approve'
        ? executionEnvelope(row, owner, decidedAt, grantReference, attemptId)
        : null;
    const result = await repository.decideExecutableAction(owner.tenantId, {
      tenantId: owner.tenantId,
      ownerUserId: owner.userId,
      actionId,
      expectedRowVersion,
      idempotencyKey: decision.idempotencyKey,
      decision: decision.decision,
      decisionHash,
      reason: decision.reason || null,
      decidedAt,
      attemptId,
      grantId,
      grantReferenceHash: hashOpaqueReference(grantReference),
      grantScopeHash: envelope?.gatewayGrant.scopeHash,
      organizationId: owner.tenantId,
      workspaceId: owner.tenantId,
      runId: row.workflow_run_id,
      stepId: row.step_id,
      effectId: row.effect_id,
      grantIssuedAt: envelope?.gatewayGrant.issuedAt,
      grantExpiresAt: envelope?.gatewayGrant.expiresAt,
      executionDeadlineAt: envelope?.deadline,
      envelope,
    });
    if (!result.dispatch) {
      return { aggregate: rowToAggregate(result.row), idempotent: result.idempotent };
    }

    const completionBase = {
      tenantId: owner.tenantId,
      ownerUserId: owner.userId,
      actionId,
      attemptId,
    };
    let completion;
    try {
      const receipt = await n8nExecutor.dispatch(result.dispatch.envelope);
      completion = completionFromReceipt(receipt, completionBase, iso(now()));
    } catch (error) {
      completion = {
        ...completionBase,
        status: error?.ambiguous ? 'outcome_unknown' : 'failed',
        executionReference: null,
        receipt: null,
        receiptHash: null,
        errorCode: error?.code || 'N8N_DISPATCH_FAILED',
        sanitizedError: error?.ambiguous
          ? 'execution may have applied; manual reconciliation is required'
          : 'execution was rejected before a verified effect was produced',
        terminalAt: iso(now()),
      };
    }
    const completed = await repository.completeExecutableAction(owner.tenantId, completion);
    return { aggregate: rowToAggregate(completed), idempotent: false };
  }

  return { read, propose, decide };
}
