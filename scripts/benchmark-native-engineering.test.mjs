import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MODEL, EFFORT, MAX_HTTP_CALLS, NATIVE_TOOLS, PROMPT, SOURCE, TEST, benchmarkPlan, parseOptions, validateResume, modelEvidence, permissionPolicyFingerprint, benchmarkExitCode,
  fixturePermission, canonicalToolName, childEnvironment, providerConfig,
  startForwarder, offlineAcceptanceCalibration, NativeAcpClient, NativeRecorder, treatmentEvidence,
} from './benchmark-native-engineering.mjs';

const workspace = '/tmp/native-fixture';
const digest = 'a'.repeat(64), anchor = `1:${digest}`;
const edit = { path: 'average.ts', expected_sha256: digest, edits: [{ start_line: 1, end_line: 1, start_anchor: anchor, end_anchor: anchor, replacement: 'new\n' }], test_command: ['node', '--test', 'average.test.mjs'] };

test('fixed 3.8 Flash/high contract, eight counterbalanced turns and bounded CLI options', () => {
  assert.equal(MODEL, 'gemini-3.8-flash'); assert.equal(EFFORT, 'high'); assert.equal(MAX_HTTP_CALLS, 120);
  const plan = benchmarkPlan(); assert.equal(plan.length, 8);
  assert.equal(new Set(plan.map((row) => `${row.native}/${row.loop}`)).size, 4);
  assert.deepEqual(plan.slice(4).map((row) => row.id), plan.slice(0, 4).map((row) => row.id).reverse());
  assert.equal(providerConfig('http://127.0.0.1').models[0].name, MODEL);
  assert.equal(providerConfig('http://127.0.0.1').models[0].request_params.reasoning_effort, 'high');
  assert.throws(() => parseOptions(['--model', 'gemini-3-flash-preview']));
  assert.throws(() => parseOptions(['--live', '--preflight']));
  assert.throws(() => parseOptions(['--live']));
  assert.throws(() => parseOptions(['--timeout-seconds', '900']));
  assert.throws(() => parseOptions(['--goose', './goose']));
  assert.equal(parseOptions(['--preflight', '--runtime', '/tmp/runtime']).live, false);
});

test('resume retains failed rows and subtracts prior paid calls, but rejects changed contract or runtime', () => {
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const plan = benchmarkPlan();
  const report = { schemaVersion: 'native-engineering-benchmark.v1', live: true, permissionPolicySha256: permissionPolicyFingerprint(), model: { requested: MODEL, requestedEffort: EFFORT }, promptSha256: hash(PROMPT), sourceSha256: hash(SOURCE), testSha256: hash(TEST), plan, binaries: { goose: { sha256: 'goose-hash' }, node: { sha256: 'node-hash' } }, languageServers: { manifestSha256: 'manifest-hash' }, rows: plan.slice(0, 2).map((row) => ({ arm: row.id, native: row.native, loop: row.loop, repetition: row.repetition, status: 'failed', primaryRequests: [{ forwarded: true, requestModel: MODEL, requestEffort: EFFORT, httpStatus: 200, returnedModels: [MODEL] }] })) };
  const current = { gooseSha256: 'goose-hash', nodeSha256: 'node-hash', languageServers: report.languageServers, timeoutSeconds: 240 };
  const resumed = validateResume(report, current);
  assert.equal(resumed.used, 2); assert.equal(resumed.keys.size, 2);
  const interruptedStream = structuredClone(report); interruptedStream.rows[1].primaryRequests[0].error = 'PROVIDER_FORWARD_FAILED';
  assert.equal(validateResume(interruptedStream, current).used, 2);
  for (const change of [
    (r) => { r.promptSha256 = 'changed'; },
    (r) => { r.permissionPolicySha256 = 'changed'; },
    (r) => { delete r.permissionPolicySha256; },
    (r) => { r.model.requested = 'other'; },
    (r) => { r.binaries.goose.sha256 = 'other'; },
    (r) => { r.languageServers.manifestSha256 = 'other'; },
    (r) => { r.rows.reverse(); },
    (r) => { r.rows[0].primaryRequests[0].httpStatus = 400; },
    (r) => { r.rows[0].primaryRequests[0].returnedModels = ['other']; },
    (r) => { r.rows[0].primaryRequests = null; },
    (r) => { r.rows[0].primaryRequests = Array.from({ length: 120 }, () => r.rows[0].primaryRequests[0]); },
  ]) { const candidate = structuredClone(report); change(candidate); assert.throws(() => validateResume(candidate, current)); }
  assert.throws(() => validateResume(report, { ...current, timeoutSeconds: 300 }));
});

test('recovered transient HTTP errors preserve identity verification while missing or wrong successful identities fail', () => {
  const success = { forwarded: true, requestModel: MODEL, requestEffort: EFFORT, httpStatus: 200, returnedModels: [MODEL] };
  for (const httpStatus of [429, 503]) assert.equal(modelEvidence([{ ...success, httpStatus, returnedModels: [] }, success]), true);
  assert.equal(modelEvidence([{ ...success, returnedModels: [] }]), false);
  assert.equal(modelEvidence([{ ...success, returnedModels: ['wrong'] }]), false);
  assert.equal(modelEvidence([{ ...success, httpStatus: 503, requestModel: 'wrong', returnedModels: [] }, success]), false);
  assert.equal(modelEvidence([{ ...success, httpStatus: 503, requestEffort: 'low', returnedModels: [] }, success]), false);
  assert.equal(modelEvidence([{ ...success, httpStatus: 503, returnedModels: [] }]), false);
  assert.equal(modelEvidence([{ ...success, httpStatus: 400, returnedModels: [] }, success]), false);
});

test('CLI exit status fails unaccepted or unfinished runs and fingerprints the actual permission policy', () => {
  const accepted = benchmarkPlan().map((arm) => ({ arm: arm.id, native: arm.native, loop: arm.loop, repetition: arm.repetition, accepted: true }));
  assert.equal(benchmarkExitCode({ live: true, rows: accepted }), 0);
  assert.equal(benchmarkExitCode({ live: true, rows: accepted.slice(0, 7) }), 1);
  assert.equal(benchmarkExitCode({ live: true, rows: accepted.map((row, index) => index === 1 ? { ...row, accepted: false } : row) }), 1);
  assert.equal(benchmarkExitCode({ live: true, rows: [...accepted].reverse() }), 1);
  const preflight = accepted.slice(0, 4).map((row) => ({ ...row, status: 'preflight_passed', primaryRequests: [] }));
  assert.equal(benchmarkExitCode({ live: false, rows: preflight }), 0);
  assert.equal(benchmarkExitCode({ live: false, rows: preflight.map((row, index) => index === 0 ? { ...row, primaryRequests: [{}] } : row) }), 1);
  assert.match(permissionPolicyFingerprint(), /^[a-f0-9]{64}$/);
  assert.equal(permissionPolicyFingerprint(), permissionPolicyFingerprint());
});

test('permission policy bounds files, argv, digest and treatment, rejecting shell escapes', () => {
  assert(fixturePermission('safe_edit_and_test', edit, workspace, true));
  for (const path of ['../average.ts', '/etc/passwd', 'README.md', 'average.ts\0']) assert(!fixturePermission('safe_edit_and_test', { ...edit, path }, workspace, true));
  for (const test_command of [['sh', '-c', 'node --test average.test.mjs'], ['node', '--test', 'average.test.mjs', 'other.mjs'], ['node', '-e', 'anything']]) assert(!fixturePermission('safe_edit_and_test', { ...edit, test_command }, workspace, true));
  assert(!fixturePermission('safe_edit_and_test', { ...edit, expected_sha256: 'short' }, workspace, true));
  assert(!fixturePermission('safe_edit_and_test', { ...edit, timeout_secs: 601 }, workspace, true));
  assert(!fixturePermission('safe_edit_and_test', edit, workspace, false));
  assert(fixturePermission('hashline_edit', { action: 'read', path: 'average.ts' }, workspace, true));
  assert(!fixturePermission('hashline_edit', { ...edit, action: 'edit' }, workspace, true));
  assert(fixturePermission('developer__edit', { path: 'average.ts' }, workspace, false));
  assert(!fixturePermission('developer__edit', { path: 'average.ts' }, workspace, true));
  assert(fixturePermission('developer__shell', { command: 'node --test average.test.mjs' }, workspace, false));
  for (const command of ['node --test average.test.mjs; touch marker', 'cat $(echo average.ts)', 'cat /etc/passwd', 'curl example.com', 'node --test average.test.mjs &']) assert(!fixturePermission('developer__shell', { command }, workspace, false));
  assert(!fixturePermission('execute_typescript', { code: 'anything' }, workspace, true));
});

test('canonical metadata survives ACP labels and permissions use trusted original tool name', async () => {
  const inventory = [...NATIVE_TOOLS, 'developer__shell'];
  assert.equal(canonicalToolName('developer: shell', inventory), 'developer__shell');
  assert.equal(canonicalToolName('safe_edit_and_test', inventory), 'safe_edit_and_test');
  assert.equal(canonicalToolName('invented tool', inventory), null);
  const sent = [], failures = [];
  const fake = { workspace, nativeEnabled: true, toolInventory: inventory, recorder: new NativeRecorder(), send: (value) => sent.push(value), fail: (value) => failures.push(value) };
  await NativeAcpClient.prototype.onRequest.call(fake, { id: 1, method: 'session/request_permission', params: { toolCall: { toolCallId: 'x', title: 'Unrelated friendly title', _meta: { goose: { toolCall: { toolName: 'safe_edit_and_test' } } }, rawInput: edit }, options: [{ kind: 'allow_once', optionId: 'yes' }, { kind: 'reject_once', optionId: 'no' }] } });
  assert.equal(sent[0].result.outcome.optionId, 'yes'); assert.equal(failures.length, 0);
  await NativeAcpClient.prototype.onRequest.call(fake, { id: 2, method: 'session/request_permission', params: { toolCall: { title: 'safe_edit_and_test', rawInput: { ...edit, test_command: ['sh'] } }, options: [{ kind: 'allow_once', optionId: 'yes' }, { kind: 'reject_once', optionId: 'no' }] } });
  assert.equal(sent[1].result.outcome.optionId, 'no'); assert.equal(failures.length, 1);
});

test('child environment excludes Google credential and fixes loop/provider identity', () => {
  const env = childEnvironment({ profile: '/tmp/p', temporary: '/tmp/t' }, { loop: '1' }, { token: 'local-token' }, { node: '/tmp/runtime/node/bin/node', servers: { typescript: ['/usr/bin/server'] } }, { HOME: '/tmp/home', PATH: '/usr/bin', GEMINI_API_KEY: 'never-pass-to-child', OTHER_SECRET: 'also-never' });
  assert.equal(env.GEMINI_API_KEY, undefined); assert.equal(env.OTHER_SECRET, undefined);
  assert.equal(env.GOOSE_MODEL, MODEL); assert.equal(env.GOOSE_STATE_MACHINE, '1');
  assert.equal(env.NATIVE_BENCHMARK_PROXY_TOKEN, 'local-token');
});

async function post(relay, overrides = {}, token = relay.token) {
  const response = await fetch(`${relay.origin}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, reasoning_effort: EFFORT, messages: [{ role: 'user', content: 'synthetic fixture only' }], ...overrides }) });
  return { status: response.status, body: await response.text() };
}

test('offline proxy refuses inference and unauthorized calls without any upstream access', async () => {
  let calls = 0;
  const relay = await startForwarder({ offline: true, fetchImpl: () => { calls += 1; throw new Error('must not run'); } });
  try {
    assert.equal((await post(relay, {}, 'wrong')).status, 403);
    assert.equal((await post(relay)).status, 502);
    assert.equal(relay.telemetry[0].error, 'OFFLINE_PREFLIGHT_FORBIDS_INFERENCE');
    assert.equal(relay.telemetry[0].forwarded, false); assert.equal(calls, 0);
  } finally { relay.close(); }
});

test('live proxy preserves fixed provider identity, normalizes sampling fields and enforces total HTTP budget with fake transport', async () => {
  const captured = [];
  const relay = await startForwarder({ offline: false, apiKey: 'fake-google-key', maxCalls: 1, fetchImpl: async (url, options) => {
    captured.push({ url, options });
    return new Response(`data: ${JSON.stringify({ model: MODEL, usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }, choices: [] })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  } });
  try {
    assert.equal((await post(relay, { model: 'wrong-model' })).status, 502);
    assert.equal((await post(relay, { reasoning_effort: 'low' })).status, 502);
    const reply = await post(relay, { temperature: 0.7, top_p: 0.9, store: false });
    assert.equal(reply.status, 200); assert.equal(captured.length, 1);
    assert.equal(captured[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    const body = JSON.parse(captured[0].options.body);
    assert.equal(body.model, MODEL); assert.equal(body.reasoning_effort, EFFORT);
    for (const field of ['temperature', 'top_p', 'store']) assert.equal(body[field], undefined);
    const record = relay.telemetry.find((entry) => entry.forwarded);
    assert.deepEqual(record.droppedRequestKeys, ['temperature', 'top_p', 'store']);
    assert.deepEqual(record.returnedModels, [MODEL]); assert.equal(record.usage[0].total_tokens, 8);
    assert.equal((await post(relay)).status, 502); assert.equal(captured.length, 1);
    assert.equal(relay.telemetry.at(-1).error, 'HTTP_CALL_BUDGET_EXHAUSTED');
    assert(!JSON.stringify(relay.telemetry).includes('fake-google-key'));
    assert(!JSON.stringify(relay.telemetry).includes('synthetic fixture only'));
  } finally { relay.close(); }
});

test('unsupported provider configuration and wrong returned model abort the active run immediately', async () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const failures = [];
    const relay = await startForwarder({ offline: false, apiKey: 'fake', onFatal: (error) => failures.push(error.message), fetchImpl: async () => new Response('{}', { status }) });
    try { await post(relay); assert.deepEqual(failures, [`PROVIDER_HTTP_${status}`]); assert.equal(relay.telemetry[0].httpStatus, status); }
    finally { relay.close(); }
  }
  const failures = [];
  const relay = await startForwarder({ offline: false, apiKey: 'fake', onFatal: (error) => failures.push(error.message), fetchImpl: async () => new Response(JSON.stringify({ model: 'wrong-model' }), { status: 200 }) });
  try { await post(relay); assert.deepEqual(failures, ['RETURNED_MODEL_MISMATCH']); assert.equal(relay.telemetry[0].error, 'RETURNED_MODEL_MISMATCH'); }
  finally { relay.close(); }
});

function validTreatment() {
  const tools = NATIVE_TOOLS.map((name) => ({ name, status: 'completed' }));
  const nativeOutputs = [
    { tool: 'ast_search', value: { status: 'completed', engine: 'tree-sitter', matches: [{ snippet: 'average', node_type: 'identifier' }] } },
    { tool: 'lsp_query', value: { status: 'completed', positionEncoding: 'utf-16', action: 'symbols', result: [{ name: 'average' }] } },
    { tool: 'lsp_query', value: { status: 'completed', positionEncoding: 'utf-16', action: 'definition', result: [{ uri: 'file:///tmp/average.ts', range: { start: { line: 2, character: 16 } } }] } },
    ...['average.ts', 'average.test.mjs'].flatMap((path) => [
      { tool: 'hashline_edit', value: { path, status: 'read', sha256: digest, lines: [{ line: 1, anchor }] } },
      { tool: 'safe_edit_and_test', value: { path, status: 'verified', verified: true, target_unchanged_during_test: true, test: { executed: true, exit_code: 0, timed_out: false, cancelled: false, output_error: null } } },
    ]),
  ];
  return { tools, nativeOutputs };
}

test('completed transport alone cannot pass native treatment evidence', () => {
  const fixture = validTreatment(); assert.equal(treatmentEvidence(fixture, true), true);
  assert.equal(treatmentEvidence({ tools: fixture.tools }, true), false);
  for (const change of [
    (row) => { row.nativeOutputs[0].value.matches.push({ snippet: 'commentDecoy' }); },
    (row) => { row.nativeOutputs[0].value.engine = 'regex'; },
    (row) => { row.nativeOutputs[1].value.status = 'unavailable'; },
    (row) => { row.nativeOutputs[2].value.result = []; },
    (row) => { row.nativeOutputs.at(-1).value.test.executed = false; },
    (row) => { row.nativeOutputs.at(-1).value.test.exit_code = 1; },
    (row) => { row.nativeOutputs.at(-1).value.verified = false; },
    (row) => { row.nativeOutputs.at(-1).value.target_unchanged_during_test = false; },
    (row) => { row.nativeOutputs.pop(); },
  ]) { const row = structuredClone(fixture); change(row); assert.equal(treatmentEvidence(row, true), false); }
  assert.equal(treatmentEvidence({ tools: [{ name: 'developer__edit', status: 'completed' }] }, false), true);
  assert.equal(treatmentEvidence(fixture, false), false);
});

test('recorder extracts native structured receipts and original canonical names', () => {
  const recorder = new NativeRecorder();
  recorder.update({ params: { update: { sessionUpdate: 'tool_call', toolCallId: '1', title: 'Friendly tool', status: 'in_progress', _meta: { goose: { toolCall: { toolName: 'safe_edit_and_test' } } } } } });
  recorder.update({ params: { update: { sessionUpdate: 'tool_call_update', toolCallId: '1', status: 'completed', rawOutput: { structuredContent: { status: 'verified', verified: true } } } } });
  assert.equal(recorder.tools.get('1').name, 'safe_edit_and_test');
  assert.equal(recorder.outputs.get('1').verified, true);
});

test('independent acceptance detects original bug and missing regression, accepts actual correction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-benchmark-test-'));
  try {
    const calibration = await offlineAcceptanceCalibration(root, process.execPath);
    assert.equal(calibration.passed, true, JSON.stringify(calibration));
    assert.equal(calibration.original.functionBehavior, false);
    assert.equal(calibration.missingRegression.regressionDetectsOriginalBug, false);
    assert.equal(calibration.corrected.passed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
