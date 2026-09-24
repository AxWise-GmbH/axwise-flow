import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  UTILITY_TOOLS, createUtilityTools, parseUtilityArguments, resolveUtilityToken,
  serveUtilitiesMcp,
} from '../src/utilities-mcp.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const accountHash = 'a'.repeat(64);
const base = { apiUrl: 'https://preview.example', conversationId: 'benchmark_1', accountHash,
  token: async () => 'test-secret', newId: () => id };
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});

test('utility launch keeps OAuth configuration separate from a local relay override', () => {
  assert.deepEqual(parseUtilityArguments([
    '--config', '/public/config.json', '--conversation-id', 'benchmark_1',
    '--account-hash', accountHash, '--api-url', 'http://127.0.0.1:9111',
  ]), {
    configPath: '/public/config.json', conversationId: 'benchmark_1', accountHash,
    apiUrlOverride: 'http://127.0.0.1:9111',
  });
  for (const value of ['http://localhost:9111', 'http://192.168.1.2:9111',
    'https://user:pass@example.com', 'https://example.com/search', 'file:///tmp/x']) {
    assert.throws(() => parseUtilityArguments([
      '--config', '/public/config.json', '--conversation-id', 'benchmark_1',
      '--account-hash', accountHash, '--api-url', value,
    ]));
  }
  assert.throws(() => parseUtilityArguments([
    '--config', '/public/config.json', '--conversation-id', 'benchmark_1',
    '--account-hash', accountHash, '--api-url', 'https://example.com',
    '--api-url', 'https://elsewhere.example',
  ]));
});

test('test token mode is permitted only with an explicit 127.0.0.1 relay', async () => {
  const normalToken = async () => 'normal-token';
  const local = resolveUtilityToken({ apiUrlOverride: 'http://127.0.0.1:9111',
    testMode: 'true', testToken: 'local-secret', normalToken });
  assert.equal(await local(), 'local-secret');
  assert.equal(await resolveUtilityToken({ apiUrlOverride: null, normalToken })(), 'normal-token');
  for (const options of [
    { apiUrlOverride: null, testMode: 'true', testToken: 'local-secret' },
    { apiUrlOverride: 'https://preview.example', testMode: 'true', testToken: 'local-secret' },
    { apiUrlOverride: 'http://127.0.0.1:9111', testMode: undefined, testToken: 'local-secret' },
    { apiUrlOverride: 'http://127.0.0.1:9111', testMode: 'true', testToken: undefined },
  ]) assert.throws(() => resolveUtilityToken({ ...options, normalToken }));
});

test('local weather and currency return legacy cards without acquiring an account token', async () => {
  let tokenCalls = 0;
  const weatherPresentation = { schemaVersion: 'axwise.presentation.weather.v1', kind: 'weather',
    location: 'Bremen', observedAt: '2026-09-23T10:00:00.000Z', temperatureUnit: 'C',
    temperature: '18', condition: 'Clear sky', forecast: [],
    source: { title: 'Open-Meteo', url: 'https://api.open-meteo.com/v1/forecast' } };
  const currencyPresentation = { schemaVersion: 'axwise.presentation.currency.v1', kind: 'currency',
    base: 'EUR', quote: 'USD', amount: '10', convertedAmount: '11', rate: '1.1',
    asOf: '2026-09-23T00:00:00.000Z',
    source: { title: 'Frankfurter', url: 'https://api.frankfurter.dev/v2/rate/eur/usd' } };
  const call = createUtilityTools({ ...base, token: async () => { tokenCalls++; return 'secret'; },
    providers: {
      weather: async () => ({ presentation: weatherPresentation, markdown: 'Bremen weather.',
        sources: [weatherPresentation.source], cacheHit: false }),
      currency: async () => ({ presentation: currencyPresentation, markdown: '10 EUR is about 11 USD.',
        sources: [currencyPresentation.source], cacheHit: false }),
    },
  });
  const weather = await call('get_weather', { location: 'Bremen' });
  const currency = await call('convert_currency', { base: 'EUR', quote: 'USD', amount: '10' });
  assert.equal(tokenCalls, 0);
  for (const value of [weather, currency]) {
    assert.equal(value.isError, false);
    assert.equal(value.structuredContent.version, 'orqaly.desktop-work.v1');
    assert.equal(value.structuredContent.status, 'completed');
    assert.equal(value.structuredContent.conversationId, 'benchmark_1');
    assert.equal(value.structuredContent.requestId, id);
    assert.equal(value.structuredContent.presentations.length, 1);
    assert.equal(Object.hasOwn(value.structuredContent, 'terminalAnswer'), false);
    assert.equal(Object.hasOwn(value.structuredContent, 'runId'), false);
  }
  assert.equal(weather.structuredContent.kind, 'weather');
  assert.equal(currency.structuredContent.kind, 'currency');
});

test('search sends only authenticated query and filters, retaining partial evidence for the main model', async () => {
  const calls = [];
  const call = createUtilityTools({ ...base, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return response({ markdown: '- Party — [Venue](<https://example.com/party>)',
      sources: [{ title: 'Venue', url: 'https://example.com/party' }],
      outcome: 'partial', queries: ['parties Riga'], retrievedAt: '2026-09-23T12:00:00Z' });
  } });
  const value = await call('search_web', {
    query: 'Raves and parties near Riga this weekend', location: 'Riga', timeRange: 'this weekend', radiusKm: 150,
  });
  assert.equal(value.isError, false);
  assert.equal(value.structuredContent.outcome, 'partial');
  assert.equal(value.content[0].text, '- Party — [Venue](<https://example.com/party>)');
  assert.equal(value.structuredContent.sources[0].url, 'https://example.com/party');
  assert.equal(calls[0].url, 'https://preview.example/desktop/v1/search');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    query: 'Raves and parties near Riga this weekend', location: 'Riga',
    timeRange: 'this weekend', radiusKm: 150,
  });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[0].options.headers['X-Orqaly-Account-Hash'], accountHash);
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
});

test('search no-results is data; provider failure and invalid filters are errors', async () => {
  const noResults = createUtilityTools({ ...base, fetchImpl: async () => response({
    markdown: 'No verified matches found.', sources: [], outcome: 'no_results',
    retrievedAt: '2026-09-23T12:00:00Z',
  }) });
  const empty = await noResults('search_web', { query: 'Impossible event' });
  assert.equal(empty.isError, false);
  assert.equal(empty.structuredContent.outcome, 'no_results');

  let fetches = 0;
  const failure = createUtilityTools({ ...base, fetchImpl: async () => { fetches++; return response({}, 503); } });
  assert.equal((await failure('search_web', { query: 'Something', radiusKm: 150 })).isError, true);
  for (const filters of [
    { location: { length: 5, value: 'Riga' } },
    { location: ['Riga'] },
    { timeRange: { length: 12, value: 'this weekend' } },
  ]) assert.equal((await failure('search_web', { query: 'Something', ...filters })).isError, true);
  assert.equal(fetches, 0);
  const unavailable = await failure('search_web', { query: 'Something' });
  assert.equal(unavailable.isError, true);
  assert.equal(unavailable.structuredContent.error.code, 'SEARCH_UNAVAILABLE');
  assert.equal(fetches, 1);
});

test('cancelled search does not send a request after token acquisition stalls', async () => {
  let fetches = 0;
  const controller = new AbortController();
  const call = createUtilityTools({ ...base, token: async () => new Promise(() => {}),
    fetchImpl: async () => { fetches++; return response({}); },
  });
  const pending = call('search_web', { query: 'Bremen headlines' }, controller.signal);
  controller.abort();
  const result = await pending;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, 'CANCELLED');
  assert.equal(fetches, 0);
});

test('MCP server exposes only real weather/currency app resources and separate search tool', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const replies = [];
  let buffer = '';
  output.on('data', (part) => {
    buffer += part.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      replies.push(JSON.parse(buffer.slice(0, index))); buffer = buffer.slice(index + 1);
    }
  });
  const server = serveUtilitiesMcp({ input, output, call: async () => ({ content: [], isError: false }) });
  for (const message of [
    { id: 1, method: 'initialize', params: {} },
    { id: 2, method: 'tools/list', params: {} },
    { id: 3, method: 'resources/list', params: {} },
    { id: 4, method: 'resources/read', params: { uri: 'ui://desktop-utilities/weather' } },
    { id: 5, method: 'resources/read', params: { uri: 'ui://desktop-utilities/currency' } },
    { id: 6, method: 'resources/read', params: { uri: 'ui://desktop-utilities/unknown' } },
  ]) input.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  input.end();
  await server;
  assert.equal(replies.length, 6);
  assert.deepEqual(replies[0].result.capabilities, { tools: {}, resources: {} });
  assert.equal(replies[0].result.serverInfo.name, 'desktop-utilities');
  assert.deepEqual(replies[1].result.tools.map((tool) => tool.name),
    ['get_weather', 'convert_currency', 'search_web']);
  assert.equal(replies[1].result.tools[0]._meta.ui.resourceUri, 'ui://desktop-utilities/weather');
  assert.equal(replies[1].result.tools[1]._meta.ui.resourceUri, 'ui://desktop-utilities/currency');
  assert.equal(Object.hasOwn(replies[1].result.tools[2], '_meta'), false);
  assert.deepEqual(replies[2].result.resources.map((resource) => resource.uri),
    ['ui://desktop-utilities/weather', 'ui://desktop-utilities/currency']);
  for (const item of replies.slice(3, 5)) {
    assert.equal(item.result.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(item.result.contents[0].text, /ui\/notifications\/tool-result/);
    assert.match(item.result.contents[0].text, /textContent/);
    assert.doesNotMatch(item.result.contents[0].text, /innerHTML/);
  }
  assert.equal(replies[5].error.code, -32602);
  assert.deepEqual(UTILITY_TOOLS.map((tool) => tool.name),
    ['get_weather', 'convert_currency', 'search_web']);
});

test('MCP server handles another tool call while cancelling one active request', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const replies = [];
  let buffer = '';
  let release;
  const gotTwoCalls = new Promise((resolve) => { release = resolve; });
  output.on('data', (part) => {
    buffer += part.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const item = JSON.parse(buffer.slice(0, index));
      replies.push(item); buffer = buffer.slice(index + 1);
      if (replies.some((reply) => reply.id === 2) && replies.some((reply) => reply.id === 3)) release();
    }
  });
  const server = serveUtilitiesMcp({ input, output, call: async (name, _args, signal) => {
    if (name === 'get_weather') return new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve({ content: [{ type: 'text', text: 'cancelled' }], isError: true }), { once: true });
    });
    return { content: [{ type: 'text', text: 'currency ready' }], isError: false };
  } });
  const send = (message) => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  send({ id: 1, method: 'initialize', params: {} });
  send({ id: 2, method: 'tools/call', params: { name: 'get_weather', arguments: { location: 'Bremen' } } });
  send({ id: 3, method: 'tools/call', params: { name: 'convert_currency', arguments: { base: 'EUR', quote: 'USD', amount: '1' } } });
  await new Promise((resolve) => setImmediate(resolve));
  send({ method: 'notifications/cancelled', params: { requestId: 2 } });
  await gotTwoCalls;
  input.end(); await server;
  assert.equal(replies.find((reply) => reply.id === 2).result.isError, true);
  assert.equal(replies.find((reply) => reply.id === 3).result.content[0].text, 'currency ready');
});
