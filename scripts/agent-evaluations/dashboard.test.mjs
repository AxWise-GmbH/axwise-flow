import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { buildEvaluationCatalog } from './catalog.mjs';
import { buildPublicSummary, RECORD_SCHEMA_VERSION } from './records.mjs';

const dashboardPath = new URL('../../apps/orqaly/public/evaluation-dashboard.js', import.meta.url);
const source = readFileSync(dashboardPath, 'utf8');
const sandbox = {
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
  assert.equal(dashboard.formatRatio(null), 'Not comparable');
});

test('accepts a measured summary with exact prompts, matched-model ratios, and receipts', () => {
  const summary = buildPublicSummary([liveRecord()], { now: '2026-09-21T12:00:00.000Z' });
  assert.equal(dashboard.validateSummary(summary), true);
  assert.equal(summary.latest.cases.length, 5);
  assert.equal(summary.windows['15m'].categories.coding.comparison.orqanixToVanillaLatencyRatioP50, 1.2);
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
