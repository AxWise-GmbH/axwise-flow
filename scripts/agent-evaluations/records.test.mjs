import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEvaluationCatalog } from './catalog.mjs';
import {
  buildPublicSummary,
  normalizeAgentEvaluationRecord,
  RECORD_SCHEMA_VERSION,
  validateAgentEvaluationRecord,
} from './records.mjs';

const HASH = 'a'.repeat(64);

function arm({
  status = 'completed',
  verdict = 'passed',
  elapsedMs = 100,
  model = 'shared-model',
  resolvedModel,
  usage,
  suffix = 'orqanix',
  time = '2026-09-21T11:59:00.000Z',
} = {}) {
  return {
    status,
    startedAt: time,
    finishedAt: time,
    elapsedMs,
    model,
    ...(resolvedModel === undefined ? {} : { resolvedModel }),
    endpoint: `https://example.test/${suffix}`,
    ...(status === 'completed' ? { outputHash: HASH, outputRef: `evidence/${suffix}.txt` } : {}),
    ...(usage === undefined ? {} : { usage }),
    evaluation: { verdict },
    ...(status === 'failed' ? { error: 'request failed' } : {}),
  };
}

function record({
  runId = 'run-1',
  finishedAt = '2026-09-21T11:59:00.000Z',
  orqanix = {},
  vanilla = {},
} = {}) {
  const catalog = buildEvaluationCatalog({ slot: finishedAt });
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
        orqanix: arm({ ...orqanix, suffix: `${runId}-${evaluationCase.category}-orqanix`, time: finishedAt }),
        vanilla: arm({ ...vanilla, suffix: `${runId}-${evaluationCase.category}-vanilla`, time: finishedAt }),
      },
    })),
  };
}

test('validates and normalizes a live record while rejecting old and synthetic schemas', () => {
  const input = record();
  input.ignored = 'not public';
  const validation = validateAgentEvaluationRecord(input);
  assert.deepEqual(validation, { valid: true, errors: [] });

  const normalized = normalizeAgentEvaluationRecord(input);
  assert.equal(normalized.executionMode, 'live');
  assert.equal(normalized.ignored, undefined);

  const old = { ...input, schemaVersion: 'orqanix.benchmark.v6' };
  assert.equal(validateAgentEvaluationRecord(old).valid, false);
  assert.throws(() => normalizeAgentEvaluationRecord(old), /Invalid orqanix\.agent-evaluation\.v1 record/);

  const synthetic = { ...input, executionMode: 'fixture' };
  assert.equal(validateAgentEvaluationRecord(synthetic).valid, false);
});

test('rejects changed case inputs and non-monotonic evidence timestamps', () => {
  const changed = record();
  changed.cases[0].prompt += ' changed';
  assert.ok(validateAgentEvaluationRecord(changed).errors.some((error) => error.includes('inputHash does not match')));

  const reversed = record();
  reversed.cases[0].arms.orqanix.startedAt = '2026-09-21T12:00:00.000Z';
  assert.ok(validateAgentEvaluationRecord(reversed).errors.some((error) => error.includes('must not precede')));
});

test('rolling windows include exact lower boundaries and never backfill invalid records', () => {
  const now = '2026-09-21T12:00:00.000Z';
  const within15 = record({ runId: 'within-15', finishedAt: '2026-09-21T11:45:00.000Z' });
  const outside15 = record({ runId: 'outside-15', finishedAt: '2026-09-21T11:44:59.999Z' });
  const boundary24 = record({ runId: 'boundary-24', finishedAt: '2026-09-20T12:00:00.000Z' });
  const invalidOld = { ...record({ runId: 'old-schema' }), schemaVersion: 'orqanix.benchmark.v6' };

  const summary = buildPublicSummary([within15, outside15, boundary24, invalidOld], { now });
  assert.equal(summary.windows['15m'].runCount, 1);
  assert.equal(summary.windows['3h'].runCount, 2);
  assert.equal(summary.windows['24h'].runCount, 3);
  assert.equal(summary.windows['24h'].caseCount, 15);
});

test('reports execution, evaluation, and terminal outcomes separately', () => {
  const completedButFailed = record({
    runId: 'evaluation-failed',
    orqanix: { status: 'completed', verdict: 'failed' },
    vanilla: { status: 'failed', verdict: 'not_evaluated' },
  });
  const summary = buildPublicSummary([completedButFailed], { now: '2026-09-21T12:00:00.000Z' });
  const message = summary.windows['15m'].categories.message;

  assert.equal(message.sampleCount, 1);
  assert.deepEqual(message.execution.orqanix, { completed: 1, failed: 0, notEvaluated: 0 });
  assert.deepEqual(message.evaluation.orqanix, { passed: 0, failed: 1, notEvaluated: 0 });
  assert.deepEqual(message.terminal.orqanix, { passed: 0, failed: 1, incomplete: 0 });
  assert.deepEqual(message.terminal.vanilla, { passed: 0, failed: 0, incomplete: 1 });
});

test('computes real percentiles, preserves zero latency, and reports only observed usage', () => {
  const first = record({
    runId: 'first',
    finishedAt: '2026-09-21T11:50:00.000Z',
    orqanix: { resolvedModel: 'reported-model', elapsedMs: 0, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
    vanilla: { resolvedModel: 'reported-model', elapsedMs: 50 },
  });
  const second = record({
    runId: 'second',
    finishedAt: '2026-09-21T11:59:00.000Z',
    orqanix: { resolvedModel: 'reported-model', elapsedMs: 100 },
    vanilla: { resolvedModel: 'reported-model', elapsedMs: 200 },
  });
  const summary = buildPublicSummary([first, second], { now: '2026-09-21T12:00:00.000Z' });
  const message = summary.windows['15m'].categories.message;

  assert.deepEqual(message.latencyMs.orqanix, { sampleCount: 2, p50: 50, p95: 95 });
  assert.deepEqual(message.latencyMs.vanilla, { sampleCount: 2, p50: 125, p95: 192.5 });
  assert.deepEqual(message.usage.orqanix, { sampleCount: 1, inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  assert.equal(message.usage.vanilla, null);
  assert.equal(message.comparison.pairedSuccessfulCount, 2);
  assert.equal(message.comparison.latencyRatioSampleCount, 2);
  assert.equal(message.comparison.orqanixToVanillaLatencyRatioP50, 0.25);
});

test('paired latency comparison requires matching actual model identities', () => {
  const mismatch = record({
    runId: 'mismatch',
    orqanix: { model: 'alias', resolvedModel: 'model-a', elapsedMs: 100 },
    vanilla: { model: 'alias', resolvedModel: 'model-b', elapsedMs: 50 },
  });
  const same = record({
    runId: 'same',
    finishedAt: '2026-09-21T11:58:00.000Z',
    orqanix: { model: 'alias', resolvedModel: 'model-a', elapsedMs: 100 },
    vanilla: { model: 'different-alias', resolvedModel: 'model-a', elapsedMs: 50 },
  });
  const configuredOnly = record({ runId: 'unreported', orqanix: { model: 'model-a' }, vanilla: { model: 'model-a' } });
  const summary = buildPublicSummary([mismatch, same, configuredOnly], { now: '2026-09-21T12:00:00.000Z' });
  const comparison = summary.windows['15m'].categories.message.comparison;

  assert.equal(comparison.pairedSuccessfulCount, 1);
  assert.equal(comparison.latencyRatioSampleCount, 1);
  assert.equal(comparison.orqanixToVanillaLatencyRatioP50, 2);
});

test('freshness turns stale only after thirty minutes and latest exposes evidence ids', () => {
  const current = record({ runId: 'latest', finishedAt: '2026-09-21T11:30:00.000Z' });
  const fresh = buildPublicSummary([current], { now: '2026-09-21T12:00:00.000Z' });
  assert.equal(fresh.freshness.status, 'fresh');
  assert.equal(fresh.freshness.ageSeconds, 1800);
  assert.equal(fresh.latest.runId, 'latest');
  assert.match(fresh.latest.cases[0].arms.orqanix.evidenceId, /^evidence\//);

  const stale = buildPublicSummary([current], { now: '2026-09-21T12:00:00.001Z' });
  assert.equal(stale.freshness.status, 'stale');

  const unavailable = buildPublicSummary([], { now: '2026-09-21T12:00:00.000Z' });
  assert.equal(unavailable.freshness.status, 'unavailable');
  assert.equal(unavailable.latest, null);
});
