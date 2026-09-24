#!/usr/bin/env node
/** Explicit packaged-MCP regression benchmark, NOT a Goose routing benchmark.
 * Default: offline plan. --live spends inference; no harness retries or uploads.
 * Two distinct small cohorts, one standard and one deep, nine stages each.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { connect, readSavedArtifact } from './benchmark-axwise-quality.mjs';
import { readSavedResult, TOOL_NAMES, VIEWS } from './benchmark-axwise-pipeline.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);
const stable = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => json(stable(a)) === json(stable(b));
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const safeError = error => /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.code || error?.message || '') ? error.code || error.message : 'EXPANDED_STAGE_FAILED';
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const reference = content => ({ operationId: content.operationId, sha256: content.artifactFile.sha256 });

// Manually selected from the linked publisher pages on the recorded date. Each
// excerpt is <=25 words. Hashes describe these exact excerpts, not entire pages.
// Product documentation establishes a documented capability, not pilot demand.
export const PUBLISHER_SOURCES = Object.freeze([
  Object.freeze({ id: 'atlassian-email-processor', title: 'How Jira Service Management processes email requests', origin: 'web_source',
    text: 'Jira Service Management Cloud uses a built-in processor to receive and process requests that come from emails.',
    url: 'https://support.atlassian.com/jira-service-management-cloud/docs/how-does-jira-service-management-process-email-requests/',
    publishedAt: null, retrievedAt: '2026-09-24T07:08:43Z' }),
  Object.freeze({ id: 'google-calendar-booking-limit', title: 'Create an appointment schedule — Google Calendar Help', origin: 'web_source',
    text: 'Maximum bookings per day: Limit the number of appointments you accept in a single day.',
    url: 'https://support.google.com/calendar/answer/10729749?hl=en', publishedAt: null, retrievedAt: '2026-09-24T07:08:43Z' }),
]);

export const CASES = Object.freeze([
  Object.freeze({ id: 'repair-handoffs', depth: 'standard', participantsPerRole: 1, roles: ['dispatcher', 'technician'],
    brief: 'Discover a shared repair queue for one fictional residential building with five total staff: one dispatcher and four technicians. Scope only dispatcher and technician roles, exactly two interview questions per role. Keep email intake and manual dispatcher assignment. No automatic assignment, payments or predictive maintenance. Include a chronological email history and required ticket fields. Keep all output concise.',
    ownerText: 'Proposed pilot constraints: one residential building, five total staff (one dispatcher, four technicians), retained email intake, manual assignment. Email updates must appear within 30 seconds; status updates within five seconds. No payments, predictive maintenance or automatic assignment. This owner specification and cohort are synthetic benchmark material, not customer testimony.',
    decision: 'Which repair-handoff needs and adoption risks should this bounded pilot address?',
    marketQuestion: 'What capability does the selected Atlassian publisher excerpt document for email request intake?',
    source: PUBLISHER_SOURCES[0],
    addition: 'When a dispatcher tries to create a second ticket from the same email message, show a duplicate warning and do not create another ticket unless the dispatcher explicitly confirms.',
  }),
  Object.freeze({ id: 'volunteer-shifts', depth: 'deep', participantsPerRole: 2, roles: ['coordinator', 'volunteer'],
    brief: 'Explore a volunteer shift board for one fictional community food pantry. Scope exactly coordinator and volunteer roles, exactly two questions per role. Four saved personas total: two for each role. Preserve phone-assisted sign-up, manual coordinator approval and a maximum of six confirmed volunteers per shift. No payroll, rankings, fundraising or automatic assignment. Explore contrasting motivations and failure cases but stay within this small pilot.',
    ownerText: 'Proposed pilot constraints: one community pantry, coordinator-approved shifts, phone-assisted sign-up retained, at most six confirmed volunteers per shift. Publish approved roster changes within ten seconds and retain the previous roster for recovery. No payroll, fundraising, volunteer rankings or automatic assignment. This owner specification and cohort are synthetic benchmark material, not customer testimony.',
    decision: 'What coordination need and accessibility risk should a small shift-board pilot address?',
    marketQuestion: 'What scheduling limit does the selected Google Calendar publisher excerpt document, without assuming it manages volunteer shifts?',
    source: PUBLISHER_SOURCES[1],
    addition: 'When a coordinator attempts to confirm a seventh volunteer on a six-person shift, show a capacity warning and leave the roster unchanged.',
  }),
]);

export function parseOptions(argv) {
  const result = { live: false, resources: null, resume: null, caseIds: CASES.map(row => row.id), timeoutMs: 240_000, seed: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]; ensure(!seen.has(name), 'DUPLICATE_OPTION'); seen.add(name);
    if (name === '--live') { result.live = true; continue; }
    ensure(['--resources', '--case', '--timeout-seconds', '--seed', '--resume'].includes(name), 'UNKNOWN_OPTION');
    const value = argv[++index]; ensure(value && !value.startsWith('--'), 'OPTION_VALUE_REQUIRED');
    if (name === '--resources') { ensure(isAbsolute(value), 'ABSOLUTE_RESOURCES_REQUIRED'); result.resources = resolve(value); }
    else if (name === '--resume') { ensure(isAbsolute(value), 'ABSOLUTE_RESUME_REPORT_REQUIRED'); result.resume = resolve(value); }
    else if (name === '--case') { ensure(CASES.some(row => row.id === value), 'UNKNOWN_CASE'); result.caseIds = [value]; }
    else if (name === '--seed') { ensure(/^[a-f0-9]{16}$/.test(value), 'SEED_MUST_BE_16_HEX'); result.seed = value; }
    else { ensure(/^\d+$/.test(value) && Number(value) >= 30 && Number(value) <= 300, 'TIMEOUT_OUT_OF_BOUNDS'); result.timeoutMs = Number(value) * 1000; }
  }
  ensure(!result.live || result.resources, 'LIVE_REQUIRES_PACKAGED_RESOURCES');
  ensure(!result.resume || result.caseIds.length === 1, 'RESUME_REQUIRES_ONE_CASE');
  return result;
}

export function cacheMeasurement(usage) {
  const number = key => Number.isSafeInteger(usage?.[key]) && usage[key] >= 0 ? usage[key] : null;
  const readTokens = number('cacheReadTokens'), writeTokens = number('cacheWriteTokens');
  return { readTokens, writeTokens, telemetry: readTokens === null && writeTokens === null ? 'unavailable' : 'provider_reported',
    cachePolicyControlled: false, note: 'Null means unavailable, never zero. No cache hit/miss is inferred from speed.' };
}

export function stagePlans(fixture, results) {
  const ref = name => results.get(name).reference;
  const artifact = name => results.get(name).content.artifact;
  const depth = fixture.depth;
  const owner = { id: `${fixture.id}-owner`, title: 'Fictional benchmark owner specification', text: fixture.ownerText, origin: 'supplied_document' };
  return [
    { id: 'scope', tool: 'prepare_discovery', depends: [], input: () => ({ brief: fixture.brief, sources: [owner], depth }) },
    { id: 'personas', tool: 'generate_personas', depends: ['scope'], input: () => ({ references: [ref('scope')], depth,
      stakeholders: artifact('scope').stakeholders.map(row => ({ id: row.id, label: row.label, description: row.description,
        participants: fixture.participantsPerRole, countryCode: row.countryCode ?? null, locality: row.locality ?? null })) }) },
    { id: 'simulation', tool: 'simulate_interviews', depends: ['personas'], input: () => ({ references: [ref('personas')], depth,
      scenario: fixture.brief, targetAudience: fixture.roles.join(' and '), problem: fixture.decision, seed: 31, responseStyle: 'mixed' }) },
    { id: 'analysis', tool: 'analyze_interviews', depends: ['simulation'], input: () => ({ references: [ref('simulation')], depth,
      decisionQuestion: fixture.decision, questions: ['Which workflow needs are suggested?', 'Which adoption risks or conflicting needs remain?'],
      outputs: ['jobs_pains', 'personas'], views: [...VIEWS] }) },
    { id: 'market', tool: 'research_market', depends: ['scope'], input: () => ({ references: [ref('scope')], depth,
      brief: 'Synthesize only the exact selected publisher excerpt and owner specification. A documented competitor capability is not evidence of customer demand or fit. Do not retrieve more data or invent current pricing, statistics or validation.',
      sources: [{ ...fixture.source }], questions: [fixture.marketQuestion, 'What evidence of willingness to adopt this specific proposed pilot is available?'] }) },
    { id: 'prd', tool: 'create_prd', depends: ['scope', 'analysis', 'market'], input: () => ({
      analysisArtifact: ref('analysis'), references: [ref('scope'), ref('market')], depth, artifactType: 'software_prd',
      brief: `Create a concise implementation-ready software PRD for this exact discovery scope, saved analysis and selected publisher evidence. Preserve every owner constraint and numeric acceptance threshold. ${fixture.ownerText} Add concrete acceptance checks and an explicit pilot validation plan, not fabricated performance measurements. Keep recommendations distinct from participant quotations. No added product direction.` }) },
    { id: 'delivery', tool: 'create_delivery_brief', depends: ['prd'], input: () => ({ references: [ref('prd')], depth,
      brief: 'Create a concise outsourced implementation handoff from this exact PRD. Preserve every acceptance condition and scope constraint as an explicit check or documented deferral. Do not authorize execution or invent commercial terms.' }) },
    { id: 'persona_chat', tool: 'chat_with_persona', depends: ['personas', 'prd'], input: () => ({
      references: [ref('personas'), ref('prd')], documentReference: ref('prd'), personaId: artifact('personas').personas[0].id, depth,
      message: 'If we implement this exact selected PRD, what practical problem remains for you? Do not propose a feature as missing if it is already specified. Give one concise concern and distinguish a new suggestion from an existing requirement.' }) },
    { id: 'prd_revision', tool: 'create_prd', depends: ['prd'], input: () => ({ revisionOf: ref('prd'), depth, artifactType: 'software_prd',
      brief: `Preserve the previous PRD, every requirement, acceptance condition, priority order, metric and scope. Add only this exact owner-requested acceptance condition: ${fixture.addition} Treat it as a new owner decision, not an interview quotation. Do not rewrite any existing item.` }) },
  ];
}

export function revisionChecks(before, after, parentReference, exactAddition) {
  ensure(before.title === after.title && before.sections?.length === after.sections?.length, 'REVISION_STRUCTURE_CHANGED');
  before.sections.forEach((section, index) => {
    const next = after.sections[index];
    ensure(next.heading === section.heading && same(next.items.slice(0, section.items.length), section.items), 'REVISION_COMMITMENT_REMOVED_OR_CHANGED');
  });
  const added = after.sections.flatMap((section, index) => section.items.slice(before.sections[index].items.length));
  ensure(added.length === 1 && added[0].text === exactAddition && added[0].basis === 'owner_decision'
    && same(added[0].sourceIds, []) && same(added[0].findingIds, []), 'REVISION_ADDITION_NOT_EXACT_OWNER_INSTRUCTION');
  const proof = after.revisionPreservation;
  ensure(proof?.policy === 'bounded_item_patch_v1' && same(proof.parent, parentReference)
    && same(proof.changedItemIds, []) && same(proof.removedItemIds, []) && proof.addedItemIds?.length === 1, 'REVISION_PRESERVATION_PROOF_INVALID');
  const old = before.itemCatalogue, next = after.itemCatalogue;
  ensure(Array.isArray(old) && old.length && old.every(item => next?.some(row => same(row, item)))
    && same([...proof.retainedItemIds].sort(), old.map(row => row.id).sort()), 'REVISION_STABLE_IDENTITIES_CHANGED');
  return { existingItemsPreserved: old.length, exactNewOwnerItems: added.length, priorVersionUnchanged: null };
}

export function checkStage(stage, content, results, fixture) {
  const artifact = content.artifact;
  const get = name => results.get(name).content.artifact;
  const ref = name => results.get(name).reference;
  ensure(artifact && content.validation?.valid === true, 'ARTIFACT_NOT_VALIDATED');
  if (stage.id === 'scope') {
    ensure(artifact.stakeholders?.length === 2 && artifact.stakeholders.every(row => row.questions?.length === 2), 'FIXTURE_SCOPE_BUDGET_CHANGED');
    ensure(artifact.sources?.some(source => source.text === fixture.ownerText && source.origin === 'supplied_document'), 'OWNER_SOURCE_CHANGED');
  } else if (stage.id === 'personas') {
    ensure(same(artifact.scopeReference, ref('scope')) && artifact.personas?.length === 2 * fixture.participantsPerRole, 'PERSONA_COHORT_LINEAGE_CHANGED');
    ensure(artifact.personas.every(row => row.origin === 'synthetic'), 'PERSONA_ORIGIN_CHANGED');
    ensure(same(artifact.questionPlan, get('scope').stakeholders.map(row => ({ stakeholderId: row.id, questions: row.questions }))), 'PERSONA_QUESTION_PLAN_CHANGED');
  } else if (stage.id === 'simulation') {
    ensure(same(artifact.selectedPersonas, get('personas').personas) && artifact.cohort?.complete === true, 'SIMULATION_COHORT_CHANGED');
    const questionIds = new Set(get('personas').questionPlan.flatMap(row => row.questions.map(q => q.id)));
    ensure(artifact.corpus?.documents?.length === 2 * fixture.participantsPerRole
      && artifact.corpus.documents.every(doc => {
        const participantIds = new Set(doc.participants?.filter(row => row.role === 'participant').map(row => row.participantId));
        const answers = doc.turns?.filter(turn => participantIds.has(turn.participantId));
        return doc.origin === 'synthetic_transcript' && participantIds.size === 1 && answers?.length === 2
          && new Set(answers.map(turn => turn.questionId)).size === 2
          && doc.turns.every(turn => questionIds.has(turn.questionId));
      }), 'SIMULATION_QUESTIONS_OR_ORIGIN_CHANGED');
  } else if (stage.id === 'analysis') {
    const docs = get('simulation').corpus.documents;
    const transcripts = content.resolvedInput?.transcripts, catalogue = content.provenance?.sourceCatalogue;
    ensure(transcripts?.length === docs.length && transcripts.every(transcript => {
      const original = docs.find(doc => doc.documentId === transcript.id);
      return original && transcript.origin === original.origin && transcript.turns?.length === original.turns.length
        && transcript.turns.every((turn, index) => turn.text === Buffer.from(original.text).subarray(original.turns[index].start, original.turns[index].end).toString('utf8')
          && turn.questionId === original.turns[index].questionId && turn.speaker === original.turns[index].participantId
          && turn.role === original.participants.find(person => person.participantId === turn.speaker)?.role);
    }), 'ANALYSIS_RESOLVED_TRANSCRIPT_CHANGED');
    ensure(artifact.quotes?.length && artifact.quotes.every(quote => {
      const source = catalogue?.find(row => row.documentId === quote.documentId);
      const transcript = transcripts.find(row => row.id === source?.id);
      if (!transcript || quote.origin !== transcript.origin) return false;
      const text = transcript.turns.map(turn => `${turn.text}\n`).join(''), bytes = Buffer.from(text);
      if (hash(bytes) !== source.textSha256 || quote.sourceTextSha256 !== source.textSha256
        || bytes.subarray(quote.start, quote.end).toString('utf8') !== quote.text) return false;
      let position = 0;
      return transcript.turns.some((turn, index) => {
        const start = position, end = start + Buffer.byteLength(turn.text); position = end + 1;
        return quote.turnId === `t${index + 1}` && quote.participantId === turn.speaker && turn.role === 'participant'
          && quote.start >= start && quote.end <= end;
      });
    }), 'ANALYSIS_QUOTE_CHANGED');
    ensure(artifact.findings?.length && artifact.findings.every(row => row.basis === 'simulation_hypothesis'), 'ANALYSIS_PROVENANCE_CHANGED');
    ensure(VIEWS.every(kind => artifact.views?.some(row => row.kind === kind)), 'ANALYSIS_VIEWS_MISSING');
  } else if (stage.id === 'market') {
    ensure(artifact.sources?.some(source => same(source, fixture.source)), 'SELECTED_PUBLISHER_SOURCE_CHANGED');
    const publishers = artifact.findings?.filter(row => row.sourceId === fixture.source.id) || [];
    ensure(publishers.length && publishers.every(row => row.origin === 'web_source' && row.url === fixture.source.url
      && row.retrievedAt === fixture.source.retrievedAt && row.quote?.length
      && Buffer.from(fixture.source.text).subarray(row.start, row.end).toString('utf8') === row.quote), 'PUBLISHER_QUOTE_OR_ATTRIBUTION_INVALID');
    ensure(artifact.gaps?.length > 0, 'MARKET_DEMAND_GAP_NOT_REPORTED');
  } else if (stage.id === 'prd') {
    ensure(same(artifact.analysisArtifact, ref('analysis')), 'MIXED_ANALYSIS_REFERENCE_CHANGED');
    ensure(content.references?.some(row => same(row, ref('scope'))) && content.references?.some(row => same(row, ref('market'))), 'MIXED_REFERENCES_DROPPED');
    ensure(artifact.itemCatalogue?.length > 0, 'PRD_STABLE_IDENTITIES_MISSING');
  } else if (stage.id === 'delivery') {
    ensure(same(artifact.prdReference, ref('prd')) && artifact.executionAuthorized === false && artifact.commercialTerms === 'not_set', 'DELIVERY_LINEAGE_CHANGED');
  } else if (stage.id === 'persona_chat') {
    ensure(same(artifact.persona, get('personas').personas[0]) && same(artifact.personaReference, ref('personas')), 'PERSONA_CHAT_IDENTITY_CHANGED');
    ensure(same(artifact.selectedDocument?.reference, ref('prd')) && same(artifact.selectedDocument?.content, get('prd'))
      && artifact.selectedDocument?.artifactHash === hash(json(stable(get('prd')))), 'PERSONA_SELECTED_DOCUMENT_MISSING_OR_CHANGED');
    ensure(artifact.turns?.length === 2 && artifact.turns.every(row => same(row.documentReference, ref('prd'))), 'PERSONA_TURN_DOCUMENT_LINEAGE_MISSING');
  } else if (stage.id === 'prd_revision') return revisionChecks(get('prd'), artifact, ref('prd'), fixture.addition);
  return { structuralLineagePassed: true, semanticAssessmentRequired: true };
}

export async function runCase({ fixture, client, stateDir, timeoutMs = 240_000, onStage = async () => {},
  readArtifact = readSavedArtifact, readResult = readSavedResult, initialResults = new Map() }) {
  const results = new Map(initialResults), stages = [], at = performance.now();
  for (const stage of stagePlans(fixture, results)) {
    const row = { id: stage.id, tool: stage.tool, dependsOn: stage.depends, status: 'pending', errorCode: null,
      harnessAttempts: 0, usage: null, cache: cacheMeasurement(null), modelStages: [] };
    stages.push(row);
    if (initialResults.has(stage.id)) {
      const reused = initialResults.get(stage.id);
      Object.assign(row, { status: 'completed', reference: reused.reference, reusedFromPriorRun: true, wallMs: 0,
        input: reused.content.selectedInput, output: reused.content.artifact, inputSha256: reused.content.inputSha256, saved: reused.saved,
        note: 'Reverified saved artifact; no inference in this resumed run. Original timing/usage remains in prior report.' });
      await onStage(row); continue;
    }
    const missing = stage.depends.filter(id => !results.has(id));
    if (missing.length) { Object.assign(row, { status: 'skipped', blockedBy: missing }); await onStage(row); continue; }
    const started = performance.now();
    try {
      row.input = stage.input(); row.inputSha256 = hash(json(row.input));
      row.inputReferences = [...(row.input.references || []), ...(row.input.analysisArtifact ? [row.input.analysisArtifact] : []), ...(row.input.revisionOf ? [row.input.revisionOf] : [])];
      row.harnessAttempts = 1;
      const response = await client.request('tools/call', { name: stage.tool, arguments: row.input }, timeoutMs);
      const content = response?.structuredContent;
      row.usage = content?.usage ?? null; row.cache = cacheMeasurement(row.usage); row.timings = content?.timings ?? null;
      row.modelStages = content?.execution?.stages ?? [];
      row.modelStageCaches = row.modelStages.map(item => ({ stage: item.stage ?? item.name ?? null, cache: cacheMeasurement(item.usage ?? item) }));
      ensure(response?.isError !== true && content?.status === 'completed', safeError(content?.error) === 'EXPANDED_STAGE_FAILED' ? 'MCP_STAGE_FAILED' : safeError(content.error));
      ensure(content.tool === stage.tool && same(content.selectedInput, row.input) && content.inputSha256 === row.inputSha256, 'SAVED_INPUT_MISMATCH');
      const saved = await readArtifact(content, stateDir), markdown = await readResult(content, stateDir, saved);
      ensure(same(saved.record.artifact, content.artifact) && saved.record.artifactSha256 === hash(json(content.artifact)), 'SAVED_ARTIFACT_CONTENT_MISMATCH');
      row.reference = reference(content); row.output = content.artifact; row.provenance = content.provenance;
      row.qualityReview = content.qualityReview ?? null; row.referencesAsReported = content.references ?? [];
      row.saved = { json: { path: saved.path, sha256: saved.sha256, byteLength: saved.byteLength }, markdown };
      ensure(row.inputReferences.every(selected => row.referencesAsReported.some(found => same(found, selected))), 'HOST_REFERENCE_LINEAGE_MISSING');
      row.checks = checkStage(stage, content, results, fixture);
      if (stage.id === 'prd_revision') {
        const prior = results.get('prd');
        const stillSaved = await readArtifact(prior.content, stateDir);
        ensure(stillSaved.sha256 === prior.reference.sha256, 'PRIOR_PRD_MUTATED');
        row.checks.priorVersionUnchanged = true;
        ensure(content.resultArtifact.parentRevisionId === prior.reference.operationId
          && content.resultArtifact.artifactId === prior.content.resultArtifact.artifactId, 'RESULT_REVISION_GROUP_CHANGED');
      }
      row.status = 'completed'; results.set(stage.id, { content, reference: row.reference });
    } catch (error) { row.status = 'failed'; row.errorCode = safeError(error); }
    row.wallMs = Math.round(performance.now() - started); await onStage(row);
  }
  return { status: stages.every(row => row.status === 'completed') ? 'completed' : 'incomplete', wallMs: Math.round(performance.now() - at), stages };
}

/** Recheck immutable saved bytes rather than trusting a prior benchmark label.
 * Useful after a documented harness bug, not a silent provider retry.
 */
export async function verifiedResume(fixture, priorRun, stateDir, readers = {}) {
  ensure(priorRun.caseId === fixture.id && priorRun.fixtureSha256 === hash(json(fixture)), 'RESUME_FIXTURE_CHANGED');
  const results = new Map(), readArtifact = readers.readArtifact ?? readSavedArtifact, readResult = readers.readResult ?? readSavedResult;
  for (const stage of stagePlans(fixture, results)) {
    const row = priorRun.stages.find(item => item.id === stage.id);
    if (!row?.saved?.json || stage.depends.some(id => !results.has(id))) continue;
    const saved = await readArtifact({ operationId: row.reference?.operationId, tool: stage.tool,
      artifactFile: { path: row.saved.json.path, sha256: row.saved.json.sha256 } }, stateDir);
    const record = saved.record;
    const content = { ...record, status: 'completed', artifactFile: { path: row.saved.json.path, sha256: row.saved.json.sha256 } };
    ensure(same(row.reference, reference(content)), 'RESUME_REFERENCE_CHANGED');
    ensure(record.inputSha256 === hash(json(record.selectedInput)) && same(row.input, record.selectedInput), 'RESUME_INPUT_CHANGED');
    await readResult(content, stateDir, saved);
    ensure(record.artifactSha256 === hash(json(record.artifact)), 'RESUME_ARTIFACT_CHANGED');
    checkStage(stage, content, results, fixture);
    results.set(stage.id, { content, reference: reference(content), saved: row.saved });
  }
  ensure(results.size > 0, 'RESUME_NO_VERIFIED_ARTIFACTS');
  return results;
}

async function resumeHistory(path, fixture) {
  const history = [], visited = new Set();
  while (path) {
    ensure(isAbsolute(path) && !visited.has(path) && history.length < 8, 'INVALID_RESUME_CHAIN'); visited.add(path);
    const report = JSON.parse(await readFile(path, 'utf8'));
    ensure(report.kind === 'expanded-explicit-packaged-mcp', 'INVALID_RESUME_REPORT');
    const run = report.runs.find(row => row.caseId === fixture.id);
    ensure(run && run.fixtureSha256 === hash(json(fixture)), 'RESUME_FIXTURE_CHANGED');
    history.push({ path, report, run }); path = report.resumption?.sourceReport;
  }
  const root = history.at(-1), stages = new Map();
  for (const entry of [...history].reverse()) for (const row of entry.run.stages)
    if (row.saved?.json) stages.set(row.id, row);
  return { priorRun: { ...root.run, stages: [...stages.values()] },
    stateDirectory: root.run.stateDirectory ?? join(dirname(root.path), fixture.id) };
}

export async function main(argv) {
  const options = parseOptions(argv), seed = options.seed ?? randomBytes(8).toString('hex');
  const fixtures = CASES.filter(row => options.caseIds.includes(row.id)).sort((a, b) => hash(seed + a.id).localeCompare(hash(seed + b.id)));
  if (!options.live) {
    const plan = { live: false, maximumToolCalls: fixtures.length * 9, seed, fixtures: fixtures.map(row => ({
      id: row.id, depth: row.depth, participants: row.roles.length * row.participantsPerRole, fixtureSha256: hash(json(row)),
      selectedPublisher: { ...row.source, textSha256: hash(row.source.text), selection: 'bounded exact publisher excerpt' },
    })), note: 'No authentication, filesystem writes, network or inference. Explicit MCP integration only; desktop on/off routing is a separate benchmark.' };
    process.stdout.write(JSON.stringify(plan, null, 2) + '\n'); return plan;
  }
  const outputDir = await mkdtemp(join(tmpdir(), 'axwise-expanded-')), reportPath = join(outputDir, 'report.json');
  const report = { version: 1, kind: 'expanded-explicit-packaged-mcp', startedAt: new Date().toISOString(), options, seed,
    maximumToolCalls: fixtures.length * 9, naturalRoutingTested: false, liveInference: true, semanticAssessmentRequired: true,
    selectedPublisherEvidence: fixtures.map(fixture => ({ caseId: fixture.id, ...fixture.source,
      textSha256: hash(fixture.source.text), hashScope: 'exact selected excerpt, not full publisher page' })),
    safety: { harnessRetries: false, credentialsPersisted: false, uploadsOrDeployments: false },
    limitations: ['Two fixtures, one per depth; depth effects are confounded with cohort and task differences.',
      'Publisher excerpts document product capabilities, not market demand, measured prevalence or customer validation.',
      'Provider cache telemetry is recorded when present; cache policy/load is uncontrolled.',
      'Explicit tool selection cannot establish natural Goose routing or desktop speed superiority.',
      'Runtime repair attempts remain visible in modelStages; failed stages are not silently retried.',
      'Deterministic checks are not a complete semantic-quality judgment or release approval.'], runs: [], errorCode: null };
  if (options.resume) report.resumption = { sourceReport: options.resume, freshFullRun: false,
    reason: 'Explicit resume after benchmark corrections: count participant answers separately from interviewer prompts; map analysis normalized corpus through resolvedInput/sourceCatalogue. Prior reports remain unchanged.',
    alsoCorrected: 'Per-model-stage cache counters are at the stage top level; telemetry unavailable stays null.' };
  await save(join(outputDir, 'fixtures.json'), fixtures);
  try {
    const manifest = await readFile(join(options.resources, 'axwise-runtime/runtime-manifest.json'));
    report.runtimeManifestSha256 = hash(manifest); report.runtimeSource = JSON.parse(manifest).source;
    for (const fixture of fixtures) {
      const directory = join(outputDir, fixture.id); await mkdir(directory, { mode: 0o700 });
      const run = { caseId: fixture.id, depth: fixture.depth, fixtureSha256: hash(json(fixture)), stages: [] }; report.runs.push(run);
      let connection;
      try {
        const resume = options.resume ? await resumeHistory(options.resume, fixture) : null;
        const stateDirectory = resume?.stateDirectory ?? directory;
        const initialResults = resume ? await verifiedResume(fixture, resume.priorRun, join(stateDirectory, 'artifacts')) : new Map();
        run.stateDirectory = stateDirectory;
        run.reusedStageIds = [...initialResults.keys()];
        connection = await connect(options.resources, stateDirectory); run.setupMs = connection.setupMs;
        const listing = await connection.client.request('tools/list', {}, 20_000);
        ensure(TOOL_NAMES.every(name => listing.tools?.some(tool => tool.name === name)), 'PIPELINE_TOOLS_MISSING');
        Object.assign(run, await runCase({ fixture, ...connection, initialResults, timeoutMs: options.timeoutMs, onStage: async row => {
          run.stages.push(row); await save(join(directory, `${row.id}.json`), row); await save(reportPath, report);
          process.stdout.write(json({ caseId: fixture.id, depth: fixture.depth, stage: row.id, status: row.status, wallMs: row.wallMs,
            cache: row.cache, modelCalls: row.usage?.modelCalls ?? null, errorCode: row.errorCode }) + '\n');
        } }));
      } catch (error) { run.status = 'incomplete'; run.errorCode = safeError(error); }
      finally { connection?.client.close(); await save(reportPath, report); }
    }
  } catch (error) { report.errorCode = safeError(error); }
  finally { report.completedAt = new Date().toISOString(); await save(reportPath, report); process.stdout.write(`Expanded benchmark: ${reportPath}\n`); }
  if (report.errorCode || report.runs.some(run => run.status !== 'completed')) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`Expanded benchmark failed: ${safeError(error)}\n`); process.exitCode = 1; });
