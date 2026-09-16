// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inspectNativeExpression } from './native-expression-policy.js';

describe('pinned zero-argument native Array.sum expression policy', () => {
  it.each([
    '={{ $json.subtotals.sum() }}',
    '={{ $json.body.values.sum() }}',
    '={{ [1, 2.5, -3].sum() }}',
    '={{ [].sum() }}',
    '={{ { "total": $json.subtotals.sum(), "accepted": $json.subtotals.sum() > 10 } }}',
    '={{ $("Aggregate").first().json.subtotals.sum() }}',
  ])('accepts only data expressions without evaluating them: %s', (expression) => {
    expect(inspectNativeExpression(expression).safe).toBe(true);
  });

  it('preserves the upstream node reference for normal graph review', () => {
    expect(inspectNativeExpression('={{ $("Aggregate").first().json.subtotals.sum() }}'))
      .toEqual({ safe: true, references: ['Aggregate'] });
  });

  it.each([
    '={{ $json.values.sum(1) }}',
    '={{ $json.values.sum($json.other) }}',
    '={{ $json.values.sum(() => 1) }}',
    '={{ $json.values.sum(function() { return 1; }) }}',
    '={{ $json.values.map(x => x * 2).sum() }}',
    '={{ $json.values.map($json.callback).sum() }}',
    '={{ $json.values.reduce($json.callback, 0) }}',
    '={{ $json.values["sum"]() }}',
    '={{ $json.values[$json.method]() }}',
    '={{ $json.values.sum.call($json.values) }}',
    '={{ $json.values.sum.apply($json.values) }}',
    '={{ $json.values.sum.constructor("return process")() }}',
    '={{ $json.values.sum()() }}',
    '={{ sum($json.values) }}',
  ])('denies arguments, callbacks and arbitrary calls: %s', (expression) => {
    expect(inspectNativeExpression(expression).safe).toBe(false);
  });

  it('does not pretend to type-check or evaluate the runtime array', () => {
    // Native n8n must reject these actual values; static safety is not success.
    expect(inspectNativeExpression('={{ [1, "2"].sum() }}').safe).toBe(true);
    expect(inspectNativeExpression('={{ [null].sum() }}').safe).toBe(true);
  });
});
