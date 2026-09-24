import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CASES, PUBLISHER_SOURCES, parseOptions, cacheMeasurement, stagePlans, runCase, verifiedResume, main } from './benchmark-axwise-expanded.mjs';
import { VIEWS } from './benchmark-axwise-pipeline.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const canonicalHash = value => hash(JSON.stringify(stable(value)));
const ref = row => ({ operationId: row.operationId, sha256: row.artifactFile.sha256 });
const copy = value => structuredClone(value);

/** Protocol double; deliberately no model, network, or quality-performance claim. */
function stub(fixture, { failStage, mutate, usage = null, throwStage } = {}) {
  const calls = [], byId = new Map(), saved = new Map();
  const plans = stagePlans(fixture, new Map());
  const from = id => byId.get(id).artifact;
  const client = { async request(method, { name, arguments: input }) {
    assert.equal(method, 'tools/call');
    const id = name === 'create_prd' && input.revisionOf ? 'prd_revision' : plans.find(row => row.tool === name).id;
    calls.push({ id, name, input: copy(input) });
    if (id === throwStage) throw new Error('Bearer secret-do-not-log');
    if (id === failStage) return { isError: true, structuredContent: { status: 'failed', error: { code: 'PROVIDER_HTTP_503' } } };
    let artifact, resolvedInput, provenance;
    if (id === 'scope') artifact = { id: 'scope-1', sources: copy(input.sources), stakeholders: fixture.roles.map(role => ({
      id: role, label: role, description: `Fixture ${role}`, questions: [1, 2].map(n => ({ id: `${role}-q${n}`, text: `Question ${n}`, uncertaintyId: `${role}-u${n}` })),
    })) };
    else if (id === 'personas') artifact = { scopeReference: input.references[0], personas: from('scope').stakeholders.flatMap(role =>
      Array.from({ length: fixture.participantsPerRole }, (_, index) => ({ id: `${role.id}-${index}`, stakeholderId: role.id, origin: 'synthetic' }))),
      questionPlan: from('scope').stakeholders.map(role => ({ stakeholderId: role.id, questions: role.questions })) };
    else if (id === 'simulation') artifact = { selectedPersonas: from('personas').personas, cohort: { complete: true }, corpus: {
      documents: from('personas').personas.map(persona => ({ documentId: `${persona.id}-doc`, origin: 'synthetic_transcript', text: 'One.\nTwo.\n',
        participants: [{ participantId: 'interviewer', role: 'interviewer' }, { participantId: persona.id, role: 'participant' }],
        turns: from('personas').questionPlan.find(role => role.stakeholderId === persona.stakeholderId).questions.flatMap((q, index) => [
          { questionId: q.id, participantId: 'interviewer', start: index * 5, end: index * 5 + 4 },
          { questionId: q.id, participantId: persona.id, start: index * 5, end: index * 5 + 4 },
        ]) })) } };
    else if (id === 'analysis') {
      const docs = from('simulation').corpus.documents;
      resolvedInput = { ...input, transcripts: docs.map(doc => ({ id: doc.documentId, origin: doc.origin,
        turns: doc.turns.map(turn => ({ speaker: turn.participantId, role: doc.participants.find(p => p.participantId === turn.participantId).role,
          questionId: turn.questionId, text: Buffer.from(doc.text).subarray(turn.start, turn.end).toString('utf8') })) })) };
      provenance = { sourceCatalogue: resolvedInput.transcripts.map(row => ({ id: row.id, documentId: `normalized-${row.id}`,
        textSha256: hash(row.turns.map(turn => `${turn.text}\n`).join('')), origin: row.origin })) };
      artifact = { quotes: docs.map((doc, index) => ({ documentId: `normalized-${doc.documentId}`, origin: doc.origin, text: 'One.', start: 5, end: 9,
        turnId: 't2', participantId: doc.participants[1].participantId, sourceTextSha256: provenance.sourceCatalogue[index].textSha256 })),
        findings: [{ basis: 'simulation_hypothesis', findingId: 'finding-1' }], views: VIEWS.map(kind => ({ kind })) };
    }
    else if (id === 'market') artifact = { sources: [copy(fixture.source)], gaps: [{ reason: 'No adoption evidence' }], findings: [{
      sourceId: fixture.source.id, quote: fixture.source.text, origin: 'web_source', url: fixture.source.url,
      retrievedAt: fixture.source.retrievedAt, start: 0, end: Buffer.byteLength(fixture.source.text) }] };
    else if (id === 'prd') {
      const item = { text: 'Retain a five-second update target.', basis: 'owner_decision', sourceIds: [], findingIds: [], acceptanceCriteria: ['Update within five seconds.'] };
      artifact = { title: 'Fixture PRD', analysisArtifact: input.analysisArtifact, sections: [{ heading: 'Requirements', items: [item] }],
        itemCatalogue: [{ id: 'prd-stable-1', heading: 'Requirements', index: 0, itemHash: canonicalHash(item) }] };
    } else if (id === 'delivery') artifact = { prdReference: input.references[0], executionAuthorized: false, commercialTerms: 'not_set' };
    else if (id === 'persona_chat') artifact = { persona: from('personas').personas[0], personaReference: ref(byId.get('personas')),
      selectedDocument: { reference: ref(byId.get('prd')), tool: 'create_prd', content: copy(from('prd')), artifactHash: canonicalHash(from('prd')) },
      turns: [{ role: 'user', documentReference: input.documentReference }, { role: 'persona', documentReference: input.documentReference }] };
    else if (id === 'prd_revision') {
      artifact = copy(from('prd'));
      const item = { text: fixture.addition, basis: 'owner_decision', sourceIds: [], findingIds: [] };
      artifact.sections[0].items.push(item);
      artifact.itemCatalogue.push({ id: 'prd-added-2', heading: 'Requirements', index: 1, itemHash: canonicalHash(item) });
      artifact.revisionPreservation = { policy: 'bounded_item_patch_v1', parent: input.revisionOf, retainedItemIds: ['prd-stable-1'],
        changedItemIds: [], removedItemIds: [], addedItemIds: ['prd-added-2'] };
    }
    mutate?.({ id, artifact, input });
    const operationId = `00000000-0000-4000-8000-${String(calls.length).padStart(12, '0')}`;
    const parent = input.revisionOf ? byId.get('prd') : null;
    const record = { operationId, tool: name, selectedInput: copy(input), inputSha256: hash(JSON.stringify(input)), artifact,
      ...(resolvedInput ? { resolvedInput, provenance } : {}),
      artifactSha256: hash(JSON.stringify(artifact)), validation: { valid: true }, usage,
      references: [...(input.references || []), ...(input.analysisArtifact ? [input.analysisArtifact] : []), ...(input.revisionOf ? [input.revisionOf] : [])],
      execution: { stages: [{ stage: 'generation', ...usage }] },
      resultArtifact: { revisionId: operationId, parentRevisionId: parent?.operationId ?? null, artifactId: parent?.resultArtifact.artifactId ?? operationId } };
    const bytes = JSON.stringify(record);
    const content = { ...record, status: 'completed', artifactFile: { path: `/stub/${operationId}.json`, sha256: hash(bytes) } };
    saved.set(operationId, { path: content.artifactFile.path, sha256: content.artifactFile.sha256, byteLength: bytes.length, record });
    byId.set(id, content);
    return { isError: false, structuredContent: content };
  } };
  return { fixture, client, stateDir: '/stub', calls, byId,
    readArtifact: async content => saved.get(content.operationId), readResult: async content => ({ descriptor: content.resultArtifact }) };
}

test('explicit opt-in, fixed fixture choices, bounded timeout, no unbounded repetition', () => {
  assert.equal(parseOptions([]).live, false);
  assert.throws(() => parseOptions(['--live']), /LIVE_REQUIRES/);
  assert.throws(() => parseOptions(['--resources', 'relative']), /ABSOLUTE/);
  assert.throws(() => parseOptions(['--case', 'private-data']), /UNKNOWN_CASE/);
  assert.throws(() => parseOptions(['--timeout-seconds', '301']), /TIMEOUT/);
  assert.throws(() => parseOptions(['--repetitions', '200']), /UNKNOWN_OPTION/);
  assert.throws(() => parseOptions(['--live', '--live']), /DUPLICATE/);
  assert.throws(() => parseOptions(['--seed', 'arbitrary']), /SEED/);
  assert.throws(() => parseOptions(['--resume', '/tmp/prior.json']), /ONE_CASE/);
  assert.deepEqual(parseOptions(['--case', CASES[0].id]).caseIds, [CASES[0].id]);
});

test('publisher evidence is exact bounded excerpt with origin, retrieval time and primary URL', () => {
  for (const source of PUBLISHER_SOURCES) {
    assert.ok(source.text.split(/\s+/).length <= 25);
    assert.equal(source.origin, 'web_source'); assert.ok(Date.parse(source.retrievedAt));
    assert.equal(source.publishedAt, null); assert.ok(new URL(source.url).hostname.startsWith('support.'));
  }
});

test('default dry run performs no writes, auth or inference and caps calls at eighteen', async () => {
  const old = process.stdout.write; process.stdout.write = () => true;
  try {
    const plan = await main(['--seed', '0000000000000001']);
    assert.equal(plan.live, false); assert.equal(plan.maximumToolCalls, 18);
    assert.deepEqual(new Set(plan.fixtures.map(row => row.depth)), new Set(['standard', 'deep']));
    assert.deepEqual(new Set(plan.fixtures.map(row => row.participants)), new Set([2, 4]));
    assert.ok(plan.fixtures.every(row => row.selectedPublisher.textSha256.length === 64));
  } finally { process.stdout.write = old; }
});

test('cache zeros are reported only when supplied, missing cache remains null', () => {
  assert.deepEqual([cacheMeasurement(null).readTokens, cacheMeasurement({ inputTokens: 4 }).writeTokens], [null, null]);
  assert.equal(cacheMeasurement({ cacheReadTokens: 0 }).readTokens, 0);
  assert.equal(cacheMeasurement({ cacheReadTokens: 24 }).readTokens, 24);
  assert.equal(cacheMeasurement({ cacheReadTokens: -1 }).readTokens, null);
  assert.equal(cacheMeasurement({ cacheReadTokens: '40' }).readTokens, null);
});

test('both cohorts execute exactly nine calls with mixed references, selected PRD and immutable additive revision', async () => {
  for (const fixture of CASES) {
    const mock = stub(fixture), journal = [];
    const report = await runCase({ ...mock, onStage: async row => journal.push(copy(row)) });
    assert.equal(report.status, 'completed', JSON.stringify(report.stages.map(row => [row.id, row.errorCode])));
    assert.equal(mock.calls.length, 9); assert.equal(journal.length, 9);
    assert.ok(mock.calls.every(row => row.input.depth === fixture.depth));
    assert.ok(report.stages.every(row => row.harnessAttempts === 1 && row.cache.readTokens === null && row.cache.writeTokens === null));
    const prd = mock.calls.find(row => row.id === 'prd');
    assert.ok(prd.input.analysisArtifact); assert.equal(prd.input.references.length, 2);
    const persona = mock.calls.find(row => row.id === 'persona_chat');
    assert.deepEqual(persona.input.documentReference, persona.input.references[1]);
    assert.equal(report.stages.at(-1).checks.priorVersionUnchanged, true);
  }
});

test('failure is recorded once, dependents skipped, independent market still runs', async () => {
  const mock = stub(CASES[0], { failStage: 'simulation' });
  const report = await runCase(mock), stages = Object.fromEntries(report.stages.map(row => [row.id, row]));
  assert.equal(report.status, 'incomplete');
  assert.equal(stages.simulation.errorCode, 'PROVIDER_HTTP_503');
  assert.equal(mock.calls.filter(row => row.id === 'simulation').length, 1);
  for (const id of ['analysis', 'prd', 'delivery', 'persona_chat', 'prd_revision']) assert.equal(stages[id].status, 'skipped');
  assert.equal(stages.market.status, 'completed');
});

test('corpus count is participant answers, not interviewer prompts, and missing answers still fail', async () => {
  const mock = stub(CASES[1], { mutate: ({ id, artifact }) => {
    if (id === 'simulation') artifact.corpus.documents[0].turns.pop();
  } });
  const report = await runCase(mock);
  assert.equal(report.stages.find(row => row.id === 'simulation').errorCode, 'SIMULATION_QUESTIONS_OR_ORIGIN_CHANGED');
});

test('explicit resumed run reuses four verified stages and calls only five downstream tools', async () => {
  const mock = stub(CASES[1]);
  await runCase(mock);
  const initialResults = new Map(['scope', 'personas', 'simulation', 'market'].map(id => {
    const content = mock.byId.get(id); return [id, { content, reference: ref(content) }];
  }));
  mock.calls.length = 0;
  const resumed = await runCase({ ...mock, initialResults });
  assert.equal(resumed.status, 'completed');
  assert.equal(mock.calls.length, 5);
  assert.deepEqual(mock.calls.map(row => row.id), ['analysis', 'prd', 'delivery', 'persona_chat', 'prd_revision']);
  for (const row of resumed.stages.filter(item => item.reusedFromPriorRun)) {
    assert.equal(row.harnessAttempts, 0); assert.equal(row.wallMs, 0);
    assert.equal(row.usage, null); assert.match(row.note, /no inference/);
  }
});

test('resume rechecks saved artifacts rather than trusting a prior pass/fail label', async () => {
  const mock = stub(CASES[0]), report = await runCase(mock);
  const priorRun = { ...report, caseId: CASES[0].id, fixtureSha256: hash(JSON.stringify(CASES[0])) };
  priorRun.stages.find(row => row.id === 'simulation').status = 'failed';
  const restored = await verifiedResume(CASES[0], priorRun, mock.stateDir, mock);
  assert.equal(restored.size, 9);
  const broken = copy(priorRun); broken.stages[0].input.brief = 'Silently edited benchmark input';
  await assert.rejects(verifiedResume(CASES[0], broken, mock.stateDir, mock), /RESUME_INPUT_CHANGED/);
  await assert.rejects(verifiedResume({ ...CASES[0], depth: 'deep' }, priorRun, mock.stateDir, mock), /RESUME_FIXTURE_CHANGED/);
});

test('stage outputs and provider cache telemetry retained for audit', async () => {
  const mock = stub(CASES[0], { usage: { inputTokens: 150, outputTokens: 22, modelCalls: 2, cacheReadTokens: 12 } });
  const report = await runCase(mock), row = report.stages[0];
  assert.ok(row.input && row.output && row.reference && row.saved);
  assert.equal(row.cache.readTokens, 12); assert.equal(row.cache.writeTokens, null);
  assert.equal(row.modelStageCaches[0].cache.readTokens, 12);
});

test('analysis quotes use normalized corpus mapping and cannot cite interviewer turns as participant evidence', async () => {
  const mock = stub(CASES[0], { mutate: ({ id, artifact }) => {
    if (id === 'analysis') Object.assign(artifact.quotes[0], { turnId: 't1', participantId: 'interviewer', start: 0, end: 4 });
  } });
  const report = await runCase(mock);
  assert.equal(report.stages.find(row => row.id === 'analysis').errorCode, 'ANALYSIS_QUOTE_CHANGED');
});

test('revision guard catches lost checks, reordering, invented attribution, and undeclared changes', async () => {
  for (const sabotage of ['lost-check', 'reordered', 'quoted-owner', 'bad-proof']) {
    const mock = stub(CASES[0], { mutate: ({ id, artifact }) => {
      if (id !== 'prd_revision') return;
      if (sabotage === 'lost-check') artifact.sections[0].items[0].acceptanceCriteria = [];
      if (sabotage === 'reordered') artifact.sections[0].items.reverse();
      if (sabotage === 'quoted-owner') artifact.sections[0].items[1].basis = 'source_statement';
      if (sabotage === 'bad-proof') artifact.revisionPreservation.changedItemIds.push('prd-stable-1');
    } });
    const report = await runCase(mock);
    assert.equal(report.stages.at(-1).status, 'failed', sabotage);
    assert.equal(mock.calls.length, 9);
  }
});

test('wrong persona document and fabricated publisher quote fail even when saved structural validation passes', async () => {
  for (const [stage, code, change] of [
    ['persona_chat', 'PERSONA_SELECTED_DOCUMENT_MISSING_OR_CHANGED', artifact => { artifact.selectedDocument.content.title = 'Wrong revision'; }],
    ['market', 'PUBLISHER_QUOTE_OR_ATTRIBUTION_INVALID', artifact => { artifact.findings[0].quote = 'Customers love this pilot.'; }],
  ]) {
    const report = await runCase(stub(CASES[0], { mutate: ({ id, artifact }) => { if (id === stage) change(artifact); } }));
    assert.equal(report.stages.find(row => row.id === stage).errorCode, code);
  }
});

test('unsanitized provider errors never enter report and no recovery retry is hidden', async () => {
  const mock = stub(CASES[0], { throwStage: 'scope' }), report = await runCase(mock);
  assert.equal(mock.calls.length, 1); assert.equal(report.stages[0].errorCode, 'EXPANDED_STAGE_FAILED');
  assert.ok(!JSON.stringify(report).includes('secret-do-not-log'));
});
