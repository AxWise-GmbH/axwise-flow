import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSpecialistTools, LocalAxwiseError, saveArtifact, hash } from '../src/runtime.mjs';
import { resolveAnalysisReference } from '../src/state.mjs';

const accountHash = 'a'.repeat(64), conversationId = 'selected-conversation';
const signal = () => new AbortController().signal;
const prompt = { context: { workflow: 'staged_v1' } };
const artifact = { type: 'interview_analysis', findings: [{ id: 'f1', quote: 'Keep original words' }] };
const final = { artifact, markdown: '# Frozen analysis', validation: { valid: true }, provenance: { kernelVersion: 'test' } };
const passed = { passed: true, issues: [], artifactHash: hash(artifact) };
async function fixture({ reviews = [true], invalid = [], provider, ...overrides } = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-stages-'));
  const requests = [], saves = []; let generation = 0, reviewCount = 0, calls = 0;
  const call = createSpecialistTools({ stateDir, accountHash, conversationId,
    kernel: async (request) => {
      requests.push(request);
      if (request.operation.startsWith('prepare')) return prompt;
      if (request.operation === 'validate_review') {
        const ok = reviews[reviewCount++] ?? true;
        return { ...passed, passed: ok, issues: ok ? [] : ['MISSING_SYNTHESIS'] };
      }
      if (request.operation === 'finalize') {
        if (invalid.includes(generation++)) {
          const error = new LocalAxwiseError('VALIDATION_FAILED', 'Candidate failed local validation.');
          error.diagnostics = ['INVALID_SOURCE_QUOTE', 'PRIVATE_SELECTED_DOCUMENT'];
          throw error;
        }
        return final;
      }
      throw new Error('Unexpected operation');
    },
    provider: provider ?? (async () => {
      calls += 1;
      return { response: JSON.stringify({ result: calls }), usage: { inputTokens: 10, outputTokens: 4 }, timings: { authMs: 1, providerMs: 7 } };
    }),
    save: async (args, requestSignal) => { saves.push(args); return saveArtifact(args, requestSignal); },
    ...overrides,
  });
  return { call, requests, saves, stateDir, get providerCalls() { return calls; } };
}

test('successful staged analysis uses generation and review, freezes input, records totals and immutable snapshots', async () => {
  const f = await fixture();
  const input = { transcripts: [{ origin: 'synthetic_transcript', text: 'Keep original words' }] };
  const result = await f.call('analyze_interviews', input);
  assert.equal(result.isError, false);
  assert.equal(f.providerCalls, 2);
  assert.equal(result.structuredContent.execution.calls, 2);
  assert.equal(result.structuredContent.usage.inputTokens, 20);
  assert.equal(result.structuredContent.timings.inferenceMs, 14);
  assert.equal(result.structuredContent.timings.authMs, 2);
  assert.deepEqual(result.structuredContent.execution.stages.map((item) => item.stage), ['generation', 'review']);
  input.transcripts[0].origin = 'supplied_transcript';
  assert.equal(f.saves[0].record.selectedInput.transcripts[0].origin, 'synthetic_transcript');
  const reference = { operationId: result.structuredContent.operationId, sha256: result.structuredContent.artifactFile.sha256 };
  assert.ok(result.content[0].text.includes(JSON.stringify(reference)));
  const journal = join(f.stateDir, accountHash, conversationId, '.operations', reference.operationId);
  const files = await readdir(journal);
  assert.ok(files.some((file) => file.endsWith('selected_input.json')));
  assert.ok(files.some((file) => file.endsWith('publication_ready.json')));
  assert.equal((await stat(join(journal, files[0]))).mode & 0o777, 0o600);
  const first = JSON.parse(await readFile(join(journal, files[0]), 'utf8'));
  assert.equal(first.pipelineVersion, 'axwise.local-staged.v1');
  assert.equal(first.data.selectedInput.transcripts[0].origin, 'synthetic_transcript');
});

test('failed substantive review gets exactly one repair and final review', async () => {
  const f = await fixture({ reviews: [false, true] });
  const result = await f.call('create_prd', { brief: 'A specialist PRD' });
  assert.equal(result.isError, false);
  assert.equal(f.providerCalls, 4);
  assert.deepEqual(result.structuredContent.execution.stages.map((item) => item.stage), ['generation', 'review', 'repair', 'final_review']);
  const repair = f.requests.find((request) => request.operation === 'prepare_repair');
  assert.equal(repair.review.passed, false);
  assert.equal(repair.candidate, '{"result":1}');
  assert.equal(f.saves[0].record.candidate, '{"result":3}');
  const validations = f.requests.filter((request) => request.operation === 'finalize');
  assert.ok(validations.every((request) => request.usage.modelCalls === 1));
  assert.ok(validations.every((request) => request.usage.inputTokens === 10));
  assert.equal(result.structuredContent.usage.inputTokens, 40);
});

test('final failed quality review is terminal, never repaired again or published', async () => {
  const f = await fixture({ reviews: [false, false] });
  const result = await f.call('create_prd', { brief: 'A specialist PRD' });
  assert.equal(result.structuredContent.error.code, 'QUALITY_REVIEW_FAILED');
  assert.equal(f.providerCalls, 4);
  assert.equal(f.saves.length, 0);
  assert.equal(f.requests.filter((request) => request.operation === 'prepare_repair').length, 1);
});

test('deterministic invalid generation uses finite diagnostics, one repair then mandatory review', async () => {
  const f = await fixture({ invalid: [0] });
  const result = await f.call('create_prd', { brief: 'Draft' });
  assert.equal(result.isError, false);
  assert.equal(f.providerCalls, 3);
  const repair = f.requests.find((request) => request.operation === 'prepare_repair');
  assert.deepEqual(repair.diagnostics, ['INVALID_SOURCE_QUOTE']);
  assert.equal(repair.review, null);
  assert.equal(JSON.stringify(result).includes('PRIVATE_SELECTED_DOCUMENT'), false);
});

test('invalid repaired generation is terminal without an extra review or publication', async () => {
  const f = await fixture({ invalid: [0, 1] });
  const result = await f.call('create_prd', { brief: 'Draft' });
  assert.equal(result.structuredContent.error.code, 'VALIDATION_FAILED');
  assert.equal(f.providerCalls, 2);
  assert.equal(f.saves.length, 0);
});

test('simulation remains one bounded generation, never review or repair', async () => {
  for (const invalid of [[], [0]]) {
    const f = await fixture({ invalid });
    const result = await f.call('simulate_interviews', { brief: 'Synthetic scenario' });
    assert.equal(f.providerCalls, 1);
    assert.equal(result.isError, invalid.length > 0);
    assert.deepEqual(f.requests.map((request) => request.operation), ['prepare', 'finalize']);
  }
});

test('cancellation during review blocks all repair and publication', async () => {
  let started; const ready = new Promise((resolve) => { started = resolve; }); let count = 0;
  const f = await fixture({ provider: async (_prepared, requestSignal) => {
    if (++count === 1) return { response: '{}', usage: {} };
    started(); return new Promise((_resolve, reject) => requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true }));
  } });
  const controller = new AbortController(), pending = f.call('create_prd', { brief: 'Draft' }, controller.signal);
  await ready; controller.abort();
  const result = await pending;
  assert.equal(result.structuredContent.error.code, 'CANCELLED');
  assert.equal(count, 2); assert.equal(f.saves.length, 0);
  assert.equal(f.requests.some((request) => request.operation === 'prepare_repair'), false);
});

test('deadline bounds an uncooperative inference callback and no automatic retry', async () => {
  const f = await fixture({ timeoutMs: 40, provider: async () => new Promise(() => {}) });
  const timer = setTimeout(() => {}, 200);
  try {
    const result = await f.call('create_prd', { brief: 'Draft' });
    assert.equal(result.structuredContent.error.code, 'TIMEOUT');
    assert.equal(f.saves.length, 0);
  } finally { clearTimeout(timer); }
  assert.throws(() => createSpecialistTools({ stateDir: '/tmp/test', accountHash, conversationId, kernel() {}, provider() {}, timeoutMs: 180_001 }));
});

test('host evidence is never accepted directly from model tool arguments', async () => {
  const f = await fixture();
  const result = await f.call('create_prd', { brief: 'Draft', hostEvidence: { trusted: true } });
  assert.equal(result.structuredContent.error.code, 'INVALID_INPUT');
  assert.equal(f.requests.length, 0); assert.equal(f.providerCalls, 0);
});

test('PRD reference resolves frozen analysis only within the same account and conversation', async () => {
  const f = await fixture();
  const analysis = await f.call('analyze_interviews', { transcripts: [{ origin: 'synthetic_transcript', turns: ['original'] }] });
  const reference = { operationId: analysis.structuredContent.operationId, sha256: analysis.structuredContent.artifactFile.sha256 };
  const result = await f.call('create_prd', { brief: 'From frozen analysis', analysisArtifact: reference });
  assert.equal(result.isError, false);
  const request = f.requests.find((item) => item.tool === 'create_prd' && item.operation === 'prepare');
  assert.deepEqual(request.hostEvidence.reference, reference);
  assert.equal(request.hostEvidence.input.transcripts[0].origin, 'synthetic_transcript');
  assert.equal(request.hostEvidence.candidate, '{"result":1}');
  for (const mismatch of [{ accountHash: 'b'.repeat(64) }, { conversationId: 'other-conversation' }]) {
    await assert.rejects(resolveAnalysisReference({ stateDir: f.stateDir, accountHash, conversationId, ...mismatch }, reference, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  }
});

test('reference hash, UUID, scope metadata, version, kind, input hash and quality status fail closed', async () => {
  const f = await fixture();
  const analysis = await f.call('analyze_interviews', { transcripts: [] });
  const original = JSON.parse(await readFile(analysis.structuredContent.artifactFile.path, 'utf8'));
  const scope = { stateDir: f.stateDir, accountHash, conversationId };
  const originalRef = { operationId: original.operationId, sha256: analysis.structuredContent.artifactFile.sha256 };
  for (const reference of [{ ...originalRef, sha256: '0'.repeat(64) }, { ...originalRef, operationId: '../escape' }, { ...originalRef, path: '/tmp/file' }])
    await assert.rejects(resolveAnalysisReference(scope, reference, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  for (const change of [{ version: 'axwise.local-artifact.v1' }, { tool: 'create_prd' }, { accountHash: 'b'.repeat(64) },
    { conversationId: 'other' }, { inputSha256: 'bad' }, { artifactSha256: 'bad' }, { qualityReview: { passed: false } }]) {
    const operationId = randomUUID(), saved = await saveArtifact({ ...scope, operationId, record: { ...original, operationId, ...change } }, signal());
    await assert.rejects(resolveAnalysisReference(scope, { operationId, sha256: saved.sha256 }, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  }
});

test('reference final-file and conversation symlinks are rejected; oversized file is bounded', async () => {
  const f = await fixture();
  const analysis = await f.call('analyze_interviews', { transcripts: [] });
  const scope = { stateDir: f.stateDir, accountHash, conversationId };
  const operationId = randomUUID(), directory = join(f.stateDir, accountHash, conversationId);
  await symlink(analysis.structuredContent.artifactFile.path, join(directory, `${operationId}.json`));
  await assert.rejects(resolveAnalysisReference(scope, { operationId, sha256: analysis.structuredContent.artifactFile.sha256 }, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  await symlink(directory, join(f.stateDir, accountHash, 'linked-conversation'));
  await assert.rejects(resolveAnalysisReference({ ...scope, conversationId: 'linked-conversation' }, { operationId: analysis.structuredContent.operationId, sha256: analysis.structuredContent.artifactFile.sha256 }, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
  const huge = randomUUID();
  await writeFile(join(directory, `${huge}.json`), 'x'.repeat(1_048_577));
  await assert.rejects(resolveAnalysisReference(scope, { operationId: huge, sha256: 'a'.repeat(64) }, signal()), { code: 'ARTIFACT_REFERENCE_INVALID' });
});

test('provider errors remain finite and journal excludes arbitrary exception text and credentials', async () => {
  const f = await fixture({ provider: async () => { throw new Error('PRIVATE_SOURCE_AND_BEARER_TOKEN'); } });
  const result = await f.call('create_prd', { brief: 'Selected input' });
  assert.equal(result.structuredContent.error.code, 'SPECIALIST_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('PRIVATE_SOURCE_AND_BEARER_TOKEN'), false);
  const directory = join(f.stateDir, accountHash, conversationId, '.operations', result.structuredContent.operationId);
  for (const name of await readdir(directory)) assert.equal((await readFile(join(directory, name), 'utf8')).includes('PRIVATE_SOURCE_AND_BEARER_TOKEN'), false);
});
