import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AxWiseCompletionResultSchema,
  AxWiseOperationEnvelopeSchema,
  PrepareSolutionInputV1Schema,
  PrepareSolutionResponseV1Schema,
} from './contracts.js';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { compileSolutionWorkflow } from '../../server/workflow-v2/solution-compiler.js';

const fixture = JSON.parse(
  readFileSync('shared/workflow-v2/fixtures/prepare_solution_v1.json', 'utf8')
);
const clone = (value) => structuredClone(value);
const envelope = (input = fixture.initialInput) => ({
  operationId: '00000000-0000-4000-8000-000000000609',
  operationType: 'PrepareSolutionV1',
  owner: {
    tenantId: '00000000-0000-4000-8000-000000000608',
    organizationId: null,
    userId: 'user_solutiontest123',
  },
  workflow: {
    runId: input.source.runId,
    stageId: input.buildRequestId,
    stageAttemptId: '00000000-0000-4000-8000-000000000609',
  },
  contractVersion: 'axwise.operation.v2',
  canonicalInputHash: canonicalHash(input),
  input,
});

describe('PrepareSolutionV1 cross-service contract', () => {
  it.each(['initialInput', 'answeredInput'])(
    'round-trips exact %s without hash-changing defaults',
    (key) => {
      expect(PrepareSolutionInputV1Schema.parse(fixture[key])).toEqual(fixture[key]);
      expect(AxWiseOperationEnvelopeSchema.parse(envelope(fixture[key]))).toEqual(
        envelope(fixture[key])
      );
    }
  );
  it.each(['needsInput', 'candidate', 'unsupported'])('accepts typed %s completion', (key) => {
    const result = { resultType: 'solution_prepared', response: fixture[key] };
    expect(AxWiseCompletionResultSchema.parse(result)).toEqual(result);
  });
  it('keeps unknown output fields nullable and unexecutable', () => {
    expect(fixture.needsInput.partialFields[0].target).toBeNull();
    expect(() =>
      compileSolutionWorkflow({
        id: fixture.initialInput.buildRequestId,
        spec: { kind: 'webhook_transform_v1', fields: fixture.needsInput.partialFields },
      })
    ).toThrow();
  });
  it('compiles the answered candidate with exact safe semantics', () => {
    const { workflow } = compileSolutionWorkflow({
      id: fixture.candidate.buildRequestId,
      spec: PrepareSolutionResponseV1Schema.parse(fixture.candidate).spec,
    });
    expect(workflow.nodes[1].parameters.jsonOutput).toContain(
      '"contactEmail": $json.body.input["email"].toLowerCase()'
    );
  });
  it('rejects stale input hash and cross-run source rebinding', () => {
    const value = envelope();
    value.input = { ...value.input, instruction: 'Replace the task.' };
    expect(AxWiseOperationEnvelopeSchema.safeParse(value).success).toBe(false);
    const rebound = envelope();
    rebound.workflow.runId = rebound.operationId;
    expect(AxWiseOperationEnvelopeSchema.safeParse(rebound).success).toBe(false);
  });
  it.each([
    (value) => {
      value.spec.fields[0].transform = 'eval';
    },
    (value) => {
      value.spec.fields[0].source = 'email.toString()';
    },
    (value) => {
      value.spec.fields[0].target = 'constructor';
    },
    (value) => {
      value.spec.credentials = { provider: 'secret' };
    },
    (value) => {
      value.workflow = { nodes: [] };
    },
    (value) => {
      value.partialFields[0].target = 'other';
    },
    (value) => {
      value.questions = fixture.needsInput.questions;
    },
    (value) => {
      value.spec.fields.push(value.spec.fields[0]);
    },
  ])('rejects unsafe or internally inconsistent candidate %#', (mutate) => {
    const value = clone(fixture.candidate);
    mutate(value);
    expect(PrepareSolutionResponseV1Schema.safeParse(value).success).toBe(false);
  });
  it('does not allow unsupported tasks to carry a substitute draft or secret question', () => {
    expect(
      PrepareSolutionResponseV1Schema.safeParse({
        ...fixture.unsupported,
        partialFields: fixture.candidate.partialFields,
      }).success
    ).toBe(false);
    const value = clone(fixture.needsInput);
    value.questions[0].kind = 'connection';
    expect(PrepareSolutionResponseV1Schema.safeParse(value).success).toBe(false);
  });
  it('rejects duplicate answers and expanded capabilities', () => {
    expect(
      PrepareSolutionInputV1Schema.safeParse({
        ...fixture.answeredInput,
        answers: [...fixture.answeredInput.answers, ...fixture.answeredInput.answers],
      }).success
    ).toBe(false);
    expect(
      PrepareSolutionInputV1Schema.safeParse({
        ...fixture.initialInput,
        supportedCapabilities: ['webhook_transform_v1', 'sms'],
      }).success
    ).toBe(false);
  });
});
