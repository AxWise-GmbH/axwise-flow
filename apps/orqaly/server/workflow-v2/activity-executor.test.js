import { describe, expect, it, vi } from 'vitest';
import compileScopeV3Envelope from '../../shared/workflow-v2/fixtures/compile_scope_envelope_v3.json';
import scopeCompletion from '../../shared/workflow-v2/fixtures/scope_completion_result_v2.json';
import synthesisGolden from '../../shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import { buildAxWiseEnvelope, createActivityExecutor } from './activity-executor.js';

function boundExecutionAgent(input) {
  return {
    schemaVersion: 'orqaly.execution-agent.v1',
    id: '90000000-0000-4000-8000-000000000001',
    runId: compileScopeV3Envelope.workflow.runId,
    owner: {
      tenantId: compileScopeV3Envelope.owner.tenantId,
      userId: compileScopeV3Envelope.owner.userId,
    },
    lifetime: 'temporary',
    source: {
      threadId: input.assistantContext.threadId,
      turnId: input.assistantContext.currentTurnId,
      taskHash: sha256Hex(input.assistantContext.instruction.content),
    },
    executorPersona: {
      role: 'task_executor',
      profileVersion: 'axwise_executor_persona_v1',
      provider: 'axwise',
      binding: 'fixed_profile_contract',
    },
    memory: { scope: 'thread_and_goal', crossThread: false },
    runtime: { provider: 'orqaly_workflow_v2', isolation: 'tenant_user' },
    capabilities: {
      research: true,
      planning: true,
      artifactProduction: true,
      approvalGates: true,
    },
    tools: { externalActions: false, executionProvider: null },
  };
}

function snapshotWithExecutionAgent(executionAgent) {
  const input = structuredClone(compileScopeV3Envelope.input);
  input.executionAgent = executionAgent;
  return {
    run: { id: executionAgent.runId },
    stages: [{ id: compileScopeV3Envelope.workflow.stageId, kind: 'compile_scope' }],
    attempts: [
      {
        stageId: compileScopeV3Envelope.workflow.stageId,
        attemptNumber: 1,
        inputPayload: input,
      },
    ],
  };
}

function stageEnvelope(input, stageKind, executionAgent) {
  const inputHash = canonicalHash(input);
  const claim = {
    tenantId: executionAgent.owner.tenantId,
    runId: executionAgent.runId,
    inputHash,
  };
  const context = {
    stageKind,
    stageId: compileScopeV3Envelope.workflow.stageId,
    attemptId: compileScopeV3Envelope.workflow.stageAttemptId,
    operationId: compileScopeV3Envelope.operationId,
    ownerOrganizationId: null,
    ownerUserId: executionAgent.owner.userId,
    inputHash,
    inputPayload: input,
  };
  return buildAxWiseEnvelope(claim, context, snapshotWithExecutionAgent(executionAgent));
}

describe('workflow v2 AxWise activity envelope', () => {
  it('dispatches an exact persisted CompileScopeV3 input without flattening its context', () => {
    const input = structuredClone(compileScopeV3Envelope.input);
    const claim = {
      tenantId: compileScopeV3Envelope.owner.tenantId,
      runId: compileScopeV3Envelope.workflow.runId,
      inputHash: compileScopeV3Envelope.canonicalInputHash,
    };
    const context = {
      stageKind: 'compile_scope',
      stageId: compileScopeV3Envelope.workflow.stageId,
      attemptId: compileScopeV3Envelope.workflow.stageAttemptId,
      operationId: compileScopeV3Envelope.operationId,
      ownerOrganizationId: null,
      ownerUserId: compileScopeV3Envelope.owner.userId,
      inputHash: compileScopeV3Envelope.canonicalInputHash,
      inputPayload: input,
    };

    expect(buildAxWiseEnvelope(claim, context)).toEqual(compileScopeV3Envelope);
    expect(() => buildAxWiseEnvelope({ ...claim, inputHash: '0'.repeat(64) }, context)).toThrow(
      /input hash/
    );
  });

  it('dispatches the persisted execution Agent contract to AxWise and binds it to the envelope', () => {
    const input = structuredClone(compileScopeV3Envelope.input);
    input.executionAgent = boundExecutionAgent(input);
    const inputHash = canonicalHash(input);
    const claim = {
      tenantId: compileScopeV3Envelope.owner.tenantId,
      runId: compileScopeV3Envelope.workflow.runId,
      inputHash,
    };
    const context = {
      stageKind: 'compile_scope',
      stageId: compileScopeV3Envelope.workflow.stageId,
      attemptId: compileScopeV3Envelope.workflow.stageAttemptId,
      operationId: compileScopeV3Envelope.operationId,
      ownerOrganizationId: null,
      ownerUserId: compileScopeV3Envelope.owner.userId,
      inputHash,
      inputPayload: input,
    };

    const envelope = buildAxWiseEnvelope(claim, context);
    expect(envelope.input.executionAgent).toEqual(input.executionAgent);
    expect(envelope.canonicalInputHash).toBe(canonicalHash(envelope.input));

    const wrongOwner = structuredClone(input);
    wrongOwner.executionAgent.owner.userId = 'user_wrongowner123';
    const wrongHash = canonicalHash(wrongOwner);
    expect(() =>
      buildAxWiseEnvelope(
        { ...claim, inputHash: wrongHash },
        { ...context, inputHash: wrongHash, inputPayload: wrongOwner }
      )
    ).toThrow(/execution Agent must match/);
  });

  it('retains the exact initial Agent contract across every later AxWise input type', () => {
    const compileInput = structuredClone(compileScopeV3Envelope.input);
    const executionAgent = boundExecutionAgent(compileInput);
    const scope = scopeCompletion.artifact;
    const acceptedScope = {
      artifactId: scope.artifactId,
      artifactHash: scope.artifactHash,
      kind: scope.kind,
    };
    const correction = 'Cover adult cats only.';
    const inputs = [
      {
        stageKind: 'compile_scope',
        input: {
          type: 'ReviseScopeV2',
          executionAgent,
          acceptedScope,
          correction,
          correctionSourceSpans: [
            {
              start: 0,
              end: correction.length,
              text: correction,
              sha256: sha256Hex(correction),
              offsetUnit: 'utf16_code_units',
            },
          ],
        },
      },
      {
        stageKind: 'execute_research',
        input: {
          type: 'ExecuteResearchV2',
          executionAgent,
          acceptedScope,
          scope: scope.payload,
          selectedEvidence: [],
        },
      },
      {
        stageKind: 'execution',
        input: { ...structuredClone(synthesisGolden.cases[0].input), executionAgent },
      },
    ];

    for (const { stageKind, input } of inputs) {
      expect(stageEnvelope(input, stageKind, executionAgent).input.executionAgent).toEqual(
        executionAgent
      );
    }

    const drifted = structuredClone(inputs[1].input);
    drifted.executionAgent.lifetime = 'persistent';
    expect(() => stageEnvelope(drifted, 'execute_research', executionAgent)).toThrow(
      /does not match the initial Goal binding/
    );
  });

  it('fails before internal planning when an Agent-rooted plan omits its binding', async () => {
    const compileInput = structuredClone(compileScopeV3Envelope.input);
    const executionAgent = boundExecutionAgent(compileInput);
    const scope = scopeCompletion.artifact;
    const planningInput = {
      type: 'OrqalyPlanV2',
      acceptedScope: {
        artifactId: scope.artifactId,
        artifactHash: scope.artifactHash,
        kind: 'scope',
      },
      research: {
        artifactId: '90000000-0000-4000-8000-000000000010',
        artifactHash: 'a'.repeat(64),
        kind: 'research',
      },
      agentCatalogue: [],
    };
    const internalExecutor = { execute: vi.fn().mockResolvedValue({ kind: 'completed' }) };
    const executor = createActivityExecutor({ axwiseClient: {}, internalExecutor });
    const claim = {
      tenantId: executionAgent.owner.tenantId,
      runId: executionAgent.runId,
      inputHash: canonicalHash(planningInput),
    };
    const context = {
      stageKind: 'planning',
      inputPayload: planningInput,
      inputHash: claim.inputHash,
    };

    await expect(
      executor.execute({
        claim,
        context,
        snapshot: snapshotWithExecutionAgent(executionAgent),
      })
    ).rejects.toThrow(/missing the run execution Agent binding/);
    expect(internalExecutor.execute).not.toHaveBeenCalled();
  });
});
