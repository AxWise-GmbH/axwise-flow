import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createMcpTools, serveMcp } from '../src/mcp.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const base = { apiUrl: 'https://preview.example', conversationId: '20260914_1', accountHash: 'a'.repeat(64), token: async () => 'test-secret', newId: () => id };
const response = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

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
    return response({ status: 'accepted', requestId: id });
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
  assert.equal(replies[0].result.serverInfo.version, '0.3.0');
  assert.match(replies[0].result.instructions, /^Orqanix capabilities and project context/);
  assert.equal(replies[1].result.tools.length, 6);
  assert.equal(replies[1].result.tools[0].annotations.readOnlyHint, false);
  assert.deepEqual(replies[1].result.tools.map(tool => tool.name), [
    'ask_axwise', 'generate_image', 'lookup_live_data', 'axwise_work_status',
    'cancel_axwise_work', 'read_goal_artifact',
  ]);
  assert.deepEqual(replies[1].result.tools.map(tool => tool.title), [
    'Research on demand', 'Create image', 'Live data card', 'Check work result',
    'Cancel work', 'Read project document',
  ]);
});
