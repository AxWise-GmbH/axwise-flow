import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createKernel, createProvider, createSpecialistTools, LocalAxwiseError, MAX_FRAME_BYTES, saveArtifact, validateTools, hash, TOOL_NAMES } from '../src/runtime.mjs';
import { parseArguments, resolveTestToken, serveMcp } from '../src/mcp.mjs';
import { AXWISE_CONVERSATION_POLICY, AXWISE_TOOL_BOUNDARY } from '../src/conversation-policy.mjs';

const accountHash = 'a'.repeat(64), conversationId = 'conversation-one';
const signal = () => new AbortController().signal;
const prepared = { systemPrompt: 'Specialist instruction', userPrompt: 'Explicit selected evidence',
  responseSchema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
  context: { kernelVersion: '0.1.0' }, maxOutputTokens: 4096 };
const finalized = { artifact: { type: 'prd', title: 'Draft' }, markdown: '# Draft', validation: { valid: true }, provenance: { kernelVersion: '0.1.0' } };
const description = { protocolVersion: 1, tools: TOOL_NAMES.map((name) => ({ name, description: 'A specialist tool', inputSchema: { type: 'object' } })) };
const providerReply = (content = '{"answer":"ok"}', overrides = {}) => Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 12 }, ...overrides });
const launch = ['--config', '/test/public.json', '--account-hash', accountHash, '--conversation-id', conversationId,
  '--state-dir', '/test/state', '--python', '/test/python3', '--kernel-root', '/test/kernel', '--connector-root', '/test/connector'];
async function fixture(options = {}) {
  const calls = [], saved = [], stateDir = await mkdtemp(join(tmpdir(), 'axwise-local-tests-'));
  const call = createSpecialistTools({ stateDir, accountHash, conversationId,
    kernel: async (request) => { calls.push(request);
      if (request.operation.startsWith('prepare')) return prepared;
      if (request.operation === 'validate_review') return { passed: true, issues: [], artifactHash: hash(finalized.artifact) };
      return finalized;
    },
    provider: async () => ({ response: '{"answer":"ok"}', usage: { modelCalls: 1 } }),
    save: async (args) => { saved.push(args); return { path: '/test/artifact.json', sha256: 'b'.repeat(64) }; }, ...options });
  return { call, calls, saved, stateDir };
}

test('launch arguments bind trusted absolute paths, account and conversation', () => {
  assert.equal(parseArguments(launch).conversationId, conversationId);
  for (const extra of [['--api-url', 'https://another.example'], ['--api-url', 'http://localhost:4444'], ['--unknown', 'value'], ['--state-dir', '/duplicate']]) assert.throws(() => parseArguments([...launch, ...extra]));
  assert.throws(() => parseArguments(launch.map((v) => v === conversationId ? '../escape' : v)));
  assert.throws(() => parseArguments(launch.map((v) => v === '/test/python3' ? 'python3' : v)));
  assert.equal(parseArguments([...launch, '--api-url', 'http://127.0.0.1:4444']).apiUrlOverride, 'http://127.0.0.1:4444');
});

test('synthetic credentials are allowed only with explicit loopback and test mode', async () => {
  const normalToken = async () => 'normal';
  assert.equal(resolveTestToken({ normalToken }), normalToken);
  assert.throws(() => resolveTestToken({ testToken: 'secret', apiUrlOverride: 'https://api.example' }));
  assert.throws(() => resolveTestToken({ testToken: 'secret', testMode: 'true' }));
  assert.throws(() => resolveTestToken({ testToken: 'bad token', testMode: 'true', apiUrlOverride: 'http://127.0.0.1:4444' }));
  assert.equal(await resolveTestToken({ testToken: 'synthetic', testMode: 'true', apiUrlOverride: 'http://127.0.0.1:4444' })(), 'synthetic');
});

test('only the eight specialist tools are advertised', () => {
  const tools = validateTools(description);
  assert.equal(tools.length, 8);
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['create_prd', 'analyze_interviews', 'simulate_interviews',
    'prepare_discovery', 'generate_personas', 'chat_with_persona', 'research_market', 'create_delivery_brief'].sort());
  assert.ok(tools.every((t) => t.description.includes('not ordinary chat')));
  assert.ok(tools.every((t) => t.description.endsWith(AXWISE_TOOL_BOUNDARY)));
  assert.throws(() => validateTools({ ...description, tools: [...description.tools, { name: 'search_web' }] }));
  assert.throws(() => validateTools({ ...description, tools: [description.tools[0], description.tools[0], description.tools[2]] }));
});

test('provider uses one authenticated, account-bound thin inference request', async () => {
  const requests = [];
  const provider = createProvider({ apiUrl: 'https://api.example', accountHash, token: async () => 'token-not-persisted', fetchImpl: async (url, options) => { requests.push({ url, options }); return providerReply(); } });
  const result = await provider(prepared, signal());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.example/desktop/v1/chat/completions');
  assert.equal(requests[0].options.headers['X-Orqaly-Account-Hash'], accountHash);
  assert.equal(requests[0].options.redirect, 'error');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.model, 'orqaly-gemini');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.equal(result.usage.inputTokens, 42);
  assert.equal(result.usage.modelCalls, 1);
});

test('auth failures never send a request or leak credential errors', async () => {
  let fetched = false;
  const provider = createProvider({ apiUrl: 'https://api.example', accountHash,
    token: async () => { throw new Error('secret private text'); }, fetchImpl: async () => { fetched = true; } });
  await assert.rejects(() => provider(prepared, signal()), { code: 'LOGIN_REQUIRED' });
  assert.equal(fetched, false);
});

test('provider preserves reported cache usage, including zero, without inventing missing values', async () => {
  for (const [reported, expected] of [
    [{ prompt_tokens_details: { cached_tokens: 21 }, cache_creation_input_tokens: 4 }, { cacheReadTokens: 21, cacheWriteTokens: 4 }],
    [{ prompt_tokens_details: { cached_tokens: 0 } }, { cacheReadTokens: 0 }],
    [{ cache_read_input_tokens: 11 }, { cacheReadTokens: 11 }],
    [{}, {}],
    [{ prompt_tokens_details: { cached_tokens: -1 }, cache_creation_input_tokens: '8' }, {}],
  ]) {
    const provider = createProvider({ apiUrl: 'https://api.example', accountHash, token: async () => 'token',
      fetchImpl: async () => providerReply('{}', { usage: { prompt_tokens: 42, completion_tokens: 12, ...reported } }) });
    const result = await provider(prepared, signal());
    assert.deepEqual(Object.fromEntries(Object.entries(result.usage).filter(([key]) => key.startsWith('cache'))), expected);
  }
});

test('401/403, rate limits and incomplete output have safe errors and no retry', async () => {
  for (const status of [401, 403, 429, 500]) {
    let count = 0;
    const provider = createProvider({ apiUrl: 'https://api.example', accountHash, token: async () => 'token', fetchImpl: async () => { count++; return new Response('private error text', { status }); } });
    await assert.rejects(() => provider(prepared, signal()), (e) => !e.message.includes('private'));
    assert.equal(count, 1);
  }
  for (const response of [providerReply('truncated', { choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }), new Response('not json', { headers: { 'Content-Type': 'application/json' } }), providerReply('x'.repeat(MAX_FRAME_BYTES + 1))]) {
    const provider = createProvider({ apiUrl: 'https://api.example', accountHash, token: async () => 'token', fetchImpl: async () => response });
    await assert.rejects(() => provider(prepared, signal()), { code: 'PROVIDER_INVALID' });
  }
});

test('specialist validates before inference, finalizes before persistence and reports timings', async () => {
  const f = await fixture();
  const result = await f.call('create_prd', { brief: 'Build a useful product' }, signal());
  assert.equal(result.isError, false);
  assert.deepEqual(f.calls.map((c) => c.operation), ['prepare', 'finalize', 'prepare_review', 'validate_review']);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].record.inputSha256, hash({ brief: 'Build a useful product' }));
  assert.equal(f.calls[1].context, prepared.context);
  assert.equal(result.structuredContent.execution.orchestration, 'local');
  for (const key of ['prepareMs', 'inferenceMs', 'validateMs', 'persistMs', 'totalMs']) assert.ok(Number.isFinite(result.structuredContent.timings[key]));
  assert.equal(JSON.stringify(f.saved).includes('token-not-persisted'), false);
});

test('ordinary tools and oversized inputs never reach the kernel/provider', async () => {
  const f = await fixture();
  for (const [name, input] of [['get_weather', { location: 'Bremen' }], ['search_web', { query: 'local news' }], ['create_prd', { brief: 'x'.repeat(160_001) }], ['create_prd', []]]) {
    const result = await f.call(name, input, signal()); assert.equal(result.structuredContent.error.code, 'INVALID_INPUT');
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.saved.length, 0);
});

test('text-only MCP consumers can find the artifact only after successful persistence', async () => {
  const f = await fixture();
  const result = await f.call('create_prd', { brief: 'Draft' }, signal());
  assert.equal(f.saved.length, 1);
  assert.ok(result.content[0].text.startsWith(finalized.markdown));
  assert.ok(result.content[0].text.includes('Saved local Axwise JSON artifact: "/test/artifact.json"'));
  const failed = await fixture({ save: async () => { throw new Error('disk unavailable'); } });
  const failure = await failed.call('create_prd', { brief: 'Draft' }, signal());
  assert.equal(failure.isError, true);
  assert.equal(failure.content[0].text.includes('Saved local Axwise JSON artifact:'), false);
});

test('validation failure leaves no completed local artifact', async () => {
  const f = await fixture({ kernel: async (request) => { if (request.operation === 'prepare') return prepared;
    throw new LocalAxwiseError('VALIDATION_FAILED', 'The generated artifact did not pass local validation.'); } });
  const result = await f.call('create_prd', { brief: 'Draft' }, signal());
  assert.equal(result.structuredContent.error.code, 'VALIDATION_FAILED');
  assert.equal(f.saved.length, 0);
});

test('cancellation aborts provider and does not finalize or persist', async () => {
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  let providerAborted = false;
  const f = await fixture({ provider: async (_request, requestSignal) => new Promise((_, reject) => {
    entered(); requestSignal.addEventListener('abort', () => { providerAborted = true; reject(requestSignal.reason); }, { once: true });
  }) });
  const controller = new AbortController();
  const operation = f.call('create_prd', { brief: 'Draft' }, controller.signal);
  await ready; controller.abort();
  const result = await operation;
  assert.equal(result.structuredContent.error.code, 'CANCELLED');
  assert.equal(providerAborted, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.saved.length, 0);
});

test('concurrent calls return busy without another model request', async () => {
  let entered, finish;
  const ready = new Promise((resolve) => { entered = resolve; });
  const f = await fixture({ provider: async () => { entered(); return new Promise((resolve) => { finish = resolve; }); } });
  const first = f.call('simulate_interviews', { brief: 'First' }, signal());
  await ready;
  assert.equal((await f.call('create_prd', { brief: 'Second' }, signal())).structuredContent.error.code, 'BUSY');
  finish({ response: '{}', usage: { modelCalls: 1 } });
  await first;
});

test('local persistence scopes account/conversation, hashes output and never overwrites', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-artifacts-'));
  const request = { stateDir, accountHash, conversationId, operationId: '11111111-1111-4111-8111-111111111111', record: { artifact: 'private selected content', inputSha256: 'abc' } };
  const saved = await saveArtifact(request, signal());
  const bytes = await readFile(saved.path, 'utf8');
  assert.equal(saved.sha256, hash(bytes));
  assert.ok(saved.path.includes(`${accountHash}/${conversationId}/`));
  assert.equal((await stat(saved.path)).mode & 0o777, 0o600);
  await assert.rejects(() => saveArtifact(request, signal()), { code: 'EEXIST' });
  assert.equal(await readFile(saved.path, 'utf8'), bytes);
});

test('artifact scope rejects symlinked account directories and traversal', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-artifacts-symlink-'));
  const other = await mkdtemp(join(tmpdir(), 'axwise-other-'));
  await symlink(other, join(stateDir, accountHash));
  const request = { stateDir, accountHash, conversationId, operationId: '11111111-1111-4111-8111-111111111111', record: {} };
  await assert.rejects(() => saveArtifact(request, signal()), { code: 'STATE_UNAVAILABLE' });
  await assert.rejects(() => saveArtifact({ ...request, conversationId: '../escape' }, signal()));
});

test('cancellation during persistence leaves no published artifact or temporary file', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-artifacts-cancel-'));
  const controller = new AbortController();
  await assert.rejects(() => saveArtifact({ stateDir, accountHash, conversationId, operationId: '22222222-2222-4222-8222-222222222222', record: { artifact: 'draft' },
    writeArtifact: async (file, bytes) => { await file.writeFile(bytes); controller.abort(); } }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(await readdir(join(stateDir, accountHash, conversationId)), []);
});

test('partial persistence errors never publish partial artifacts', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'axwise-artifacts-partial-'));
  await assert.rejects(() => saveArtifact({ stateDir, accountHash, conversationId, operationId: '33333333-3333-4333-8333-333333333333', record: { artifact: 'draft' },
    writeArtifact: async (file, bytes) => { await file.writeFile(bytes.slice(0, 3)); throw new Error('disk full'); } }, signal()), /disk full/);
  assert.deepEqual(await readdir(join(stateDir, accountHash, conversationId)), []);
});

test('MCP initialization and tool discovery do not call specialists or model', async () => {
  const input = new PassThrough(); let output = '', called = false;
  const sink = new Writable({ write(chunk, _encoding, callback) { output += chunk; callback(); } });
  const serving = serveMcp({ tools: validateTools(description), input, output: sink, call: async () => { called = true; } });
  input.end([{ id: 1, method: 'initialize' }, { id: 2, method: 'tools/list' }, { id: 3, method: 'ping' }].map((message) => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n');
  await serving;
  const replies = output.trim().split('\n').map(JSON.parse);
  assert.equal(replies.length, 3);
  assert.equal(replies[0].result.instructions, AXWISE_CONVERSATION_POLICY);
  assert.equal(replies[1].result.tools.length, 8);
  assert.equal(called, false);
});

test('MCP rejects overlong frames, recovers framing and cancels active tool calls', async () => {
  const input = new PassThrough(); let output = '', entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const sink = new Writable({ write(chunk, _encoding, callback) { output += chunk; callback(); } });
  const serving = serveMcp({ tools: validateTools(description), input, output: sink,
    call: async (_tool, _args, requestSignal) => new Promise((resolve) => { entered(); requestSignal.addEventListener('abort', () => resolve({ isError: true, content: [{ type: 'text', text: 'cancelled' }] })); }) });
  input.write('x'.repeat(MAX_FRAME_BYTES + 1) + '\n');
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_prd', arguments: { brief: 'draft' } } }) + '\n');
  await ready;
  input.end(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2 } }) + '\n');
  await serving;
  const replies = output.trim().split('\n').map(JSON.parse);
  assert.equal(replies[0].error.code, -32700);
  assert.equal(replies.at(-1).result.content[0].text, 'cancelled');
});

test('MCP never executes duplicate tool request IDs, even after completion', async () => {
  const input = new PassThrough(); let output = '', calls = 0, resolveResult;
  let responseReady = new Promise((resolve) => { resolveResult = resolve; });
  const sink = new Writable({ write(chunk, _encoding, callback) {
    output += chunk; if (String(chunk).includes('"id":2,"result"')) resolveResult(); callback();
  } });
  const serving = serveMcp({ tools: validateTools(description), input, output: sink,
    call: async () => { calls++; return { isError: false, content: [{ type: 'text', text: 'draft' }] }; } });
  const call = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_prd', arguments: { brief: 'draft' } } }) + '\n';
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
  input.write(call);
  await responseReady;
  input.end(call);
  await serving;
  assert.equal(calls, 1);
  assert.equal(output.trim().split('\n').map(JSON.parse).at(-1).error.code, -32600);
});

test('disconnect aborts in-flight inference before serving exits', async () => {
  const input = new PassThrough(); let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let aborted = false;
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const serving = serveMcp({ tools: validateTools(description), input, output: sink,
    call: async (_name, _input, requestSignal) => new Promise((resolve) => {
      started(); requestSignal.addEventListener('abort', () => { aborted = true; resolve({ isError: true, content: [] }); });
    }) });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_prd', arguments: { brief: 'draft' } } }) + '\n');
  await ready;
  input.end();
  await serving;
  assert.equal(aborted, true);
});

test('Python worker bridge sends bounded protocol and kills the process on cancellation', async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const kills = []; child.kill = (value) => { kills.push(value); if (value === 'SIGTERM') queueMicrotask(() => child.emit('close', 1)); };
  let spawnOptions;
  const kernel = createKernel({ python: '/python', kernelRoot: '/kernel', spawnImpl: (_exe, args, options) => { spawnOptions = options; assert.ok(args.includes('backend.services.local_axwise.worker')); return child; } });
  const controller = new AbortController();
  const operation = kernel({ operation: 'prepare', tool: 'create_prd', input: { brief: 'selected' } }, controller.signal);
  controller.abort();
  await assert.rejects(() => operation, { code: 'CANCELLED' });
  assert.ok(kills.includes('SIGTERM'));
  assert.equal(spawnOptions.env.GEMINI_API_KEY, undefined);
  assert.equal(spawnOptions.cwd, '/kernel');
});

test('worker input guidance uses only fixed safe codes, never arbitrary exception text', async () => {
  async function check(code, expected, expectedCode = 'INVALID_INPUT') {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => true;
    child.stdin.on('data', (bytes) => queueMicrotask(() => {
      const request = JSON.parse(bytes.toString());
      child.stdout.write(JSON.stringify({ id: request.id, ok: false, error: { code, message: 'PRIVATE_SELECTED_TEXT' } }));
      child.emit('close', 0);
    }));
    const kernel = createKernel({ python: '/python', kernelRoot: '/kernel', spawnImpl: () => child });
    await assert.rejects(kernel({ operation: 'prepare' }), (error) => {
      assert.equal(error.code, expectedCode);
      assert.match(error.message, expected);
      assert.equal(error.message.includes('PRIVATE_SELECTED_TEXT'), false);
      return true;
    });
  }
  await check('AXWISE_LOCAL_MISSING_SYNTHETIC_QUESTION_ID', /original questionId.*do not invent/);
  await check('AXWISE_LOCAL_MISSING_SOURCE_ORIGIN', /requires its original origin/);
  await check('DOCUMENT_CONTEXT_REQUIRED', /exact saved document.*operationId and sha256 to references.*documentReference/, 'DOCUMENT_CONTEXT_REQUIRED');
  await check('AXWISE_LOCAL_INVALID_INPUT', /Check the tool schema/);
  await check('__proto__', /Check the tool schema/);
});

test('missing persona document stops before any inference or artifact publication', async () => {
  let providerCalls = 0;
  const kernelCalls = [];
  const f = await fixture({ kernel: async (request) => {
    kernelCalls.push(request.operation);
    throw new LocalAxwiseError('DOCUMENT_CONTEXT_REQUIRED', 'Select the exact saved document in references.');
  }, provider: async () => { providerCalls++; throw new Error('must not run'); } });
  const result = await f.call('chat_with_persona', { personaId: 'persona-1', message: 'What remains in this PRD?' }, signal());
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, 'DOCUMENT_CONTEXT_REQUIRED');
  assert.match(result.content[0].text, /Select the exact saved document/);
  assert.deepEqual(kernelCalls, ['prepare']);
  assert.equal(providerCalls, 0);
  assert.equal(f.saved.length, 0);
});

test('analysis contract diagnostics survive the bridge without arbitrary worker text', async () => {
  for (const code of ['MISSING_CONFLICT_GAP', 'MISSING_INSUFFICIENT_GAP', 'UNREQUESTED_ANALYSIS_OUTPUT']) {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => true;
    child.stdin.on('data', (bytes) => queueMicrotask(() => {
      const request = JSON.parse(bytes.toString());
      child.stdout.write(JSON.stringify({ id: request.id, ok: false,
        error: { code: 'AXWISE_LOCAL_INVALID_OUTPUT', message: 'PRIVATE_SELECTED_TEXT', diagnostics: [code, 'PRIVATE_SELECTED_TEXT'] } }));
      child.emit('close', 0);
    }));
    const kernel = createKernel({ python: '/python', kernelRoot: '/kernel', spawnImpl: () => child });
    await assert.rejects(kernel({ operation: 'finalize', tool: 'analyze_interviews' }), (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      assert.deepEqual(error.diagnostics, [code]);
      assert.equal(error.message.includes('PRIVATE_SELECTED_TEXT'), false);
      return true;
    });
  }
});
