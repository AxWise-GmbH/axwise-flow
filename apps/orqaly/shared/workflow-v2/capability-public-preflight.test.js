// @vitest-environment node
import { describe, expect, it } from 'vitest';
import vectors from './fixtures/capability-contract-vectors.json';
import legacy from './fixtures/compile_scope_envelope_v2.json';
import {
  ActivityInputSchema,
  AxWiseOperationInputSchema,
  AxWiseOperationEnvelopeSchema,
} from './contracts.js';

describe('capability preflight before historical union traversal', () => {
  for (const vector of vectors.cases)
    it(`accepts complete validated ${vector.name} wire without changing hashes`, () => {
      expect(AxWiseOperationEnvelopeSchema.parse(vector.envelope)).toEqual(vector.envelope);
      expect(ActivityInputSchema.parse(vector.envelope.input)).toEqual(vector.envelope.input);
      expect(AxWiseOperationInputSchema.parse(vector.envelope.input)).toEqual(
        vector.envelope.input
      );
    });
  it('retains exact plain legacy input and envelope', () => {
    expect(AxWiseOperationEnvelopeSchema.parse(legacy)).toEqual(legacy);
    expect(ActivityInputSchema.parse(legacy.input)).toEqual(legacy.input);
  });
  it.each(['operationType', 'input'])('does not invoke top-level envelope accessor %s', (field) => {
    let calls = 0;
    const value = structuredClone(vectors.cases[0].envelope);
    Object.defineProperty(value, field, {
      enumerable: true,
      get() {
        calls += 1;
        throw new Error('Accessor must not run');
      },
    });
    expect(AxWiseOperationEnvelopeSchema.safeParse(value).success).toBe(false);
    expect(calls).toBe(0);
  });
  it.each(['ActivityInputSchema', 'AxWiseOperationInputSchema', 'AxWiseOperationEnvelopeSchema'])(
    'does not invoke nested capability getters through %s',
    (name) => {
      const schemas = {
        ActivityInputSchema,
        AxWiseOperationInputSchema,
        AxWiseOperationEnvelopeSchema,
      };
      let calls = 0;
      const envelope = structuredClone(vectors.cases[0].envelope);
      Object.defineProperty(envelope.input, 'source', {
        enumerable: true,
        get() {
          calls += 1;
          throw new Error('Private getter');
        },
      });
      const value = name === 'AxWiseOperationEnvelopeSchema' ? envelope : envelope.input;
      expect(schemas[name].safeParse(value).success).toBe(false);
      expect(calls).toBe(0);
    }
  );
  it('rejects a mismatched legacy discriminator before it can traverse capability source getters', () => {
    let calls = 0;
    const envelope = structuredClone(vectors.cases[0].envelope);
    envelope.operationType = 'CompileScopeV2';
    Object.defineProperty(envelope.input.source, 'payload', {
      enumerable: true,
      get() {
        calls += 1;
        return {};
      },
    });
    expect(AxWiseOperationEnvelopeSchema.safeParse(envelope).success).toBe(false);
    expect(calls).toBe(0);
  });
  it('rejects accessor input discriminators, cycles, sparse arrays and excessive depth', () => {
    let calls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'type', {
      enumerable: true,
      get() {
        calls += 1;
        return 'SimulateV1';
      },
    });
    expect(ActivityInputSchema.safeParse(accessor).success).toBe(false);
    expect(calls).toBe(0);
    const cycle = structuredClone(vectors.cases[0].envelope.input);
    cycle.request.extra = cycle;
    expect(ActivityInputSchema.safeParse(cycle).success).toBe(false);
    const sparse = structuredClone(vectors.cases[0].envelope.input);
    delete sparse.request.questions[0];
    expect(AxWiseOperationInputSchema.safeParse(sparse).success).toBe(false);
    const deep = structuredClone(vectors.cases[0].envelope.input);
    let current = deep;
    for (let index = 0; index < 70; index += 1) {
      current.extra = {};
      current = current.extra;
    }
    expect(ActivityInputSchema.safeParse(deep).success).toBe(false);
  });
});
