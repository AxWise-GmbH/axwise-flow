import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CASE_IDS, parseOptions, loadFixtures, directRequest, runDirect, analysisReference,
  structuralChecks, runSpecialist, readSavedArtifact, reviewPacket } from './benchmark-axwise-quality.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fixtures = await loadFixtures();
const accountHash = 'a'.repeat(64);
const operationId = '11111111-1111-4111-8111-111111111111';
const artifactHash = 'b'.repeat(64);
const providerOptions = { apiUrl: 'https://api.example.test', accountHash, token: async () => 'secret-access-token' };

function response(content = '# Analysis and PRD\nSynthetic.', { finishReason = 'stop', usage = { prompt_tokens: 321, completion_tokens: 123 } } = {}) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }], usage }),
    { status: 200, headers: { 'content-type': 'application/json' } });
}

function resultPair(fixture = fixtures[0]) {
  const sources = fixture.analysis.transcripts;
  const catalogue = sources.map((source, index) => ({ id: source.id, documentId: `doc-${index}`, origin: source.origin,
    textSha256: hash(source.turns.map((turn) => `${turn.text}\n`).join('')) }));
  const quotes = sources.map((source, index) => ({ documentId: `doc-${index}`, quoteId: hash(`quote-${index}`),
    turnId: 't1', participantId: source.turns[0].speaker, text: source.turns[0].text, start: 0,
    end: Buffer.byteLength(source.turns[0].text), origin: 'synthetic_transcript' }));
  const findings = quotes.map((quote, index) => ({ findingId: hash(`finding-${index}`), basis: 'simulation_hypothesis',
    quoteIds: [quote.quoteId], questionIds: ['q1'], participantRefs: [{ documentId: quote.documentId, participantId: quote.participantId }] }));
  const analysis = { isError: false, structuredContent: { tool: 'analyze_interviews', status: 'completed', operationId,
    markdown: '# Synthetic interview analysis\nFixture result.', artifactFile: { path: '/test/analysis.json', sha256: artifactHash },
    artifact: { quotes, findings, gaps: [], coverageStatus: 'partial' }, provenance: { sourceCatalogue: catalogue },
    usage: { modelCalls: 2, inputTokens: 400, outputTokens: 300 }, timings: { inferenceMs: 500, authMs: 5 } } };
  const reference = { operationId, sha256: artifactHash };
  const prd = { isError: false, structuredContent: { tool: 'create_prd', status: 'completed', operationId: '22222222-2222-4222-8222-222222222222',
    markdown: '# Synthetic PRD\nFixture requirements.', artifactFile: { path: '/test/prd.json', sha256: 'c'.repeat(64) },
    artifact: { analysisArtifact: reference, sources: sources.map(({ id, origin }) => ({ id, origin })),
      sections: [{ heading: 'Prioritized requirements', items: findings.map((finding, index) => ({ text: 'Proposed measurable check',
        findingIds: [finding.findingId], sourceIds: [sources[index].id], basis: 'simulation_hypothesis' })) }] },
    usage: { modelCalls: 3, inputTokens: 600, outputTokens: 350 }, timings: { inferenceMs: 1000, authMs: 7 } } };
  return { analysis, prd, reference };
}

test('live calls are opt-in, packaged resources are explicit, repetitions and time are bounded', () => {
  assert.equal(parseOptions([]).live, false);
  assert.ok(parseOptions([]).timeoutMs >= 195_000);
  assert.throws(() => parseOptions(['--live']), /LIVE_REQUIRES_PACKAGED_RESOURCES/);
  assert.throws(() => parseOptions(['--resources', './local']), /ABSOLUTE_RESOURCES_REQUIRED/);
  assert.throws(() => parseOptions(['--repetitions', '3']));
  assert.throws(() => parseOptions(['--repetitions', '0']));
  assert.throws(() => parseOptions(['--timeout-seconds', '301']));
  assert.throws(() => parseOptions(['--case', '../../secret']));
  assert.throws(() => parseOptions(['--live', '--live']));
  assert.throws(() => parseOptions(['--unknown']));
  assert.throws(() => parseOptions(['--resources']));
  assert.deepEqual(parseOptions(['--live', '--resources', '/tmp/packaged/Resources', '--repetitions', '2', '--case', 'repair-handoffs']).cases, ['repair-handoffs']);
});

test('fixtures predeclare semantic expectations, original IDs and synthetic provenance', () => {
  assert.deepEqual(fixtures.map((fixture) => fixture.id), CASE_IDS);
  for (const fixture of fixtures) {
    assert.match(fixture.fixtureSha256, /^[a-f0-9]{64}$/);
    assert.equal(fixture.analysis.transcripts.length, 4);
    assert.equal(fixture.reviewCriteria.length, 10);
    assert.equal(new Set(fixture.reviewCriteria.map((criterion) => criterion.id)).size, 10);
    assert.ok(fixture.reviewCriteria.some(({ id }) => id === 'real-conflict'));
    assert.ok(fixture.reviewCriteria.some(({ id }) => id === 'testable-acceptance'));
    for (const source of fixture.analysis.transcripts) {
      assert.equal(source.origin, 'synthetic_transcript');
      assert.deepEqual(source.turns.map((turn) => turn.questionId), ['q1', 'q2', 'q3']);
    }
  }
});

test('direct baseline uses equivalent task data but never receives expected answers or specialist schema', () => {
  const request = directRequest(fixtures[0]);
  assert.equal(request.model, 'orqaly-gemini');
  assert.equal(request.reasoning_effort, 'low');
  assert.equal(request.max_completion_tokens, 16_384);
  assert.equal(request.response_format, undefined);
  assert.equal(request.tools, undefined);
  const text = request.messages[1].content;
  for (const transcript of fixtures[0].analysis.transcripts)
    for (const turn of transcript.turns) assert.ok(text.includes(turn.text));
  assert.ok(text.includes(fixtures[0].prdBrief));
  assert.ok(!text.includes(fixtures[0].reviewCriteria[0].expected));
});

test('direct request is one authenticated call, with usage retained and no credential logging', async () => {
  let calls = 0;
  const row = await runDirect(fixtures[0], { ...providerOptions, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.example.test/desktop/v1/chat/completions');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer secret-access-token');
    assert.equal(options.headers['X-Orqaly-Account-Hash'], accountHash);
    return response();
  } });
  assert.equal(calls, 1);
  assert.equal(row.status, 'completed');
  assert.equal(row.modelCalls, 1);
  assert.deepEqual(row.usage, { inputTokens: 321, outputTokens: 123 });
  assert.ok(row.timings.inferenceMs >= 0);
  assert.match(row.outputSha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(row).includes('secret-access-token'));
});

test('direct failures are recorded without retries, raw errors or captured OAuth stdout', async () => {
  let calls = 0;
  const row = await runDirect(fixtures[0], { ...providerOptions, fetchImpl: async () => {
    calls++; throw new Error('Failed with secret-access-token stdout');
  } });
  assert.equal(calls, 1);
  assert.equal(row.status, 'failed');
  assert.equal(row.errorCode, 'BENCHMARK_OPERATION_FAILED');
  assert.ok(!JSON.stringify(row).includes('secret-access-token'));
  const authFailure = await runDirect(fixtures[0], { ...providerOptions,
    token: async () => { throw new Error('token stdout: secret-access-token'); },
    fetchImpl: () => assert.fail('network should not be called after auth failure') });
  assert.equal(authFailure.modelCalls, 0);
  assert.ok(!JSON.stringify(authFailure).includes('secret-access-token'));
});

test('incomplete provider output is retained but never counted as a completed draft', async () => {
  const row = await runDirect(fixtures[0], { ...providerOptions,
    fetchImpl: async () => response('partial draft', { finishReason: 'length' }) });
  assert.equal(row.status, 'failed');
  assert.equal(row.errorCode, 'PROVIDER_INCOMPLETE_OUTPUT');
  assert.equal(row.markdown, 'partial draft');
  assert.equal(row.finishReason, 'length');
  assert.equal(row.usage.inputTokens, 321);
  const unavailable = await runDirect(fixtures[0], { ...providerOptions,
    fetchImpl: async () => new Response('internal detail', { status: 502 }) });
  assert.equal(unavailable.errorCode, 'PROVIDER_HTTP_502');
  assert.ok(!JSON.stringify(unavailable).includes('internal detail'));
});

test('immutable analysis reference accepts only a successful saved analysis', () => {
  const { analysis, reference } = resultPair();
  assert.deepEqual(analysisReference(analysis), reference);
  for (const modified of [
    { ...analysis, isError: true },
    { ...analysis, structuredContent: { ...analysis.structuredContent, tool: 'create_prd' } },
    { ...analysis, structuredContent: { ...analysis.structuredContent, operationId: '../other' } },
    { ...analysis, structuredContent: { ...analysis.structuredContent, artifactFile: { sha256: 'bad' } } },
  ]) assert.throws(() => analysisReference(modified), /ANALYSIS_ARTIFACT_REFERENCE_INVALID/);
});

test('structural checks verify spans, labels and links without pretending to assess meaning', () => {
  const { analysis, prd, reference } = resultPair();
  const checks = structuralChecks(fixtures[0], analysis, prd, reference);
  for (const [key, value] of Object.entries(checks)) {
    if (typeof value === 'boolean' && key !== 'semanticTruthChecked') assert.equal(value, true, key);
  }
  assert.equal(checks.semanticTruthChecked, false);
  assert.equal(checks.counts.quotedDocuments, 4);
  assert.equal(checks.counts.questionsWithFindingLinks, 1, 'one referenced question does not equal complete comprehension');
  assert.match(checks.coverageCaveat, /not insight/);
  analysis.structuredContent.artifact.quotes[0].text = 'invented';
  analysis.structuredContent.artifact.findings[0].basis = 'source_statement';
  prd.structuredContent.artifact.sections[0].items[0].findingIds = ['d'.repeat(64)];
  prd.structuredContent.artifact.analysisArtifact = { ...reference, sha256: 'e'.repeat(64) };
  const broken = structuralChecks(fixtures[0], analysis, prd, reference);
  assert.equal(broken.exactQuoteSpansAndIdentities, false);
  assert.equal(broken.syntheticFindingLabels, false);
  assert.equal(broken.prdFindingLinksExist, false);
  assert.equal(broken.immutableAnalysisReference, false);
});

test('packaged MCP path chains hash/operation only, never retypes analysis sources', async () => {
  const pair = resultPair(), calls = [];
  const client = { request: async (method, params, timeout) => {
    calls.push({ method, params, timeout });
    return params.name === 'analyze_interviews' ? pair.analysis : pair.prd;
  } };
  const row = await runSpecialist(fixtures[0], { client, stateDir: '/test', readArtifact: async (content) => ({ record: content }) });
  assert.equal(row.status, 'completed');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params.arguments, fixtures[0].analysis);
  assert.deepEqual(calls[1].params.arguments, { brief: fixtures[0].prdBrief, artifactType: 'product_prd', analysisArtifact: pair.reference });
  assert.ok(calls.every((call) => call.timeout >= 195_000));
  assert.equal(calls[1].params.arguments.sources, undefined);
  assert.equal(row.savedArtifacts.length, 2);
  assert.deepEqual(row.usage, { modelCalls: 5, inputTokens: 1000, outputTokens: 650 });
  assert.equal(row.timings.inferenceMs, 1500);
  assert.equal(row.timings.authMs, 12);
});

test('failed analysis stops the dependent PRD and preserves failure details', async () => {
  let calls = 0;
  const row = await runSpecialist(fixtures[0], { stateDir: '/test', client: { request: async () => {
    calls++;
    return { isError: true, structuredContent: { status: 'failed', error: { code: 'VALIDATION_FAILED' }, timings: { inferenceMs: 22 } } };
  } } });
  assert.equal(calls, 1);
  assert.equal(row.status, 'failed');
  assert.equal(row.errorCode, 'VALIDATION_FAILED');
  assert.equal(row.stages.length, 1);
  assert.equal(row.stages[0].result.isError, true);
  assert.equal(row.timings.inferenceMs, 22);
  assert.equal(row.deterministicChecks.analysisCompleted, false);
});

test('a failed PRD keeps the successful analysis and does not trigger a harness retry', async () => {
  const pair = resultPair(); let calls = 0;
  const row = await runSpecialist(fixtures[0], { stateDir: '/test', readArtifact: async (content) => ({ record: content }),
    client: { request: async () => {
      calls++;
      return calls === 1 ? pair.analysis : { isError: true, structuredContent: { status: 'failed', error: { code: 'TIMEOUT' } } };
    } } });
  assert.equal(calls, 2);
  assert.equal(row.status, 'failed');
  assert.equal(row.errorCode, 'TIMEOUT');
  assert.match(row.markdown, /Synthetic interview analysis/);
  assert.equal(row.savedArtifacts.length, 1);
});

test('saved artifact verification rejects mutation, scope escape and symlink escape', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-quality-artifact-test-'));
  const outside = await mkdtemp(join(tmpdir(), 'axwise-quality-other-test-'));
  const file = join(stateDir, 'analysis.json'), record = { operationId, tool: 'analyze_interviews' };
  const bytes = JSON.stringify(record);
  await writeFile(file, bytes, { mode: 0o600 });
  const content = { ...record, artifactFile: { path: file, sha256: hash(bytes) } };
  assert.equal((await readSavedArtifact(content, stateDir)).record.operationId, operationId);
  await writeFile(file, bytes + ' ', { mode: 0o600 });
  await assert.rejects(readSavedArtifact(content, stateDir), /ARTIFACT_HASH_MISMATCH/);
  const outsideFile = join(outside, 'other.json');
  await writeFile(outsideFile, bytes, { mode: 0o600 });
  await assert.rejects(readSavedArtifact({ ...content, artifactFile: { ...content.artifactFile, path: outsideFile } }, stateDir), /ARTIFACT_OUTSIDE_RUN/);
  const link = join(stateDir, 'link.json');
  await symlink(outsideFile, link);
  await assert.rejects(readSavedArtifact({ ...content, artifactFile: { ...content.artifactFile, path: link } }, stateDir), /ARTIFACT_OUTSIDE_RUN/);
});

test('blinded assessment has seeded labels, no latency or arm field, and blank semantic scores', () => {
  const rows = ['direct-draft', 'axwise-specialist'].map((arm, index) => ({ caseId: fixtures[0].id, repetition: 1, arm,
    status: 'completed', markdown: `Output number ${index}.`, outputSha256: hash(`output-${index}`), timings: { totalMs: 912345 } }));
  const seed = 'f'.repeat(64);
  const packet = reviewPacket([fixtures[0]], rows, seed);
  assert.deepEqual(packet, reviewPacket([fixtures[0]], rows, seed));
  assert.equal(packet.key.mappings.length, 2);
  assert.deepEqual(new Set(packet.key.mappings.map((row) => row.arm)), new Set(['direct-draft', 'axwise-specialist']));
  assert.ok(!packet.markdown.includes('direct-draft'));
  assert.ok(!packet.markdown.includes('axwise-specialist'));
  assert.ok(!packet.markdown.includes('912345'));
  assert.match(packet.markdown, /best-effort/);
  assert.equal(packet.rubric.completed, false);
  assert.equal(packet.rubric.candidates.length, 2);
  assert.ok(packet.rubric.candidates.every((candidate) => candidate.criteria.every((criterion) => criterion.score === null)));
  assert.throws(() => reviewPacket(fixtures, rows, 'not-a-seed'), /BLINDING_SEED_INVALID/);
  const partial = reviewPacket([fixtures[0]], [{ ...rows[0], status: 'failed', markdown: '' }], seed);
  assert.match(partial.markdown, /did not complete/);
  assert.match(partial.markdown, /No output produced/);
});
