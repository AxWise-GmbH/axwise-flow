import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createMcpTools, parseMcpLaunchArguments, serveMcp } from '../src/mcp.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const base = { apiUrl: 'https://preview.example', conversationId: '20260914_1', accountHash: 'a'.repeat(64), token: async () => 'test-secret', newId: () => id };
const response = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

test('packaged launch arguments require one explicit boolean JEV setting', () => {
  const accountHash = 'a'.repeat(64);
  const baseArgs = ['--config', '/public/config.json', '--conversation-id', 'chat_1', '--account-hash', accountHash];
  assert.deepEqual(parseMcpLaunchArguments([...baseArgs, '--jev-enabled', 'true']), {
    conversationId: 'chat_1', accountHash, jevEnabled: true,
    authArgs: ['--config', '/public/config.json'],
  });
  assert.equal(parseMcpLaunchArguments([...baseArgs, '--jev-enabled', 'false']).jevEnabled, false);
  for (const args of [
    baseArgs,
    [...baseArgs, '--jev-enabled', 'yes'],
    [...baseArgs, '--jev-enabled', 'true', '--jev-enabled', 'false'],
    [...baseArgs, '--conversation-id', 'chat_2', '--jev-enabled', 'true'],
  ]) assert.throws(() => parseMcpLaunchArguments(args));
});

test('cloud work is bound to native conversation and token never becomes tool content', async () => {
  const calls = [];
  const call = createMcpTools({ ...base, fetchImpl: async (...args) => {
    calls.push(args); return response({ status: args[1].method === 'GET' ? 'completed' : 'pending', requestId: id });
  } });
  const value = await call('ask_axwise', { question: 'Explain retries' });
  assert.equal(value.isError, false);
  assert.equal(JSON.parse(calls[0][1].body).conversationId, base.conversationId);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[0][1].headers['X-Orqaly-Account-Hash'], base.accountHash);
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
  await call('axwise_work_status', { requestId: id });
  assert.equal(calls[1][1].method, 'GET');
  assert.equal(calls[1][0], `https://preview.example/desktop/v1/work/20260914_1/${id}`);
});
test('research sends only explicitly selected artifact IDs and rejects invalid references locally', async () => {
  const calls = [];
  const call = createMcpTools({ ...base, fetchImpl: async (url, options) => {
    calls.push(JSON.parse(options.body)); return response({ status: 'running', requestId: id });
  } });
  for (const args of [
    { artifactIds: [id] }, { runId: id, artifactIds: [id, id] },
    { runId: id, artifactIds: ['../../file'] }, { runId: id, artifactIds: 'all' },
    { runId: id, artifactIds: Array.from({ length: 6 }, (_, i) => `${i + 1}1111111-1111-4111-8111-111111111111`) },
  ]) assert.equal((await call('ask_axwise', { question: 'Explain retries', ...args })).isError, true);
  assert.equal(calls.length, 0);
  await call('ask_axwise', { question: 'Explain retries' });
  assert.equal(Object.hasOwn(calls[0], 'runId'), false);
  assert.equal(Object.hasOwn(calls[0], 'artifactIds'), false);
  await call('ask_axwise', { question: 'Explain retries', runId: id, artifactIds: [id] });
  assert.equal(calls[1].runId, id);
  assert.deepEqual(calls[1].artifactIds, [id]);
});
test('explicit image and live-data tools send typed capabilities without invoking research routing', async () => {
  const calls = [];
  const call = createMcpTools({ ...base, fetchImpl: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return response({ status: calls.length === 1 ? 'accepted' : 'completed', requestId: id, kind: 'research' });
  } });
  assert.equal((await call('generate_image', { prompt: 'A blue robot', aspectRatio: '16:9' })).isError, false);
  assert.deepEqual(calls[0].capability, {
    kind: 'image_generate', imageSize: '1K', aspectRatio: '16:9',
  });
  assert.equal(calls[0].question, 'A blue robot');

  assert.equal((await call('lookup_live_data', {
    kind: 'weather', location: 'Berlin', temperatureUnit: 'C',
  })).isError, false);
  assert.deepEqual(calls[1].capability, { kind: 'weather', location: 'Berlin', tempUnit: 'C' });

  assert.equal((await call('lookup_live_data', {
    kind: 'currency', base: 'EUR', quote: 'USD', amount: '10.50',
  })).isError, false);
  assert.deepEqual(calls[2].capability, {
    kind: 'currency', base: 'EUR', quote: 'USD', amount: '10.50',
  });
  assert.equal((await call('lookup_live_data', {
    kind: 'currency', base: 'eur', quote: 'USD', amount: '10',
  })).isError, true);
  assert.equal(calls.length, 3);
});
test('live-data lookup starts and polls one durable request to completion in one tool call', async () => {
  let elapsed = 0;
  const calls = [];
  let submitted;
  const states = [
    { requestId: id, status: 'accepted', kind: 'research' },
    { requestId: id, status: 'running', kind: 'research', retryAfterSeconds: 1 },
    { requestId: id, status: 'completed', kind: 'research', presentations: [{ kind: 'weather' }] },
  ];
  const call = createMcpTools({ ...base, clock: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      if (options.method === 'POST') submitted = JSON.parse(options.body);
      return response(states.shift());
    },
  });

  const value = await call('lookup_live_data', {
    kind: 'weather', location: 'Bremen',
  });

  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.status, 'completed');
  assert.equal(value.structuredContent.kind, 'weather');
  assert.deepEqual(submitted.capability, { kind: 'weather', location: 'Bremen', tempUnit: 'C' });
  assert.deepEqual(calls, [
    ['https://preview.example/desktop/v1/work', 'POST'],
    [`https://preview.example/desktop/v1/work/${base.conversationId}/${id}`, 'GET'],
    [`https://preview.example/desktop/v1/work/${base.conversationId}/${id}`, 'GET'],
  ]);
  assert.equal(elapsed, 3000);
});
test('quick info sends one bounded capability with the desktop JEV routing mode', async () => {
  let elapsed = 0;
  const calls = [];
  const states = [
    { requestId: id, status: 'accepted', kind: 'research' },
    { requestId: id, status: 'completed', kind: 'research', markdown: 'Werder won 2-1.' },
  ];
  const call = createMcpTools({ ...base, jevEnabled: true, clock: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    fetchImpl: async (url, options) => {
      calls.push([url, options.method, options.body && JSON.parse(options.body)]);
      return response(states.shift());
    },
  });

  const value = await call('quick_info', {
    query: 'What was the latest Werder Bremen score?', location: 'Bremen',
  });

  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.status, 'completed');
  assert.equal(value.structuredContent.kind, 'quick_info');
  assert.deepEqual(calls[0][2].capability, {
    kind: 'quick_info', location: 'Bremen', routingMode: 'jev',
  });
  assert.equal(calls[0][2].question, 'What was the latest Werder Bremen score?');
  assert.equal(calls.length, 2);
  assert.equal(elapsed, 0);
});
test('quick info remains available with JEV explicitly disabled for benchmarking', async () => {
  const calls = [];
  const call = createMcpTools({ ...base, jevEnabled: false, fetchImpl: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return response({ requestId: id, status: 'completed', markdown: 'Open until 20:00.' });
  } });

  const value = await call('quick_info', { query: 'When does IKEA Bremen close today?' });

  assert.equal(value.isError, false);
  assert.deepEqual(calls[0].capability, { kind: 'quick_info', routingMode: 'explicit' });
  for (const args of [
    { query: '' },
    { query: 'x'.repeat(2001) },
    { query: 'Latest local headlines', location: ' ' },
  ]) assert.equal((await call('quick_info', args)).isError, true);
  assert.equal(calls.length, 1);
});
test('quick-info failure forbids automatic research, web, shell, or OMP fallback', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base, fetchImpl: async () => response(++calls === 1
    ? { requestId: id, status: 'pending', kind: 'research' }
    : { requestId: id, status: 'failed', kind: 'research', error: { code: 'AXWISE_ASSISTANT_QUICK_ROUTE_MISMATCH' } }),
  });

  const value = await call('quick_info', { query: 'Compare all local newspapers.' });

  assert.equal(value.structuredContent.kind, 'quick_info');
  assert.equal(value.structuredContent.automaticFallback, 'disabled');
  assert.match(value.structuredContent.next, /routing mismatch/i);
  assert.match(value.structuredContent.next, /research.*web-search.*fetch.*shell.*OMP/i);
});
test('live-data terminal failure forbids an automatic research, web, shell, or OMP fallback', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base,
    fetchImpl: async () => response(++calls === 1
      ? { requestId: id, status: 'pending', kind: 'research' }
      : { requestId: id, status: 'failed', kind: 'research', error: { code: 'LIVE_DATA_FAILED' } }),
  });

  const value = await call('lookup_live_data', {
    kind: 'currency', base: 'EUR', quote: 'USD', amount: '10',
  });

  assert.equal(calls, 2);
  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.status, 'failed');
  assert.equal(value.structuredContent.kind, 'currency');
  assert.equal(value.structuredContent.automaticFallback, 'disabled');
  assert.match(value.structuredContent.next, /ask the user/i);
  assert.match(value.structuredContent.next, /web-search.*fetch.*shell.*OMP/i);
});
test('same-request status recovery preserves the remembered live-data kind and failure contract', async () => {
  let calls = 0; let elapsed = 0;
  const call = createMcpTools({ ...base, statusWaitMs: 1, clock: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    fetchImpl: async (_url, options) => {
      calls++;
      if (options.method === 'POST') return response({ requestId: id, status: 'running', kind: 'research' });
      return response({ requestId: id, status: calls === 2 ? 'running' : 'failed', kind: 'research' });
    },
  });
  const started = await call('lookup_live_data', { kind: 'weather', location: 'Bremen' });
  assert.equal(started.structuredContent.status, 'running');
  assert.equal(started.structuredContent.kind, 'weather');
  const recovered = await call('axwise_work_status', { requestId: id });
  assert.equal(recovered.structuredContent.kind, 'weather');
  assert.equal(recovered.structuredContent.automaticFallback, 'disabled');
});
test('status recovery after a connector restart preserves the durable quick-info failure contract', async () => {
  const call = createMcpTools({ ...base, fetchImpl: async () => response({
    requestId: id, status: 'failed', kind: 'quick_info',
    error: { code: 'AXWISE_ASSISTANT_QUICK_ROUTE_MISMATCH' },
  }) });

  const value = await call('axwise_work_status', { requestId: id });

  assert.equal(value.structuredContent.kind, 'quick_info');
  assert.equal(value.structuredContent.automaticFallback, 'disabled');
  assert.match(value.structuredContent.next, /routing mismatch/i);
  assert.match(value.structuredContent.next, /research.*web-search.*fetch.*shell.*OMP/i);
});
test('status recovery remembers a durable bounded kind before a later transport failure', async () => {
  let calls = 0; let elapsed = 0;
  const call = createMcpTools({ ...base, statusWaitMs: 5000, clock: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? response({ requestId: id, status: 'running', kind: 'quick_info' })
        : new Response('', { status: 503 });
    },
  });

  const value = await call('axwise_work_status', { requestId: id });

  assert.equal(calls, 2);
  assert.equal(value.isError, true);
  assert.equal(value.structuredContent.kind, 'quick_info');
  assert.equal(value.structuredContent.automaticFallback, 'disabled');
  assert.match(value.structuredContent.next, /same requestId.*research.*web-search.*fetch.*shell.*OMP/i);
});
test('generated image bytes become an MCP image block and structured content keeps a safe reference', async () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('generated'),
  ]).toString('base64');
  const sha256 = createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex');
  const state = { status: 'completed', requestId: id, presentations: [{
    schemaVersion: 'axwise.presentation.generated-image.v1', kind: 'generated_image',
    mimeType: 'image/png', data: png, sha256, alt: 'Blue robot',
    model: 'gemini-3.1-flash-image',
  }] };
  const call = createMcpTools({ ...base, fetchImpl: async () => response(state) });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, false);
  assert.equal(value.content[1].type, 'image');
  assert.equal(value.content[1].data, png);
  assert.equal(value.content[1].mimeType, 'image/png');
  assert.equal(value.structuredContent.presentations[0].contentIndex, 1);
  assert.equal(value.structuredContent.presentations[0].sha256, sha256);
  assert.equal(value.structuredContent.presentations[0].model, 'gemini-3.1-flash-image');
  assert.equal(Object.hasOwn(value.structuredContent.presentations[0], 'data'), false);
  assert.equal(JSON.stringify(value.structuredContent).includes(png), false);
});
test('a cancellation that loses the completion race still returns the completed capability result', async () => {
  const weather = {
    schemaVersion: 'axwise.presentation.weather.v1', kind: 'weather', location: 'Berlin',
    observedAt: '2026-09-22T10:30:00Z', temperature: '17', temperatureUnit: 'C',
    condition: 'Partly cloudy', forecast: [],
    source: { title: 'Weather office', url: 'https://example.com/weather' },
  };
  const calls = [];
  const call = createMcpTools({ ...base, fetchImpl: async (url, options) => {
    calls.push([url, options.method, options.body]);
    return response({ status: 'completed', requestId: id, presentations: [weather] });
  } });

  const value = await call('cancel_axwise_work', { requestId: id });

  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.status, 'completed');
  assert.deepEqual(value.structuredContent.presentations, [weather]);
  assert.deepEqual(calls, [[
    `https://preview.example/desktop/v1/work/${base.conversationId}/${id}/cancel`,
    'POST',
    '{}',
  ]]);
});
test('invalid generated image payload fails closed instead of exposing base64 in structured content', async () => {
  const call = createMcpTools({ ...base, fetchImpl: async () => response({
    status: 'completed', requestId: id, presentations: [{
      schemaVersion: 'axwise.presentation.generated-image.v1', kind: 'generated_image',
      mimeType: 'image/png', data: 'not-base64',
    }],
  }) });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, true);
  assert.deepEqual(value.structuredContent, { error: 'Orqanix returned an invalid presentation.' });
  assert.equal(value.content.length, 1);
});
test('generated image metadata must match the returned bytes', async () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('generated'),
  ]).toString('base64');
  const call = createMcpTools({ ...base, fetchImpl: async () => response({
    status: 'completed', requestId: id, presentations: [{
      schemaVersion: 'axwise.presentation.generated-image.v1', kind: 'generated_image',
      mimeType: 'image/png', data: png, sha256: '0'.repeat(64), alt: 'Blue robot',
      model: 'gemini-3.1-flash-image',
    }],
  }) });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, true);
  assert.equal(JSON.stringify(value).includes(png), false);
});
test('one invalid presentation removes image blocks staged earlier in the same result', async () => {
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('generated'),
  ]);
  const png = bytes.toString('base64');
  const valid = {
    schemaVersion: 'axwise.presentation.generated-image.v1', kind: 'generated_image',
    mimeType: 'image/png', data: png,
    sha256: createHash('sha256').update(bytes).digest('hex'), alt: 'Blue robot',
    model: 'gemini-3.1-flash-image',
  };
  const call = createMcpTools({ ...base, fetchImpl: async () => response({
    status: 'completed', requestId: id, presentations: [valid, { ...valid, sha256: '0'.repeat(64) }],
  }) });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, true);
  assert.deepEqual(value.content.map((block) => block.type), ['text']);
  assert.equal(JSON.stringify(value).includes(png), false);
});
test('one status call polls only the same request, honors server delays and returns completed research', async () => {
  let elapsed = 0;
  const calls = []; const sleeps = [];
  const states = [
    { requestId: id, status: 'running', retryAfterSeconds: 2 },
    { requestId: id, status: 'running', retryAfterSeconds: 4 },
    { requestId: id, status: 'completed', markdown: 'Research result', sources: [{ url: 'https://example.org/source' }] },
  ];
  const call = createMcpTools({ ...base, clock: () => elapsed,
    newId: () => { throw new Error('Status must not create work'); },
    sleep: async (ms) => { sleeps.push(ms); elapsed += ms; },
    fetchImpl: async (url, options) => { calls.push([url, options.method]); return response(states.shift()); },
  });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.status, 'completed');
  assert.equal(value.structuredContent.markdown, 'Research result');
  assert.equal(value.structuredContent.sources.length, 1);
  assert.deepEqual(sleeps, [3000, 4000]);
  assert.deepEqual(calls, Array(3).fill([`https://preview.example/desktop/v1/work/${base.conversationId}/${id}`, 'GET']));
});
test('bounded wait returns the latest state without shortening a server delay or cancelling work', async () => {
  let elapsed = 0; let calls = 0;
  const call = createMcpTools({ ...base, statusWaitMs: 7000, clock: () => elapsed,
    sleep: async (ms) => { elapsed += ms; },
    fetchImpl: async () => { calls++; return response({ requestId: id, status: 'running', retryAfterSeconds: 10 }); },
  });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, false);
  assert.equal(calls, 1);
  assert.equal(elapsed, 7000);
  assert.equal(value.structuredContent.status, 'running');
  assert.equal(value.structuredContent.requestId, id);
  assert.equal(value.structuredContent.retryAfterSeconds, 3);
  assert.equal(value.structuredContent.waitExpired, true);
  assert.match(value.structuredContent.next, /same requestId/);
});
test('terminal failure and cancellation are returned unchanged without polling or retrying', async () => {
  for (const status of ['failed', 'cancelled']) {
    let calls = 0;
    const state = { requestId: id, status, ...(status === 'failed' ? { error: { code: 'RESEARCH_FAILED', retryMode: 'none' } } : {}) };
    const call = createMcpTools({ ...base,
      sleep: async () => { throw new Error('Terminal work must not be polled'); },
      fetchImpl: async () => { calls++; return response(state); },
    });
    assert.deepEqual((await call('axwise_work_status', { requestId: id })).structuredContent, state);
    assert.equal(calls, 1);
  }
});
test('status errors are exposed without automatic retries and retain the same request ID', async () => {
  let elapsed = 0; let calls = 0;
  const call = createMcpTools({ ...base, clock: () => elapsed, sleep: async (ms) => { elapsed += ms; },
    fetchImpl: async () => ++calls === 1 ? response({ requestId: id, status: 'running', retryAfterSeconds: 1 })
      : new Response('test-secret', { status: 429 }),
  });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(calls, 2);
  assert.equal(value.isError, true);
  assert.equal(value.structuredContent.requestId, id);
  assert.equal(value.structuredContent.status, 'unknown');
  assert.match(value.structuredContent.error, /busy/);
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
});
test('cancelling a status wait stops polling without sending a cloud cancellation', async () => {
  const controller = new AbortController(); let calls = 0;
  const call = createMcpTools({ ...base,
    sleep: async (ms, signal) => { controller.abort(); signal.throwIfAborted(); },
    fetchImpl: async () => { calls++; return response({ requestId: id, status: 'running', retryAfterSeconds: 1 }); },
  });
  const value = await call('axwise_work_status', { requestId: id }, controller.signal);
  assert.equal(calls, 1);
  assert.equal(value.isError, true);
  assert.equal(value.structuredContent.requestId, id);
  assert.match(value.structuredContent.error, /Cloud work was not cancelled/);
});
test('deadline also aborts an in-flight poll and reports the latest observed state', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base, statusWaitMs: 50, sleep: async () => {},
    fetchImpl: async (url, { signal }) => {
      if (++calls === 1) return response({ requestId: id, status: 'running', retryAfterSeconds: 1 });
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    },
  });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(calls, 2);
  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.status, 'running');
  assert.equal(value.structuredContent.waitExpired, true);
});
test('the status deadline includes token acquisition and never claims an unobserved status', async () => {
  let finishToken;
  let fetches = 0;
  const call = createMcpTools({ ...base, statusWaitMs: 20,
    token: () => new Promise((resolve) => { finishToken = resolve; }),
    fetchImpl: async () => { fetches++; return response({ status: 'completed' }); },
  });
  const value = await call('axwise_work_status', { requestId: id });
  assert.equal(value.isError, true);
  assert.equal(value.structuredContent.status, 'unknown');
  assert.equal(value.structuredContent.requestId, id);
  finishToken('test-secret');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetches, 0);
});
test('ambiguous submissions retain request ID without automatic paid retries or leaked errors', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base, fetchImpl: async () => { calls++; throw new Error('test-secret'); } });
  const value = await call('ask_axwise', { question: 'Explain retries' });
  assert.equal(calls, 1); assert.equal(value.structuredContent.status, 'unknown');
  assert.equal(value.structuredContent.requestId, id);
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
});
test('argument and account failures do not redirect requests or expose response bodies', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base, fetchImpl: async () => { calls++; return new Response('test-secret', { status: 403 }); } });
  assert.equal((await call('read_goal_artifact', { runId: '../../evil' })).isError, true);
  assert.equal((await call('ask_axwise', { question: 'test', url: 'https://evil.example' })).isError, true);
  assert.equal(calls, 0);
  const value = await call('ask_axwise', { question: 'test' });
  assert.equal(value.structuredContent.status, 'not_started');
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
});
test('stdio handshake exposes native tools and emits only JSON-RPC', async () => {
  const input = new PassThrough(); const output = new PassThrough(); let received = '';
  output.on('data', (data) => { received += data.toString(); });
  const run = serveMcp({ input, output, call: async () => ({ content: [] }) });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
  input.end(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await run;
  const replies = received.trim().split('\n').map(JSON.parse);
  assert.equal(replies[0].result.serverInfo.name, 'orqaly');
  assert.equal(replies[0].result.serverInfo.version, '0.3.1');
  assert.match(replies[0].result.instructions, /^Orqanix capabilities and project context/);
  assert.match(replies[0].result.instructions, /simple current weather or currency/);
  assert.match(replies[0].result.instructions, /one narrow current public fact/);
  assert.match(replies[0].result.instructions, /Do not automatically replace/);
  assert.equal(replies[1].result.tools.length, 7);
  assert.match(replies[1].result.tools[0].description, /Never use this for a simple weather\/currency/);
  assert.match(replies[1].result.tools[2].description, /starts one durable request and waits/);
  assert.match(replies[1].result.tools[3].description, /local headlines.*opening hours/);
  assert.equal(replies[1].result.tools[0].annotations.readOnlyHint, false);
  assert.deepEqual(replies[1].result.tools.map(tool => tool.name), [
    'ask_axwise', 'generate_image', 'lookup_live_data', 'quick_info', 'axwise_work_status',
    'cancel_axwise_work', 'read_goal_artifact',
  ]);
  assert.deepEqual(replies[1].result.tools.map(tool => tool.title), [
    'Research on demand', 'Create image', 'Live data card', 'Quick current check', 'Check work result',
    'Cancel work', 'Read project document',
  ]);
});
