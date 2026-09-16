// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GoalWorkflowViewResponseSchema } from './goal-workflow-view-contract.js';
import { goalViewId as id, goalViewResponse } from './fixtures/goal-workflow-view.js';

describe('Goal Workflow/Outputs response boundary', () => {
  it('accepts the existing Goal projection with explicit coverage', () => {
    const value = goalViewResponse();
    expect(GoalWorkflowViewResponseSchema.parse(value)).toBe(value);
  });
  it.each(['payload', 'inputPayload', 'leaseToken', 'leaseExpiresAt', 'transcript', 'history'])(
    'rejects undeclared %s fields at every public metadata level',
    (field) => {
      for (const target of ['response', 'workflow', 'step', 'output', 'reference']) {
        const value = goalViewResponse();
        const row = {
          response: value,
          workflow: value.workflow,
          step: value.workflow.steps[0],
          output: value.workflow.outputs[0],
          reference: value.workflow.outputs[0].reference,
        }[target];
        row[field] = 'PRIVATE_SECRET';
        expect(() => GoalWorkflowViewResponseSchema.parse(value)).toThrow();
      }
    }
  );
  it.each([
    (v) => {
      v.workflow.source.id = id(99);
    },
    (v) => {
      v.workflow.outputs[0].reference.runId = id(99);
    },
    (v) => {
      v.workflow.steps[0].output.kind = 'other';
    },
    (v) => {
      v.workflow.steps[0].output.artifactHash = 'd'.repeat(64);
    },
    (v) => {
      v.workflow.steps.push({ ...v.workflow.steps[0] });
    },
    (v) => {
      v.workflow.outputs.push({ ...v.workflow.outputs[0] });
    },
    (v) => {
      v.coverage.lineage.incompleteArtifactIds = [id(99)];
    },
    (v) => {
      v.coverage.stages.complete = false;
    },
    (v) => {
      v.coverage.outputs.loaded = 0;
    },
    (v) => {
      v.workflow.outputs[0].sourceArtifactIds = [id(5), id(5)];
    },
  ])('rejects inconsistent identities and completeness', (change) => {
    const value = goalViewResponse();
    change(value);
    expect(() => GoalWorkflowViewResponseSchema.parse(value)).toThrow();
  });
});
