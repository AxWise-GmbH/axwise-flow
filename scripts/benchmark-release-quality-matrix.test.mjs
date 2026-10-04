import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runQualityMatrix, BENCHMARK_TASKS } from './benchmark-release-quality-matrix.mjs';

test('10-task release quality benchmark runs and achieves 100% pass rate', async () => {
  assert.equal(BENCHMARK_TASKS.length, 10, 'Suite must define exactly 10 release quality tasks');
  const report = await runQualityMatrix({ verbose: false });
  assert.equal(report.total, 10);
  assert.equal(report.passed, 10, 'All 10 quality tasks must pass');
  assert.equal(report.passRate, 100);
});
