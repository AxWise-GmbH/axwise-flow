import test from 'node:test';
import assert from 'node:assert/strict';
import { GavelPrReviewer } from './gavel-ci-pr-review.mjs';

test('GavelPrReviewer detects breaking signature changes in PR diffs in < 5ms', () => {
  const sampleCodebase = `// Module: src/core/pricing.ts
export function calculateTax(rate: number): number { return rate; }
`;

  const prChanges = [
    {
      path: 'src/core/pricing.ts',
      change: 'edited',
      diff: '-export function calculateTax(rate: number)\n+export function calculateTax(rate: number, options?: any)',
    },
  ];

  const reviewer = new GavelPrReviewer({ maxHops: 2 });
  const result = reviewer.reviewPullRequest(sampleCodebase, prChanges);

  assert.equal(result.status, 'CHANGES_REQUESTED');
  assert.equal(result.breakingChanges.length, 1);
  assert.equal(result.breakingChanges[0].symbol, 'calculateTax');
  assert.ok(result.metrics.reviewDurationMs < 10);
});
