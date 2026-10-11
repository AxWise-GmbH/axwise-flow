// Exercise the exact extracted standalone executable. Model replies are fixtures;
// this checks transport, admission, lineage, repairs and storage, not model quality.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const binary = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const child = spawn(binary, ['--workspace', output, '--state-dir', join(output, 'state'), '--session', 'packaged-probe'], {
  cwd: output, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin' }, stdio: ['pipe', 'pipe', 'pipe'],
});
const pending = new Map();
let sequence = 0, buffer = '', stderr = '';
child.stderr.on('data', data => { stderr += data; });
child.stdout.on('data', data => {
  buffer += data;
  for (;;) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const message = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    const item = pending.get(message.id);
    if (!item) continue;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  }
});
child.on('error', error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); });
function rpc(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}; ${stderr}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const call = (name, args) => rpc('tools/call', { name, arguments: args });
const advance = (request, payload) => call('advance_artifact', { requestId: request.requestId, stage: request.stage, payload });
const accepted = [];
const checks = [];
function content(result) {
  assert.equal(result.isError, false, JSON.stringify(result));
  return result.structuredContent;
}
function fixtureReview(request, failedCriterion) {
  const criteria = JSON.parse(request.userPrompt).requiredCriteria;
  return { checks: criteria.map(criterion => ({ criterion, passed: criterion !== failedCriterion,
    reason: criterion === failedCriterion ? 'The requested channel experiment is absent from this fixture draft.' : `Fixture assertion: ${criterion} was checked against the exact candidate, input, assigned identifiers and selected evidence.` })) };
}
async function save(tool, input, makeCandidate) {
  const request = content(await call(tool, input));
  assert.equal(request.status, 'model_request');
  const context = JSON.parse(request.userPrompt).resolvedContext;
  const candidate = typeof makeCandidate === 'function' ? makeCandidate(context) : makeCandidate;
  const review = content(await advance(request, candidate));
  assert.equal(review.stage, 'review', JSON.stringify(JSON.parse(review.userPrompt).repairDefects));
  const receipt = content(await advance(review, fixtureReview(review)));
  assert.equal(receipt.status, 'completed'); assert.equal(receipt.storageAccepted, true);
  const bytes = await readFile(receipt.artifactPath);
  assert.equal(bytes.length, receipt.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256);
  assert.equal(receipt.reference.sha256, receipt.sha256);
  assert.equal(receipt.provenance.engine, 'rust_standalone');
  assert.equal(receipt.provenance.managedJevAudit, false);
  assert.equal(receipt.qualityReview.passed, true);
  assert.ok((await readFile(receipt.markdownPath, 'utf8')).length > 50);
  accepted.push({ tool, reference: receipt.reference, bytes: receipt.bytes, hashVerified: true, markdownPath: receipt.markdownPath });
  return receipt;
}
const source = { id: 's1', title: 'Synthetic website fixture', text: 'Operators lose time copying handoff updates.', origin: 'web_source', url: 'https://example.com/fixture', retrievedAt: '2026-10-11T12:00:00Z' };
const role = { id: 'operators', label: 'Operators', description: 'People coordinating handoffs', participants: 1 };
const persona = { id: 'p1', stakeholderId: role.id, label: 'Test operator', description: 'A hypothetical operator coordinates daily handoffs and copies updates between team tools.', origin: 'synthetic', basis: 'evidence_informed_hypothesis', motivations: [{ text: 'Reduce repeated copying', basis: 'interpretation', evidence: [{ passageId: source.id }] }], painPoints: [{ text: source.text, basis: 'source_statement', evidence: [{ passageId: source.id }] }], traits: [], communicationStyle: 'Direct and practical', assumptions: ['This profile is a synthetic fixture.'] };
try {
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const catalog = await rpc('tools/list', {});
  assert.equal(catalog.tools.length, 9);
  checks.push('nine-tool catalog');
  for (const missing of ['url', 'retrievedAt']) {
    const invalid = { ...source }; delete invalid[missing];
    const result = await call('prepare_discovery', { brief: 'Fixture', sources: [invalid] });
    assert.equal(result.isError, true); assert.match(result.content[0].text, /web_source_identity_required/);
  }
  checks.push('missing web identity rejected before generation');
  const scope = await save('prepare_discovery', { brief: 'Investigate handoff delays.', sources: [source] }, {
    decision: 'Decide whether to pilot shared handoff updates', scope: ['Proposed pilot'], uncertainties: [{ id: 'u1', text: 'Does duplicate copying delay handoffs?' }],
    stakeholders: [{ id: role.id, label: role.label, description: role.description, questions: [{ id: 'q1', text: 'What delays the handoff?', uncertaintyId: 'u1' }] }],
    knownFacts: [{ sourceId: source.id, quote: source.text, basis: 'source_statement' }], gaps: ['No real interview was selected.'],
  });
  await save('research_market', { brief: 'Handoff pilot', questions: ['How many operators need this?'], references: [scope.reference] }, {
    gaps: [{ questionId: 'q-1', reason: 'The selected source provides no verified market size.' }], limitations: ['No live market retrieval in this fixture test.'],
  });
  const personas = await save('generate_personas', { brief: 'Operator hypothesis', stakeholders: [role], references: [scope.reference] }, { personas: [persona], limitations: ['A synthetic persona, not an observed participant.'] });
  const personaId = personas.artifact.personaIds[0];
  await save('chat_with_persona', { personaId, message: 'What would you test first?', references: [personas.reference] }, {
    personaId, origin: 'synthetic', basis: 'simulation_hypothesis', response: 'I would test whether a shared update reduces duplicate copying during one pilot handoff.',
  });
  const simulation = await save('simulate_interviews', { scenario: 'Explicit synthetic rehearsal', stakeholders: [{ ...role, questions: ['What delays the handoff?'] }], references: [scope.reference, personas.reference], seed: 7 }, context => ({
    participants: context.plan.map(slot => ({ ...slot, ...context.savedParticipants.find(p => p.participantId === slot.participantId), origin: 'synthetic' })),
    interviews: context.plan.map(slot => ({ participantId: slot.participantId, answers: [{ questionId: context.stakeholders[0].questionIds[0], text: 'Copying updates between team tools delays the daily handoff.' }] })),
  }));
  const analysis = await save('analyze_interviews', { decisionQuestion: 'Which handoff risk should the pilot test?', questions: ['What delays the handoff?'], references: [simulation.reference] }, context => {
    const turn = context.turns[0];
    return { quotes: [{ key: 'quote1', documentId: turn.documentId, turnId: turn.turnId, participantId: turn.participantId, start: 0, end: Buffer.byteLength(turn.text), text: turn.text }],
      findings: [{ key: 'f1', category: 'pain', statement: 'Test whether shared updates reduce handoff delays.', basis: 'simulation_hypothesis', supportStatus: 'supported', quoteKeys: ['quote1'], questionIds: context.questions.map(q => q.id), participantRefs: [{ documentId: turn.documentId, participantId: turn.participantId }] }], personas: [], gaps: [], limitations: ['Synthetic rehearsal; customer demand remains unknown.'] };
  });
  const prd = await save('create_prd', { brief: 'Pilot shared handoff updates; all proposed effects require real validation.', analysisArtifact: analysis.reference }, context => ({
    title: 'Handoff pilot PRD', sections: context.requiredSections.map(heading => ({ heading, items: [{ text: `Proposed ${heading}: test shared handoff updates with recorded pilot results before deciding to launch.`, basis: heading === 'Prioritized requirements' ? 'simulation_hypothesis' : 'proposal', sourceIds: heading === 'Prioritized requirements' ? context.analysis.sources.filter(s => s.origin === 'synthetic_transcript').map(s => s.id) : [], ...(heading === 'Prioritized requirements' ? { findingIds: ['f1'] } : {}) }] })),
  }));
  assert.equal(prd.artifact.input.analysisArtifact.operationId, analysis.operationId);
  checks.push('saved simulation → analysis → PRD reference chain');
  await save('create_delivery_brief', { references: [prd.reference] }, context => ({
    title: 'Proposed pilot delivery', requirements: context.requirements.map(r => ({ requirementId: r.id, acceptanceTests: [{ given: 'A selected pilot handoff', when: 'Shared updates are piloted', then: 'The original pilot condition is recorded before the launch decision', evidenceExpected: 'Recorded pilot results' }] })),
    conditionCoverage: context.conditions.map(c => ({ conditionId: c.id, status: 'deferred', requirementId: null, acceptanceTestIndex: null, reason: `Retained original condition: ${c.text}. Exact implementation and evaluation are deferred to the pilot owner.` })),
    milestones: [{ title: 'Pilot evaluation', requirementIds: context.requirements.map(r => r.id), deliverable: 'Recorded pilot results', exitCondition: 'The pilot owner reviews each condition and decides whether to launch' }],
  }));
  let request = content(await call('generate_personas', { brief: 'Repair fixture', stakeholders: [role], sources: [source] }));
  const badPersona = structuredClone(persona); badPersona.motivations[0].basis = 'source_statement';
  const repair = content(await advance(request, { personas: [badPersona], limitations: ['Synthetic fixture'] }));
  const repairPrompt = JSON.parse(repair.userPrompt);
  assert.ok(repairPrompt.repairDefects.includes('persona_claim_not_exact'));
  assert.match(repairPrompt.repairDefects.join(' '), /interpretation/);
  assert.equal(repair.storageAccepted, undefined);
  request = content(await advance(repair, { personas: [persona], limitations: ['Synthetic fixture'] }));
  assert.equal(request.stage, 'review');
  const repaired = content(await advance(request, fixtureReview(request))); assert.equal(repaired.storageAccepted, true);
  checks.push('paraphrase repair followed by fresh review');
  request = content(await call('create_prd', { brief: 'Include a channel experiment.' }));
  const context = JSON.parse(request.userPrompt).resolvedContext;
  const candidate = { title: 'Review rejection fixture', sections: context.requiredSections.map(heading => ({ heading, items: [{ text: `Proposed ${heading}: evaluate a pilot before launch.`, basis: 'proposal', sourceIds: [] }] })) };
  request = content(await advance(request, candidate));
  const failed = fixtureReview(request, 'answers_requested_questions');
  request = content(await advance(request, failed));
  assert.deepEqual(JSON.parse(request.userPrompt).previousReview, failed);
  request = content(await advance(request, candidate));
  const rejected = await advance(request, failed);
  assert.equal(rejected.isError, true); assert.match(rejected.content[0].text, /artifact_rejected/);
  checks.push('failed review reasons retained; second failed review rejects');
  const forged = await call('create_prd', { brief: 'Reference mismatch fixture', analysisArtifact: { ...analysis.reference, sha256: '0'.repeat(64) } });
  assert.equal(forged.isError, true); assert.match(forged.content[0].text, /scope_or_hash_mismatch/);
  checks.push('forged upstream hash rejected');
  const report = { passed: true, binary, server: initialized.serverInfo, modelReplies: 'synthetic fixtures; no live model used', accepted, checks };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, server: report.server, completedTools: accepted.map(a => a.tool), checks, report: join(output, 'report.json') }));
} finally {
  child.stdin.end();
  if (child.exitCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 1000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  for (const item of pending.values()) clearTimeout(item.timer);
}
