#!/usr/bin/env node
/**
 * Explicit packaged-MCP integration smoke for the eight local capabilities.
 * NOT a natural-routing, vanilla-Goose, factual-search or quality benchmark.
 * Default is offline description only. --live performs paid model inference.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, realpath, lstat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { connect, readSavedArtifact } from './benchmark-axwise-quality.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value);
const same = (left, right) => encode(left) === encode(right);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const code = error => /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.code || error?.message || '')
  ? error.code || error.message : 'PIPELINE_STAGE_FAILED';
const ensure = (condition, error) => { if (!condition) throw new Error(error); };
const referenceOf = content => ({ operationId: content.operationId, sha256: content.artifactFile.sha256 });
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const save = (path, value) => writeFile(path, json(value), { mode: 0o600 });

export const TOOL_NAMES = Object.freeze(['prepare_discovery', 'generate_personas', 'simulate_interviews',
  'analyze_interviews', 'research_market', 'create_prd', 'create_delivery_brief', 'chat_with_persona']);
export const VIEWS = Object.freeze(['themes', 'patterns', 'stakeholders', 'sentiment', 'insights']);
export const FIXTURE = Object.freeze({
  id: 'fictional-repair-handoff-pipeline-v1',
  provenance: 'Entirely fictional test scenario. The supplied document is a test-owner specification, not publisher evidence, customer testimony or market validation.',
  brief: 'Explore a tiny shared repair-handoff tool for a fictional bicycle repair shop. This is a synthetic integration fixture, not validated demand. Keep this smoke scope to exactly ONE stakeholder role (shop coordinator), ONE simulated participant and exactly TWO interview questions: how requests are handed off and what would block adoption. No other roles or questions. Do not invent real customers, companies, prices, market size, statistics or current facts. Use short, specific output.',
  decision: 'Which handoff problem and adoption risk should a small prototype test first?',
  source: Object.freeze({ id: 'fixture-owner-spec', title: 'Fictional test-owner specification', origin: 'supplied_document',
    text: 'This is a fictional test-owner specification, not market evidence. The proposed pilot uses one shared queue and manual task assignment. The pilot must retain existing email communication. No real customer interviews, willingness-to-pay evidence or market statistics have been supplied.' }),
  marketQuestions: Object.freeze(['What real-world demand or willingness-to-pay evidence is available for this proposed pilot?']),
});

export function parseOptions(argv) {
  const result = { live: false, resources: null, repetitions: 1, timeoutMs: 240_000 };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    ensure(!seen.has(option), 'DUPLICATE_OPTION'); seen.add(option);
    if (option === '--live') { result.live = true; continue; }
    ensure(['--resources', '--repetitions', '--timeout-seconds'].includes(option), 'UNKNOWN_OPTION');
    const value = argv[++index]; ensure(value && !value.startsWith('--'), 'OPTION_VALUE_REQUIRED');
    if (option === '--resources') { ensure(isAbsolute(value), 'ABSOLUTE_RESOURCES_REQUIRED'); result.resources = resolve(value); }
    else if (option === '--repetitions') { ensure(/^[12]$/.test(value), 'REPETITIONS_MUST_BE_ONE_OR_TWO'); result.repetitions = Number(value); }
    else { ensure(/^\d+$/.test(value) && Number(value) >= 30 && Number(value) <= 300, 'TIMEOUT_OUT_OF_BOUNDS'); result.timeoutMs = Number(value) * 1000; }
  }
  ensure(!result.live || result.resources, 'LIVE_REQUIRES_PACKAGED_RESOURCES');
  return result;
}

/** Inspect only a Markdown result adjacent to the verified JSON in this run. */
export async function readSavedResult(content, stateDir, saved) {
  const descriptor = content.resultArtifact;
  ensure(object(descriptor) && descriptor.schemaVersion === 'orqanix.result.v1' && descriptor.mimeType === 'text/markdown', 'RESULT_DESCRIPTOR_INVALID');
  ensure(descriptor.revisionId === content.operationId && typeof descriptor.artifactId === 'string'
    && descriptor.createdAt === saved.record.createdAt && same(saved.record.resultArtifact, descriptor), 'RESULT_IDENTITY_MISMATCH');
  ensure(typeof descriptor.path === 'string' && isAbsolute(descriptor.path)
    && basename(descriptor.path) === `${content.operationId}.md`, 'RESULT_PATH_INVALID');
  ensure((await lstat(descriptor.path)).isFile(), 'RESULT_NOT_REGULAR_FILE');
  const root = await realpath(stateDir), path = await realpath(descriptor.path);
  ensure(path.startsWith(root + sep), 'RESULT_OUTSIDE_RUN');
  ensure(dirname(path) === dirname(saved.path), 'RESULT_PATH_INVALID');
  const bytes = await readFile(path);
  ensure(bytes.length <= 1_048_576 && hash(bytes) === descriptor.sha256 && bytes.toString('utf8') === saved.record.markdown, 'RESULT_HASH_MISMATCH');
  ensure(content.content === undefined, 'UNEXPECTED_NESTED_MCP_CONTENT');
  return { path, sha256: hash(bytes), byteLength: bytes.length, descriptor };
}

function sourceRecord(source) {
  return { id: source.id, origin: source.origin, title: source.title, textSha256: hash(source.text),
    url: source.url ?? null, publishedAt: source.publishedAt ?? null, retrievedAt: source.retrievedAt ?? null };
}

function stagePlans(results) {
  const ref = name => results.get(name).reference;
  const artifact = name => results.get(name).content.artifact;
  return [
    { id: 'scope', tool: 'prepare_discovery', depends: [], input: () => ({ brief: FIXTURE.brief, sources: [{ ...FIXTURE.source }], depth: 'standard' }) },
    { id: 'personas', tool: 'generate_personas', depends: ['scope'], input: () => ({ references: [ref('scope')], depth: 'standard' }) },
    { id: 'simulation', tool: 'simulate_interviews', depends: ['personas'], input: () => ({
      scenario: 'Fictional repair-shop shared handoff pilot; interview only the saved synthetic coordinator.',
      targetAudience: 'The explicitly saved fictional shop coordinator', problem: 'Unclear handoff ownership while retaining email.',
      references: [ref('personas')], seed: 17, responseStyle: 'mixed', depth: 'standard',
    }) },
    { id: 'analysis', tool: 'analyze_interviews', depends: ['simulation'], input: () => ({
      decisionQuestion: FIXTURE.decision, questions: ['What handoff need is suggested by this simulated interview?', 'What adoption risk remains untested?'],
      references: [ref('simulation')], outputs: ['jobs_pains', 'personas'], views: [...VIEWS], depth: 'standard',
    }) },
    { id: 'market', tool: 'research_market', depends: ['scope'], input: () => ({
      brief: 'Evaluate only supplied evidence for this fictional pilot. No real market evidence is supplied. Explicitly report demand/willingness-to-pay gaps and suggested searches without inventing facts or actually searching.',
      references: [ref('scope')], questions: [...FIXTURE.marketQuestions], depth: 'standard',
    }) },
    { id: 'prd', tool: 'create_prd', depends: ['analysis', 'market'], input: () => ({
      brief: 'Create a concise software PRD for the fictional repair-handoff prototype using the saved synthetic analysis and evidence gaps. Retain email and manual assignment. Mark recommendations as hypotheses. Include bounded requirements, observable acceptance criteria, an explicit validation experiment, and unknown demand/pricing. Do not claim customer validation.',
      artifactType: 'software_prd', references: [ref('analysis'), ref('market')], depth: 'standard',
    }) },
    { id: 'delivery', tool: 'create_delivery_brief', depends: ['prd'], input: () => ({
      brief: 'Prepare a small implementation handoff for an outsourced software team from this exact PRD. Preserve scope, acceptance criteria, evidence uncertainty and exclusions. Propose work and responsibilities; do not invent agreements or perform code changes.',
      references: [ref('prd')], depth: 'standard',
    }) },
    { id: 'persona_chat', tool: 'chat_with_persona', depends: ['personas'], input: () => ({
      references: [ref('personas')], personaId: artifact('personas').personas[0].id,
      message: 'As this synthetic coordinator, what would concern you about adopting the proposed shared queue?', depth: 'standard',
    }) },
    { id: 'persona_chat_revision', tool: 'chat_with_persona', depends: ['persona_chat'], input: () => ({
      revisionOf: ref('persona_chat'), personaId: artifact('persona_chat').personaId,
      message: 'Continue that same simulated conversation: what small pilot would address your concern while preserving email?', depth: 'standard',
    }) },
  ];
}

function lineageChecks(stage, content, results) {
  const artifact = content.artifact;
  ensure(object(artifact) && content.validation?.valid === true, 'ARTIFACT_NOT_VALIDATED');
  const source = id => results.get(id).content.artifact;
  const reference = id => results.get(id).reference;
  if (stage.id === 'scope') {
    ensure(artifact.stakeholders?.length === 1 && artifact.stakeholders[0].questions?.length === 2, 'FIXTURE_SCOPE_BUDGET_NOT_PRESERVED');
    ensure(artifact.sources?.length === 1 && artifact.sources[0].text === FIXTURE.source.text && artifact.sources[0].origin === FIXTURE.source.origin, 'FIXTURE_SOURCE_PROVENANCE_CHANGED');
  } else if (stage.id === 'personas') {
    ensure(same(artifact.scopeReference, reference('scope')) && artifact.scopeId === source('scope').id, 'PERSONA_SCOPE_LINEAGE_INVALID');
    ensure(artifact.personas?.length === 1 && artifact.personas[0].origin === 'synthetic', 'PERSONA_COHORT_INVALID');
    ensure(same(artifact.questionPlan, source('scope').stakeholders.map(row => ({ stakeholderId: row.id, questions: row.questions }))), 'PERSONA_QUESTION_PLAN_CHANGED');
  } else if (stage.id === 'simulation') {
    ensure(same(artifact.selectedPersonas, source('personas').personas), 'SIMULATION_SELECTED_PERSONAS_CHANGED');
    const questionIds = source('personas').questionPlan.flatMap(row => row.questions.map(q => q.id));
    const requestIds = artifact.request?.stakeholders?.flatMap(row => row.questions.map(q => q.questionId));
    ensure(same(requestIds, questionIds), 'SIMULATION_QUESTION_IDS_CHANGED');
    const docs = artifact.corpus?.documents;
    ensure(docs?.length === 1 && docs.every(doc => doc.origin === 'synthetic_transcript'
      && doc.turns.every(turn => questionIds.includes(turn.questionId))) && artifact.cohort?.complete === true, 'SIMULATION_CORPUS_LINEAGE_INVALID');
  } else if (stage.id === 'analysis') {
    ensure(artifact.findings?.length > 0 && artifact.findings.every(row => row.basis === 'simulation_hypothesis'), 'ANALYSIS_SYNTHETIC_ORIGIN_LOST');
    ensure(VIEWS.every(kind => artifact.views?.some(row => row.kind === kind)), 'ANALYSIS_VIEWS_MISSING');
    const transcripts = content.resolvedInput?.transcripts;
    const documents = source('simulation').corpus.documents;
    ensure(transcripts?.length === documents.length && transcripts.every(transcript => {
      const doc = documents.find(row => row.documentId === transcript.id);
      return doc && transcript.origin === 'synthetic_transcript' && transcript.turns.length === doc.turns.length
        && transcript.turns.every((turn, i) => turn.text === Buffer.from(doc.text).subarray(doc.turns[i].start, doc.turns[i].end).toString('utf8')
          && turn.questionId === doc.turns[i].questionId && turn.speaker === doc.turns[i].participantId);
    }), 'ANALYSIS_TRANSCRIPT_REFERENCE_CHANGED');
  } else if (stage.id === 'market') {
    ensure(artifact.sources?.length === 1 && artifact.sources[0].origin === 'supplied_document'
      && artifact.sources[0].text === FIXTURE.source.text, 'MARKET_FIXTURE_SOURCE_CHANGED');
    ensure(artifact.gaps?.length > 0 && artifact.searchRequests?.length > 0, 'MARKET_MISSING_EVIDENCE_NOT_REPORTED');
    ensure((artifact.findings || []).every(row => row.sourceId === FIXTURE.source.id
      && typeof row.quote === 'string' && FIXTURE.source.text.includes(row.quote)), 'MARKET_UNSUPPORTED_FACT');
  } else if (stage.id === 'prd') {
    ensure(same(artifact.analysisArtifact, reference('analysis')), 'PRD_ANALYSIS_REFERENCE_CHANGED');
    const ids = new Set(source('analysis').findings.map(row => row.findingId));
    ensure(artifact.sections?.length && artifact.sections.flatMap(section => section.items).every(item => (item.findingIds || []).every(id => ids.has(id))), 'PRD_FINDING_LINEAGE_INVALID');
  } else if (stage.id === 'delivery') {
    ensure(content.references?.some(row => same(row, reference('prd'))) && same(artifact.prdReference, reference('prd'))
      && artifact.executionAuthorized === false && artifact.commercialTerms === 'not_set', 'DELIVERY_PRD_REFERENCE_MISSING');
  } else if (stage.id === 'persona_chat') {
    ensure(same(artifact.personaReference, reference('personas')) && same(artifact.persona, source('personas').personas[0])
      && artifact.turns?.length === 2 && artifact.origin === 'synthetic', 'CHAT_PERSONA_LINEAGE_INVALID');
  } else if (stage.id === 'persona_chat_revision') {
    const previous = results.get('persona_chat').content;
    ensure(same(artifact.previousConversationReference, reference('persona_chat')) && same(artifact.personaReference, previous.artifact.personaReference)
      && same(artifact.turns?.slice(0, 2), previous.artifact.turns) && artifact.turns?.length === 4, 'CHAT_REVISION_HISTORY_CHANGED');
    ensure(content.resultArtifact.artifactId === previous.resultArtifact.artifactId
      && content.resultArtifact.parentRevisionId === previous.operationId
      && content.resultArtifact.previousPath === previous.resultArtifact.path, 'RESULT_REVISION_LINK_INVALID');
  }
}

export async function runPipeline({ client, stateDir, timeoutMs = 240_000,
  readArtifact = readSavedArtifact, readResult = readSavedResult, onStage = async () => {} }) {
  const results = new Map(), stages = [], started = performance.now();
  for (const stage of stagePlans(results)) {
    const row = { id: stage.id, tool: stage.tool, dependsOn: stage.depends, status: 'pending', errorCode: null };
    stages.push(row);
    const missing = stage.depends.filter(id => !results.has(id));
    if (missing.length) { Object.assign(row, { status: 'skipped', blockedBy: missing }); await onStage(row); continue; }
    const at = performance.now();
    try {
      row.input = stage.input(); row.inputSha256 = hash(encode(row.input));
      row.inputReferences = [...(row.input.references || []), ...(row.input.revisionOf ? [row.input.revisionOf] : [])];
      const response = await client.request('tools/call', { name: stage.tool, arguments: row.input }, timeoutMs);
      const content = response?.structuredContent;
      row.usage = content?.usage ?? null; row.timings = content?.timings ?? null;
      row.modelStages = content?.execution?.stages ?? [];
      ensure(response?.isError !== true && content?.status === 'completed', code(content?.error) === 'PIPELINE_STAGE_FAILED' ? 'MCP_STAGE_FAILED' : code(content.error));
      ensure(content.tool === stage.tool && same(content.selectedInput, row.input) && content.inputSha256 === row.inputSha256, 'SAVED_INPUT_MISMATCH');
      const saved = await readArtifact(content, stateDir);
      ensure(same(saved.record.artifact, content.artifact) && saved.record.artifactSha256 === hash(encode(content.artifact)), 'SAVED_ARTIFACT_CONTENT_MISMATCH');
      const markdown = await readResult(content, stateDir, saved);
      const text = (response.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
      ensure(text.includes(`Saved result artifact: ${encode(content.resultArtifact)}`), 'RESULT_DESCRIPTOR_NOT_EXPOSED_TO_GOOSE');
      row.reference = referenceOf(content);
      row.saved = { json: { path: saved.path, sha256: saved.sha256, byteLength: saved.byteLength }, markdown };
      row.output = content.artifact; row.provenance = content.provenance;
      row.sources = (content.artifact.sources || []).filter(source => typeof source.text === 'string').map(sourceRecord);
      row.referencesAsReported = content.references ?? [];
      ensure(row.inputReferences.every(ref => row.referencesAsReported.some(found => same(ref, found))), 'HOST_REFERENCE_LINEAGE_MISSING');
      lineageChecks(stage, content, results);
      row.status = 'completed'; row.structuralLineageChecksPassed = true;
      results.set(stage.id, { content, reference: row.reference });
    } catch (error) { row.status = 'failed'; row.errorCode = code(error); row.structuralLineageChecksPassed = false; }
    row.wallMs = Math.round(performance.now() - at);
    await onStage(row);
  }
  return { status: stages.every(row => row.status === 'completed') ? 'completed' : 'incomplete',
    wallMs: Math.round(performance.now() - started), stages,
    assessment: 'Deterministic packaging, artifact persistence and lineage only. Not semantic quality, natural routing, factual retrieval or performance superiority.' };
}

export async function main(argv) {
  const options = parseOptions(argv);
  const fixtureSha256 = hash(encode(FIXTURE));
  if (!options.live) {
    const dry = { live: false, fixtureSha256, tools: TOOL_NAMES, repetitions: options.repetitions,
      note: 'No files, authentication, network or inference. Add --live --resources ABSOLUTE_PACKAGED_RESOURCES for paid explicit MCP integration smoke. This does not benchmark natural routing.' };
    process.stdout.write(json(dry)); return dry;
  }
  const outputDir = await mkdtemp(join(tmpdir(), 'axwise-pipeline-'));
  const reportPath = join(outputDir, 'report.json');
  const report = { version: 1, liveInference: true, kind: 'explicit-packaged-mcp-integration-smoke', naturalRoutingTested: false,
    startedAt: new Date().toISOString(), resources: options.resources, options, fixtureSha256,
    safety: { fixtureOnly: true, realPublisherEvidence: false, credentialsPersisted: false, harnessRetries: false, uploadsOrDeployments: false },
    limitations: ['At most two runs, not statistical proof.', 'Fixtures establish no real-world market facts.',
      'Explicit tool selection tests integration, not Goose choosing tools or ordinary-task regressions.',
      'Structural provenance does not prove good personas, semantic fidelity or useful output.', 'Gateway/model/cache variability is uncontrolled.'],
    runs: [], errorCode: null };
  await save(join(outputDir, 'fixture.json'), FIXTURE);
  try {
    const manifest = await readFile(join(options.resources, 'axwise-runtime/runtime-manifest.json'));
    report.runtimeManifestSha256 = hash(manifest);
    report.runtimeSource = JSON.parse(manifest.toString('utf8')).source;
    for (let repetition = 1; repetition <= options.repetitions; repetition++) {
      const runDir = join(outputDir, `run-${repetition}`); await mkdir(runDir, { mode: 0o700 });
      let connection;
      const run = { repetition, stages: [] }; report.runs.push(run);
      try {
        connection = await connect(options.resources, runDir);
        run.setupMs = connection.setupMs;
        const listing = await connection.client.request('tools/list', {}, 20_000);
        ensure(TOOL_NAMES.every(name => listing.tools?.some(tool => tool.name === name)), 'PIPELINE_TOOLS_MISSING');
        const result = await runPipeline({ ...connection, timeoutMs: options.timeoutMs, onStage: async row => {
          run.stages.push(row); await save(reportPath, report);
          process.stdout.write(json({ repetition, id: row.id, status: row.status, wallMs: row.wallMs, errorCode: row.errorCode, blockedBy: row.blockedBy }));
        } });
        Object.assign(run, result);
      } finally { connection?.client.close(); }
    }
  } catch (error) { report.errorCode = code(error); }
  finally {
    report.completedAt = new Date().toISOString(); await save(reportPath, report);
    process.stdout.write(`Pipeline integration report: ${reportPath}\n`);
  }
  if (report.errorCode || report.runs.some(run => run.status !== 'completed')) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`Axwise pipeline smoke failed: ${code(error)}\n`); process.exitCode = 1;
  });
}
