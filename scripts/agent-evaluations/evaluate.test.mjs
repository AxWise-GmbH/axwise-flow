import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEvaluationCatalog } from './catalog.mjs';
import { evaluateOutput } from './evaluate.mjs';

const RUN_ID = '12345678-1234-4123-a123-123456789abc';

function catalogCase(templateId) {
  const start = Date.parse('2026-09-21T00:00:00.000Z');
  for (let index = 0; index < 96; index += 1) {
    const found = buildEvaluationCatalog({ slot: new Date(start + (index * 15 * 60 * 1000)) })
      .cases.find((evaluationCase) => evaluationCase.templateId === templateId);
    if (found) return found;
  }
  throw new Error(`Template ${templateId} was not found`);
}

function jevReceipt(caseData, verdict = 'passed') {
  return {
    verdict,
    criteriaResults: caseData.criteria.map((criterion, index) => ({
      criterion,
      passed: verdict === 'passed' || index > 0,
      reason: 'advisory_review',
    })),
    reason: 'advisory_review',
    receiptId: 'jev-receipt-1',
    advisory: true,
    provider: 'typesafe',
    runId: RUN_ID,
    category: caseData.category,
    model: 'jev-latest',
    overallProbability: verdict === 'passed' ? 0.91 : 0.32,
    evidenceHash: 'b'.repeat(64),
    evaluatedAt: '2026-09-21T12:00:00.000Z',
  };
}

test('passes exact JSON only after a valid Jev advisory receipt', async () => {
  const caseData = catalogCase('message-json-normalization');
  let judgeInput;
  const output = JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' });
  const result = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    judge: async (input) => {
      judgeInput = input;
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(result.evidence.judge.provider, 'typesafe');
  assert.equal(judgeInput.output, output);
  assert.deepEqual(judgeInput.criteria, caseData.criteria);
});

test('strict deterministic failure does not call the advisory judge', async () => {
  const caseData = catalogCase('message-json-normalization');
  let calls = 0;
  const result = await evaluateOutput({
    caseData,
    output: '{"project":"Northstar","owner":"Mina","priorities":["reliability"]}',
    runId: RUN_ID,
    judge: async () => {
      calls += 1;
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(calls, 0);
  assert.ok(result.evidence.deterministicChecks.some(({ passed }) => !passed));
});

test('judge failure or malformed unknown receipt remains not evaluated', async () => {
  const caseData = catalogCase('message-json-normalization');
  const output = JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' });

  const unavailable = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async () => { throw new Error('provider down'); } });
  assert.equal(unavailable.evaluation.verdict, 'not_evaluated');

  const unknown = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async () => ({ verdict: 'maybe' }) });
  assert.equal(unknown.evaluation.verdict, 'not_evaluated');

  const genericJudge = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    judge: async () => ({ verdict: 'passed', criteriaResults: [], advisory: false, provider: 'other' }),
  });
  assert.equal(genericJudge.evaluation.verdict, 'not_evaluated');
});

test('search rejects adversarial URLs without issuing a request', async () => {
  const caseData = catalogCase('search-node-abort-timeout');
  let fetchCalls = 0;
  let judgeCalls = 0;
  const result = await evaluateOutput({
    caseData,
    output: 'AbortSignal.timeout creates a signal. https://nodejs.org.evil.test/api/globals.html',
    runId: RUN_ID,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must not fetch');
    },
    judge: async () => {
      judgeCalls += 1;
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(fetchCalls, 0);
  assert.equal(judgeCalls, 0);
});

test('search fetches bounded official evidence and passes it to Jev', async () => {
  const caseData = catalogCase('search-python-json-ascii');
  const output = 'The ensure_ascii option defaults to true and escapes non-ASCII characters in the result. https://docs.python.org/3/library/json.html#json.dumps';
  let judgeInput;
  const result = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://docs.python.org/3/library/json.html');
      assert.equal(options.redirect, 'manual');
      return new Response('<html><body><h1>json.dumps</h1><p>If ensure_ascii is true, output is escaped.</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    judge: async (input) => {
      judgeInput = input;
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(result.evidence.sources.length, 1);
  assert.match(result.evidence.sources[0].excerpt, /ensure_ascii is true/);
  assert.match(result.evidence.sources[0].excerptHash, /^[a-f0-9]{64}$/);
  assert.equal(judgeInput.sources.length, 1);
  assert.equal(judgeInput.sources[0].url, 'https://docs.python.org/3/library/json.html');
  assert.equal(judgeInput.sources[0].contentHash, result.evidence.sources[0].excerptHash);
});

test('structured product citations use the same allowlist, fetch, and hash path', async () => {
  const caseData = catalogCase('search-node-abort-timeout');
  const output = 'AbortSignal.timeout returns a signal that aborts after the requested delay.';
  let fetched;
  const result = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    sources: [{ title: 'Globals', url: 'https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay' }],
    fetchImpl: async (url) => {
      fetched = url;
      return new Response('<p>AbortSignal.timeout(delay) returns a new AbortSignal.</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
    judge: async (input) => {
      assert.equal(input.sources[0].url, 'https://nodejs.org/api/globals.html');
      assert.match(input.sources[0].contentHash, /^[a-f0-9]{64}$/);
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(fetched, 'https://nodejs.org/api/globals.html');
  assert.equal(result.evidence.declaredSourceCount, 1);
});

test('a disallowed structured citation is never fetched', async () => {
  const caseData = catalogCase('search-node-abort-timeout');
  let fetchCalls = 0;
  const result = await evaluateOutput({
    caseData,
    output: 'AbortSignal.timeout returns a timed signal.',
    runId: RUN_ID,
    sources: [{ title: 'Impostor', url: 'https://nodejs.org.evil.test/private' }],
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must not fetch');
    },
    judge: async () => jevReceipt(caseData),
  });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(fetchCalls, 0);
});

test('redirects are revalidated and cannot leave the official host allowlist', async () => {
  const caseData = catalogCase('research-node-streams');
  let calls = 0;
  const result = await evaluateOutput({
    caseData,
    output: 'I recommend stream.pipeline for its coordinated cleanup and error handling. Tradeoffs include stricter lifecycle behavior and added callback or promise handling. https://nodejs.org/api/stream.html',
    runId: RUN_ID,
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } });
    },
    judge: async () => jevReceipt(caseData),
  });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(calls, 1);
  assert.equal(result.evidence.judge, null);
});

test('plan keywords cannot produce a pass when Jev finds semantic criteria unmet', async () => {
  const caseData = catalogCase('plan-idempotency-key');
  const output = [
    '1. Add a database schema and table.',
    '2. Define the request flow and concurrency lock behavior.',
    '3. Add expiry TTL handling.',
    '4. Add rollout, observability metrics, and tests.',
    'Non-goal 1: Redesign payment providers.',
    'Non-goal 2: Change unrelated endpoints.',
  ].join('\n');
  const result = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async () => jevReceipt(caseData, 'failed') });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(result.evaluation.reason, 'advisory_review');
  assert.ok(result.evidence.deterministicChecks.every(({ passed }) => passed));
});

test('Jev receipt identity must match the requested run and category', async () => {
  const caseData = catalogCase('message-json-normalization');
  const output = JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' });
  const wrongRun = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    judge: async () => ({ ...jevReceipt(caseData), runId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }),
  });
  assert.equal(wrongRun.evaluation.verdict, 'not_evaluated');

  const wrongCategory = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    judge: async () => ({ ...jevReceipt(caseData), category: 'research' }),
  });
  assert.equal(wrongCategory.evaluation.verdict, 'not_evaluated');
});

test('coding remains unevaluated for the isolated coding runner', async () => {
  const caseData = catalogCase('coding-clamp');
  let judgeCalls = 0;
  const result = await evaluateOutput({
    caseData,
    output: 'export function clamp() {}',
    runId: RUN_ID,
    judge: async () => {
      judgeCalls += 1;
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'not_evaluated');
  assert.equal(judgeCalls, 0);
});
