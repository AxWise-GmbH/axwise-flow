import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { callGeminiSample } from './benchmark-provider-client.mjs';
import { benchmarkRealArtifactCreation, TIERS } from './benchmark-real-creation-times.mjs';
import { runMatrix } from './e2e-matrix-benchmark.mjs';
import { runBenchmarks } from './benchmark-jev-acceleration.mjs';
import { runBenchmark } from './benchmark-gemini-jev-batches.mjs';

const providerOptions = { apiKey: 'dummy-key', model: 'requested-model' };
const response = data => new Response(JSON.stringify(data), { status: 200 });
const stopped = text => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }], modelVersion: 'returned-model' });
const sample = text => ({ text, finishReason: 'STOP', requestedModel: 'fake-model', requestedEffort: 'low', usage: null });
const triage = async () => ({ evaluated: true, route: 'conversation', thinkingEffort: 'low', model: 'fake-jev' });

test('raw provider rejects HTTP, empty, malformed and truncated responses', async () => {
  for (const fetchImpl of [
    async () => new Response('provider failure', { status: 500 }),
    async () => response({}), async () => response(stopped('')),
    async () => response({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }),
    async () => new Response('not-json'),
  ]) await assert.rejects(callGeminiSample('prompt', { ...providerOptions, fetchImpl }));
});

test('deadline includes body read and does not depend on AbortSignal support', async () => {
  const fetchImpl = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(callGeminiSample('prompt', { ...providerOptions, fetchImpl, timeoutMs: 10 }), /timed out/);
});

test('requested and returned model, actual effort, complete text and usage are reported', async () => {
  let requested;
  const result = await callGeminiSample('exact prompt', { ...providerOptions, effort: 'off', fetchImpl: async (url, options) => {
    requested = { url, options };
    return response({ ...stopped('first'), candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private thought', thought: true }, { text: 'first ' }, { text: 'second' }] } }], usageMetadata: { totalTokenCount: 17 } });
  } });
  assert.equal(result.requestedModel, 'requested-model');
  assert.equal(result.returnedModel, 'returned-model');
  assert.equal(result.requestedEffort, 'low');
  assert.equal(result.text, 'first second');
  assert.equal(result.usage.totalTokenCount, 17);
  assert.ok(!requested.url.includes('dummy-key'));
  assert.equal(requested.options.headers['x-goog-api-key'], 'dummy-key');
});

test('text pipeline carries actual prior outputs and never labels triage as review', async () => {
  const prompts = [];
  const result = await benchmarkRealArtifactCreation('simple', TIERS.simple, { generate: async prompt => {
    prompts.push(prompt); return sample(`generated-stage-${prompts.length}`);
  } });
  assert.equal(result.stages.length, 5);
  for (let i = 1; i < prompts.length; i++) assert.match(prompts[i], new RegExp(`generated-stage-${i}`));
  assert.equal(result.review.status, 'not_evaluated');
});

test('all-error and incomplete text pipelines fail at first unusable stage', async () => {
  let calls = 0;
  await assert.rejects(benchmarkRealArtifactCreation('simple', TIERS.simple, { generate: async () => {
    calls++; throw new Error('HTTP 500');
  } }), /HTTP 500/);
  assert.equal(calls, 1);
  await assert.rejects(benchmarkRealArtifactCreation('simple', TIERS.simple, { generate: async () => sample('') }), /incomplete/);
});

test('matrix labels correlated design and passes lookup results to generation', async () => {
  const prompts = [];
  const result = await runMatrix({ triage, code: 'export function createUtilityTools(config) { return config; }', generate: async prompt => {
    prompts.push(prompt); return sample('createUtilityTools test error');
  } });
  assert.equal(result.productE2E, false);
  assert.equal(result.cells, 12);
  assert.match(result.design, /not independently varied/);
  for (const row of result.results.filter(row => row.tier === 'middle')) {
    assert.ok(row.toolOutput.length);
    assert.ok(prompts.some(prompt => prompt.includes(JSON.stringify(row.toolOutput))));
    assert.equal(row.qualityReview, 'not_evaluated');
    assert.ok(!('qualityScore' in row));
  }
});

test('unavailable helper evaluation cannot verify matrix, batches or safety experiment', async () => {
  const unavailable = async () => ({ evaluated: false, passed: null });
  await assert.rejects(runMatrix({ triage: unavailable, generate: async () => sample('unused'), code: '' }), /not evaluated/);
  await assert.rejects(runBenchmark({ triage: unavailable }), /not evaluated/);
  await assert.rejects(runBenchmarks({ apiKey: 'dummy-key', triage, safety: unavailable }), /unevaluated/);
});

test('standalone live script exits nonzero when provider configuration is unavailable', () => {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  const result = spawnSync(process.execPath, [new URL('./benchmark-real-creation-times.mjs', import.meta.url).pathname], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /PASSED|completed successfully/);
  assert.match(result.stderr, /GEMINI_API_KEY/);
});
