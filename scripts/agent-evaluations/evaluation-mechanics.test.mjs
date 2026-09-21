import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluationCatalog, caseInputHash } from './catalog.mjs';
import { evaluateOutput } from './evaluate.mjs';

const RUN_ID = '12345678-1234-4123-a123-123456789abc';

function catalogCase(templateId) {
  const start = Date.parse('2026-09-21T00:00:00Z');
  for (let index = 0; index < 96; index += 1) {
    const found = buildEvaluationCatalog({ slot: new Date(start + index * 900_000) })
      .cases.find((item) => item.templateId === templateId);
    if (found) return found;
  }
  throw new Error(`Missing catalog case ${templateId}`);
}

function receipt(input, overallProbability = 0.9, failedCriterion = -1) {
  const criteriaResults = input.criteria.map((criterion, index) => ({ criterion, passed: index !== failedCriterion }));
  return {
    verdict: overallProbability >= 0.6 && failedCriterion < 0 ? 'passed' : 'failed',
    criteriaResults, overallProbability, advisory: true, provider: 'typesafe',
    runId: input.runId, category: input.category, model: 'jev-latest',
    receiptId: 'unchanged-jev-receipt', evidenceHash: 'a'.repeat(64),
    perCriterion: criteriaResults.map((item) => ({ criterion: item.criterion, probability: item.passed ? 0.9 : 0.2 })),
  };
}

const PLAN = [
  '1. Add a database schema and request flow with concurrency locks, expiry TTL, rollout, observability metrics, and tests.',
  'Non-goal 1: Replace payment providers.',
  'Non-goal 2: Redesign unrelated endpoints.',
].join('\n');

test('pure plan word count is enforced once and sent as a verified measurement', async () => {
  const caseData = catalogCase('plan-idempotency-key');
  const originalCriteria = [...caseData.criteria];
  const originalHash = caseInputHash(caseData);
  let input;
  const result = await evaluateOutput({
    caseData, output: PLAN, runId: RUN_ID,
    judge: async (value) => { input = value; return receipt(value); },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.deepEqual(input.criteria, originalCriteria.slice(0, 3));
  assert.equal(input.prompt, caseData.prompt);
  assert.match(input.verifiedChecks[0], /^Displayed word count is \d+; maximum is 700; passed\./);
  assert.deepEqual(result.evidence.verifiedChecks, input.verifiedChecks);
  assert.deepEqual(result.evidence.semanticCriteria, input.criteria);
  assert.equal(result.evidence.deterministicChecks.find(({ id }) => id === 'plan_word_limit').passed, true);
  assert.deepEqual(caseData.criteria, originalCriteria);
  assert.equal(caseInputHash(caseData), originalHash);
});

test('compound research criterion retains source support while removing only measured length', async () => {
  const caseData = catalogCase('research-postgres-indexes');
  const originalCriteria = [...caseData.criteria];
  const output = 'BRIN summarizes block ranges and stays small; B-tree supports precise lookups. Prefer BRIN for ordered append-only data, trading lossy rechecks for lower index size. https://www.postgresql.org/docs/current/brin.html';
  let input;
  const result = await evaluateOutput({
    caseData, output, runId: RUN_ID,
    fetchImpl: async () => new Response('BRIN summarizes block ranges. B-tree indexes individual values.', { headers: { 'content-type': 'text/plain' } }),
    judge: async (value) => { input = value; return receipt(value); },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.deepEqual(input.criteria, [
    ...originalCriteria.slice(0, 2),
    'Claims are supported by exact official PostgreSQL documentation URLs.',
  ]);
  assert.match(input.verifiedChecks[0], /maximum is 220; passed\./);
  assert.equal(input.sources.length, 1);
  assert.match(input.sources[0].contentHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(caseData.criteria, originalCriteria);
});

test('search retains factual and source criteria after removing the pure length criterion', async () => {
  const caseData = catalogCase('search-python-json-ascii');
  let input;
  const result = await evaluateOutput({
    caseData, runId: RUN_ID,
    output: 'ensure_ascii defaults to true and escapes non-ASCII characters. https://docs.python.org/3/library/json.html',
    fetchImpl: async () => new Response('ensure_ascii defaults to True and escapes non-ASCII characters.', { headers: { 'content-type': 'text/plain' } }),
    judge: async (value) => { input = value; return receipt(value); },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.deepEqual(input.criteria, caseData.criteria.slice(0, 2));
  assert.match(input.verifiedChecks[0], /maximum is 120; passed\./);
});

test('verified mechanics never turn a low overall or semantic Jev score into a pass', async () => {
  const caseData = catalogCase('plan-idempotency-key');
  for (const [overall, failedCriterion] of [[0.54, -1], [0.9, 1]]) {
    const result = await evaluateOutput({
      caseData, output: PLAN, runId: RUN_ID,
      judge: async (input) => receipt(input, overall, failedCriterion),
    });
    assert.equal(result.evaluation.verdict, 'failed');
    assert.equal(result.evidence.judge.overallProbability, overall);
    assert.equal(result.evidence.judge.receiptId, 'unchanged-jev-receipt');
    assert.equal(result.evidence.judge.evidenceHash, 'a'.repeat(64));
    assert.equal(result.evaluation.criteriaResults.length, 3);
  }
});

test('over-limit prose fails deterministically without calling Jev', async () => {
  const caseData = catalogCase('plan-idempotency-key');
  let calls = 0;
  const result = await evaluateOutput({
    caseData, output: `${PLAN}\n${Array(701).fill('word').join(' ')}`, runId: RUN_ID,
    judge: async (input) => { calls += 1; return receipt(input); },
  });
  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(result.evidence.deterministicChecks.find(({ id }) => id === 'plan_word_limit').passed, false);
  assert.equal(calls, 0);
  assert.equal(result.evidence.judge, null);
});
