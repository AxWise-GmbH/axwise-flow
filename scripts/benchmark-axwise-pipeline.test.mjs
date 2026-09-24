import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseOptions, runPipeline, readSavedResult, TOOL_NAMES, FIXTURE, VIEWS } from './benchmark-axwise-pipeline.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const reference = content => ({ operationId: content.operationId, sha256: content.artifactFile.sha256 });

/** Deliberately synthetic protocol double: no provider, quality or latency claims. */
async function stubClient({ failTool, mutate, throwTool, alterArtifact } = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-pipeline-test-'));
  const responses = [], calls = [], byTool = new Map(), byReference = new Map();
  const client = {
    async request(method, { name, arguments: input }) {
      assert.equal(method, 'tools/call'); calls.push({ name, input: copy(input) });
      if (throwTool === name) throw new Error('Bearer secret-do-not-log');
      if (failTool === name) return { isError: true, structuredContent: { status: 'failed', error: { code: 'VALIDATION_FAILED' } } };
      const previous = input.revisionOf ? byReference.get(input.revisionOf.operationId) : null;
      const take = tool => byTool.get(tool).artifact;
      let artifact, resolvedInput;
      if (name === 'prepare_discovery') artifact = {
        id: 'scope-fixture', sources: [{ ...FIXTURE.source }],
        stakeholders: [{ id: 'coordinator', label: 'Coordinator', description: 'Fictional shop coordinator',
          questions: [{ id: 'question-handoff', text: 'How are repairs handed off?', uncertaintyId: 'uncertainty-handoff', stakeholderId: 'coordinator' },
            { id: 'question-adoption', text: 'What would block adoption?', uncertaintyId: 'uncertainty-adoption', stakeholderId: 'coordinator' }] }],
      };
      else if (name === 'generate_personas') artifact = {
        id: 'cohort-fixture', scopeReference: input.references[0], scopeId: take('prepare_discovery').id,
        sources: [{ ...FIXTURE.source }], personas: [{ id: 'synthetic-coordinator', stakeholderId: 'coordinator', origin: 'synthetic', label: 'Synthetic coordinator' }],
        questionPlan: take('prepare_discovery').stakeholders.map(row => ({ stakeholderId: row.id, questions: row.questions })),
      };
      else if (name === 'simulate_interviews') {
        const questions = take('generate_personas').questionPlan[0].questions;
        const text = 'Hypothetical handoff concern.\nHypothetical adoption concern.\n';
        artifact = { selectedPersonas: take('generate_personas').personas,
          request: { stakeholders: [{ questions: questions.map(q => ({ questionId: q.id, text: q.text })) }] },
          cohort: { complete: true }, corpus: { documents: [{ documentId: 'synthetic-document', origin: 'synthetic_transcript', text,
            turns: [{ participantId: 'synthetic-participant', questionId: questions[0].id, start: 0, end: 28 },
              { participantId: 'synthetic-participant', questionId: questions[1].id, start: 29, end: 58 }] }] } };
      } else if (name === 'analyze_interviews') {
        const docs = take('simulate_interviews').corpus.documents;
        artifact = { findings: [{ findingId: 'f'.repeat(64), basis: 'simulation_hypothesis' }], views: VIEWS.map(kind => ({ kind, status: 'hypothesis' })) };
        resolvedInput = { ...input, transcripts: docs.map(doc => ({ id: doc.documentId, origin: doc.origin,
          turns: doc.turns.map(turn => ({ speaker: turn.participantId, questionId: turn.questionId, text: Buffer.from(doc.text).subarray(turn.start, turn.end).toString('utf8') })) })) };
      } else if (name === 'research_market') artifact = { sources: [{ ...FIXTURE.source }], findings: [],
        gaps: [{ questionId: 'q-market', reason: 'No real evidence supplied.' }], searchRequests: [{ query: 'Proposed search only; not executed.' }] };
      else if (name === 'create_prd') artifact = { analysisArtifact: input.references[0], sections: [{ heading: 'Prioritized requirements',
        items: [{ text: 'Hypothetical requirement', findingIds: ['f'.repeat(64)] }] }] };
      else if (name === 'create_delivery_brief') artifact = { prdReference: input.references[0], executionAuthorized: false, commercialTerms: 'not_set' };
      else if (name === 'chat_with_persona') {
        const first = byTool.get('generate_personas');
        artifact = { personaReference: previous?.artifact.personaReference ?? reference(first),
          previousConversationReference: previous ? reference(previous) : null,
          persona: first.artifact.personas[0], personaId: input.personaId, origin: 'synthetic',
          turns: [...(previous?.artifact.turns || []), { role: 'user', text: input.message, origin: 'user_message' },
            { role: 'persona', text: 'This is a protocol-test answer, not model output.', origin: 'synthetic' }] };
      } else throw new Error('UNKNOWN_TEST_TOOL');
      if (alterArtifact) alterArtifact({ name, input, artifact });
      const operationId = `00000000-0000-4000-8000-${String(responses.length + 1).padStart(12, '0')}`;
      const markdown = '# Protocol test double\nNo model quality or performance claim.\n';
      const createdAt = '2026-09-23T00:00:00.000Z';
      const descriptor = { schemaVersion: 'orqanix.result.v1', artifactId: previous?.resultArtifact.artifactId ?? operationId,
        revisionId: operationId, parentRevisionId: previous?.operationId ?? null,
        title: 'Protocol test double', mimeType: 'text/markdown', path: join(stateDir, `${operationId}.md`),
        sha256: hash(markdown), createdAt, previousPath: previous?.resultArtifact.path ?? null };
      const record = { operationId, tool: name, selectedInput: copy(input), inputSha256: hash(JSON.stringify(input)), artifact, resolvedInput,
        artifactSha256: hash(JSON.stringify(artifact)), markdown, createdAt, resultArtifact: descriptor,
        references: [...(input.references || []), ...(input.revisionOf ? [input.revisionOf] : [])],
        validation: { valid: true }, provenance: { testDoubleOnly: true }, execution: { stages: [] } };
      await writeFile(descriptor.path, markdown, { mode: 0o600 });
      const bytes = JSON.stringify(record);
      const path = join(stateDir, `${operationId}.json`);
      await writeFile(path, bytes, { mode: 0o600 });
      const content = { ...record, status: 'completed', artifactFile: { path, sha256: hash(bytes) } };
      byTool.set(name, content); byReference.set(operationId, content);
      const response = { isError: false, structuredContent: content, content: [{ type: 'text', text: `Saved result artifact: ${JSON.stringify(descriptor)}` }] };
      if (mutate) await mutate({ name, input, content, response });
      responses.push(response); return response;
    },
  };
  return { client, stateDir, responses, calls };
}

test('live is explicit and resources, repetitions, timeout and flags are bounded', () => {
  assert.equal(parseOptions([]).live, false);
  assert.throws(() => parseOptions(['--live']), /LIVE_REQUIRES/);
  assert.throws(() => parseOptions(['--resources', 'relative']), /ABSOLUTE/);
  assert.throws(() => parseOptions(['--repetitions', '3']), /ONE_OR_TWO/);
  assert.throws(() => parseOptions(['--timeout-seconds', '301']), /TIMEOUT/);
  assert.throws(() => parseOptions(['--live', '--live']), /DUPLICATE/);
  assert.throws(() => parseOptions(['--fixture', '/private/document']), /UNKNOWN/);
  assert.equal(parseOptions(['--live', '--resources', '/tmp/Resources', '--repetitions', '2']).repetitions, 2);
});

test('nine explicit calls cover eight tools with saved immutable lineage and two chat revisions', async () => {
  const stub = await stubClient();
  const report = await runPipeline(stub);
  assert.equal(report.status, 'completed', JSON.stringify(report.stages.map(row => [row.id, row.errorCode])));
  assert.equal(stub.calls.length, 9);
  assert.deepEqual(new Set(stub.calls.map(row => row.name)), new Set(TOOL_NAMES));
  assert.match(report.assessment, /Not semantic quality, natural routing/);
  assert.ok(report.stages.every(row => row.saved.json.sha256.length === 64 && row.saved.markdown.sha256.length === 64));
  assert.equal(report.stages.at(-1).saved.markdown.descriptor.parentRevisionId, report.stages.at(-2).reference.operationId);
  assert.equal(report.stages.at(-1).saved.markdown.descriptor.artifactId, report.stages.at(-2).saved.markdown.descriptor.artifactId);
  assert.ok(stub.calls.filter(row => !['prepare_discovery'].includes(row.name)).every(row => row.input.references?.length || row.input.revisionOf));
  assert.equal(stub.calls.find(row => row.name === 'analyze_interviews').input.transcripts, undefined);
  assert.equal(stub.calls.find(row => row.name === 'chat_with_persona').input.history, undefined);
});

test('failed dependency is retained, descendants skipped, independent market/chat branches still execute', async () => {
  const stub = await stubClient({ failTool: 'simulate_interviews' });
  const report = await runPipeline(stub);
  const stages = Object.fromEntries(report.stages.map(row => [row.id, row]));
  assert.equal(report.status, 'incomplete');
  assert.equal(stages.simulation.status, 'failed');
  assert.equal(stages.simulation.errorCode, 'VALIDATION_FAILED');
  for (const name of ['analysis', 'prd', 'delivery']) assert.equal(stages[name].status, 'skipped');
  for (const name of ['market', 'persona_chat', 'persona_chat_revision']) assert.equal(stages[name].status, 'completed');
  assert.equal(stub.calls.filter(row => row.name === 'simulate_interviews').length, 1);
});

test('scope budget mismatch fails instead of pruning model output or faking a narrower plan', async () => {
  const stub = await stubClient({ alterArtifact: ({ name, artifact }) => {
    if (name === 'prepare_discovery') artifact.stakeholders.push(copy(artifact.stakeholders[0]));
  } });
  const report = await runPipeline(stub);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.stages[0].status, 'failed');
  assert.equal(report.stages[0].errorCode, 'FIXTURE_SCOPE_BUDGET_NOT_PRESERVED');
  assert.equal(stub.calls.length, 1);
});

test('validly saved but incorrect semantic IDs, origins and fabricated evidence are rejected structurally', async () => {
  for (const [tool, error, change] of [
    ['simulate_interviews', 'SIMULATION_QUESTION_IDS_CHANGED', artifact => { artifact.request.stakeholders[0].questions[0].questionId = 'invented'; }],
    ['analyze_interviews', 'ANALYSIS_SYNTHETIC_ORIGIN_LOST', artifact => { artifact.findings[0].basis = 'source_statement'; }],
    ['research_market', 'MARKET_UNSUPPORTED_FACT', artifact => { artifact.findings.push({ sourceId: FIXTURE.source.id, quote: 'Real customers love this product.' }); }],
    ['chat_with_persona', 'CHAT_PERSONA_LINEAGE_INVALID', artifact => { artifact.personaReference = { operationId: 'wrong', sha256: 'b'.repeat(64) }; }],
  ]) {
    const stub = await stubClient({ alterArtifact: ({ name, artifact }) => { if (name === tool) change(artifact); } });
    const report = await runPipeline(stub);
    const row = report.stages.find(stage => stage.tool === tool);
    assert.equal(row.status, 'failed'); assert.equal(row.errorCode, error);
  }
});

test('modified Markdown bytes and hidden Results descriptor are failures', async () => {
  for (const sabotage of ['bytes', 'descriptor']) {
    const stub = await stubClient({ mutate: async ({ name, content, response }) => {
      if (name !== 'prepare_discovery') return;
      if (sabotage === 'bytes') await writeFile(content.resultArtifact.path, 'tampered');
      else response.content = [{ type: 'text', text: 'Result saved, but no machine-readable descriptor.' }];
    } });
    const report = await runPipeline(stub);
    assert.equal(report.stages[0].status, 'failed');
    assert.equal(report.stages[0].errorCode, sabotage === 'bytes' ? 'RESULT_HASH_MISMATCH' : 'RESULT_DESCRIPTOR_NOT_EXPOSED_TO_GOOSE');
  }
});

test('exceptions do not leak credentials and do not trigger retries', async () => {
  const stub = await stubClient({ throwTool: 'prepare_discovery' });
  const report = await runPipeline(stub);
  assert.equal(stub.calls.length, 1);
  assert.equal(report.stages[0].errorCode, 'PIPELINE_STAGE_FAILED');
  assert.ok(!JSON.stringify(report).includes('secret-do-not-log'));
});

test('result reader rejects symlink and escaping result path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axwise-result-read-test-'));
  const outside = await mkdtemp(join(tmpdir(), 'axwise-result-outside-test-'));
  const operationId = '00000000-0000-4000-8000-000000000001';
  const path = join(root, `${operationId}.md`);
  const markdown = 'test';
  const outsidePath = join(outside, 'outside.md'); await writeFile(outsidePath, markdown);
  await symlink(outsidePath, path);
  const descriptor = { schemaVersion: 'orqanix.result.v1', mimeType: 'text/markdown', revisionId: operationId,
    artifactId: operationId, createdAt: 'test-date', path, sha256: hash(markdown) };
  const content = { operationId, resultArtifact: descriptor };
  const saved = { path: join(root, `${operationId}.json`), record: { createdAt: 'test-date', resultArtifact: descriptor, markdown } };
  await assert.rejects(readSavedResult(content, root, saved), /RESULT_NOT_REGULAR_FILE/);
  descriptor.path = outsidePath;
  await assert.rejects(readSavedResult(content, root, saved), /RESULT_PATH_INVALID/);
});
