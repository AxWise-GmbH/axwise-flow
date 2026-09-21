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
      return jevReceipt(input);
    },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(result.evidence.judge.provider, 'typesafe');
  assert.equal(judgeInput.output, output);
  assert.equal(judgeInput.prompt, caseData.prompt);
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
    judge: async (input) => {
      calls += 1;
      return jevReceipt(input);
    },
  });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(calls, 0);
  assert.ok(result.evidence.deterministicChecks.some(({ passed }) => !passed));
});

test('judge failure or malformed unknown receipt remains not evaluated', async () => {
  const caseData = catalogCase('message-json-normalization');
  const output = JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' });

  const unavailable = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async (input) => { throw new Error('provider down'); } });
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
    judge: async (input) => {
      judgeCalls += 1;
      return jevReceipt(input);
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
      return new Response('<html><body><h1 id="json.dumps">json.dumps</h1><p>If ensure_ascii is true, output is escaped.</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    judge: async (input) => {
      judgeInput = input;
      return jevReceipt(input);
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
      return new Response('<h4>AbortSignal.timeout(delay)<a id=static-method-abortsignaltimeoutdelay></a></h4><p>AbortSignal.timeout(delay) returns a new AbortSignal.</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
    judge: async (input) => {
      assert.equal(input.sources[0].url, 'https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay');
      assert.match(input.sources[0].contentHash, /^[a-f0-9]{64}$/);
      return jevReceipt(input);
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
          return jevReceipt(input);
        },
      });
      assert.equal(result.evaluation.verdict, 'passed');
    });
  }
});

test('fragmentless Node and SQLite roots select all supporting claim sections', async (t) => {
  await t.test('Node root combines pipeline and pipe evidence', async () => {
    const caseData = catalogCase('research-node-streams');
    const navigation = `<nav>stream.pipeline readable.pipe ${'navigation '.repeat(30_000)}</nav>`;
    const pipeline = [
      '<section><h4><code>stream.pipeline(source, destination, callback)</code>',
      '<span><a class=mark id=streampipelinesource-transforms-destination-callback></a></span></h4>',
      '<p>A module method forwarding errors and properly cleaning up.</p>',
      `<p>${'pipeline detail '.repeat(180)}</p>`,
      '<p>stream.pipeline() will call stream.destroy(err) on active streams.</p></section>',
    ].join('');
    const pipe = [
      '<section><h6><code>readable.pipe(destination[, options])</code>',
      '<span><a class=mark id=readablepipedestination-options></a></span></h6>',
      `<p>${'pipe detail '.repeat(180)}</p>`,
      '<p>If the Readable emits an error, the Writable destination is not closed automatically; manually close streams to prevent memory leaks.</p></section>',
    ].join('');
    const result = await evaluateOutput({
      caseData,
      output: 'Use stream.pipeline for error forwarding and cleanup; readable.pipe needs manual cleanup. Tradeoffs are lifecycle control and listener handling. https://nodejs.org/api/stream.html',
      runId: RUN_ID,
      fetchImpl: async () => new Response(`<html><body>${navigation}${pipeline}${pipe}</body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
      judge: async (input) => {
        const excerpt = input.sources[0].excerpt;
        assert.match(excerpt, /forwarding errors/i);
        assert.match(excerpt, /destroy\(err\)/i);
        assert.match(excerpt, /not closed automatically/i);
        assert.match(excerpt, /prevent memory leaks/i);
        assert.doesNotMatch(excerpt, /navigation navigation/);
        assert.ok(excerpt.length <= 2_400);
        return jevReceipt(input);
      },
    });
    assert.equal(result.evaluation.verdict, 'passed');
  });

  await t.test('SQLite root combines values with the later WAL persistence statement', async () => {
    const caseData = catalogCase('search-sqlite-journal-mode');
    const navigation = `<nav>journal_mode ${'navigation '.repeat(30_000)}</nav>`;
    const journalMode = [
      '<a name="pragma_journal_mode"></a><h _id=pragma_journal_mode>PRAGMA journal_mode</h>',
      '<p>PRAGMA journal_mode = DELETE | TRUNCATE | PERSIST | MEMORY | WAL | OFF</p>',
      `<p>${'mode detail '.repeat(300)}</p>`,
      '<p>The WAL journaling mode is persistent; after being set it stays in effect after closing and reopening the database.</p>',
    ].join('');
    const result = await evaluateOutput({
      caseData,
      output: 'Values are DELETE, TRUNCATE, PERSIST, MEMORY, WAL, and OFF. WAL persists after reopening. https://www.sqlite.org/pragma.html',
      runId: RUN_ID,
      fetchImpl: async () => new Response(`<html><body>${navigation}${journalMode}</body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
      judge: async (input) => {
        const excerpt = input.sources[0].excerpt;
        assert.match(excerpt, /DELETE \| TRUNCATE \| PERSIST \| MEMORY \| WAL \| OFF/i);
        assert.match(excerpt, /WAL journaling mode is persistent/i);
        assert.doesNotMatch(excerpt, /navigation navigation/);
        assert.ok(excerpt.length <= 2_400);
        return jevReceipt(input);
      },
    });
    assert.equal(result.evaluation.verdict, 'passed');
  });
});

test('other fragmentless catalog roots use their pinned official content sections', async (t) => {
  const scenarios = [
    {
      templateId: 'search-node-abort-timeout',
      output: 'AbortSignal.timeout(delay) returns a signal that aborts after the delay. https://nodejs.org/api/globals.html',
      pages: new Map([['https://nodejs.org/api/globals.html', '<nav>AbortSignal timeout navigation</nav><h4>AbortSignal.timeout(delay)<a id=static-method-abortsignaltimeoutdelay></a></h4><p>The number of milliseconds to wait. Returns a new AbortSignal.</p>']]),
      expected: [/number of milliseconds/i, /new AbortSignal/i],
    },
    {
      templateId: 'search-python-json-ascii',
      output: 'ensure_ascii defaults to true and escapes non-ASCII characters. https://docs.python.org/3/library/json.html',
      pages: new Map([['https://docs.python.org/3/library/json.html', '<nav>ensure_ascii navigation</nav><h3 id="json.dump">json.dump ensure_ascii=True</h3><p>If ensure_ascii is true (the default), non-ASCII characters are escaped.</p><h3 id="json.dumps">json.dumps ensure_ascii=True</h3><p>The arguments have the same meaning as dump().</p>']]),
      expected: [/true \(the default\)/i, /characters are escaped/i, /same meaning as dump/i],
    },
    {
      templateId: 'research-postgres-indexes',
      output: 'Prefer BRIN for correlated append-only data and B-tree for selective ranges. Tradeoffs include index size and precision. https://www.postgresql.org/docs/current/indexes-types.html https://www.postgresql.org/docs/current/brin.html',
      pages: new Map([
        ['https://www.postgresql.org/docs/current/indexes-types.html', '<nav>B-tree navigation</nav><div id="INDEXES-TYPES-BTREE"><h3>B-Tree</h3><p>B-trees handle equality and range queries and can retrieve sorted order.</p></div>'],
        ['https://www.postgresql.org/docs/current/brin.html', '<nav>BRIN navigation</nav><div id="BRIN-INTRO"><h3>Introduction</h3><p>BRIN summarizes block ranges for columns correlated with physical order.</p></div>'],
      ]),
      expected: [/equality and range queries/i, /block ranges/i, /physical order/i],
    },
    {
      templateId: 'research-browser-storage',
      output: 'Use IndexedDB for a structured offline queue. It is asynchronous; localStorage is simpler but string-based. Tradeoffs include scale and complexity. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage',
      pages: new Map([
        ['https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API', '<nav>IndexedDB navigation</nav><h2 id="key_concepts_and_usage">Key concepts</h2><p>IndexedDB stores structured data and operates asynchronously.</p>'],
        ['https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage', '<nav>localStorage navigation</nav><main id="content"><h1>localStorage</h1><p>Stored data is saved across browser sessions.</p><p>Keys and values use UTF-16 strings.</p></main>'],
      ]),
      expected: [/structured data/i, /asynchronously/i, /saved across browser sessions/i, /UTF-16/i],
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.templateId, async () => {
      const caseData = catalogCase(scenario.templateId);
      const result = await evaluateOutput({
        caseData,
        output: scenario.output,
        runId: RUN_ID,
        fetchImpl: async (url) => new Response(scenario.pages.get(url), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
        judge: async (input) => {
          const excerpts = input.sources.map(({ excerpt }) => excerpt).join(' ');
          for (const expected of scenario.expected) assert.match(excerpts, expected);
          assert.doesNotMatch(excerpts, /navigation navigation/);
          return jevReceipt(input);
        },
      });
      assert.equal(result.evaluation.verdict, 'passed');
    });
  }
});

test('a valid root citation supersedes an invalid fragment for the same official document', async () => {
  const caseData = catalogCase('search-node-abort-timeout');
  const output = [
    'AbortSignal.timeout(delay) returns a signal that aborts after the requested delay.',
    'https://nodejs.org/api/globals.html#abortsignaltimeoutdelay',
    '(https://nodejs.org/api/globals.html)',
  ].join(' ');
  let fetchCalls = 0;
  const page = '<nav>AbortSignal.timeout navigation</nav><h4>AbortSignal.timeout(delay)<a id=static-method-abortsignaltimeoutdelay></a></h4><p>The number of milliseconds to wait. Returns a new AbortSignal.</p>';
  const result = await evaluateOutput({
    caseData,
    output,
    runId: RUN_ID,
    fetchImpl: async (url) => {
      fetchCalls += 1;
      assert.equal(url, 'https://nodejs.org/api/globals.html');
      return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
    },
    judge: async (input) => {
      assert.equal(input.sources.length, 1);
      assert.equal(input.sources[0].url, 'https://nodejs.org/api/globals.html');
      assert.match(input.sources[0].excerpt, /Returns a new AbortSignal/i);
      return jevReceipt(input);
    },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(fetchCalls, 1);
});

test('an invalid official fragment without a valid document root still fails grounding', async () => {
  const caseData = catalogCase('search-node-abort-timeout');
  const page = '<h4>AbortSignal.timeout(delay)<a id=static-method-abortsignaltimeoutdelay></a></h4><p>Returns a new AbortSignal.</p>';
  const result = await evaluateOutput({
    caseData,
    output: 'AbortSignal.timeout returns a timed signal. https://nodejs.org/api/globals.html#abortsignaltimeoutdelay',
    runId: RUN_ID,
    fetchImpl: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }),
    judge: async (input) => jevReceipt(input),
  });

  assert.equal(result.evaluation.verdict, 'failed');
  assert.equal(result.evaluation.criteriaResults.at(-1).reason, 'source_relevant_section_not_found');
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
    judge: async (input) => jevReceipt(input),
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
    judge: async (input) => jevReceipt(input),
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
  const result = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async (input) => jevReceipt(input, 'failed') });

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
    judge: async (input) => jevReceipt(input),
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
    judge: async (input) => jevReceipt(input),
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
    judge: async (input) => {
      judgeCalls += 1;
      return jevReceipt(input);
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

test('plan counts eight Step headings separately from numbered non-goals and rollout substeps', async () => {
  const caseData = catalogCase('plan-webhook-retries');
  // Shape of live run d9793c32-fe7d-4f23-a50c-9cb43fab0fcd: eight Step headings,
  // two numbered non-goals first, then three numbered rollout details under Step 8.
  const output = [
    '### Non-Goals',
    '1. **Strict FIFO In-Order Delivery:** Concurrent deliveries need not be ordered.',
    '2. **Custom Transports and Auth Schemes:** Delivery uses HTTPS POST and HMAC.',
    '---',
    '### Implementation Plan',
    '#### Step 1: Persistence & Transactional Outbox',
    'Persist events and delivery records in a transactional outbox.',
    '#### Step 2: Payload Envelope & Cryptographic Signing',
    'Sign timestamp and payload with HMAC-SHA256.',
    '#### Step 3: Dispatch Worker Pipeline & HTTP Hardening',
    'Deploy workers with HTTPS-only destinations and bounded timeouts.',
    '#### Step 4: Retry Policy & Dynamic Backoff',
    'Retry transient network failures and 5xx with jitter for at most seven attempts.',
    '#### Step 5: Terminal Failure Handling & Dead-Letter Queue',
    'Mark non-retryable 4xx and exhausted retries terminal, retaining failed events.',
    '#### Step 6: Observability, Metrics, and Alerting',
    'Log attempts and measure delivery latency and terminal failure rates.',
    '#### Step 7: Automated Testing Strategy',
    'Test signing, retry bounds, terminal responses, and recovery after crashes.',
    '#### Step 8: Phased Rollout & Migration',
    '1. **Canary Verification:** Deploy to internal mock endpoints.',
    '2. **Pilot Cohort:** Enable a small cohort and inspect metrics.',
    '3. **General Availability:** Expand gradually with rollback readiness.',
  ].join('\n');
  let judgeCalls = 0;
  const result = await evaluateOutput({
    caseData, output, runId: RUN_ID,
    judge: async (input) => { judgeCalls += 1; return jevReceipt(input); },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(judgeCalls, 1);
  assert.ok(result.evidence.deterministicChecks.every(({ passed }) => passed));
});

test('numbered implementation plans exclude numbered non-goals and indented substeps', async () => {
  const caseData = catalogCase('plan-cache-migration');
  const output = [
    ...Array.from({ length: 8 }, (_, index) => `${index + 1}. Address key design, invalidation, fallback, rollout, rollback, observability metrics, and tests.`),
    '   1. Verify the rollout cohort.',
    '   2. Inspect the metrics.',
    '## Non-goals',
    '1. Replace the database.',
    '2. Redesign unrelated APIs.',
  ].join('\n');
  const result = await evaluateOutput({ caseData, output, runId: RUN_ID, judge: async (input) => jevReceipt(input) });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.ok(result.evidence.deterministicChecks.every(({ passed }) => passed));
});

test('plan enforces one through eight ordered steps without an unstated four-step minimum', async () => {
  const caseData = catalogCase('plan-cache-migration');
  for (const count of [0, 1, 3, 8, 9]) {
    const output = [
      ...Array.from({ length: count }, (_, index) => `#### Step ${index + 1}: Implementation`),
      'Address key design, invalidation, fallback, rollout, rollback, observability metrics, and tests.',
      'Non-goal 1: Replace the database.',
      'Non-goal 2: Redesign unrelated APIs.',
    ].join('\n');
    let judgeCalls = 0;
    const result = await evaluateOutput({
      caseData, output, runId: RUN_ID,
      judge: async (input) => { judgeCalls += 1; return jevReceipt(input); },
    });
    const bounded = count >= 1 && count <= 8;
    assert.equal(result.evidence.deterministicChecks.find(({ id }) => id === 'bounded_ordered_steps').passed, bounded, `step count ${count}`);
    assert.equal(judgeCalls, bounded ? 1 : 0, `step count ${count}`);
    assert.equal(result.evaluation.verdict, bounded ? 'passed' : 'failed', `step count ${count}`);
  }
});

test('message judge receives the original incident facts as well as the output and criteria', async () => {
  const caseData = catalogCase('message-constraint-summary');
  const output = 'At 09:10 UTC, cache saturation caused elevated API latency. The cache was resized at 09:18 UTC, allowing latency to return to normal by 09:24 UTC.';
  let judgeInput;
  const result = await evaluateOutput({
    caseData, output, runId: RUN_ID,
    judge: async (input) => { judgeInput = input; return jevReceipt(input); },
  });

  assert.equal(result.evaluation.verdict, 'passed');
  assert.equal(judgeInput.prompt, caseData.prompt);
  assert.match(judgeInput.prompt, /At 09:10 UTC, cache saturation raised API latency/);
  assert.match(judgeInput.prompt, /At 09:18 UTC, the cache was resized/);
});

test('PostgreSQL response word limit counts prose rather than Markdown and numeric citations', async () => {
  const caseData = catalogCase('research-postgres-indexes');
  const brin = '[1](<https://www.postgresql.org/docs/current/brin.html>)';
  const indexes = '[2](<https://www.postgresql.org/docs/current/indexes-types.html>)';
  // Exact displayed response from the third live run, with citation strings shared.
  const output = [
    '### Recommendation',
    '',
    `For a large append-only events table where rows are physically inserted in timestamp order, a **BRIN (Block Range Index)** is the recommended choice ${brin} ${indexes}. Because event timestamps naturally correlate with their physical page layout, BRIN provides efficient range scanning while keeping index overhead negligible ${brin} ${indexes}.`,
    '',
    '---',
    '',
    '### Tradeoffs',
    '',
    `1. **Storage Footprint and Lossiness vs. Point Lookup Precision** ${brin} ${indexes}`,
    `   * **BRIN:** Summarizes column values (such as minimum and maximum bounds for linear sort orders) across multi-page block ranges rather than indexing individual rows ${brin} ${indexes}. This yields an extremely small index with minimal maintenance overhead, but it is lossy ${brin}. Queries execute via bitmap index scans, requiring the executor to fetch and recheck all heap tuples within matching ranges ${brin}.`,
    `   * **B-tree:** Indexes every individual tuple, enabling exact, non-lossy equality and range lookups ${indexes}. However, it consumes substantial disk space and incurs higher maintenance cost on massive tables ${brin}.`,
    '',
    `2. **Index-Driven Ordering vs. Maintenance on Append** ${indexes}`,
    `   * **B-tree:** Can return matching rows directly in sorted order, which can bypass an explicit query sort step ${indexes}.`,
    `   * **BRIN:** Cannot return data in sorted order. Additionally, when new heap pages are appended past the previously summarized block range, they remain unsummarized until a summarization routine or vacuum run processes them ${brin}.`,
    '',
    '---',
    '',
    `**Sources:** PostgreSQL Documentation chapters *Index Types* and *BRIN Indexes* ${brin} ${indexes}.`,
  ].join('\n');
  const result = await evaluateOutput({
    caseData, output, runId: RUN_ID,
    fetchImpl: async () => { throw new Error('Word-count regression does not fetch sources.'); },
  });

  assert.equal(output.trim().split(/\s+/u).length, 226);
  assert.equal(result.evidence.deterministicChecks.find(({ id }) => id === 'word_limit').passed, true);
});

test('word limit retains descriptive labels, ordinary numbers, and non-ASCII prose', async () => {
  const caseData = catalogCase('research-postgres-indexes');
  const url = 'https://www.postgresql.org/docs/current/brin.html';
  const words = (count, word = 'word') => Array(count).fill(word).join(' ');
  const cases = [
    { name: 'plain prose over the limit', output: words(221), passed: false },
    { name: 'descriptive link labels', output: `${words(218)} [three descriptive words](${url})`, passed: false },
    { name: 'ordinary numeric prose', output: `${words(219)} 42 2026`, passed: false },
    { name: 'non-ASCII prose over the limit', output: words(221, 'Überprüfung'), passed: false },
    { name: 'non-ASCII prose at the limit', output: words(220, 'résumé'), passed: true },
    { name: 'visible heading words', output: `${words(219)}\n### Two Words`, passed: false },
    { name: 'numeric citations and bare URL', output: `${words(220)} [1](<${url}>) [2](${url}) [3] ${url}`, passed: true },
    { name: 'list markers and horizontal rules', output: `##\n---\n1. ${words(110)}\n* ${words(110)}\n***`, passed: true },
  ];
  for (const item of cases) {
    const result = await evaluateOutput({
      caseData, output: item.output, runId: RUN_ID, sources: [{ url }],
      fetchImpl: async () => { throw new Error('Word-count regression does not fetch sources.'); },
    });
    assert.equal(result.evidence.deterministicChecks.find(({ id }) => id === 'word_limit').passed, item.passed, item.name);
  }
});
