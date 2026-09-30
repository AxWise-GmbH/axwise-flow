#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { main as authCommand } from './cli.mjs';
import { parseArguments } from './config.mjs';
import { createUtilityProviders, UtilityLookupError } from './utility-providers.mjs';

const CONVERSATION = /^[A-Za-z0-9_-]{1,128}$/;
const ACCOUNT_HASH = /^[a-f0-9]{64}$/;
const MAX_SEARCH_RESPONSE_BYTES = 1_048_576;
const MAX_RESULT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const WEATHER_URI = 'ui://desktop-utilities/weather';
const CURRENCY_URI = 'ui://desktop-utilities/currency';
const waitWithSignal = async (promise, signal) => {
  signal.throwIfAborted();
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([promise, interrupted]); }
  finally { signal.removeEventListener('abort', onAbort); }
};

export const UTILITY_TOOLS = [
  {
    name: 'get_weather', title: 'Weather and forecast',
    description: 'Get current model-estimated weather and a seven-day forecast for a supplied location. Reuse an unambiguous location from the user’s recent conversation when appropriate. The result includes an Open-Meteo source link and a weather card.',
    inputSchema: schema({
      location: { type: 'string', minLength: 1, maxLength: 500 },
      temperatureUnit: { type: 'string', enum: ['C', 'F'] },
    }, ['location']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: WEATHER_URI } },
  },
  {
    name: 'convert_currency', title: 'Currency reference rate',
    description: 'Convert an amount using the latest available Frankfurter daily reference rate. The rate is not a tradable quote. The result includes a source link and a currency card.',
    inputSchema: schema({
      base: { type: 'string', pattern: '^[A-Z]{3}$' },
      quote: { type: 'string', pattern: '^[A-Z]{3}$' },
      amount: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,6})?$' },
    }, ['base', 'quote', 'amount']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: CURRENCY_URI } },
  },
  {
    name: 'search_web', title: 'Search the web',
    description: 'Search current public web information. Supply the complete question and optional location, time window, and distance. Returns sourced findings, including partial or no-result outcomes, for the assistant to interpret in the ongoing conversation.',
    inputSchema: schema({
      query: { type: 'string', minLength: 1, maxLength: 2_000 },
      location: { type: 'string', minLength: 1, maxLength: 500 },
      timeRange: { type: 'string', minLength: 1, maxLength: 200 },
      radiusKm: { type: 'number', minimum: 0.1, maximum: 1_000 },
    }, ['query']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'generate_image', title: 'Create image',
    description: 'Create an original image with Nano Banana 2 (Gemini 3.1 Flash Image) from a visual description. Returns the generated image directly in chat.',
    inputSchema: schema({
      prompt: { type: 'string', minLength: 1, maxLength: 8_000 },
      aspectRatio: { type: 'string', enum: [...SUPPORTED_ASPECT_RATIOS] },
    }, ['prompt']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
];

function widgetHtml(kind) {
  const label = kind === 'weather' ? 'Weather' : 'Currency';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${label}</title><style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}body{margin:0;padding:16px;color:CanvasText;background:Canvas}main{max-width:560px;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:14px;padding:16px}.eyebrow{font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.07em}.value{font-size:30px;font-weight:650;margin:8px 0}.details{font-size:14px;line-height:1.5}.forecast{display:flex;gap:8px;overflow:auto;margin-top:14px}.day{min-width:90px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:8px;padding:8px;font-size:12px}a{color:LinkText}
</style></head><body><main id="card" role="status">Loading ${label.toLowerCase()}…</main><script>
(() => {
  const expected = ${JSON.stringify(kind)};
  const card = document.getElementById('card');
  const add = (parent, tag, value, className) => { const node = document.createElement(tag); node.textContent = String(value ?? ''); if (className) node.className = className; parent.appendChild(node); return node; };
  const link = (parent, value) => { try { const url = new URL(value.url); if (url.protocol !== 'https:') return; const node = add(parent, 'a', value.title || url.hostname); node.href = url.href; node.target = '_blank'; node.rel = 'noopener noreferrer'; } catch {} };
  const render = (payload) => {
    card.replaceChildren();
    const presentation = Array.isArray(payload?.presentations) ? payload.presentations.find((item) => item?.kind === expected) : null;
    if (!presentation) { add(card, 'div', payload?.error?.message || 'No card data available.'); return; }
    add(card, 'div', expected === 'weather' ? 'Current weather' : 'Daily reference rate', 'eyebrow');
    if (expected === 'weather') {
      add(card, 'div', presentation.location, 'details');
      add(card, 'div', presentation.temperature + ' °' + presentation.temperatureUnit, 'value');
      add(card, 'div', presentation.condition, 'details');
      if (presentation.high && presentation.low) add(card, 'div', 'High ' + presentation.high + '° · Low ' + presentation.low + '°', 'details');
      const days = add(card, 'div', '', 'forecast');
      for (const item of (presentation.forecast || []).slice(0, 7)) {
        const day = add(days, 'div', '', 'day'); add(day, 'div', item.label); add(day, 'div', item.condition);
        add(day, 'div', item.high + '° / ' + item.low + '°');
      }
      add(card, 'div', 'Model estimate · ' + new Date(presentation.observedAt).toLocaleString(), 'details');
    } else {
      add(card, 'div', presentation.amount + ' ' + presentation.base + ' ≈ ' + presentation.convertedAmount + ' ' + presentation.quote, 'value');
      add(card, 'div', '1 ' + presentation.base + ' = ' + presentation.rate + ' ' + presentation.quote, 'details');
      add(card, 'div', 'Reference date: ' + presentation.asOf.slice(0, 10) + ' · Not a tradable quote', 'details');
    }
    if (presentation.source) link(card, presentation.source);
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (message.id === 1 && message.result) window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*');
    if (message.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
    if (message.method === 'ui/resource-teardown' && message.id) window.parent.postMessage({ jsonrpc: '2.0', id: message.id, result: {} }, '*');
  });
  window.parent.postMessage({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {
    protocolVersion: '2026-01-26', appInfo: { name: 'desktop-utilities-${kind}', version: '1.0.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
  } }, '*');
})();
</script></body></html>`;
}

const RESOURCES = [
  { uri: WEATHER_URI, name: 'Weather card', mimeType: 'text/html;profile=mcp-app', description: 'Current weather and seven-day forecast' },
  { uri: CURRENCY_URI, name: 'Currency card', mimeType: 'text/html;profile=mcp-app', description: 'Daily reference-rate conversion' },
];

function origin(value, { localOverride = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('An explicit API origin is required.'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(localOverride && url.protocol === 'http:' && url.hostname === '127.0.0.1')))
    throw new Error('Use an HTTPS API origin or an explicit HTTP 127.0.0.1 local relay.');
  return url.origin;
}

export function parseUtilityArguments(argv) {
  if (!Array.isArray(argv)) throw new Error('Utility launch arguments are required.');
  const accepted = new Set(['--config', '--conversation-id', '--account-hash', '--api-url']);
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!accepted.has(flag) || options.has(flag) || typeof value !== 'string' || !value || value.startsWith('--'))
      throw new Error('Invalid utility launch arguments.');
    options.set(flag, value);
  }
  if (options.size < 3 || !options.has('--config') || !CONVERSATION.test(options.get('--conversation-id') || '')
    || !ACCOUNT_HASH.test(options.get('--account-hash') || ''))
    throw new Error('Configuration, conversation ID, and expected account are required.');
  const apiUrlOverride = options.has('--api-url')
    ? origin(options.get('--api-url'), { localOverride: true }) : null;
  return {
    configPath: options.get('--config'), conversationId: options.get('--conversation-id'),
    accountHash: options.get('--account-hash'), apiUrlOverride,
  };
}

export function resolveUtilityToken({ apiUrlOverride, testMode, testToken, normalToken }) {
  if (testMode !== undefined || testToken !== undefined) {
    if (testMode !== 'true' || typeof testToken !== 'string' || !testToken.trim()
      || /\s/.test(testToken) || !apiUrlOverride
      || new URL(apiUrlOverride).protocol !== 'http:' || new URL(apiUrlOverride).hostname !== '127.0.0.1')
      throw new Error('Local test token requires explicit 127.0.0.1 relay and test mode.');
    return async () => testToken;
  }
  return normalToken;
}

function publicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.local')
      && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && !url.hostname.startsWith('[');
  } catch { return false; }
}

async function readSearchResult(response, signal) {
  if (!response.ok) {
    if (response.status === 401) throw new UtilityLookupError('LOGIN_REQUIRED', 'Sign in to use web search.');
    if (response.status === 429) throw new UtilityLookupError('BUSY', 'Web search is busy. Try again shortly.');
    throw new UtilityLookupError('SEARCH_UNAVAILABLE', 'Web search is unavailable right now.');
  }
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json') || !response.body)
    throw new UtilityLookupError('SEARCH_INVALID', 'Web search returned an unusable result.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SEARCH_RESPONSE_BYTES) throw new UtilityLookupError('SEARCH_INVALID', 'Web search returned too much data.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new UtilityLookupError('SEARCH_INVALID', 'Web search returned an unusable result.'); }
  if (!object(data) || typeof data.markdown !== 'string' || !data.markdown.trim()
    || data.markdown.length > 120_000 || !['grounded', 'partial', 'no_results'].includes(data.outcome)
    || !Array.isArray(data.sources) || data.sources.length > 10
    || data.sources.some((item) => !object(item) || typeof item.title !== 'string' || !item.title.trim()
      || item.title.length > 500 || !publicHttps(item.url))
    || typeof data.retrievedAt !== 'string' || !Number.isFinite(Date.parse(data.retrievedAt))
    || (data.queries !== undefined && (!Array.isArray(data.queries) || data.queries.length > 10
      || data.queries.some((item) => typeof item !== 'string' || item.length > 300))))
    throw new UtilityLookupError('SEARCH_INVALID', 'Web search returned an unusable result.');
  return {
    markdown: data.markdown, sources: data.sources.map(({ title, url }) => ({ title, url })),
    outcome: data.outcome, ...(data.queries ? { queries: data.queries } : {}), retrievedAt: data.retrievedAt,
  };
}

function canonicalImageBase64(value, mimeType) {
  if (typeof value !== 'string' || !value.length || value.length % 4
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > MAX_RESULT_IMAGE_BYTES || bytes.toString('base64') !== value) return null;
  const signatureMatches = mimeType === 'image/png'
    ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mimeType === 'image/jpeg'
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === 'image/webp'
        ? bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
          && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
        : false;
  if (!signatureMatches) return null;
  return bytes;
}

async function readImageResult(response, signal) {
  if (!response.ok) {
    if (response.status === 401) throw new UtilityLookupError('LOGIN_REQUIRED', 'Sign in to generate images.');
    if (response.status === 429) throw new UtilityLookupError('BUSY', 'Image generation is busy. Try again shortly.');
    throw new UtilityLookupError('IMAGE_UNAVAILABLE', 'Image generation is unavailable right now.');
  }
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json') || !response.body)
    throw new UtilityLookupError('IMAGE_INVALID', 'Image generation returned an unusable result.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_RESPONSE_BYTES) throw new UtilityLookupError('IMAGE_INVALID', 'Image generation returned too much data.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new UtilityLookupError('IMAGE_INVALID', 'Image generation returned an unusable result.'); }
  if (!object(data) || data.kind !== 'generated_image' || !['image/jpeg', 'image/png', 'image/webp'].includes(data.mimeType)
    || typeof data.data !== 'string' || !canonicalImageBase64(data.data, data.mimeType)
    || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256))
    throw new UtilityLookupError('IMAGE_INVALID', 'Image generation returned an unusable result.');
  return data;
}

export function createUtilityTools({ apiUrl, conversationId, accountHash, token,
  fetchImpl = fetch, providers = createUtilityProviders({ fetchImpl }), newId = randomUUID } = {}) {
  const apiOrigin = origin(apiUrl, { localOverride: true });
  if (!CONVERSATION.test(conversationId || '') || !ACCOUNT_HASH.test(accountHash || '') || typeof token !== 'function')
    throw new Error('Invalid utility connection');
  return async function call(name, args, signal) {
    const definition = UTILITY_TOOLS.find((tool) => tool.name === name);
    if (!definition || !object(args) || Object.keys(args).some((key) => !Object.hasOwn(definition.inputSchema.properties, key))
      || definition.inputSchema.required.some((key) => args[key] === undefined))
      return { content: [{ type: 'text', text: 'Invalid utility arguments.' }], structuredContent: { error: { code: 'INVALID_INPUT', message: 'Invalid utility arguments.' } }, isError: true };
    const requestId = newId();
    try {
      let data;
      if (name === 'get_weather') {
        const result = await providers.weather(args.location, args.temperatureUnit ?? 'C', signal);
        data = {
          version: 'orqaly.desktop-work.v1', conversationId, requestId, kind: 'weather', status: 'completed',
          markdown: result.markdown, presentations: [result.presentation], sources: result.sources,
          cacheHit: result.cacheHit,
        };
      } else if (name === 'convert_currency') {
        const result = await providers.currency(args.base, args.quote, args.amount, signal);
        data = {
          version: 'orqaly.desktop-work.v1', conversationId, requestId, kind: 'currency', status: 'completed',
          markdown: result.markdown, presentations: [result.presentation], sources: result.sources,
          cacheHit: result.cacheHit,
        };
      } else if (name === 'generate_image') {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        const aspectRatio = typeof args.aspectRatio === 'string' ? args.aspectRatio.trim() : undefined;
        if (!prompt || prompt.length > 8_000
          || (aspectRatio !== undefined && !SUPPORTED_ASPECT_RATIOS.has(aspectRatio)))
          throw new UtilityLookupError('INVALID_INPUT', 'Use a prompt between 1 and 8,000 characters and a valid aspect ratio.');
        let image;
        if (typeof providers?.image === 'function') {
          image = await providers.image(prompt, aspectRatio, signal);
        } else {
          const body = { prompt, ...(aspectRatio ? { aspectRatio } : {}) };
          const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
          let accessToken;
          try { accessToken = await waitWithSignal(Promise.resolve().then(token), requestSignal); }
          catch (error) {
            if (requestSignal.aborted) throw new UtilityLookupError('IMAGE_TIMEOUT', 'Image generation timed out.');
            if (error?.code === 'LOGIN_REQUIRED') throw new UtilityLookupError('LOGIN_REQUIRED', 'Sign in to generate images.');
            throw error;
          }
          if (typeof accessToken !== 'string' || !accessToken || /\s/.test(accessToken))
            throw new UtilityLookupError('LOGIN_REQUIRED', 'Sign in to generate images.');
          let response;
          try {
            response = await fetchImpl(`${apiOrigin}/desktop/v1/image`, {
              method: 'POST', redirect: 'error', signal: requestSignal,
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
                'X-Orqaly-Account-Hash': accountHash }, body: JSON.stringify(body),
            });
          } catch {
            throw new UtilityLookupError(requestSignal.aborted ? 'IMAGE_TIMEOUT' : 'IMAGE_UNAVAILABLE',
              requestSignal.aborted ? 'Image generation timed out.' : 'Image generation is unavailable right now.');
          }
          try { image = await readImageResult(response, requestSignal); }
          catch (error) {
            if (requestSignal.aborted) throw new UtilityLookupError('IMAGE_TIMEOUT', 'Image generation timed out.');
            throw error;
          }
        }
        const bytes = canonicalImageBase64(image?.data, image?.mimeType);
        if (!bytes) throw new UtilityLookupError('IMAGE_INVALID', 'Image generation returned an unusable result.');
        const markdown = image.markdown || `![${prompt.slice(0, 50)}](generated)`;
        const presentation = {
          schemaVersion: 'axwise.presentation.generated-image.v1',
          kind: 'generated_image',
          mimeType: image.mimeType,
          data: image.data,
          sha256: image.sha256 || createHash('sha256').update(bytes).digest('hex'),
          alt: image.alt || (prompt.length > 500 ? `${prompt.slice(0, 497)}...` : prompt),
          model: image.model || 'models/gemini-3.1-flash-image',
          markdown,
        };
        data = {
          version: 'orqaly.desktop-work.v1', conversationId, requestId, kind: 'generate_image',
          status: 'completed', markdown, presentations: [presentation],
        };
      } else {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        const location = typeof args.location === 'string' ? args.location.trim() : args.location;
        const timeRange = typeof args.timeRange === 'string' ? args.timeRange.trim() : args.timeRange;
        if (!query || query.length > 2_000
          || (args.location !== undefined && (typeof args.location !== 'string' || !location || location.length > 500))
          || (args.timeRange !== undefined && (typeof args.timeRange !== 'string' || !timeRange || timeRange.length > 200))
          || (args.radiusKm !== undefined && (!Number.isFinite(args.radiusKm) || args.radiusKm < 0.1
            || args.radiusKm > 1_000 || !location)))
          throw new UtilityLookupError('INVALID_INPUT', 'Use a concise search question and valid optional filters.');
        const body = { query, ...(location ? { location } : {}), ...(timeRange ? { timeRange } : {}),
          ...(args.radiusKm !== undefined ? { radiusKm: args.radiusKm } : {}) };
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(35_000)]) : AbortSignal.timeout(35_000);
        let accessToken;
        try { accessToken = await waitWithSignal(Promise.resolve().then(token), requestSignal); }
        catch (error) {
          if (requestSignal.aborted) throw new UtilityLookupError('SEARCH_TIMEOUT', 'Web search timed out.');
          if (error?.code === 'LOGIN_REQUIRED') throw new UtilityLookupError('LOGIN_REQUIRED', 'Sign in to use web search.');
          throw error;
        }
        if (typeof accessToken !== 'string' || !accessToken || /\s/.test(accessToken))
          throw new UtilityLookupError('LOGIN_REQUIRED', 'Sign in to use web search.');
        let response;
        try {
          response = await fetchImpl(`${apiOrigin}/desktop/v1/search`, {
            method: 'POST', redirect: 'error', signal: requestSignal,
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
              'X-Orqaly-Account-Hash': accountHash }, body: JSON.stringify(body),
          });
        } catch {
          throw new UtilityLookupError(requestSignal.aborted ? 'SEARCH_TIMEOUT' : 'SEARCH_UNAVAILABLE',
            requestSignal.aborted ? 'Web search timed out.' : 'Web search is unavailable right now.');
        }
        let result;
        try { result = await readSearchResult(response, requestSignal); }
        catch (error) {
          if (requestSignal.aborted) throw new UtilityLookupError('SEARCH_TIMEOUT', 'Web search timed out.');
          throw error;
        }
        data = { kind: 'search_web', conversationId, requestId, ...result };
      }
      const content = data.presentations?.[0]?.kind === 'generated_image'
        ? [
            { type: 'image', data: data.presentations[0].data, mimeType: data.presentations[0].mimeType },
            { type: 'text', text: data.markdown },
          ]
        : [{ type: 'text', text: data.markdown }];
      return { content, structuredContent: data, isError: false };
    } catch (error) {
      const message = signal?.aborted ? 'The utility request was cancelled.'
        : error instanceof UtilityLookupError ? error.message : 'The utility could not complete this request.';
      const code = signal?.aborted ? 'CANCELLED'
        : error instanceof UtilityLookupError ? error.code : 'UTILITY_UNAVAILABLE';
      return { content: [{ type: 'text', text: message }],
        structuredContent: { conversationId, requestId, kind: name, error: { code, message } }, isError: true };
    }
  };
}

export async function serveUtilitiesMcp({ input = process.stdin, output = process.stdout, call }) {
  const active = new Map();
  const write = (message) => output.write(`${JSON.stringify(message)}\n`);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let initialized = false;
  for await (const line of lines) {
    let message;
    try { if (Buffer.byteLength(line, 'utf8') > MAX_IMAGE_RESPONSE_BYTES) throw new Error(); message = JSON.parse(line); }
    catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC message' } }); continue; }
    if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') continue;
    if (message.method === 'notifications/cancelled') { active.get(message.params?.requestId)?.abort(); continue; }
    if (message.id === undefined) continue;
    if (message.method === 'initialize') {
      initialized = true;
      write({ jsonrpc: '2.0', id: message.id, result: {
        protocolVersion: '2025-06-18', capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'desktop-utilities', version: '1.0.0' },
        instructions: 'Weather, currency, and public web search provide data and source links for this conversation.',
      } });
    } else if (message.method === 'ping') write({ jsonrpc: '2.0', id: message.id, result: {} });
    else if (!initialized) write({ jsonrpc: '2.0', id: message.id, error: { code: -32002, message: 'Initialize first' } });
    else if (message.method === 'tools/list') write({ jsonrpc: '2.0', id: message.id, result: { tools: UTILITY_TOOLS } });
    else if (message.method === 'resources/list') write({ jsonrpc: '2.0', id: message.id, result: { resources: RESOURCES } });
    else if (message.method === 'resources/read') {
      const uri = message.params?.uri;
      const kind = uri === WEATHER_URI ? 'weather' : uri === CURRENCY_URI ? 'currency' : null;
      if (!kind) write({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Unknown utility resource' } });
      else write({ jsonrpc: '2.0', id: message.id, result: { contents: [{
        uri, mimeType: 'text/html;profile=mcp-app', text: widgetHtml(kind),
      }] } });
    } else if (message.method === 'tools/call') {
      const controller = new AbortController(); active.set(message.id, controller);
      Promise.resolve().then(() => call(message.params?.name, message.params?.arguments || {}, controller.signal))
        .then((data) => write({ jsonrpc: '2.0', id: message.id, result: data }))
        .catch(() => write({ jsonrpc: '2.0', id: message.id, result: {
          content: [{ type: 'text', text: 'The utility could not complete this request.' }],
          isError: true,
        } }))
        .finally(() => active.delete(message.id));
    } else write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not supported' } });
  }
  for (const controller of active.values()) controller.abort();
}

export async function main(argv) {
  const launch = parseUtilityArguments(argv);
  const authArgs = ['--config', launch.configPath];
  const { config } = await parseArguments(['token', ...authArgs]);
  const token = resolveUtilityToken({
    apiUrlOverride: launch.apiUrlOverride,
    testMode: process.env.ORQALY_LOCAL_TEST_MODE,
    testToken: process.env.ORQALY_LOCAL_TEST_TOKEN,
    normalToken: async () => {
      let value = '';
      await authCommand(['token', ...authArgs], { stdout: { write(part) { value += part; } }, stderr: { write() {} } });
      return value.trim();
    },
  });
  await serveUtilitiesMcp({ call: createUtilityTools({
    apiUrl: launch.apiUrlOverride || config.apiUrl, conversationId: launch.conversationId,
    accountHash: launch.accountHash, token,
  }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('Desktop utilities could not start. Check configuration and sign-in.\n');
    process.exitCode = 1;
  });
}
