import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createByokProvider } from '../src/byok-provider.mjs';
import { main, standaloneKernel } from '../src/standalone.mjs';
import { parseStandaloneArguments, readStandaloneConfig, standaloneScope, validateBaseUrl, validateStandaloneConfig } from '../src/standalone-config.mjs';
import { createSpecialistTools, hash, MAX_FRAME_BYTES, TOOL_NAMES } from '../src/runtime.mjs';
import { resolveArtifactReference } from '../src/state.mjs';
import { serveMcp, SUPPORTED_PROTOCOL_VERSIONS } from '../src/mcp.mjs';

const config = { version: 1, provider: 'gemini', model: 'gemini-test-model',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'AXWISE_TEST_PROVIDER_KEY',
  profileId: 'local-user', workspaceId: 'customer-discovery', sessionId: 'research-one', stateDir: '/test/state' };
const prepared = { systemPrompt: 'Fixed system instruction', userPrompt: 'Selected exact evidence',
  responseSchema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
  maxOutputTokens: 4096 };
const finalized = { artifact: { type: 'prd', title: 'Draft' }, markdown: '# Draft',
  validation: { valid: true }, provenance: { kernelVersion: 'test' } };
const secret = 'test-key-MUST-NOT-LEAK';
const reply = (overrides = {}) => Response.json({ model: 'actual-model-2026',
  choices: [{ finish_reason: 'stop', message: { content: '{"answer":"ok"}' } }],
  usage: { prompt_tokens: 40, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 0 } }, ...overrides });
const description = { protocolVersion: 1, tools: TOOL_NAMES.map((name) => ({ name,
  description: 'Return the full saved reference to Goose.', inputSchema: { type: 'object' } })) };
const env = { AXWISE_TEST_PROVIDER_KEY: secret };
const launch = (path) => ['--config', path, '--python', '/test/python', '--kernel-root', '/test/kernel'];

test('standalone endpoints require HTTPS or explicit literal loopback with unambiguous path', () => {
  assert.equal(validateBaseUrl(config.baseUrl + '/'), config.baseUrl);
  assert.equal(validateBaseUrl('http://127.0.0.1:8123/v1', { allowLoopback: true }), 'http://127.0.0.1:8123/v1');
  assert.equal(validateBaseUrl('http://[::1]:8123/v1', { allowLoopback: true }), 'http://[::1]:8123/v1');
  for (const value of [undefined, 'not a url', 'https://user:secret@example.com/v1', 'https://example.com/v1?key=secret',
    'https://example.com/#secret', 'http://example.com/v1', 'http://localhost/v1', 'http://127.0.0.1/v1',
    'https://example.com/v1/../v2', 'https://example.com/%2fprivate', 'https://example.com//v1', 'https://example.com/v1\\other',
    'https://example.com/v1 ', ' https://example.com/v1', 'https:example.com/v1'])
    assert.throws(() => validateBaseUrl(value), { code: 'CONFIG_INVALID' });
  assert.throws(() => validateBaseUrl('http://127.0.0.1.evil.example/v1', { allowLoopback: true }));
});

test('configuration rejects implicit model, embedded secrets and missing local scope', () => {
  const checked = validateStandaloneConfig(config);
  assert.equal(checked.providerTimeoutMs, 90_000);
  for (const edit of [{ provider: 'managed' }, { model: '' }, { apiKeyEnv: 'key value' }, { apiKey: secret },
    { stateDir: 'relative' }, { profileId: '' }, { workspaceId: '../workspace' }, { sessionId: '' },
    { accountHash: 'a'.repeat(64) }, { connectorRoot: '/connector' }, { allowLoopback: 'true' },
    { providerTimeoutMs: 0 }, { providerTimeoutMs: 180_001 }, { version: 2 }])
    assert.throws(() => validateStandaloneConfig({ ...config, ...edit }), { code: 'CONFIG_INVALID' });
  assert.deepEqual(parseStandaloneArguments(launch('/config.json')), { configPath: '/config.json', python: '/test/python', kernelRoot: '/test/kernel' });
  for (const args of [launch('config.json'), [...launch('/config.json'), '--api-key', secret],
    [...launch('/config.json'), '--config', '/duplicate'], launch('/config.json').slice(0, -1)])
    assert.throws(() => parseStandaloneArguments(args), { code: 'CONFIG_INVALID' });
});

test('local profile/workspace/session isolation does not depend on credentials or model', () => {
  const first = standaloneScope(config);
  assert.deepEqual(standaloneScope({ ...config, apiKeyEnv: 'ROTATED_KEY', model: 'other-model' }), first);
  assert.notEqual(standaloneScope({ ...config, workspaceId: 'other-workspace' }).accountHash, first.accountHash);
  assert.notEqual(standaloneScope({ ...config, profileId: 'other-person' }).accountHash, first.accountHash);
  assert.equal(standaloneScope({ ...config, sessionId: 'another-chat' }).accountHash, first.accountHash);
  assert.notEqual(standaloneScope({ ...config, sessionId: 'another-chat' }).conversationId, first.conversationId);
  assert.equal(first.conversationId, config.sessionId);
});

test('config file is bounded and parse errors never expose contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'axwise-config-test-')), path = join(directory, 'config.json');
  await writeFile(path, JSON.stringify(config));
  assert.equal((await readStandaloneConfig(path)).model, config.model);
  for (const content of ['{"apiKey":"' + secret, 'x'.repeat(16_385)]) {
    await writeFile(path, content);
    await assert.rejects(() => readStandaloneConfig(path), (error) => error.code === 'CONFIG_INVALID' && !error.message.includes(secret));
  }
});

test('BYOK initialization and tool listing need neither API credentials nor Orqanix/Clerk', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'axwise-init-test-')), path = join(directory, 'config.json');
  await writeFile(path, JSON.stringify({ ...config, stateDir: directory }));
  const input = new PassThrough(); let output = '', requested = 0;
  const sink = new Writable({ write(chunk, _encoding, callback) { output += chunk; callback(); } });
  input.end([{ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { method: 'notifications/initialized' }, { id: 2, method: 'tools/list' }]
    .map((message) => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n');
  await main(launch(path), { input, output: sink,
    env: new Proxy({}, { get() { throw new Error('Credentials must not be read during discovery'); } }),
    fetchImpl: async () => { throw new Error('No model or auth call allowed'); },
    kernelFactory: () => async (request) => { requested++; assert.equal(request.operation, 'describe'); return description; } });
  const responses = output.trim().split('\n').map(JSON.parse);
  assert.equal(requested, 1);
  assert.equal(responses[1].result.tools.length, 8);
  assert.doesNotMatch(output, /Goose|orqanix-result:|Clerk|orqaly/);
  assert.match(responses[0].result.instructions, /scope is static for this process, not automatically isolated per chat/);
  assert.deepEqual(responses[0].result.capabilities, { tools: {} });
  assert.deepEqual(responses[0].result.serverInfo, { name: 'axwise-extension', version: '0.3.0' });
});

test('standalone adapter changes fixed host guidance only, never evidence or finalized results', async () => {
  const source = { ...prepared, systemPrompt: 'Plan inside Goose; do not authorize Goose to act.',
    userPrompt: 'User said: Goose should remain unchanged.', generationTasks: [{ ...prepared, userPrompt: 'Goose evidence' }] };
  const wrapped = standaloneKernel(async () => source);
  const result = await wrapped({ operation: 'prepare' });
  assert.doesNotMatch(result.systemPrompt, /Goose/);
  assert.equal(result.userPrompt, source.userPrompt);
  assert.equal(result.generationTasks[0].userPrompt, source.generationTasks[0].userPrompt);
  assert.equal(await wrapped({ operation: 'finalize' }), source);
});

test('BYOK calls only the chosen provider with JSON schema and actual provider/model usage', async () => {
  for (const providerName of ['gemini', 'openai-compatible']) {
    const requests = [];
    const provider = createByokProvider({ config: { ...config, provider: providerName }, env,
      fetchImpl: async (url, options) => { requests.push({ url, options }); return reply(); } });
    const result = await provider(prepared);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, config.baseUrl + '/chat/completions');
    assert.equal(requests[0].options.redirect, 'error');
    assert.deepEqual(requests[0].options.headers, { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.model, config.model);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, providerName === 'gemini');
    if (providerName === 'openai-compatible') assert.deepEqual(body.response_format.json_schema.schema, prepared.responseSchema);
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.store, providerName === 'gemini' ? undefined : false);
    assert.equal(body.tools, undefined);
    assert.equal(body.stream, false);
    assert.equal(result.usage.provider, providerName);
    assert.equal(result.usage.model, 'actual-model-2026');
    assert.equal(result.usage.requestedModel, config.model);
    assert.equal(result.usage.modelReported, true);
    assert.equal(result.usage.cacheReadTokens, 0);
    assert.doesNotMatch(JSON.stringify(result), /MUST-NOT-LEAK|Clerk|orqaly/);
  }
});

test('generic OpenAI schema retains optional fields, definitions and constraints without an invalid strict promise', async () => {
  const responseSchema = { type: 'object', properties: { label: { type: 'string', minLength: 1 },
    optionalItems: { type: 'array', items: { $ref: '#/$defs/Item' }, maxItems: 3 } },
  required: ['label'], additionalProperties: false,
  $defs: { Item: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } };
  let body;
  const provider = createByokProvider({ config: { ...config, provider: 'openai-compatible' }, env,
    fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return reply(); } });
  await provider({ ...prepared, responseSchema });
  assert.equal(body.response_format.json_schema.strict, false);
  assert.deepEqual(body.response_format.json_schema.schema, responseSchema);
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['label']);
});

test('BYOK checks the key at invocation and never falls back to managed auth', async () => {
  const credentials = {}; let calls = 0;
  const provider = createByokProvider({ config, env: credentials, fetchImpl: async () => { calls++; return reply(); } });
  await assert.rejects(() => provider(prepared), { code: 'PROVIDER_KEY_REQUIRED' });
  assert.equal(calls, 0);
  credentials.AXWISE_TEST_PROVIDER_KEY = secret;
  await provider(prepared);
  assert.equal(calls, 1);
  delete credentials.AXWISE_TEST_PROVIDER_KEY;
  await assert.rejects(() => provider(prepared), { code: 'PROVIDER_KEY_REQUIRED' });
  assert.equal(calls, 1);
});

test('BYOK provider errors redact bodies and transport errors, without retry or fallback', async () => {
  for (const status of [301, 401, 403, 429, 500]) {
    let calls = 0;
    const provider = createByokProvider({ config, env, fetchImpl: async () => { calls++; return new Response(secret, { status }); } });
    await assert.rejects(() => provider(prepared), (error) => !error.message.includes(secret) && error instanceof Error);
    assert.equal(calls, 1);
  }
  const provider = createByokProvider({ config, env, fetchImpl: async () => { throw new Error(secret); } });
  await assert.rejects(() => provider(prepared), (error) => error.code === 'PROVIDER_UNAVAILABLE' && !error.message.includes(secret));
});

test('BYOK rejects incomplete, oversized, redirected and non-JSON responses', async () => {
  const redirected = reply(); Object.defineProperty(redirected, 'redirected', { value: true });
  for (const response of [redirected, new Response(secret),
    new Response(secret, { headers: { 'Content-Type': 'application/json' } }),
    reply({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    reply({ choices: [{ finish_reason: 'stop', message: { content: '{}', tool_calls: [{}] } }] }),
    reply({ choices: [{ finish_reason: 'stop', message: { content: 'x'.repeat(MAX_FRAME_BYTES + 1) } }] })]) {
    const provider = createByokProvider({ config, env, fetchImpl: async () => response });
    await assert.rejects(() => provider(prepared), (error) => error.code === 'PROVIDER_INVALID' && !error.message.includes(secret));
  }
});

test('BYOK cancellation aborts request; provider timeout is bounded without retries', async () => {
  const controller = new AbortController(); let entered, requestSignal;
  const ready = new Promise((resolve) => { entered = resolve; });
  const provider = createByokProvider({ config, env, fetchImpl: async (_url, options) => {
    requestSignal = options.signal; entered(); return new Promise(() => {});
  } });
  const pending = provider(prepared, controller.signal);
  await ready; controller.abort();
  await assert.rejects(() => pending, { name: 'AbortError' });
  assert.equal(requestSignal.aborted, true);
  const timeout = createByokProvider({ config: { ...config, providerTimeoutMs: 10 }, env,
    fetchImpl: async () => new Promise(() => {}) });
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(() => timeout(prepared), { code: 'PROVIDER_TIMEOUT' }); }
  finally { clearTimeout(keepAlive); }
});

test('generic artifacts retain exact references, revisions and actual stage metadata', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-generic-results-'));
  const scope = standaloneScope({ ...config, stateDir });
  const provider = createByokProvider({ config, env, fetchImpl: async () => reply() });
  const requests = [];
  const call = createSpecialistTools({ ...scope, provider, presentation: 'generic',
    kernel: async (request) => { requests.push(request);
      if (request.operation.startsWith('prepare')) return prepared;
      if (request.operation === 'validate_review') return { passed: true, issues: [] };
      return finalized;
    } });
  const first = await call('create_prd', { brief: 'Selected scope' });
  assert.equal(first.isError, false, JSON.stringify(first));
  const record = first.structuredContent, descriptor = record.resultArtifact;
  assert.equal(descriptor.schemaVersion, 'axwise.result.v1');
  assert.doesNotMatch(first.content[0].text, /orqanix-result:|Goose|orqaly/);
  assert.equal(record.usage.provider, 'gemini');
  assert.equal(record.usage.model, 'actual-model-2026');
  assert.equal(record.execution.inference, 'gemini');
  assert.ok(record.execution.stages.every((stage) => stage.model === 'actual-model-2026'));
  const reference = { operationId: record.operationId, sha256: record.artifactFile.sha256 };
  assert.deepEqual((await resolveArtifactReference(scope, reference, new AbortController().signal)).reference, reference);
  const revision = await call('create_prd', { brief: 'Add the requested small detail', revisionOf: reference });
  assert.equal(revision.isError, false, JSON.stringify(revision));
  assert.equal(revision.structuredContent.resultArtifact.parentRevisionId, reference.operationId);
  assert.equal(revision.structuredContent.resultArtifact.artifactId, descriptor.artifactId);
  assert.equal(await readFile(descriptor.path, 'utf8'), finalized.markdown);
  assert.equal(requests.at(-1).input.revisionOf.sha256, reference.sha256);
  const other = standaloneScope({ ...config, stateDir, sessionId: 'different-session' });
  await assert.rejects(() => resolveArtifactReference(other, reference, new AbortController().signal), { code: 'ARTIFACT_REFERENCE_INVALID' });
  assert.equal(record.artifactSha256, hash(finalized.artifact));
});

test('MCP negotiates known protocol versions and strips unsupported output for older hosts', async () => {
  for (const requested of [...SUPPORTED_PROTOCOL_VERSIONS, 'unknown-future-version']) {
    const input = new PassThrough(); let output = '', resultReady;
    const finished = new Promise((resolve) => { resultReady = resolve; });
    const sink = new Writable({ write(chunk, _encoding, callback) {
      output += chunk; if (String(chunk).includes('"id":3')) resultReady(); callback();
    } });
    const serving = serveMcp({ tools: [{ name: 'create_prd', inputSchema: { type: 'object' }, annotations: {} }], input, output: sink,
      strictInitialization: true, call: async () => ({ content: [{ type: 'text', text: 'Saved exact reference' }], structuredContent: { test: true } }) });
    input.write([{ id: 1, method: 'initialize', params: { protocolVersion: requested } }, { id: 2, method: 'tools/list' },
      { id: 3, method: 'tools/call', params: { name: 'create_prd', arguments: {} } }]
      .map((message) => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n');
    await finished; input.end(); await serving;
    const responses = output.trim().split('\n').map(JSON.parse);
    const selected = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
    assert.equal(responses[0].result.protocolVersion, selected);
    assert.equal(responses[2].result.structuredContent !== undefined, selected === '2025-06-18');
    assert.equal(responses[1].result.tools[0].annotations !== undefined, selected !== '2024-11-05');
  }
});

test('real Python standalone launcher completes generation/review through an explicit local provider', async (t) => {
  const kernelRoot = fileURLToPath(new URL('../../../', import.meta.url));
  let fixture;
  try {
    fixture = JSON.parse(execFileSync(process.env.AXWISE_TEST_PYTHON || 'python3', ['-B', '-c',
      'import json,sys; from backend.tests.local_axwise.fixtures import inputs,candidate; print(json.dumps({"python":sys.executable,"input":inputs()["create_prd"],"candidate":candidate("create_prd")}))'],
    { cwd: kernelRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONPATH: kernelRoot, PYTHONDONTWRITEBYTECODE: '1' } }));
  } catch (error) {
    if (process.env.AXWISE_TEST_PYTHON) throw error;
    t.skip('Set AXWISE_TEST_PYTHON to the installed local-kernel Python environment'); return;
  }
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body), prompt = JSON.parse(payload.messages[1].content);
    requests.push({ path: request.url, payload });
    const content = prompt.requiredCriteria
      ? { checks: prompt.requiredCriteria.map((criterion) => ({ criterion, passed: true,
        reason: 'Offline fixture criterion result; not a model-quality claim.' })) } : fixture.candidate;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ model: 'fixture-model-v1', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const directory = await mkdtemp(join(tmpdir(), 'axwise-byok-kernel-')), path = join(directory, 'config.json');
    await writeFile(path, JSON.stringify({ ...config, provider: 'openai-compatible', stateDir: directory,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`, allowLoopback: true }));
    const input = new PassThrough(); let output = '', finished;
    const completed = new Promise((resolve) => { finished = resolve; });
    const sink = new Writable({ write(chunk, _encoding, callback) {
      output += chunk; if (String(chunk).includes('"id":2,')) finished(); callback();
    } });
    const serving = main(['--config', path, '--python', fixture.python, '--kernel-root', kernelRoot], { input, output: sink, env });
    input.write([{ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { id: 2, method: 'tools/call', params: { name: 'create_prd', arguments: fixture.input } }]
      .map((message) => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n');
    await completed; input.end(); await serving;
    const result = output.trim().split('\n').map(JSON.parse).at(-1).result;
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(requests.length, 2);
    assert.ok(requests.every(({ path }) => path === '/v1/chat/completions'));
    assert.equal(result.structuredContent.execution.inference, 'openai-compatible');
    assert.equal(result.structuredContent.usage.model, 'fixture-model-v1');
    assert.equal(result.structuredContent.usage.inputTokens, 200);
    assert.equal(result.structuredContent.qualityReview.passed, true);
    assert.equal(result.structuredContent.resultArtifact.schemaVersion, 'axwise.result.v1');
    assert.doesNotMatch(output, /orqanix-result:|authenticated-desktop-gateway|MUST-NOT-LEAK/);
    assert.equal(hash(await readFile(result.structuredContent.resultArtifact.path, 'utf8')), result.structuredContent.resultArtifact.sha256);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
