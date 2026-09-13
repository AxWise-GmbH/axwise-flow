// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inspectNativeExpression } from './native-expression-policy.js';

describe('pure native typeof input validation', () => {
  it.each([
    "={{ typeof $json.body?.text === 'string' }}",
    '={{ typeof $json.body.text !== "number" }}',
    '={{ typeof ($json.body.text) === "string" && $json.body.text.length > 0 }}',
    '={{ { "valid": typeof $json.body?.text === "string" } }}',
    '={{ typeof $json.body?.text === "string" ? $json.body.text.trim() : "invalid" }}',
    '={{ typeof null === "object" }}',
  ])('admits type inspection of permitted data only: %s', (expression) => {
    expect(inspectNativeExpression(expression)).toEqual({ safe: true, references: [] });
  });

  it('preserves source-node references for graph reachability review', () => {
    expect(inspectNativeExpression('={{ typeof $("Input").first().json.text === "string" }}'))
      .toEqual({ safe: true, references: ['Input'] });
  });

  it.each([
    '={{ typeof process }}',
    '={{ typeof globalThis }}',
    '={{ typeof $env.SECRET }}',
    '={{ typeof $credentials }}',
    '={{ typeof fetch("https://example.com") }}',
    '={{ typeof $json.constructor }}',
    '={{ typeof $json["__proto__"] }}',
    '={{ typeof $json[$json.key] }}',
    '={{ typeof $json.callback() }}',
    '={{ typeof $json.text.trim.constructor("return process")() }}',
    '={{ typeof (() => 1) }}',
    '={{ typeof function() { return 1; } }}',
    '={{ typeof $json.value = 1 }}',
    '={{ typeof }}',
    '={{ typeof $json; process }}',
  ])('does not grant globals, mutation, arbitrary calls or callbacks: %s', (expression) => {
    expect(inspectNativeExpression(expression).safe).toBe(false);
  });

  it('remains static safety inspection, not proof of successful evaluation', () => {
    // A missing body can still fail at runtime without optional chaining.
    expect(inspectNativeExpression('={{ typeof $json.body.text === "string" }}').safe).toBe(true);
    expect(inspectNativeExpression(`={{ typeof ${'('.repeat(40)}$json${')'.repeat(40)} }}`).safe).toBe(false);
  });
});
