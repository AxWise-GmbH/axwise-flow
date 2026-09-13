import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import {
  ActivityInputSchema,
  AXWISE_OPERATION_CONTRACT_VERSION,
  AxWiseOperationEnvelopeSchema,
  AxWiseOperationInputSchema,
  ExecutionAgentContractV1Schema,
} from '../../shared/workflow-v2/contracts.js';
import { AxWiseDispatchError } from './axwise-client.js';

function validateRunExecutionAgent(input, snapshot) {
  if (!snapshot) return;
  const compileStage = snapshot.stages.find((stage) => stage.kind === 'compile_scope');
  const initialCompile = snapshot.attempts
    .filter(
      (attempt) =>
        attempt.stageId === compileStage?.id && attempt.inputPayload?.type === 'CompileScopeV3'
    )
    .sort((left, right) => left.attemptNumber - right.attemptNumber)[0];
  const root = initialCompile?.inputPayload?.executionAgent;
  if (!root && !input.executionAgent) return;
  if (!root || !input.executionAgent) {
    throw new Error('Workflow activity is missing the run execution Agent binding');
  }
  const parsed = ExecutionAgentContractV1Schema.parse(root);
  if (
    parsed.runId !== snapshot.run.id ||
    canonicalHash(input.executionAgent) !== canonicalHash(parsed)
  ) {
    throw new Error('Workflow activity execution Agent does not match the initial Goal binding');
  }
}

export function buildAxWiseEnvelope(claim, context, snapshot = null) {
  if (
    !['compile_scope', 'execute_research', 'execution', 'evaluation', 'synthesis'].includes(
      context.stageKind
    )
  ) {
    throw new Error(`${context.stageKind} is not an AxWise operation stage`);
  }
  const input = AxWiseOperationInputSchema.parse(context.inputPayload);
  validateRunExecutionAgent(input, snapshot);
  const operationType = input.type;
  const canonicalInputHash = canonicalHash(input);
  if (canonicalInputHash !== context.inputHash || canonicalInputHash !== claim.inputHash) {
    throw new Error('persisted AxWise input hash does not match the typed operation input');
  }
  return AxWiseOperationEnvelopeSchema.parse({
    operationId: context.operationId,
    operationType,
    owner: {
      tenantId: claim.tenantId,
      organizationId: context.ownerOrganizationId,
      userId: context.ownerUserId,
    },
    workflow: {
      runId: claim.runId,
      stageId: context.stageId,
      stageAttemptId: context.attemptId,
    },
    contractVersion: AXWISE_OPERATION_CONTRACT_VERSION,
    canonicalInputHash,
    input,
  });
}

function normalizeAxWiseResponse(response) {
  if (response.status === 'accepted' || response.status === 'running') {
    return {
      kind: 'deferred',
      statusUrl: response.statusUrl,
      nextPollAt: new Date(Date.now() + response.retryAfterSeconds * 1000).toISOString(),
    };
  }
  if (response.status === 'failed') {
    return {
      kind: 'failed',
      retryable: response.retryable,
      errorClass: response.errorClass,
    };
  }
  return { kind: 'completed', result: response.result };
}

export function createActivityExecutor({ axwiseClient, internalExecutor }) {
  return {
    async execute({ claim, context, snapshot }) {
      const input = ActivityInputSchema.parse(context.inputPayload);
      validateRunExecutionAgent(input, snapshot);
      if (
        ['compile_scope', 'execute_research', 'execution', 'evaluation', 'synthesis'].includes(
          context.stageKind
        )
      ) {
        try {
          const response =
            claim.commandType === 'poll_activity'
              ? await axwiseClient.poll(
                  context.operationStatusUrl,
                  context.operationId,
                  claim.tenantId
                )
              : await axwiseClient.submit(buildAxWiseEnvelope(claim, context, snapshot));
          if (response.operationId !== context.operationId) {
            throw new AxWiseDispatchError('AxWise operation identity changed', {
              retryable: false,
              errorClass: 'AXWISE_OPERATION_ID_MISMATCH',
            });
          }
          if (response.canonicalInputHash !== context.inputHash) {
            throw new AxWiseDispatchError('AxWise operation input hash changed', {
              retryable: false,
              errorClass: 'AXWISE_INPUT_HASH_MISMATCH',
            });
          }
          return normalizeAxWiseResponse(response);
        } catch (error) {
          if (error instanceof AxWiseDispatchError) {
            if (error.disposition === 'ambiguous') {
              return {
                kind: 'ambiguous',
                statusUrl: axwiseClient.deterministicStatusUrl(context.operationId, claim.tenantId),
                nextPollAt: new Date(Date.now() + 2_000).toISOString(),
                errorClass: error.errorClass,
              };
            }
            if (error.disposition === 'not_found') {
              return {
                kind: 'redispatch',
                redispatchAt: new Date().toISOString(),
                errorClass: error.errorClass,
              };
            }
            return {
              kind: 'failed',
              retryable: error.retryable,
              errorClass: error.errorClass,
            };
          }
          throw error;
        }
      }
      return internalExecutor.execute({ claim, context });
    },
  };
}
