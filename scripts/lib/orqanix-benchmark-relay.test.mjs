import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { startBenchmarkRelay, BENCHMARK_MODEL, classifyChatRequest, trackInboundResponse, toolSelectionMetadata } from './orqanix-benchmark-relay.mjs';
const bearer = 'real-shaped-fixture-oauth-token-never-log';
const userId = 'fixture-user-id-never-log';
const secret = 'fake-google-secret-never-log';
const typesafeSecret = 'fake-typesafe-secret-never-log';
const accountHash = createHash('sha256').update(userId).digest('hex');
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('tool-selection fingerprints distinguish real instruction/schema changes without storing private text', () => {
  const marker = 'Native engineering selection policy v1';
  const body = { messages: [
    { role: 'system', content: [{ type: 'text', text: `${marker}\nPRIVATE SYSTEM CONTENT` }] },
    { role: 'developer', content: 'PRIVATE DEVELOPER CONTENT' },
    { role: 'user', content: 'Use write and edit to efficiently make changes' },
  ], tools: [{ type: 'function', function: { name: 'ast_search', description: 'PRIVATE TOOL CONTENT' } }] };
  const metadata = toolSelectionMetadata(body);
  assert.equal(metadata.nativeSelectionPolicy, 'v1');
  assert.equal(toolSelectionMetadata({messages:[{role:'system',content:'Native engineering selection policy v2'}]}).nativeSelectionPolicy,'v2');
  assert.equal(metadata.legacyWritePreferencePresent, false, 'user text is not system guidance');
  assert.match(metadata.systemPromptSha256, /^[a-f0-9]{64}$/);
  assert.match(metadata.toolDefinitionsSha256, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(metadata).includes('PRIVATE'));
  assert.deepEqual(toolSelectionMetadata(structuredClone(body)), metadata);
  const changed = structuredClone(body); changed.messages[0].content[0].text += '\nchanged';
  assert.notEqual(toolSelectionMetadata(changed).systemPromptSha256, metadata.systemPromptSha256);
  changed.tools[0].function.description += ' changed';
  assert.notEqual(toolSelectionMetadata(changed).toolDefinitionsSha256, metadata.toolDefinitionsSha256);
  const userOnly = toolSelectionMetadata({ messages: [{ role: 'user', content: marker }] });
  assert.equal(userOnly.nativeSelectionPolicy, null);
  assert.equal(userOnly.systemPromptSha256, null);
  assert.equal(userOnly.toolDefinitionsSha256, null);
  assert.equal(toolSelectionMetadata({ messages: [{ role: 'system', content: 'Use write and edit to efficiently make changes' }] }).legacyWritePreferencePresent, true);
});

test('client close after end but before finish settles the inbound record', () => {
  for (const scenario of ['normal', 'abort_before_end', 'abort_after_end']) {
    const response = Object.assign(new EventEmitter(), { statusCode: 200, writableEnded: scenario !== 'abort_before_end', writableFinished: scenario === 'normal' });
    const calls = [];
    trackInboundResponse(response, { finish: (status, details) => calls.push({ status, details }) });
    if (scenario === 'normal') response.emit('finish');
    response.emit('close');
    assert.equal(calls.length, 1, `${scenario}: exactly one settlement`);
    assert.equal(calls[0].status, scenario === 'normal' ? 'completed' : 'cancelled');
    if (scenario !== 'normal') {
      assert.equal(calls[0].details.writableFinishedAtClose, false);
      assert.equal(calls[0].details.writableEndedAtClose, scenario === 'abort_after_end');
    }
  }
});

async function fixture(t, handler = async () => json({ model: BENCHMARK_MODEL, choices: [{ message: { role: 'assistant', content: 'fixture result' } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }), options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'benchmark-relay-test-'));
  const config = join(root, 'production.config.json');
  await writeFile(config, JSON.stringify({ apiUrl: 'https://deployed.example.test', issuer: 'https://clerk.example.test', clientId: 'production-client' }));
  const calls = [], events = [];
  const fetchImpl = async (url, input) => {
    calls.push({ url, input });
    if (url === 'https://deployed.example.test/desktop/v1/session') {
      if (input.headers.Authorization !== `Bearer ${bearer}`) return json({ error: 'unauthenticated' }, 401);
      return json({ userId, accountScoped: true, model: 'orqaly-gemini' });
    }
    return handler(url, input);
  };
  const relay = await startBenchmarkRelay({ connectorConfigPath: config, environment: { GEMINI_API_KEY: secret }, fetchImpl, onEvent: (event) => events.push(event), ...options });
  t.after(async () => { await relay.close(); await rm(root, { recursive: true, force: true }); });
  return { relay, calls, events, config, fetchImpl };
}
async function post(relay, path, body, headers = {}) {
  return fetch(`${relay.url}/desktop/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'X-Orqaly-Account-Hash': accountHash, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const chat = (extra = {}) => ({ model: 'orqaly-gemini', messages: [{ role: 'user', content: 'PRIVATE FIXTURE PROMPT DO NOT RECORD' }], stream: false, ...extra });

test('real identity delegation is required; missing, rejected and cross-account credentials never reach Google', async (t) => {
  const { relay, calls } = await fixture(t);
  relay.setTrial('auth');
  assert.equal((await post(relay, '/chat/completions', chat(), { Authorization: 'invalid' })).status, 401);
  assert.equal((await post(relay, '/chat/completions', chat(), { Authorization: 'Bearer wrong-fixture-token-long-enough' })).status, 401);
  assert.equal((await post(relay, '/chat/completions', chat(), { 'X-Orqaly-Account-Hash': 'a'.repeat(64) })).status, 403);
  assert.equal(calls.filter((call) => call.url.includes('googleapis')).length, 0);
  assert(calls.every((call) => call.url === 'https://deployed.example.test/desktop/v1/session'));
  assert.equal(relay.provenance.authMethod, 'packaged_authenticated_session_endpoint');
});

test('production chat router handles primary and Axwise with pinned model, normalization, actual usage and no secret/prompt telemetry', async (t) => {
  const { relay, calls, events } = await fixture(t, async () => json({ model: BENCHMARK_MODEL, choices: [{ message: { role: 'assistant', content: 'PRIVATE RESPONSE DO NOT RECORD' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 18, completion_tokens_details: { reasoning_tokens: 3 }, malicious_prompt: 'PRIVATE USAGE STRING' } }));
  relay.setTrial('trial-1');
  let response = await post(relay, '/chat/completions', chat({ temperature: 1, top_p: 0.8, store: false, reasoning_effort: 'high', tools: [{ type: 'function', function: { name: 'ast_search', description: 'PRIVATE TOOL DESCRIPTION', parameters: { type: 'object' } } }, { type: 'function', function: { name: 'axwise__generate_prd', parameters: { type: 'object' } } }] }));
  assert.equal(response.status, 200); await response.json();
  response = await post(relay, '/chat/completions', chat({ response_format: { type: 'json_schema', json_schema: { name: 'axwise_specialist_artifact', schema: { type: 'object' } } } }));
  assert.equal(response.status, 200); await response.json(); await tick();
  const modelCalls = calls.filter((call) => call.url.includes('googleapis'));
  assert.equal(modelCalls.length, 2);
  const upstream = JSON.parse(modelCalls[0].input.body);
  assert.equal(upstream.model, BENCHMARK_MODEL); assert.equal(upstream.reasoning_effort, 'high');
  for (const key of ['temperature', 'top_p', 'store']) assert.equal(upstream[key], undefined);
  assert.equal(modelCalls[0].input.headers.Authorization, `Bearer ${secret}`);
  assert.equal(calls.filter((call) => call.url.endsWith('/session')).length, 1, 'short auth cache avoids repeated identity calls');
  const snapshot = relay.snapshot('trial-1');
  assert.equal(snapshot.primaryHttpAttempts, 1); assert.equal(snapshot.axwiseHttpAttempts, 1);
  assert.deepEqual(snapshot.modelRequests[0].toolNames, ['ast_search', 'axwise__generate_prd']);
  assert.equal(snapshot.modelRequests[0].systemPromptSha256, null);
  assert.equal(snapshot.modelRequests[0].nativeSelectionPolicy, null);
  assert.match(snapshot.modelRequests[0].toolDefinitionsSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.modelRequests[1].toolNames, []);
  assert.equal(snapshot.pending, 0);
  for (const record of snapshot.modelRequests) { assert.equal(record.modelIdentity, 'verified'); assert.deepEqual(record.responseModels, [BENCHMARK_MODEL]); assert.equal(record.usage.total_tokens, 18); assert.equal(record.usage.completion_tokens_details.reasoning_tokens, 3); assert(record.elapsedMs >= 0); }
  const serialized = JSON.stringify({ snapshot, events });
  for (const forbidden of [bearer, secret, userId, accountHash, 'PRIVATE FIXTURE', 'PRIVATE RESPONSE', 'PRIVATE USAGE', 'PRIVATE TOOL DESCRIPTION']) assert(!serialized.includes(forbidden), forbidden);
  snapshot.modelRequests[0].usage.total_tokens = 999; assert.equal(relay.snapshot('trial-1').modelRequests[0].usage.total_tokens, 18);
});

test('SSE bytes are preserved while streamed model identity and cumulative usage are observed', async (t) => {
  const chunks = [JSON.stringify({ model: BENCHMARK_MODEL, choices: [{ delta: { content: 'hello' } }] }), JSON.stringify({ model: BENCHMARK_MODEL, choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })];
  const text = chunks.map((chunk) => `data: ${chunk}\n\n`).join('') + 'data: [DONE]\n\n';
  const { relay } = await fixture(t, async () => new Response(new ReadableStream({ start(controller) { const bytes = new TextEncoder().encode(text); controller.enqueue(bytes.slice(0, 17)); controller.enqueue(bytes.slice(17)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } }));
  relay.setTrial('stream');
  const response = await post(relay, '/chat/completions', chat({ stream: true }));
  assert.equal(await response.text(), text); await tick();
  const record = relay.snapshot('stream').modelRequests[0];
  assert.equal(record.status, 'completed'); assert.equal(record.modelIdentity, 'verified'); assert.equal(record.usage.total_tokens, 7);
});

test('JEV forwards authenticated production decisions and review, preserving outcomes and measuring full endpoint overhead', async (t) => {
  const { relay, calls } = await fixture(t, async (url) => url.endsWith('/decisions') ? json({ decision: 'local_engineering', reason: 'classified', advisory: true, provenance: { model: 'jev-1', inputHash: 'unrecorded' } }) : json({ review: { status: 'passed', reason: 'advisory_review', advisory: true, model: 'jev-1', latencyMs: 17, qualityScore: 0.9 }, taskId: 'unrecorded' }));
  relay.setTrial('jev');
  let response = await post(relay, '/decisions', { kind: 'lane_triage', enabled: true, sessionId: 'private-session', message: 'PRIVATE JEV PROMPT' });
  assert.equal((await response.json()).decision, 'local_engineering');
  response = await post(relay, '/engineering/review', { task: 'PRIVATE EVIDENCE', evidence: {} });
  assert.equal((await response.json()).review.status, 'passed'); await tick();
  const snapshot = relay.snapshot('jev'); assert.equal(snapshot.jevHttpAttempts, 2);
  assert.equal(snapshot.jevRequests[0].decision, 'local_engineering'); assert.equal(snapshot.jevRequests[0].responseModel, 'jev-1');
  assert.equal(snapshot.jevRequests[1].reviewStatus, 'passed'); assert.equal(snapshot.jevRequests[1].providerReportedLatencyMs, 17);
  assert(snapshot.jevRequests.every((record) => record.providerHttpVisibility === 'deployed_service_only'));
  assert(calls.filter((call) => !call.url.endsWith('/session')).every((call) => call.input.headers.Authorization === `Bearer ${bearer}`));
  assert(!JSON.stringify(snapshot).includes('PRIVATE')); assert(!JSON.stringify(snapshot).includes('private-session'));
});

test('current production JEV service classifies with direct provider tracing and unchanged real desktop authentication', async (t) => {
  const provider = { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: 'local_engineering', confidence: 1, probabilities: { quick_info: 0, research: 0, local_engineering: 1, conversation: 0, mixed: 0 } } } };
  const { relay, calls, events } = await fixture(t, async (url, input) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(input.headers.Authorization, `Bearer ${typesafeSecret}`);
    assert.equal(JSON.parse(input.body).model, 'jev-latest');
    return json(provider);
  }, { environment: { GEMINI_API_KEY: secret, TYPESAFE_API_KEY: typesafeSecret } });
  relay.setTrial('local-jev');
  const response = await post(relay, '/decisions', { kind: 'lane_triage', enabled: true, sessionId: 'private-session', message: 'PRIVATE JEV INPUT' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.decision, 'local_engineering'); assert.equal(result.reason, 'classified');
  assert.equal(result.provenance.model, 'jev-1.13.0');
  await tick();
  const snapshot = relay.snapshot('local-jev');
  assert.equal(snapshot.provenance.jevMethod, 'current_local_production_services');
  assert.equal(snapshot.provenance.jevFallbackOnError, false);
  assert.equal(snapshot.jevHttpAttempts, 1); assert.equal(snapshot.jevRequests.length, 1); assert.equal(snapshot.pending, 0);
  assert.equal(snapshot.jevRequests[0].evaluated, true);
  assert.equal(snapshot.jevRequests[0].decision, 'local_engineering');
  assert.equal(snapshot.jevRequests[0].effectiveMode, 'current_local_service');
  const traced = snapshot.jevProviderRequests[0];
  assert.equal(traced.serviceRecordId, snapshot.jevRequests[0].id);
  assert.equal(traced.requestedModel, 'jev-latest'); assert.equal(traced.responseModel, 'jev-1.13.0');
  assert.equal(traced.httpStatus, 200); assert.equal(traced.status, 'completed'); assert(traced.elapsedMs >= 0);
  assert.deepEqual(traced.questionNames, ['route']);
  assert.equal(calls.filter((call) => call.url.endsWith('/session')).length, 1);
  assert(!calls.some((call) => call.url.endsWith('/decisions')));
  const serialized = JSON.stringify({ snapshot, events });
  for (const forbidden of [bearer, secret, typesafeSecret, userId, accountHash, 'PRIVATE JEV', 'private-session']) assert(!serialized.includes(forbidden), forbidden);
});

test('disabled and unavailable current JEV decisions remain explicitly unevaluated without remote fallback', async (t) => {
  const { relay, calls } = await fixture(t, async (url) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    return json({ error: { message: 'PRIVATE PROVIDER ERROR' } }, 503);
  }, { environment: { GEMINI_API_KEY: secret, TYPESAFE_API_KEY: typesafeSecret } });
  relay.setTrial('jev-disabled');
  let response = await post(relay, '/decisions', { kind: 'lane_triage', enabled: false, sessionId: 'private-session', message: 'PRIVATE JEV INPUT' });
  assert.equal((await response.json()).reason, 'disabled');
  assert.equal(relay.snapshot().jevRequests[0].evaluated, false); assert.equal(relay.snapshot().jevHttpAttempts, 0);
  relay.setTrial('jev-unavailable');
  response = await post(relay, '/decisions', { kind: 'lane_triage', enabled: true, sessionId: 'private-session', message: 'PRIVATE JEV INPUT' });
  const result = await response.json(); assert.equal(result.reason, 'provider_unavailable'); assert.equal(result.decision, 'uncertain');
  const snapshot = relay.snapshot();
  assert.equal(snapshot.pending, 0); assert.equal(snapshot.jevRequests[0].evaluated, false);
  assert.equal(snapshot.jevProviderRequests[0].httpStatus, 503); assert.equal(snapshot.jevProviderRequests[0].status, 'failed');
  assert.equal(snapshot.jevHttpAttempts, 1);
  assert(!calls.some((call) => call.url.endsWith('/decisions')));
  assert(!JSON.stringify(snapshot).includes('PRIVATE'));
});

test('remote JEV rejection retains only its bounded error code and actual HTTP status', async (t) => {
  const { relay } = await fixture(t, async () => json({ error: { code: 'INVALID_DESKTOP_REQUEST', message: 'PRIVATE AUTH AND PROMPT' } }, 400));
  relay.setTrial('old-remote');
  const response = await post(relay, '/decisions', { kind: 'lane_triage', enabled: true, sessionId: 'private-session', message: 'PRIVATE JEV INPUT' });
  assert.equal(response.status, 400); await response.json();
  const snapshot = relay.snapshot();
  assert.equal(snapshot.provenance.jevMethod, 'forwarded_authenticated_packaged_endpoint');
  assert.equal(snapshot.jevRequests[0].httpStatus, 400);
  assert.equal(snapshot.jevRequests[0].remoteErrorCode, 'INVALID_DESKTOP_REQUEST');
  assert.equal(snapshot.jevRequests[0].status, 'failed');
  assert(!JSON.stringify(snapshot).includes('PRIVATE'));
});

test('an in-flight request retains the label captured on arrival after the active trial changes', async (t) => {
  let release, reached;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { reached = resolve; });
  const { relay } = await fixture(t, async () => { reached(); await gate; return json({ model: BENCHMARK_MODEL, choices: [], usage: { total_tokens: 1 } }); });
  relay.setTrial(null);
  const pending = post(relay, '/chat/completions', chat());
  await started; relay.setTrial('later-trial'); release();
  await (await pending).json(); await tick();
  assert.equal(relay.snapshot(null).modelRequests.length, 1);
  assert.equal(relay.snapshot('later-trial').modelRequests.length, 0);
});

test('missing and mismatched generated model identities fail closed and remain visible', async (t) => {
  for (const [body, expected] of [[{ choices: [] }, 'RESPONSE_MODEL_MISSING'], [{ model: 'gemini-2.5-flash', choices: [] }, 'RESPONSE_MODEL_MISMATCH']]) {
    await t.test(expected, async (sub) => {
      const { relay } = await fixture(sub, async () => json(body)); relay.setTrial('model-check');
      try { const response = await post(relay, '/chat/completions', chat()); await response.text(); } catch { /* production stream closes on rejected provider output */ }
      await tick(); const record = relay.snapshot('model-check').modelRequests[0];
      assert.equal(record.status, 'failed'); assert.equal(record.error, expected);
      if (expected.endsWith('MISMATCH')) assert.deepEqual(record.responseModels, ['gemini-2.5-flash']);
    });
  }
});

test('legacy cloud work routes are absent and synthetic auth cannot be configured', async (t) => {
  const { relay, config, fetchImpl, calls } = await fixture(t);
  assert.equal((await post(relay, '/work', { task: 'no hosted Axwise route' })).status, 404);
  assert.equal(calls.filter((call) => !call.url.endsWith('/session')).length, 0);
  await assert.rejects(startBenchmarkRelay({ connectorConfigPath: config, environment: { GEMINI_API_KEY: secret, ORQALY_LOCAL_TEST_MODE: 'true' }, fetchImpl }), /SYNTHETIC_AUTH_FORBIDDEN/);
  await assert.rejects(startBenchmarkRelay({ connectorConfigPath: config, environment: {}, fetchImpl }), /GEMINI_API_KEY_REQUIRED/);
  assert.throws(() => relay.setTrial('raw prompt with spaces'), /INVALID_TRIAL_LABEL/);
  assert.equal(classifyChatRequest({ response_format: { type: 'json_schema', json_schema: { name: 'axwise_specialist_artifact' } } }).source, 'axwise');
});
