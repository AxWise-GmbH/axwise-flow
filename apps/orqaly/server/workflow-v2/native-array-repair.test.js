// @vitest-environment node
import { describe, expect, it } from 'vitest';
import original from './fixtures/native-model-array-acceptance-2026-09-06.json';
import repaired from './fixtures/native-model-array-repaired-acceptance-2026-09-06.json';
import receipts from './fixtures/native-model-array-repaired-runtime-2026-09-06.json';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { reviewNativeWorkflow, REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';
import {
  createNativeWorkflowKnowledge,
  verifyNativeWorkflowKnowledge,
} from './native-workflow-knowledge.js';

describe('native array repair scope', () => {
  it('keeps every existing node pin while excluding unrelated negative keyword hints', () => {
    const args = { instruction: original.input.instruction, draft: original.initialDraft };
    const broad = createNativeWorkflowKnowledge(args);
    const repair = createNativeWorkflowKnowledge({ ...args, phase: 'repair' });
    const keys = repair.nodes.map((node) => `${node.type}@${node.typeVersion}`);
    for (const node of original.initialDraft.workflow.nodes) {
      expect(keys).toContain(`${node.type}@${node.typeVersion}`);
    }
    expect(repair.nodes.some((node) => node.type === 'n8n-nodes-base.httpRequest')).toBe(false);
    expect(repair.nodes.some((node) => node.type === 'n8n-nodes-base.code')).toBe(false);
    expect(repair.nodes.some((node) => node.type === 'n8n-nodes-base.wait')).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(repair))).toBeLessThan(
      Buffer.byteLength(JSON.stringify(broad)) * 0.7
    );
    expect(verifyNativeWorkflowKnowledge(repair)).toEqual(repair);
  });

  it('allows an explicit selected definition without turning it into execution authority', () => {
    const knowledge = createNativeWorkflowKnowledge({
      instruction: original.input.instruction,
      draft: original.initialDraft,
      phase: 'repair',
      requestedTypes: ['httpRequest'],
    });
    expect(knowledge.nodes.some((node) => node.type === 'n8n-nodes-base.httpRequest')).toBe(true);
    expect(knowledge).not.toHaveProperty('runtimePolicy');
    expect(knowledge).not.toHaveProperty('credentials');
  });

  it('preserves the historical failure and all original acceptance cases', () => {
    expect(original.candidateAccepted).toBe(false);
    expect(original.runtimeExecuted).toBe(false);
    expect(original.repairAttempts.map((attempt) => attempt.errorClass)).toEqual([
      'AXWISE_SOLUTION_DESIGN_DEADLINE',
      'AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED',
    ]);
    expect(original.spec.acceptanceCases).toEqual(original.frozenAcceptanceCases);
  });

  it('binds the real-model repair to the original complete frozen contract', () => {
    expect(repaired.input.baseWorkflowHash).toBe(original.workflowHash);
    expect(repaired.spec).toEqual(original.spec);
    expect(repaired.frozenAcceptanceCases).toEqual(original.frozenAcceptanceCases);
    expect(repaired.manuallyCorrected).toBe(false);
    const normalized = normalizeNativeWorkflow({
      workflow: repaired.workflow,
      id: repaired.buildRequestId,
    });
    expect(normalized.workflowHash).toBe(repaired.workflowHash);
    const review = reviewNativeWorkflow({
      workflow: normalized.workflow,
      spec: repaired.spec,
      runtimePolicy: REQUEST_AUTOMATION_POLICY,
    });
    expect(review.valid).toBe(true);
    expect(review.execution.allowed).toBe(true);
  });

  it('keeps actual local receipts separate from static model output and cloud deployment', () => {
    expect(repaired.runtimeExecuted).toBe(false);
    expect(receipts.scope).toBe('synthetic_local_runtime');
    expect(receipts.runtimeExecuted).toBe(true);
    expect(receipts.workflowHash).toBe(repaired.workflowHash);
    expect(receipts.cases).toHaveLength(original.frozenAcceptanceCases.length);
    for (const acceptance of original.frozenAcceptanceCases) {
      const receipt = receipts.cases.find((entry) => entry.caseId === acceptance.id);
      expect(receipt.output).toEqual(acceptance.expectedOutput);
      expect(receipt.responseStatus).toBe(acceptance.expectedStatus ?? 200);
      expect(receipt.passed).toBe(true);
      expect(receipt.cleanup).toBe('removed');
    }
    expect(receipts.checks.cloudResourcesChanged).toBe(false);
    expect(receipts.checks.additionalModelCallsDuringExecution).toBe(0);
  });
});
