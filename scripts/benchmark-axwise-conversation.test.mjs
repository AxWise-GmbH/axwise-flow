import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, SAFETY, TRANSCRIPTS, parseOptions, assessTurn, readArtifacts, runTurns, runBenchmark, loadWorkspaceResource,
  authorizeFixtureMarkdownWrites, authorizeFixtureMarkdownReads, ConversationAcpClient } from './benchmark-axwise-conversation.mjs';
import { loadTypescriptParser } from './benchmark-goose-reset.mjs';
import { AXWISE_TOOL_CALLBACKS, expectedSpecialistInventory, benchmarkPermission,
  hasSpecialistInvocation, confirmedSpecialistExecution } from './benchmark-local-axwise.mjs';

const typescriptPath = fileURLToPath(new URL('../frontend/node_modules/typescript/lib/typescript.js', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const clean = (overrides = {}) => ({ status: 'completed', markdown: 'A useful answer.', tools: [], permissionDenials: [], sourceUrls: [], ...overrides });
const artifact = (tool = 'analyze_interviews', overrides = {}) => ({ path: `/isolated/${tool}.json`, valid: true,
  operationId: randomUUID(), sha256: 'a'.repeat(64), tool, selectedInput: { transcripts: structuredClone(TRANSCRIPTS) }, ...overrides });
const invocation = (tool = 'analyze_interviews', status = 'completed') => ({ name: `axwise-local__${tool}`, status, input: {} });
const turn = (id) => SCENARIOS.flatMap((s) => s.turns).find((item) => item.id === id);

test('all user fixtures are natural, bounded; defaults require live opt-in', () => {
  for (const scenario of SCENARIOS) for (const entry of scenario.turns) {
    assert.doesNotMatch(entry.prompt, /axwise|analyze_interviews|create_prd|simulate_interviews|prepare_discovery|generate_personas|chat_with_persona|research_market|create_delivery_brief|AxwiseLocal/);
    assert.ok(entry.prompt.length < 8000);
  }
  assert.doesNotMatch(SAFETY, /axwise/i);
  assert.equal(parseOptions([]).live, false);
  assert.equal(parseOptions(['--scenario', 'news_deeper', '--repeats', '1']).scenario, 'news_deeper');
  assert.equal(parseOptions(['--scenario', 'news_deeper,brainstorm']).scenario, 'news_deeper,brainstorm');
  assert.throws(() => parseOptions(['--scenario', 'news_deeper', '--scenario', 'brainstorm']), /Duplicate --scenario/);
  assert.throws(() => parseOptions(['--scenario', 'news_deeper', '--scenario', 'news_deeper']), /Duplicate --scenario/);
  assert.throws(() => parseOptions(['--scenario', '']));
  assert.throws(() => parseOptions(['--scenario', 'unknown']));
  assert.throws(() => parseOptions(['--scenario']));
  assert.throws(() => parseOptions(['--specialist-mode', 'explicit']));
  assert.throws(() => parseOptions(['--arms', 'off']));
  assert.throws(() => parseOptions(['--repeats', '0']));
});

test('no model or filesystem work without explicit live opt-in', async () => {
  await assert.rejects(runBenchmark({ live: false }), /require --live/);
});

test('positive analysis requires actual confirmed call, valid artifact and exact synthetic lineage', () => {
  const input = turn('analysis'), saved = artifact();
  const row = clean({ tools: [invocation()] });
  assert.equal(assessTurn(input, row, [saved], []).passed, true);
  assert.equal(assessTurn(input, clean(), [], []).passed, false);
  assert.equal(assessTurn(input, row, [], []).passed, false);
  assert.equal(assessTurn(input, row, [{ ...saved, valid: false }], []).passed, false);
  for (const property of ['origin', 'text', 'questionId', 'speaker']) {
    const changed = structuredClone(saved);
    if (property === 'origin') changed.selectedInput.transcripts[0].origin = 'supplied_transcript';
    else changed.selectedInput.transcripts[0].turns[0][property] = 'changed';
    assert.equal(assessTurn(input, row, [changed], []).sourcePreserved, false, property);
  }
  const extra = structuredClone(saved);
  extra.selectedInput.transcripts[0].turns.push({ role: 'interviewer', text: 'Invented turn' });
  assert.equal(assessTurn(input, row, [extra], []).passed, false);
});

test('PRD resume requires exact previously saved analysis ID and file SHA; fresh analysis does not pass', () => {
  const earlier = artifact();
  const saved = artifact('create_prd', { analysisReference: { operationId: earlier.operationId, sha256: earlier.sha256 } });
  const row = clean({ tools: [invocation('create_prd')] });
  assert.equal(assessTurn(turn('return_to_prd'), row, [saved], [earlier]).passed, true);
  assert.equal(assessTurn(turn('return_to_prd'), row, [{ ...saved, analysisReference: null, references: [saved.analysisReference] }], [earlier]).passed, true);
  assert.equal(assessTurn(turn('return_to_prd'), row, [{ ...saved, analysisReference: null, references: [{ ...saved.analysisReference, sha256: '0'.repeat(64) }] }], [earlier]).passed, false);
  assert.equal(assessTurn(turn('return_to_prd'), row, [{ ...saved, analysisReference: null, references: [saved.analysisReference] }], [{ ...earlier, tool: 'prepare_discovery' }]).matchingReference, false);
  assert.equal(assessTurn(turn('return_to_prd'), row, [{ ...saved, analysisReference: null, references: saved.analysisReference }], [earlier]).matchingReference, false);
  assert.equal(assessTurn(turn('return_to_prd'), row, [saved], []).passed, false);
  assert.equal(assessTurn(turn('return_to_prd'), row, [saved, artifact()], [earlier]).passed, false);
  for (const field of ['operationId', 'sha256']) {
    const changed = structuredClone(saved); changed.analysisReference[field] = 'wrong';
    assert.equal(assessTurn(turn('return_to_prd'), row, [changed], [earlier]).matchingReference, false);
  }
});

test('negative cases reject proposals, denied calls, saved artifacts and provider failures', () => {
  const entry = turn('brainstorm');
  assert.equal(assessTurn(entry, clean(), [], []).passed, true);
  for (const status of ['completed', 'failed', 'pending', 'in_progress']) {
    assert.equal(assessTurn(entry, clean({ tools: [invocation('create_prd', status)] }), [], []).passed, false);
  }
  assert.equal(assessTurn(entry, clean(), [artifact()], []).passed, false);
  assert.equal(assessTurn(entry, clean({ permissionDenials: [{ title: 'shell' }] }), [], []).passed, false);
  for (const markdown of ['', 'Ran into this error: gateway timeout', 'I could not complete the request.', 'No artifact was saved.']) {
    assert.equal(assessTurn(entry, clean({ markdown }), [], []).passed, false, markdown);
  }
  assert.equal(assessTurn(entry, clean({ artifactReadError: 'bad file' }), [], []).passed, false);
  assert.equal(assessTurn(entry, clean({ status: 'failed' }), [], []).passed, false);
});

test('news needs links and ambiguous deeper needs a clarification, not a stub success', () => {
  assert.equal(assessTurn(turn('news'), clean(), [], []).passed, false);
  assert.equal(assessTurn(turn('news'), clean({ sourceUrls: ['https://example.org/news'] }), [], []).passed, true);
  assert.equal(assessTurn(turn('news'), clean({ markdown: "I couldn't verify the current news.", sourceUrls: ['https://example.org/news'] }), [], []).passed, false);
  assert.equal(assessTurn(turn('ambiguous'), clean(), [], []).passed, false);
  assert.equal(assessTurn(turn('ambiguous'), clean({ markdown: 'Which topic would you like to explore further?' }), [], []).passed, true);
});

test('same session retained across every natural turn; safety text only on first turn', async () => {
  const calls = [], observed = [];
  const scenario = SCENARIOS.find((s) => s.id === 'brainstorm');
  const client = { async request(method, params) {
    calls.push({ method, params }); this.recorder.text = 'Useful answer.'; return { stopReason: 'end_turn' };
  }, async stop() { throw new Error('Must not stop a successful conversation between turns'); } };
  const resource = { type: 'resource', resource: { uri: 'orqaly://conversation/same-session/desktop-routing', text: 'Actual production resource placeholder for unit test.' } };
  const rows = await runTurns({ client, sessionId: 'same-session', scenario, timeoutSeconds: 10, onRow: (row) => observed.push(row), resourceFor: () => resource });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.params.sessionId === 'same-session'));
  assert.ok(calls[0].params.prompt[1].text.startsWith(SAFETY));
  assert.equal(calls[1].params.prompt[1].text, scenario.turns[1].prompt);
  assert.ok(calls.every((call) => call.params.prompt[0] === resource));
  assert.equal(rows.length, 2); assert.equal(observed.length, 2);
  assert.ok(rows.every((row) => row.checks.passed));
});

test('full eight-tool inventory rejects missing, duplicated and unknown tools', () => {
  assert.equal(AXWISE_TOOL_CALLBACKS.size, 8);
  const tools = [...AXWISE_TOOL_CALLBACKS.values()].map((name) => ({ name }));
  assert.equal(expectedSpecialistInventory({ tools }), true);
  assert.equal(expectedSpecialistInventory({ tools: tools.slice(0, 3) }), false);
  assert.equal(expectedSpecialistInventory({ tools: [...tools.slice(0, 7), tools[0]] }), false);
  assert.equal(expectedSpecialistInventory({ tools: [...tools, { name: 'axwise-local__unknown' }] }), false);
  assert.equal(expectedSpecialistInventory({ tools: [] }, false), true);
  assert.equal(expectedSpecialistInventory({ tools }, false), false);
});

test('all eight direct and Code Mode operations are permitted and classified without treating discovery as execution', () => {
  const parser = loadTypescriptParser(typescriptPath);
  for (const [callback, name] of AXWISE_TOOL_CALLBACKS) {
    const input = { code: `async function run(){ return await ${callback}({brief:"synthetic"}); }` };
    assert.equal(benchmarkPermission({ name, rawInput: { brief: 'synthetic' } }, '/tmp/fixture', parser), true, name);
    assert.equal(benchmarkPermission({ name: 'execute_typescript', rawInput: input }, '/tmp/fixture', parser), true, callback);
    assert.equal(hasSpecialistInvocation({ name, status: 'completed' }, parser), true);
    assert.equal(confirmedSpecialistExecution({ name, status: 'completed' }), true);
    const wrapper = { name: 'execute_typescript', input, status: 'completed' };
    assert.equal(hasSpecialistInvocation(wrapper, parser), true, callback);
    assert.equal(confirmedSpecialistExecution(wrapper), false, 'wrapper success alone is not nested execution');
    wrapper.result = 'Code Executed Successfully: true\nSaved local Axwise JSON artifact: /tmp/00000000-0000-4000-8000-000000000000.json';
    assert.equal(confirmedSpecialistExecution(wrapper), true);
    assert.equal(hasSpecialistInvocation({ name: 'list_functions', result: callback }, parser), false);
  }
});

test('fixture Markdown permissions allow new root files only and reserve bounded names and bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conversation-write-test-'));
  const parser = loadTypescriptParser(typescriptPath);
  const call = (path, content = '# Synthetic analysis', extra = {}) => ({ title: `write · ${path}`, rawInput: { path, content, ...extra } });
  try {
    await writeFile(join(root, 'README.md'), 'Original fixture');
    await writeFile(join(root, 'existing.md'), 'Existing output');
    await symlink(join(root, 'missing-target.md'), join(root, 'link.md'));
    const approved = new Map();
    assert.equal(await authorizeFixtureMarkdownWrites(call('interview_analysis.md'), root, approved, parser), true);
    assert.equal(await authorizeFixtureMarkdownWrites(call('interview_analysis.md'), root, approved, parser), false, 'cannot reserve a name twice even before the tool writes');
    for (const path of ['README.md', 'readme.md', 'existing.md', 'link.md', 'src/result.md', '../outside.md', '/tmp/outside.md', '.hidden.md', 'code.js', 'file.md\0', 'a\\b.md']) {
      assert.equal(await authorizeFixtureMarkdownWrites(call(path), root, approved, parser), false, path);
    }
    assert.equal(await authorizeFixtureMarkdownWrites(call('extra.md', 'text', { overwrite: true }), root, approved, parser), false);
    assert.equal(await authorizeFixtureMarkdownWrites(call('large.md', 'é'.repeat(32_001)), root, approved, parser), false);
    assert.equal(await authorizeFixtureMarkdownWrites(call('empty.md', ''), root, approved, parser), false);
    for (let i = 1; i < 8; i++) assert.equal(await authorizeFixtureMarkdownWrites(call(`allowed-${i}.md`), root, approved, parser), true);
    assert.equal(await authorizeFixtureMarkdownWrites(call('ninth.md'), root, approved, parser), false);
    const bytes = new Map();
    for (let i = 0; i < 4; i++) assert.equal(await authorizeFixtureMarkdownWrites(call(`bytes-${i}.md`, 'x'.repeat(64_000)), root, bytes, parser), true);
    assert.equal(await authorizeFixtureMarkdownWrites(call('overflow.md'), root, bytes, parser), false);
    assert.equal(await authorizeFixtureMarkdownWrites(call(join(root, 'Interview Analysis.v1.md')), root, new Map(), parser), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Code Mode Markdown writes retain static-call grammar and reject mixed unsafe operations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conversation-code-write-test-'));
  const parser = loadTypescriptParser(typescriptPath);
  const check = (code, reservations = new Map()) => authorizeFixtureMarkdownWrites({ name: 'execute_typescript', rawInput: { code } }, root, reservations, parser);
  try {
    assert.equal(await check('async function run(){ const result=await Developer.write({path:"analysis.md",content:"# Synthetic finding"}); return result; }'), true);
    assert.equal(await check('async function run(){ return await Write.write({path:"other.md",content:"# Result"}); }'), true);
    for (const code of [
      'async function run(){ await Developer.write({path:"README.md",content:"overwrite"}); }',
      'async function run(){ await Developer.write({path:"same.md",content:"first"}); await Developer.write({path:"same.md",content:"second"}); }',
      'async function run(){ await Developer.write({path:"safe.md",content:"x"}); await Developer.shell({command:"git push"}); }',
      'async function run(){ await Developer.write({path:"safe.md",content:await fetch("https://example.org")}); }',
    ]) assert.equal(await check(code), false, code);
    const concurrent = new Map();
    const code = 'async function run(){ await Developer.write({path:"race.md",content:"one"}); }';
    assert.deepEqual((await Promise.all([check(code, concurrent), check(code, concurrent)])).sort(), [false, true]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('generated Markdown verification accepts only exact read commands for existing reserved fixture outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conversation-read-output-test-'));
  const parser = loadTypescriptParser(typescriptPath), reservations = new Map();
  const check = (command, extra = {}) => authorizeFixtureMarkdownReads({ title: `shell · ${command}`, rawInput: { command, ...extra } }, root, reservations, parser);
  try {
    for (const filename of ['analysis.md', 'Interview Analysis.md']) {
      const rawInput = { path: filename, content: '# Synthetic findings' };
      assert.equal(await authorizeFixtureMarkdownWrites({ name: 'write', rawInput }, root, reservations, parser), true);
      assert.equal(await check(`cat '${filename}'`), false, 'a reservation is not a saved file');
      await writeFile(join(root, filename), rawInput.content);
      for (const command of ['ls -lh', 'wc -c', 'cat']) {
        assert.equal(await check(`${command} '${filename}'`), true);
        assert.equal(await check(`${command} "${join(root, filename)}"`), true);
      }
    }
    for (const command of ['ls -lh', 'wc -c', 'cat']) {
      assert.equal(await check(`${command} analysis.md`), true);
      assert.equal(await check(`${command} ${join(root, 'analysis.md')}`), true);
    }
    for (const command of [
      'ls -la analysis.md', 'ls -lh -- analysis.md', 'cat -n analysis.md', 'wc -w analysis.md',
      'cat README.md', 'cat unknown.md', 'cat ../analysis.md', 'cat /etc/passwd',
      'cat analysis.md other.md', 'cat analysis.md | head', 'cat analysis.md; pwd',
      'cat analysis.md && pwd', 'cat analysis.md > copied.md', 'cat $(pwd)/analysis.md',
      'cat `pwd`/analysis.md', 'cat analysis.md\npwd', 'cat analysis*',
      'cat Interview Analysis.md', ' cat analysis.md', 'cat analysis.md ',
    ]) assert.equal(await check(command), false, command);
    assert.equal(await check('cat analysis.md', { cwd: '/etc' }), false);
    const row = reservations.get('analysis.md');
    await rm(row.path);
    await symlink(join(root, 'Interview Analysis.md'), row.path);
    assert.equal(await check('cat analysis.md'), false, 'do not follow a replaced output symlink');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Code Mode output checks retain strict callbacks and cannot add arbitrary reads or chained commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conversation-code-read-test-'));
  const parser = loadTypescriptParser(typescriptPath), reservations = new Map();
  const check = (code) => authorizeFixtureMarkdownReads({ name: 'execute_typescript', rawInput: { code } }, root, reservations, parser);
  try {
    await authorizeFixtureMarkdownWrites({ name: 'write', rawInput: { path: 'analysis.md', content: '# Synthetic findings' } }, root, reservations, parser);
    await writeFile(join(root, 'analysis.md'), '# Synthetic findings');
    assert.equal(await check('async function run(){ const result=await Developer.shell({command:"ls -lh analysis.md"}); return result.stdout; }'), true);
    assert.equal(await check('async function run(){ await Developer.shell({command:"wc -c analysis.md"}); return await Developer.shell({command:"cat analysis.md"}); }'), true);
    for (const code of [
      'async function run(){ await Developer.shell({command:"cat analysis.md; cat /etc/passwd"}); }',
      'async function run(){ await Developer.shell({command:"cat analysis.md"}); await Developer.shell({command:"cat /etc/passwd"}); }',
      'async function run(){ const result=await Developer.shell({command:"cat analysis.md"}); return eval(result.stdout); }',
      'async function run(){ await Developer.shell({command:"cat unknown.md"}); }',
    ]) assert.equal(await check(code), false, code);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native fixture-write approval does not fail a session, while routing failure stays visible across later turns', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conversation-native-write-test-'));
  try {
    const replies = [];
    const permissionClient = Object.assign(Object.create(ConversationAcpClient.prototype), {
      workspace: root, parser: loadTypescriptParser(typescriptPath), fixtureWriteReservations: new Map(),
      recorder: null, send: (response) => replies.push(response),
      fail: () => { throw new Error('Allowed fixture write must not fail session'); },
    });
    await permissionClient.onRequest({ id: 17, method: 'session/request_permission', params: {
      toolCall: { title: 'write · interview_analysis.md', rawInput: { path: 'interview_analysis.md', content: '# Synthetic finding' } },
      options: [{ kind: 'allow_once', optionId: 'permit' }, { kind: 'reject_once', optionId: 'deny' }],
    } });
    assert.equal(replies[0].result.outcome.optionId, 'permit');
    await writeFile(join(root, 'interview_analysis.md'), '# Synthetic finding');
    await permissionClient.onRequest({ id: 18, method: 'session/request_permission', params: {
      toolCall: { title: 'shell · ls -lh interview_analysis.md', rawInput: { command: 'ls -lh interview_analysis.md' } },
      options: [{ kind: 'allow_once', optionId: 'permit-read' }, { kind: 'reject_once', optionId: 'deny' }],
    } });
    assert.equal(replies[1].result.outcome.optionId, 'permit-read');
    let calls = 0;
    const client = { async request() {
      this.recorder.text = calls === 0 ? 'Saved interview_analysis.md.' : 'Current source https://example.org/news';
      if (calls === 0) this.recorder.tools.set('native', { title: 'write · interview_analysis.md', status: 'completed', input: { path: 'interview_analysis.md', content: '# Synthetic finding' } });
      calls++; return { stopReason: 'end_turn' };
    }, async stop() { throw new Error('Wrong routing must not terminate observation'); } };
    const rows = await runTurns({ client, sessionId: 'same', scenario: SCENARIOS[0], timeoutSeconds: 10 });
    assert.equal(calls, 4);
    assert.equal(rows[0].checks.passed, false);
    assert.equal(rows[0].checks.matchingOperation, false);
    assert.equal(rows[0].checks.axwiseUsed, false);
    assert.equal(rows[1].checks.passed, true);
    assert.equal(rows[2].checks.passed, true);
    assert.equal(rows[3].checks.passed, false);
    assert.ok(rows.every((row) => row.failurePhase === null));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('desktop guidance is loaded from actual TypeScript sources rather than duplicated benchmark text', async () => {
  const parser = loadTypescriptParser(typescriptPath);
  const root = await mkdtemp(join(tmpdir(), 'conversation-resource-test-'));
  try {
    const path = join(root, 'workspace.ts');
    await writeFile(join(root, 'replyQuestionPrompt.ts'), 'export function engineeringInstruction(capabilities: { nativeGemsEnabled: boolean }) { return capabilities.nativeGemsEnabled ? "native" : "disabled"; }');
    await writeFile(path, 'import { engineeringInstruction } from "./replyQuestionPrompt"; export function workspacePromptResource(state: {sessionId: string}, capabilities: {nativeGemsEnabled: boolean}) { return { type: "resource", resource: { text: engineeringInstruction(capabilities), uri: state.sessionId } }; }');
    const loaded = await loadWorkspaceResource(path, parser);
    assert.deepEqual(loaded.resourceFor('same'), { type: 'resource', resource: { text: 'disabled', uri: 'same' } });
    assert.match(loaded.sourceHashes.workspace, /^[a-f0-9]{64}$/);
    await writeFile(path, 'import { engineeringInstruction } from "./replyQuestionPrompt"; import fs from "unapproved-module"; export function workspacePromptResource() { return [engineeringInstruction({nativeGemsEnabled: false}), fs]; }');
    await assert.rejects(loadWorkspaceResource(path, parser), /WORKSPACE_IMPORT_NOT_ALLOWED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('whole discovery/news/deeper/resume scenario uses same session and frozen reference', async () => {
  const scenario = SCENARIOS[0], savedAnalysis = artifact(), savedPrd = artifact('create_prd');
  savedPrd.analysisReference = { operationId: savedAnalysis.operationId, sha256: savedAnalysis.sha256 };
  const calls = []; let allArtifacts = [];
  const client = { async request(method, params) {
    const entry = scenario.turns[calls.length]; calls.push(params.sessionId);
    this.recorder.text = 'Answer with source https://example.org/news';
    if (entry.expectedOperation !== 'none') {
      this.recorder.tools.set('call', invocation(entry.expectedOperation));
      allArtifacts = entry.expectedOperation === 'analyze_interviews' ? [savedAnalysis] : [savedAnalysis, savedPrd];
    }
    return { stopReason: 'end_turn' };
  }, async stop() {} };
  const rows = await runTurns({ client, sessionId: 'same', scenario, timeoutSeconds: 10, artifacts: async () => allArtifacts });
  assert.deepEqual(calls, ['same', 'same', 'same', 'same']);
  assert.ok(rows.every((row) => row.checks.passed));
  assert.equal(rows[1].checks.axwiseProposed, false);
  assert.equal(rows[2].checks.axwiseProposed, false);
  assert.equal(rows[3].checks.matchingReference, true);
});

test('timeout or permission failure stops client and records every remaining turn as not started', async () => {
  for (const message of ['ACP deadline exceeded: session/prompt', 'MANUAL_APPROVAL_REQUIRED: forbidden']) {
    let calls = 0, stopped = 0;
    const client = { async request() { calls++; throw new Error(message); }, async stop(id) { assert.equal(id, 'session'); stopped++; } };
    const rows = await runTurns({ client, sessionId: 'session', scenario: SCENARIOS[0], timeoutSeconds: 10 });
    assert.equal(calls, 1); assert.equal(stopped, 1); assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => !row.checks.passed));
    assert.ok(rows.slice(1).every((row) => row.failurePhase === 'not_started'));
  }
});

test('token-like errors and outputs are redacted before callbacks or returned reports', async () => {
  const secret = 'private-token-should-never-be-persisted';
  const client = { async request() { this.recorder.text = secret; throw new Error(`Failed ${secret}`); }, async stop() {} };
  const seen = [];
  const rows = await runTurns({ client, sessionId: 'session', scenario: SCENARIOS[4], timeoutSeconds: 10, secrets: [secret], onRow: (row) => seen.push(row) });
  assert.ok(!JSON.stringify(rows).includes(secret)); assert.ok(!JSON.stringify(seen).includes(secret));
});

test('artifact scanner validates scope, hashes and quality without following unrelated filenames or symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conversation-artifacts-test-'));
  try {
    const accountHash = 'a'.repeat(64), conversationId = 'fixture', operationId = randomUUID();
    const selectedInput = { transcripts: TRANSCRIPTS }, artifactValue = { findings: [] };
    const record = { version: 'axwise.local-artifact.v2', operationId, accountHash, conversationId, tool: 'analyze_interviews',
      validation: { valid: true }, qualityReview: { passed: true }, selectedInput, artifact: artifactValue,
      inputSha256: hash(JSON.stringify(selectedInput)), artifactSha256: hash(JSON.stringify(artifactValue)) };
    const file = join(root, `${operationId}.json`);
    await writeFile(file, JSON.stringify(record));
    await writeFile(join(root, 'ignore.json'), '{ invalid json');
    await symlink(file, join(root, `${randomUUID()}.json`));
    const found = await readArtifacts(root, accountHash, conversationId);
    assert.equal(found.length, 1); assert.equal(found[0].valid, true);
    assert.equal(found[0].sha256, hash(JSON.stringify(record)));
    const references = [{ operationId: randomUUID(), sha256: 'b'.repeat(64) }];
    await writeFile(file, JSON.stringify({ ...record, references }));
    const referenced = await readArtifacts(root, accountHash, conversationId);
    assert.equal(referenced[0].valid, true);
    assert.deepEqual(referenced[0].references, references);
    for (const invalid of [references[0], [{ ...references[0], sha256: 'invented' }], [{ ...references[0], text: 'Retyped findings' }]]) {
      await writeFile(file, JSON.stringify({ ...record, references: invalid }));
      assert.equal((await readArtifacts(root, accountHash, conversationId))[0].valid, false);
    }
    await writeFile(file, JSON.stringify(record));
    assert.equal((await readArtifacts(root, accountHash, 'wrong'))[0].valid, false);
    await writeFile(file, JSON.stringify({ ...record, qualityReview: { passed: false } }));
    assert.equal((await readArtifacts(root, accountHash, conversationId))[0].valid, false);
    await writeFile(file, JSON.stringify({ ...record, inputSha256: 'b'.repeat(64) }));
    assert.equal((await readArtifacts(root, accountHash, conversationId))[0].valid, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
