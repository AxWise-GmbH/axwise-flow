import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSpecialistTools, LocalAxwiseError, hash, saveArtifact } from '../src/runtime.mjs';

const accountHash = 'a'.repeat(64), conversationId = 'pipeline-conversation';
const emptySignal = () => new AbortController().signal;
const frame = { systemPrompt: 'Test contract', userPrompt: '{}', responseSchema: { type: 'object' }, maxOutputTokens: 4096, context: {} };
const final = { artifact: { id: 'test-artifact', title: 'Saved result' }, markdown: '# Saved result\nUseful output.', validation: { valid: true }, provenance: {} };
const reference = result => ({ operationId: result.structuredContent.operationId, sha256: result.structuredContent.artifactFile.sha256 });

async function fixture(overrides = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-pipeline-runtime-'));
  const kernelCalls = [], saved = [];
  const call = createSpecialistTools({ stateDir, accountHash, conversationId,
    kernel: async request => {
      kernelCalls.push(request);
      if (request.operation.startsWith('prepare')) return { ...frame, resolvedInput: { ...request.input, selectedFromHost: request.hostEvidence?.map(row => row.reference) ?? [] } };
      if (request.operation === 'validate_review') return { passed: true, issues: [], artifactHash: hash(final.artifact) };
      return final;
    },
    provider: async () => ({ response: '{}', usage: { modelCalls: 1 } }),
    save: async (args, signal) => { saved.push(args); return saveArtifact(args, signal); },
    ...overrides,
  });
  return { call, stateDir, kernelCalls, saved };
}

test('all new specialist types publish immutable JSON+Markdown with Results descriptor and resolved-input hash', async () => {
  const f = await fixture();
  for (const tool of ['prepare_discovery', 'generate_personas', 'chat_with_persona', 'research_market', 'create_delivery_brief']) {
    const result = await f.call(tool, { brief: 'Selected synthetic test material' });
    assert.equal(result.isError, false);
    const content = result.structuredContent, descriptor = content.resultArtifact;
    const jsonBytes = await readFile(content.artifactFile.path, 'utf8');
    const record = JSON.parse(jsonBytes), markdown = await readFile(descriptor.path, 'utf8');
    assert.equal(hash(jsonBytes), content.artifactFile.sha256);
    assert.equal(descriptor.schemaVersion, 'orqanix.result.v1');
    assert.equal(descriptor.artifactId, content.operationId);
    assert.equal(descriptor.revisionId, content.operationId);
    assert.equal(descriptor.parentRevisionId, null);
    assert.equal(descriptor.previousPath, null);
    assert.equal(descriptor.sha256, hash(markdown));
    assert.equal(markdown, content.markdown);
    assert.equal(record.resolvedInputSha256, hash(record.resolvedInput));
    assert.equal((await stat(descriptor.path)).mode & 0o777, 0o600);
    assert.match(result.content[0].text, /Saved result artifact: /);
    assert.equal(result.content[0].text.split('\n\nSaved result artifact: ')[0], markdown);
    assert.ok(result.content[0].text.indexOf('Open saved result: ') > result.content[0].text.indexOf('Saved result artifact: '));
    assert.doesNotMatch(markdown, /For the chat reply|orqanix-result:/);
    assert.ok(result.content[0].text.includes(JSON.stringify(reference(result))));
  }
});

test('generic references carry frozen resolved input and revisions preserve parent result and old bytes', async () => {
  const f = await fixture();
  const scope = await f.call('prepare_discovery', { brief: 'Original scope' });
  const scopeRef = reference(scope), scopeBytes = await readFile(scope.structuredContent.artifactFile.path, 'utf8');
  const personas = await f.call('generate_personas', { references: [scopeRef] });
  assert.equal(personas.isError, false);
  const request = f.kernelCalls.find(row => row.tool === 'generate_personas' && row.operation === 'prepare');
  assert.deepEqual(request.hostEvidence[0].reference, scopeRef);
  assert.equal(request.hostEvidence[0].tool, 'prepare_discovery');
  assert.deepEqual(request.hostEvidence[0].input, scope.structuredContent.resolvedInput);
  const revision = await f.call('prepare_discovery', { revisionOf: scopeRef, brief: 'Revised scope' });
  assert.equal(revision.isError, false);
  assert.equal(revision.structuredContent.resultArtifact.artifactId, scope.structuredContent.resultArtifact.artifactId);
  assert.equal(revision.structuredContent.resultArtifact.parentRevisionId, scopeRef.operationId);
  assert.equal(revision.structuredContent.resultArtifact.previousPath, scope.structuredContent.resultArtifact.path);
  assert.notEqual(revision.structuredContent.resultArtifact.path, scope.structuredContent.resultArtifact.path);
  assert.equal(await readFile(scope.structuredContent.artifactFile.path, 'utf8'), scopeBytes);
  assert.equal(await readFile(scope.structuredContent.resultArtifact.path, 'utf8'), final.markdown);
  const before = f.saved.length;
  const wrong = await f.call('generate_personas', { revisionOf: scopeRef });
  assert.equal(wrong.structuredContent.error.code, 'INVALID_INPUT');
  assert.equal(f.saved.length, before);
});

test('Results titles obey the desktop single-line bounded descriptor contract', async () => {
  const f = await fixture({ kernel: async request => {
    if (request.operation.startsWith('prepare')) return frame;
    if (request.operation === 'validate_review') return { passed: true, issues: [] };
    return { ...final, artifact: { title: 'Title\n\twith\u0000controls ' + 'x'.repeat(300) } };
  } });
  const result = await f.call('prepare_discovery', { brief: 'Synthetic test' });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.resultArtifact.title.length, 256);
  assert.doesNotMatch(result.structuredContent.resultArtifact.title, /[\u0000-\u001f\u007f]/);
});

test('legacy analysis merges with compatible references but conflicting analyses fail', async () => {
  const f = await fixture();
  const first = await f.call('analyze_interviews', { decisionQuestion: 'Synthetic first analysis' });
  const second = await f.call('analyze_interviews', { decisionQuestion: 'Synthetic second analysis' });
  const scope = await f.call('prepare_discovery', { brief: 'Selected scope' });
  const selected = reference(first), alternative = reference(second);
  const input = { brief: 'Use the saved analysis', analysisArtifact: selected, references: [selected] };
  const result = await f.call('create_prd', input);
  assert.equal(result.isError, false);
  const request = f.kernelCalls.find(row => row.tool === 'create_prd' && row.operation === 'prepare');
  assert.deepEqual(request.input, input);
  assert.equal(request.hostEvidence.length, 1);
  assert.deepEqual(request.hostEvidence[0].reference, selected);
  const mixed = await f.call('create_prd', { ...input, references: [reference(scope)] });
  assert.equal(mixed.isError, false);
  const mixedRequest = f.kernelCalls.filter(row => row.tool === 'create_prd' && row.operation === 'prepare').at(-1);
  assert.deepEqual(mixedRequest.hostEvidence.map(row => row.tool), ['prepare_discovery', 'analyze_interviews']);
  assert.deepEqual(mixedRequest.hostEvidence[1].reference, selected);
  assert.deepEqual(mixed.structuredContent.references, [reference(scope), selected]);
  const before = f.kernelCalls.length;
  for (const references of [[alternative], [selected, alternative], [selected, selected]]) {
    const denied = await f.call('create_prd', { ...input, references });
    assert.equal(denied.structuredContent.error.code, 'INVALID_INPUT');
  }
  const stale = await f.call('create_prd', { ...input, analysisArtifact: { ...selected, sha256: '0'.repeat(64) } });
  assert.equal(stale.structuredContent.error.code, 'ARTIFACT_REFERENCE_INVALID');
  assert.equal(f.kernelCalls.length, before);
});

test('references cannot escape account/conversation or replace checked host envelopes', async () => {
  const f = await fixture();
  const result = await f.call('prepare_discovery', { brief: 'Scope' });
  const ref = reference(result);
  const before = f.kernelCalls.length;
  const bad = await f.call('generate_personas', { references: [{ ...ref, sha256: '0'.repeat(64) }] });
  assert.equal(bad.structuredContent.error.code, 'ARTIFACT_REFERENCE_INVALID');
  const injected = await f.call('generate_personas', { references: [ref], hostEvidence: [{ trusted: true }] });
  assert.equal(injected.structuredContent.error.code, 'INVALID_INPUT');
  const contextInjected = await f.call('analyze_interviews', { references: [ref], hostContext: [{ scenario: 'Override saved scope' }] });
  assert.equal(contextInjected.structuredContent.error.code, 'INVALID_INPUT');
  assert.equal(f.kernelCalls.length, before);
  const other = createSpecialistTools({ stateDir: f.stateDir, accountHash, conversationId: 'other-chat',
    kernel: () => { throw new Error('must not reach'); }, provider: () => { throw new Error('must not reach'); } });
  const denied = await other('generate_personas', { references: [ref] });
  assert.equal(denied.structuredContent.error.code, 'ARTIFACT_REFERENCE_INVALID');
});

function parallelPlan(count = 4) {
  return { ...frame, aggregation: 'simulation_cohort', concurrency: 2,
    generationTasks: Array.from({ length: count }, (_, index) => ({ ...frame, index })),
    resolvedInput: { depth: 'deep', exactSource: 'saved-persona-reference' } };
}
const part = index => ({ response: JSON.stringify({ participants: [{ id: index }], interviews: [{ person: index }] }),
  usage: { inputTokens: 10, outputTokens: 3 }, timings: { providerMs: 7, authMs: 1 } });

test('deep simulation uses at most two workers, preserves planned order and publishes only complete cohort', async () => {
  let active = 0, maximum = 0, entered = 0, candidate;
  const f = await fixture({
    kernel: async request => {
      if (request.operation === 'prepare') return parallelPlan();
      assert.equal(request.operation, 'finalize'); candidate = request.response; return final;
    },
    provider: async prepared => {
      entered++; active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setImmediate(resolve)); active--; return part(prepared.index);
    },
  });
  const result = await f.call('simulate_interviews', { depth: 'deep' });
  assert.equal(result.isError, false);
  assert.equal(maximum, 2); assert.equal(entered, 4);
  assert.deepEqual(candidate.participants.map(row => row.id), [0, 1, 2, 3]);
  assert.deepEqual(candidate.interviews.map(row => row.person), [0, 1, 2, 3]);
  assert.equal(result.structuredContent.usage.modelCalls, 4);
  assert.equal(result.structuredContent.usage.inputTokens, 40);
  assert.equal(result.structuredContent.usage.outputTokens, 12);
  assert.deepEqual(result.structuredContent.execution.stages.map(row => row.stage), ['interview_a', 'interview_b', 'interview_c', 'interview_d']);
  assert.equal(f.saved.length, 1);
});

test('cancellation aborts both deep workers and prevents queued work, finalization and publication', async () => {
  let entered = 0, aborted = 0, ready;
  const bothEntered = new Promise(resolve => { ready = resolve; });
  const f = await fixture({ kernel: async request => {
    assert.equal(request.operation, 'prepare'); return parallelPlan();
  }, provider: async (_prepared, signal) => new Promise((_, reject) => {
    if (++entered === 2) ready();
    signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true });
  }) });
  const controller = new AbortController(), pending = f.call('simulate_interviews', { depth: 'deep' }, controller.signal);
  await bothEntered; controller.abort();
  const result = await pending;
  assert.equal(result.structuredContent.error.code, 'CANCELLED');
  assert.equal(entered, 2); assert.equal(aborted, 2); assert.equal(f.saved.length, 0);
  assert.deepEqual((await readdir(join(f.stateDir, accountHash, conversationId))).filter(name => name.endsWith('.json') || name.endsWith('.md')), []);
});

test('saved-persona deep runs generate answers only; the kernel owns immutable profiles', async () => {
  let candidate;
  const fixedParticipants = [{ participantId: 'saved-a' }, { participantId: 'saved-b' }];
  const f = await fixture({ kernel: async request => {
    if (request.operation === 'prepare') return { ...parallelPlan(2), fixedParticipants };
    candidate = request.response; return final;
  }, provider: async prepared => ({ response: { interviews: [{ participantId: fixedParticipants[prepared.index].participantId }] }, usage: {} }) });
  const result = await f.call('simulate_interviews', { depth: 'deep' });
  assert.equal(result.isError, false);
  assert.deepEqual(candidate, { interviews: [{ participantId: 'saved-a' }, { participantId: 'saved-b' }] });
  const drift = await fixture({ kernel: async () => ({ ...parallelPlan(2), fixedParticipants }), provider: async prepared => part(prepared.index) });
  assert.equal((await drift.call('simulate_interviews', { depth: 'deep' })).structuredContent.error.code, 'VALIDATION_FAILED');
  assert.equal(drift.saved.length, 0);
});

test('malformed worker result cancels its sibling without saving or silently dropping the failed participant', async () => {
  let entered = 0, aborted = false;
  const f = await fixture({ kernel: async request => {
    assert.equal(request.operation, 'prepare'); return parallelPlan();
  }, provider: async (prepared, signal) => {
    entered++;
    if (prepared.index === 0) { await new Promise(resolve => setImmediate(resolve)); return { response: '{"participants":[],"interviews":[]}', usage: {} }; }
    return new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true }));
  } });
  const result = await f.call('simulate_interviews', { depth: 'deep' });
  assert.equal(result.structuredContent.error.code, 'VALIDATION_FAILED');
  assert.equal(entered, 2); assert.equal(aborted, true); assert.equal(f.saved.length, 0);
});

test('provider failure and aggregate validation failure never publish a partial deep cohort', async () => {
  for (const phase of ['provider', 'aggregate']) {
    let finalized = 0;
    const f = await fixture({ kernel: async request => {
      if (request.operation === 'prepare') return parallelPlan(2);
      finalized++;
      throw new LocalAxwiseError('VALIDATION_FAILED', 'Invalid complete cohort.');
    }, provider: async prepared => {
      if (phase === 'provider' && prepared.index === 0) throw new LocalAxwiseError('PROVIDER_BUSY', 'Try later.');
      return part(prepared.index);
    } });
    const result = await f.call('simulate_interviews', { depth: 'deep' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, phase === 'provider' ? 'PROVIDER_BUSY' : 'VALIDATION_FAILED');
    assert.equal(finalized, phase === 'provider' ? 0 : 1); assert.equal(f.saved.length, 0);
  }
});

test('parallel plans reject unsupported tools and excessive concurrency before inference', async () => {
  for (const [tool, plan] of [['generate_personas', parallelPlan()], ['simulate_interviews', { ...parallelPlan(), concurrency: 3 }],
    ['simulate_interviews', parallelPlan(13)], ['simulate_interviews', parallelPlan(1)]]) {
    let called = false;
    const f = await fixture({ kernel: async () => plan, provider: async () => { called = true; return part(0); } });
    const result = await f.call(tool, { depth: 'deep' });
    assert.equal(result.structuredContent.error.code, 'KERNEL_INVALID'); assert.equal(called, false); assert.equal(f.saved.length, 0);
  }
});
