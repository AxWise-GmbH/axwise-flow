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
  assert.ok(result.evidence.deterministicChecks.every((check) => !Object.hasOwn(check, 'reason')));
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
  assert.equal(judgeInput.sources[0].url, 'https://docs.python.org/3/library/json.html#json.dumps');
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
      assert.equal(input.sources[0].url, 'https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay');
      assert.match(input.sources[0].contentHash, /^[a-f0-9]{64}$/);
      return jevReceipt(caseData);
    },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(fetched, 'https://nodejs.org/api/globals.html');
  assert.equal(result.evidence.declaredSourceCount, 1);
});

test('large official pages select the cited Node and SQLite sections instead of navigation', async (t) => {
  const scenarios = [
    {
      templateId: 'research-node-streams',
      output: 'Use stream.pipeline for coordinated error handling and cleanup; readable.pipe requires manual handling. Two tradeoffs are lifecycle control and cleanup behavior. https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-callback',
      url: 'https://nodejs.org/api/stream.html',
      anchor: 'streampipelinesource-transforms-destination-callback',
      relevant: 'stream.pipeline forwards errors and destroys the streams',
      section: (anchor, relevant) => `<section><h4><code>${relevant}</code><span><a class=mark id=${anchor} href=#${anchor}>#</a></span></h4><p>Relevant supporting details follow.</p></section>`,
    },
    {
      templateId: 'search-sqlite-journal-mode',
      output: 'SQLite accepts DELETE, TRUNCATE, PERSIST, MEMORY, WAL, and OFF. WAL persists across reopenings. https://www.sqlite.org/pragma.html#pragma_journal_mode',
      url: 'https://www.sqlite.org/pragma.html',
      anchor: 'pragma_journal_mode',
      relevant: 'PRAGMA journal_mode supports DELETE TRUNCATE PERSIST MEMORY WAL and OFF',
      section: (anchor, relevant) => `<a name="${anchor}"></a><h _id=${anchor} style="display:none">${relevant}</h><hr><p>Relevant supporting details follow.</p>`,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.templateId, async () => {
      const caseData = catalogCase(scenario.templateId);
      const irrelevant = `<h2>List and navigation</h2>menu navigation ${'x'.repeat(260_000)}`;
      const page = `<html><body><nav>${irrelevant}</nav>${scenario.section(scenario.anchor, scenario.relevant)}</body></html>`;
      const result = await evaluateOutput({
        caseData,
        output: scenario.output,
        runId: RUN_ID,
        fetchImpl: async (url) => {
          assert.equal(url, scenario.url);
          return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
        },
        judge: async (input) => {
          assert.match(input.sources[0].excerpt, new RegExp(scenario.relevant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
          assert.doesNotMatch(input.sources[0].excerpt, /menu navigation/);
          assert.ok(input.sources[0].excerpt.length <= 2_400);
          return jevReceipt(caseData);
        },
      });
      assert.equal(result.evaluation.verdict, 'passed');
    });
  }
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

test('plan accepts Markdown Step headings and numbered non-goals within the explicit word bound', async () => {
  const caseData = catalogCase('plan-cache-migration');
  const output = [
    '## Step 1 — Key design',
    'Define Redis key names and invalidation ownership.',
    '## Step 2 — Failure behavior',
    'Add fallback and degraded behavior with observability metrics.',
    '## Step 3 — Rollout',
    'Stage the rollout with measurable tests and comparison.',
    '## Step 4 — Rollback',
    'Document the rollback trigger and procedure.',
    '## Non-goals',
    '1. Rebuild the product API.',
    '2. Replace PostgreSQL.',
  ].join('\n');
  const result = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    judge: async () => jevReceipt(caseData),
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.ok(result.evidence.deterministicChecks.every(({ passed }) => passed));
  assert.ok(result.evidence.deterministicChecks.every((check) => !Object.hasOwn(check, 'reason')));
});

test('technical output limit yields not evaluated rather than a quality failure', async () => {
  const caseData = catalogCase('plan-cache-migration');
  const result = await evaluateOutput({
    caseData,
    output: 'x'.repeat(24_001),
    runId: RUN_ID,
    judge: async () => jevReceipt(caseData),
  });
  assert.equal(result.evaluation.verdict, 'not_evaluated');
  assert.match(result.evaluation.reason, /technical input limit/);
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

test('overall Jev failure is retained when every individual criterion passes', async () => {
  const caseData = catalogCase('message-json-normalization');
  const output = JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' });
  const receipt = { ...jevReceipt(caseData), verdict: 'failed', overallProbability: 0.4 };
  const result = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async () => receipt });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(result.evaluation.reason, 'advisory_review');
  assert.ok(result.evaluation.criteriaResults.every(({ passed }) => passed));
  assert.equal(result.evidence.judge.overallProbability, 0.4);
  assert.equal(result.evidence.judge.receiptId, receipt.receiptId);
  assert.equal(result.evidence.judge.evidenceHash, receipt.evidenceHash);
});

test('Jev verdict must agree with bounded overall probability and criterion results', async () => {
  const caseData = catalogCase('message-json-normalization');
  const output = JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' });
  for (const changes of [
    { verdict: 'passed', overallProbability: 0.59 },
    { verdict: 'failed', overallProbability: 0.6 },
    { overallProbability: -0.1 },
    { overallProbability: 1.1 },
    { overallProbability: null },
  ]) {
    const result = await evaluateOutput({
      caseData, output, runId: RUN_ID,
      judge: async () => ({ ...jevReceipt(caseData), ...changes }),
    });
    assert.equal(result.evaluation.verdict, 'not_evaluated', JSON.stringify(changes));
    assert.equal(result.evidence.judge, null);
  }
  const threshold = await evaluateOutput({
    caseData, output, runId: RUN_ID,
    judge: async () => ({ ...jevReceipt(caseData), overallProbability: 0.6 }),
  });
  assert.equal(threshold.evaluation.verdict, 'passed');
});
