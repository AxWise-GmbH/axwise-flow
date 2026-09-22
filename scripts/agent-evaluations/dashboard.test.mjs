import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';

import { buildEvaluationCatalog } from './catalog.mjs';
import { buildPublicSummary, RECORD_SCHEMA_VERSION } from './records.mjs';

const dashboardPath = new URL('../../apps/orqaly/public/evaluation-dashboard.js', import.meta.url);
const source = readFileSync(dashboardPath, 'utf8');
const { JSDOM } = createRequire(new URL('../../apps/orqaly/package.json', import.meta.url))('jsdom');
const sandbox = {
  Date: class extends Date { static now() { return Date.parse('2026-09-21T12:00:00.000Z'); } },
  AbortController,
  Intl,
  URL,
  clearTimeout,
  console,
  setTimeout,
};
vm.runInNewContext(source, sandbox, { filename: dashboardPath.pathname });
const dashboard = sandbox.OrqanixEvaluationDashboard;
const HASH = 'a'.repeat(64);

function liveRecord() {
  const finishedAt = '2026-09-21T11:59:00.000Z';
  const runId = '79b2b1ac-10d8-4bfd-8ef8-0c92255a56de';
  const catalog = buildEvaluationCatalog({ slot: finishedAt });
  const arm = (evaluationCase, armName, elapsedMs) => ({
    status: 'completed',
    startedAt: finishedAt,
    finishedAt,
    elapsedMs,
    model: 'shared-model',
    resolvedModel: 'shared-model-v1',
    endpoint: `https://example.test/${armName}`,
    outputHash: HASH,
    outputRef: `/heartbeat/evidence/${runId}.json#${evaluationCase.category}-${armName}`,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    evaluation: { verdict: 'passed' },
  });
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    executionMode: 'live',
    runId,
    slot: catalog.slot,
    startedAt: finishedAt,
    finishedAt,
    runnerRevision: '0123456789abcdef',
    cases: catalog.cases.map((evaluationCase) => ({
      ...evaluationCase,
      arms: {
        orqanix: arm(evaluationCase, 'orqanix', 120),
        vanilla: arm(evaluationCase, 'vanilla', 100),
      },
    })),
  };
}

test('accepts the canonical empty public summary without inventing samples', () => {
  const summary = buildPublicSummary([], { now: '2026-09-21T12:00:00.000Z' });
  assert.equal(dashboard.validateSummary(summary), true);
  assert.equal(summary.windows['15m'].runCount, 0);
  assert.equal(summary.windows['3h'].categories.coding.latencyMs.orqanix.p50, null);
  assert.equal(dashboard.formatDuration(null), '—');
  assert.equal(dashboard.usageText(null), 'Not captured');
});

test('accepts a measured summary with exact prompts and receipts', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  assert.equal(dashboard.validateSummary(summary), true);
  assert.equal(summary.latest.cases.length, 5);
  assert.match(summary.latest.cases[1].prompt, /function|implementation|module/i);
});

test('rejects synthetic, incomplete, and malformed summaries', () => {
  const summary = buildPublicSummary([], { now: '2026-09-21T12:00:00.000Z' });
  assert.equal(dashboard.validateSummary({ ...summary, schemaVersion: 'orqanix.benchmark.synthetic.v1' }), false);

  const missingWindow = structuredClone(summary);
  delete missingWindow.windows['24h'];
  assert.equal(dashboard.validateSummary(missingWindow), false);

  const fakeLatency = structuredClone(summary);
  fakeLatency.windows['3h'].categories.message.latencyMs.orqanix.p50 = 'fast';
  assert.equal(dashboard.validateSummary(fakeLatency), false);
});

test('links only sanitized UUID evidence receipts for the exact category and arm', () => {
  const valid = '/heartbeat/evidence/79b2b1ac-10d8-4bfd-8ef8-0c92255a56de.json#coding-orqanix';
  assert.equal(dashboard.safeEvidenceHref(valid, 'coding', 'orqanix'), valid);
  assert.equal(dashboard.safeEvidenceHref(valid, 'coding', 'vanilla'), null);
  assert.equal(dashboard.safeEvidenceHref('https://example.test/evidence.json', 'coding', 'orqanix'), null);
  assert.equal(dashboard.safeEvidenceHref('/heartbeat/evidence/../../secret#coding-orqanix', 'coding', 'orqanix'), null);
});

test('derives freshness from the browser clock and rejects future observations', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  const fresh = dashboard.deriveFreshness(summary, Date.parse('2026-09-21T12:29:00.000Z'));
  assert.equal(fresh.status, 'fresh');
  assert.equal(fresh.ageSeconds, 1800);
  const stale = dashboard.deriveFreshness(summary, Date.parse('2026-09-21T12:29:00.001Z'));
  assert.equal(stale.status, 'stale');
  assert.equal(stale.ageSeconds, 1800.001);
  assert.equal(dashboard.deriveFreshness(summary, Date.parse('2026-09-21T11:57:00.000Z')), null);
});

test('public mirrors remain byte-identical and use external scripts', () => {
  const publicRoot = new URL('../../apps/orqaly/public/', import.meta.url);
  const gcpRoot = new URL('../../apps/orqaly/public-gcp/', import.meta.url);
  for (const file of ['heartbeat.html', 'benchmark.html', 'evaluation-dashboard.js']) {
    assert.equal(readFileSync(new URL(file, publicRoot), 'utf8'), readFileSync(new URL(file, gcpRoot), 'utf8'));
  }
  for (const file of ['heartbeat.html', 'benchmark.html']) {
    const html = readFileSync(new URL(file, publicRoot), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i);
  }
  const heartbeat = readFileSync(new URL('heartbeat.html', publicRoot), 'utf8');
  const benchmark = readFileSync(new URL('benchmark.html', publicRoot), 'utf8');
  assert.equal(heartbeat, readFileSync(new URL('heartbeat/index.html', publicRoot), 'utf8'));
  assert.equal(heartbeat, readFileSync(new URL('heartbeat/index.html', gcpRoot), 'utf8'));
  assert.equal(benchmark, readFileSync(new URL('benchmark/index.html', publicRoot), 'utf8'));
  assert.equal(benchmark, readFileSync(new URL('benchmark/index.html', gcpRoot), 'utf8'));
  assert.equal(benchmark, readFileSync(new URL('../../orqanix-public-benchmark-showcase.html', import.meta.url), 'utf8'));
});


test('labels failures as failed attempts, with no speed or quality winner claim for two passing results', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  const item = summary.latest.cases[0];
  item.arms.orqanix.elapsedMs = 61000;
  item.arms.vanilla.elapsedMs = 2800;
  assert.equal(dashboard.outcome(item.arms.orqanix).text, 'Completed · 1.0 min');
  assert.equal(dashboard.interpretation(item), 'Both passed the task checks. This case does not establish a quality winner.');
  item.arms.orqanix.status = 'failed';
  item.arms.orqanix.evaluationVerdict = 'not_evaluated';
  item.arms.orqanix.error = 'AXWISE_ASSISTANT_EVIDENCE_UNAVAILABLE';
  assert.equal(dashboard.outcome(item.arms.orqanix).text, 'Execution failed after 1.0 min');
  assert.equal(dashboard.failureReason(item.arms.orqanix), 'No usable supporting evidence was obtained.');
  assert.equal(dashboard.interpretation(item), 'The Orqanix request failed; the direct model returned an answer.');
  assert.equal(dashboard.usageText(undefined), 'Not captured');
});

test('rejects malformed and future history instead of rendering unsupported records', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  summary.history = [structuredClone(summary.latest)];
  assert.equal(dashboard.validateSummary(summary), true);
  summary.history[0].finishedAt = '2026-09-21T12:01:00.000Z';
  assert.equal(dashboard.validateSummary(summary), false);
  summary.history = [null];
  assert.equal(dashboard.validateSummary(summary), false);
});

test('table shows the latest prompt, selects earlier runs and keeps selection and disclosures on refresh', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  const previous = structuredClone(summary.latest);
  previous.runId = '5b2dfac2-7fa9-4e39-a1bd-f2156b379e6b';
  previous.finishedAt = '2026-09-21T11:30:00.000Z';
  previous.runnerRevision = 'abcdef0123456789';
  previous.cases[0].prompt = 'The previous prompt, kept exactly for inspection.';
  summary.history = [summary.latest, previous];
  const html = readFileSync(new URL('../../apps/orqaly/public/benchmark.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.equal(dashboard.render(document, summary), true);
  assert.equal(document.querySelector('[aria-pressed="true"]').dataset.window, '15m');
  assert.equal(document.querySelectorAll('#evaluation-category-body > tr[data-category]').length, 5);
  assert.equal(document.querySelector('#evaluation-run-select').options.length, 1);
  document.querySelector('[data-window="3h"]').click();
  const selector = document.querySelector('#evaluation-run-select');
  assert.equal(selector.options.length, 2);
  selector.value = previous.runId;
  selector.dispatchEvent(new dom.window.Event('change'));
  assert.match(document.querySelector('#evaluation-category-body').textContent, /The previous prompt/);
  assert.equal(document.querySelector('#evaluation-revision-notice').hidden, false);
  assert.match(document.querySelector('#evaluation-revision-notice').textContent, /Earlier evaluator version/);
  document.querySelector('#evaluation-category-body .info-button').click();
  dashboard.render(document, structuredClone(summary));
  assert.equal(document.querySelector('[aria-pressed="true"]').dataset.window, '3h');
  assert.equal(document.querySelector('#evaluation-run-select').value, previous.runId);
  assert.equal(document.querySelector('#evaluation-category-body .info-button').getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelector('#details-message').hidden, false);
  assert.doesNotMatch(document.querySelector('table').textContent, /Matched-model ratio|p50|p95|Vanilla/);
  dom.window.close();
});

test('a stale latest run remains dated and visible outside an empty window; invalid data clears it', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  summary.latest.finishedAt = '2026-09-21T11:29:00.000Z';
  summary.freshness.latestFinishedAt = summary.latest.finishedAt;
  summary.history = [summary.latest];
  const html = readFileSync(new URL('../../apps/orqaly/public/benchmark.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  dashboard.render(document, summary);
  assert.match(document.querySelector('#evaluation-freshness').textContent, /Stale/);
  assert.match(document.querySelector('#evaluation-history-note').textContent, /No run finished in this window/);
  assert.equal(document.querySelectorAll('#evaluation-category-body > tr[data-category]').length, 5);
  assert.equal(dashboard.render(document, { broken: true }), false);
  assert.match(document.querySelector('#evaluation-freshness').textContent, /unavailable/);
  assert.equal(document.querySelectorAll('#evaluation-category-body > tr').length, 1);
  assert.equal(document.querySelector('#evaluation-run-select').disabled, true);
  dom.window.close();
});


test('keeps advisory concerns and retired reviews separate from execution completion', () => {
  const arm = { status: 'completed', elapsedMs: 2800, evaluationKind: 'advisory', evaluationVerdict: 'failed' };
  assert.equal(dashboard.outcome(arm).text, 'Completed · 2.80 s');
  assert.equal(dashboard.reviewLabel(arm).text, 'Jev: concerns');
  arm.evaluationVerdict = 'not_evaluated';
  arm.originalEvaluationVerdict = 'failed';
  arm.evaluationNotice = 'This earlier count-only review is retired and needs reevaluation.';
  assert.equal(dashboard.outcome(arm).text, 'Completed · 2.80 s');
  assert.equal(dashboard.reviewLabel(arm).text, 'Review outdated — needs reevaluation');
});


test('main table renders advisory and outdated reviews without relabelling completed requests as failed', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  const advisory = summary.latest.cases.find((item) => item.category === 'research').arms.orqanix;
  advisory.evaluationKind = 'advisory';
  advisory.evaluationVerdict = 'failed';
  const retired = summary.latest.cases.find((item) => item.category === 'plan').arms.orqanix;
  retired.evaluationKind = 'checks';
  retired.evaluationVerdict = 'not_evaluated';
  retired.originalEvaluationVerdict = 'failed';
  retired.evaluationNotice = 'An earlier step-count-only failure needs reevaluation.';
  retired.criteriaResults = [{ criterion: 'Old step count', passed: false }];
  summary.history = [summary.latest];
  const dom = new JSDOM(readFileSync(new URL('../../apps/orqaly/public/benchmark.html', import.meta.url), 'utf8'));
  const document = dom.window.document;
  dashboard.render(document, summary);
  const researchCell = document.querySelector('tr[data-category="research"] .result-cell');
  assert.match(researchCell.textContent, /Completed/);
  assert.match(researchCell.textContent, /Jev: concerns/);
  assert.doesNotMatch(researchCell.textContent, /Checks failed|Execution failed/);
  const planCell = document.querySelector('tr[data-category="plan"] .result-cell');
  assert.match(planCell.textContent, /Completed/);
  assert.match(planCell.textContent, /Review outdated — needs reevaluation/);
  assert.doesNotMatch(planCell.textContent, /Checks failed|Checks passed|Execution failed/);
  document.querySelector('tr[data-category="plan"] .info-button').click();
  assert.equal(document.querySelector('#details-plan').hidden, false);
  assert.match(document.querySelector('#details-plan').textContent, /Original recorded checks — review outdated/);
  dom.window.close();
});
