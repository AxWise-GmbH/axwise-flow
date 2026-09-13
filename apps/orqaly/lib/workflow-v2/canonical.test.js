import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AxWiseOperationEnvelopeSchema } from '../../shared/workflow-v2/contracts.js';
import { canonicalHash, canonicalJson, sha256Hex, verifySourceSpan } from './canonical.js';

const golden = JSON.parse(
  readFileSync(
    'shared/workflow-v2/fixtures/canonical_v1_golden.json',
    'utf8'
  )
);
const compileEnvelope = JSON.parse(
  readFileSync(
    'shared/workflow-v2/fixtures/compile_scope_envelope_v2.json',
    'utf8'
  )
);
const contextualCompileEnvelope = JSON.parse(
  readFileSync(
    'shared/workflow-v2/fixtures/compile_scope_envelope_v3.json',
    'utf8'
  )
);

describe('canonical-v1 cross-language contract', () => {
  it('matches every canonical byte and SHA-256 golden vector', () => {
    for (const vector of golden.vectors) {
      expect(canonicalJson(vector.value), vector.name).toBe(vector.canonical);
      expect(canonicalHash(vector.value), vector.name).toBe(vector.sha256);
    }
  });

  it('uses UTF-16 code-unit source spans while hashing UTF-8 text', () => {
    expect(verifySourceSpan(golden.sourceSpan.source, golden.sourceSpan)).toBe(true);
    expect(sha256Hex(golden.sourceSpan.text)).toBe(golden.sourceSpan.sha256);
  });

  it('rejects noncanonical numeric and Unicode values', () => {
    expect(() => canonicalJson(1.5)).toThrow(/integer/);
    expect(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1)).toThrow(/unsafe/);
    expect(() => canonicalJson('\ud800')).toThrow(/surrogate/);
    expect(() => canonicalJson('\udc00')).toThrow(/surrogate/);
    expect(() => canonicalJson(-0)).toThrow(/negative zero/);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('parses the explicit CompileScopeV2 envelope without default-expansion drift', () => {
    const parsed = AxWiseOperationEnvelopeSchema.parse(compileEnvelope);
    expect(canonicalHash(parsed.input)).toBe(compileEnvelope.canonicalInputHash);
    expect(parsed.input).toEqual(compileEnvelope.input);
  });

  it('parses the Unicode CompileScopeV3 context envelope without hash or UTF-16 drift', () => {
    const parsed = AxWiseOperationEnvelopeSchema.parse(contextualCompileEnvelope);
    expect(canonicalHash(parsed.input)).toBe(contextualCompileEnvelope.canonicalInputHash);
    expect(parsed.input).toEqual(contextualCompileEnvelope.input);
    expect(parsed.input.assistantContext.instruction.sourceSpan.end).toBe(32);
    expect(parsed.input.assistantContext.turns[0].user.sourceSpan).toMatchObject({
      start: 46,
      end: 81,
    });
  });
});
