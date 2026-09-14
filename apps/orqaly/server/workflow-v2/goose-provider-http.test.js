// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createGooseProviderRouter, GOOSE_PROVIDER_MODEL } from './goose-provider-http.js';
import { DesktopWorkIdentitySchema, DesktopWorkStartSchema } from './desktop-work-service.js';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  })));
});

describe('desktop context and bounded work routes', () => {
  const conversationId = '20260914_1';
  const requestId = '11111111-1111-4111-8111-111111111111';
  const runId = '22222222-2222-4222-8222-222222222222';
  const artifactId = '33333333-3333-4333-8333-333333333333';
  const workPath = `/work/${conversationId}/${requestId}`;
  const body = { conversationId, requestId, issuedAt: '2026-09-14T12:00:00.000Z', question: 'Investigate transient retries.' };

  function services() {
    return {
      desktopContextService: {
        read: vi.fn(async (auth, id) => ({ runId: id, owner: auth.userId, artifacts: [] })),
        artifact: vi.fn(async (_auth, id, artifact) => ({ runId: id, artifactId: artifact, markdown: '# Design' })),
      },
      desktopWorkService: {
        start: vi.fn(async (_auth, input) => ({ ...DesktopWorkStartSchema.parse(input), status: 'accepted' })),
        read: vi.fn(async (_auth, input) => ({ ...DesktopWorkIdentitySchema.parse(input), status: 'running' })),
        cancel: vi.fn(async (_auth, input) => ({ ...DesktopWorkIdentitySchema.parse(input), status: 'cancel_requested' })),
        events: vi.fn(async () => ({ events: [], cursor: 0 })),
      },
    };
  }

  it('authenticates every added route before parsing, context lookup or AxWise work', async () => {
    const s = services();
    const f = await fixture(s);
    for (const [path, payload] of [
      ['/work', '{invalid'], [workPath, null], [`${workPath}/cancel`, {}],
      [`${workPath}/events`, null], [`/goals/${runId}/context`, null],
      [`/goals/${runId}/artifacts/${artifactId}`, null],
    ]) {
      const response = await f.call(path, payload, { headers: { 'Content-Type': 'application/json' } });
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(f.commandService.session).not.toHaveBeenCalled();
    for (const service of Object.values(s)) for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('passes only the verified owner and exact path/body identities to services', async () => {
    const s = services();
    const f = await fixture(s);
    expect((await f.call('/work', body)).status).toBe(200);
    expect(s.desktopWorkService.start).toHaveBeenCalledWith({ userId: 'user-1' }, body);
    expect((await f.call(workPath, null)).status).toBe(200);
    expect(s.desktopWorkService.read).toHaveBeenCalledWith({ userId: 'user-1' }, { conversationId, requestId });
    expect((await f.call(`${workPath}/cancel`, {})).status).toBe(200);
    expect(s.desktopWorkService.cancel).toHaveBeenCalledWith({ userId: 'user-1' }, { conversationId, requestId });
    expect((await f.call(`${workPath}/events?after=2&limit=10`, null)).status).toBe(200);
    expect(s.desktopWorkService.events).toHaveBeenCalledWith({ userId: 'user-1' }, { conversationId, requestId }, 2, 10);
    expect((await f.call(`/goals/${runId}/context`, null)).status).toBe(200);
    expect(s.desktopContextService.read).toHaveBeenCalledWith({ userId: 'user-1' }, runId);
    expect((await f.call(`/goals/${runId}/artifacts/${artifactId}`, null)).status).toBe(200);
    expect(s.desktopContextService.artifact).toHaveBeenCalledWith({ userId: 'user-1' }, runId, artifactId);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('reports malformed desktop contracts as client errors instead of an unavailable service', async () => {
    const f = await fixture(services());
    const invalidQuestion = await f.call('/work', { ...body, question: '' });
    expect(invalidQuestion.status).toBe(400);
    expect(await invalidQuestion.json()).toMatchObject({ error: { code: 'INVALID_DESKTOP_REQUEST' } });
    const invalidIdentity = await f.call(`/work/${conversationId}/not-a-uuid`, null);
    expect(invalidIdentity.status).toBe(400);
    expect(await invalidIdentity.json()).toMatchObject({ error: { code: 'INVALID_DESKTOP_REQUEST' } });
    const untrustedIdentity = await f.call('/work', { ...body, userId: 'user-other' });
    expect(untrustedIdentity.status).toBe(400);
  });

  it('does not turn pending, failed or cancellation-requested work into successful completion', async () => {
    const s = services();
    const f = await fixture(s);
    expect(await (await f.call('/work', body)).json()).toMatchObject({ status: 'accepted' });
    expect(await (await f.call(`${workPath}/cancel`, {})).json()).toMatchObject({ status: 'cancel_requested' });
    s.desktopWorkService.read.mockResolvedValueOnce({ conversationId, requestId, status: 'failed', markdown: null, artifacts: [], error: { code: 'SOURCE_UNAVAILABLE' } });
    expect(await (await f.call(workPath, null)).json()).toEqual({ conversationId, requestId, status: 'failed', markdown: null, artifacts: [], error: { code: 'SOURCE_UNAVAILABLE' } });
  });

  it('preserves owned not-found responses without echoing internal details or invoking another route', async () => {
    const s = services();
    s.desktopWorkService.cancel.mockRejectedValueOnce(Object.assign(new Error('secret owner state'), { status: 404, code: 'ASSISTANT_THREAD_NOT_FOUND' }));
    const f = await fixture(s);
    const response = await f.call(`${workPath}/cancel`, {});
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('secret owner state');
    expect(s.desktopWorkService.start).not.toHaveBeenCalled();
    expect(s.desktopWorkService.read).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('adds product guidance alongside actual Goose instructions and context without changing tool history', async () => {
    const f = await fixture({ productGuidance: 'Actual desktop capabilities.', contextForRequest: async () => 'Selected project reference.' });
    const history = [
      { role: 'user', content: 'Read the design.' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'read_goal_artifact', arguments: JSON.stringify({ runId }) }, extra_content: { google: { thought_signature: 'keep-signature' } } }] },
      { role: 'tool', tool_call_id: 'tool-1', content: 'Design returned.' },
    ];
    expect((await f.call('/chat/completions', { model: GOOSE_PROVIDER_MODEL, messages: [{ role: 'system', content: 'Goose tool and skill instructions.' }, ...history] })).status).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).messages).toEqual([
      { role: 'system', content: 'Goose tool and skill instructions.\n\nActual desktop capabilities.\n\nSelected project reference.' }, ...history,
    ]);
  });
});
const jsonResponse = (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const requestBody = () => ({ model: GOOSE_PROVIDER_MODEL, messages: [{ role: 'user', content: 'Explain the next step.' }] });
async function fixture(overrides = {}) {
  const commandService = { session: vi.fn().mockResolvedValue({ userId: 'user-1', tenantBound: true }) };
  const verifyDesktopAuth = vi.fn(async (req) => req.get('authorization') === 'Bearer desktop-token' ? { userId: 'user-1' } : null);
  const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { role: 'assistant', content: 'Ready.' }, finish_reason: 'stop' }], usage: { total_tokens: 8 } }));
  const options = { commandService, verifyDesktopAuth, fetchImpl, apiKey: 'backend-only-test-key', ...overrides };
  const app = express();
  app.use('/desktop/v1', createGooseProviderRouter(options));
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}/desktop/v1`;
  const call = (path = '/chat/completions', body = requestBody(), extra = {}) => fetch(base + path, {
    method: body === null ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer desktop-token', 'Content-Type': 'application/json' },
    ...(body === null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    ...extra,
  });
  return { ...options, call };
}

describe('authenticated Goose provider transport', () => {
  it('rejects unauthenticated input before parsing or tenant/provider work', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', 'x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } });
    expect(response.status).toBe(401);
    expect(f.commandService.session).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('requires an exact tenant-bound session for the verified user', async () => {
    const commandService = { session: vi.fn().mockResolvedValue({ userId: 'different-user', tenantBound: true }) };
    const f = await fixture({ commandService });
    expect((await f.call()).status).toBe(403);
    expect(commandService.session).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('applies the injected rate limit after identity and before session/body work', async () => {
    const rateLimiter = vi.fn((req, res) => {
      expect(req.authContext).toEqual({ userId: 'user-1' });
      res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    });
    const f = await fixture({ rateLimiter });
    expect((await f.call()).status).toBe(429);
    expect(f.verifyDesktopAuth).toHaveBeenCalledOnce();
    expect(rateLimiter).toHaveBeenCalledOnce();
    expect(f.commandService.session).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('serves authenticated model discovery and session without provider spend', async () => {
    const f = await fixture();
    expect(await (await f.call('/models', null)).json()).toMatchObject({ data: [{ id: GOOSE_PROVIDER_MODEL }] });
    expect(await (await f.call('/session', null)).json()).toEqual({ userId: 'user-1', tenantBound: true, model: GOOSE_PROVIDER_MODEL });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('enforces the 2MB body limit after authenticating', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', { ...requestBody(), messages: [{ role: 'user', content: 'x'.repeat(2 * 1024 * 1024) }] });
    expect(response.status).toBe(413);
    expect(f.commandService.session).toHaveBeenCalledOnce();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_REQUEST_TOO_LARGE' } });
  });
  it.each([
    { ...requestBody(), model: 'gemini-3.8-flash' },
    { ...requestBody(), upstream: 'https://attacker.invalid' },
    { ...requestBody(), tenantId: 'some-other-tenant' },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://169.254.169.254/' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'file', file: { file_id: 'external-file' } }] }] },
    { ...requestBody(), tools: [{ type: 'url_context' }] },
    { ...requestBody(), messages: [{ role: 'user', content: 'Text', attachments: [{ url: 'https://external.invalid/file' }] }] },
  ])('rejects unsupported model/routing/identity/modalities before upstream spend: %#', async (body) => {
    const f = await fixture();
    expect((await f.call('/chat/completions', body)).status).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('keeps tool calls, argument strings, thought signatures, usage and response bytes intact', async () => {
    const raw = JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'read_file', arguments: '{ "path": "next.md" }' }, extra_content: { google: { thought_signature: 'opaque-response-signature' } } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 8, completion_tokens: 4 }, provider_extension: { keep: true } }, null, 2);
    const fetchImpl = vi.fn(async () => new Response(raw, { headers: { 'Content-Type': 'application/json' } }));
    const f = await fixture({ fetchImpl });
    const body = {
      ...requestBody(), stream: false, temperature: 0.4, top_p: 0.9,
      messages: [
        { role: 'user', content: 'Read this.' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: '{ "path": "notes.md" }' }, extra_content: { google: { thought_signature: 'opaque-input-signature', future_field: { keep: true } } } }] },
        { role: 'tool', tool_call_id: 'call-1', content: 'File contents.' },
      ],
      tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }],
      tool_choice: 'auto', parallel_tool_calls: true,
    };
    const response = await f.call('/chat/completions', body);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(raw);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(options.redirect).toBe('error');
    expect(options.headers).toEqual({ Authorization: 'Bearer backend-only-test-key', 'Content-Type': 'application/json' });
    const sent = JSON.parse(options.body);
    expect(sent).toEqual({ ...body, model: 'gemini-3.8-flash', temperature: undefined, top_p: undefined });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('relays SSE bytes across arbitrary UTF-8 and tool-delta boundaries', async () => {
    const frames = [
      { choices: [{ delta: { content: 'café', tool_calls: [{ index: 0, id: 'c1', type: 'function', extra_content: { google: { thought_signature: 'opaque' } }, function: { name: 'read_file', arguments: '{"pa' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a"}' } }] }, finish_reason: 'tool_calls' }], usage: { total_tokens: 12 } },
    ];
    const raw = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
    const bytes = new TextEncoder().encode(raw);
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } }));
    const f = await fixture({ fetchImpl });
    const response = await f.call('/chat/completions', { ...requestBody(), stream: true, stream_options: { include_usage: true } });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
  });
  it('never echoes upstream errors or backend credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('provider echoed backend-only-test-key and private user input', { status: 400 }));
    const f = await fixture({ fetchImpl });
    const response = await f.call();
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"error":{"type":"orqaly_provider_error","code":"PROVIDER_UNAVAILABLE","message":"PROVIDER_UNAVAILABLE"}}');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('sanitizes malformed JSON without echoing submitted text', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', '{private-input');
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('private-input');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('aborts the upstream stream when the desktop disconnects', async () => {
    let signal;
    const fetchImpl = vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const f = await fixture({ fetchImpl });
    const abort = new AbortController();
    const response = await f.call('/chat/completions', { ...requestBody(), stream: true }, { signal: abort.signal });
    await response.body.getReader().read();
    abort.abort();
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('bounds time before response headers and does not retry', async () => {
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const f = await fixture({ fetchImpl, timeoutMs: 25 });
    const response = await f.call();
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: { code: 'PROVIDER_TIMEOUT' } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('also bounds an optional context callback that never finishes', async () => {
    const f = await fixture({ contextForRequest: () => new Promise(() => {}), timeoutMs: 25 });
    expect((await f.call()).status).toBe(504);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('stops a stalled response stream without fabricating a terminal event', async () => {
    let upstreamSignal;
    const fetchImpl = vi.fn(async (_url, options) => {
      upstreamSignal = options.signal;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const f = await fixture({ fetchImpl, timeoutMs: 50 });
    const response = await f.call('/chat/completions', { ...requestBody(), stream: true });
    await expect(response.text()).rejects.toThrow();
    expect(upstreamSignal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([403, 404])('normalizes context authorization status %s without leaking existence', async (status) => {
    const contextForRequest = vi.fn(async () => { throw Object.assign(new Error('private tenant details'), { status }); });
    const f = await fixture({ contextForRequest });
    const response = await f.call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { type: 'orqaly_provider_error', code: 'CONTEXT_NOT_AVAILABLE', message: 'CONTEXT_NOT_AVAILABLE' } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('adds only explicit server context without rewriting tool history', async () => {
    const contextForRequest = vi.fn(async ({ request, authContext }) => {
      expect(request.get('authorization')).toBe('Bearer desktop-token');
      return `Known workspace for ${authContext.userId}.`;
    });
    const f = await fixture({ contextForRequest });
    const body = requestBody();
    expect((await f.call('/chat/completions', body)).status).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).messages).toEqual([{ role: 'system', content: 'Known workspace for user-1.' }, ...body.messages]);
  });
  it.each([
    ['Goose instructions', 'Goose instructions\n\nOrqaly project reference.'],
    [[{ type: 'text', text: 'Goose instructions', extra_content: { keep: true } }], [{ type: 'text', text: 'Goose instructions', extra_content: { keep: true } }, { type: 'text', text: 'Orqaly project reference.' }]],
    [null, 'Orqaly project reference.'],
  ])('merges context into the existing leading Goose system message without changing tool history: %#', async (content, expectedContent) => {
    const f = await fixture({ contextForRequest: async () => 'Orqaly project reference.' });
    const history = [
      { role: 'user', content: 'Use the selected project.' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: '{ "path": "notes.md" }' }, extra_content: { google: { thought_signature: 'opaque-signature' } } }] },
      { role: 'tool', tool_call_id: 'call-1', content: 'File contents.' },
    ];
    const body = { ...requestBody(), messages: [{ role: 'system', content, extra_content: { keep: 'system extension' } }, ...history] };
    expect((await f.call('/chat/completions', body)).status).toBe(200);
    const sent = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    expect(sent.messages).toEqual([{ role: 'system', content: expectedContent, extra_content: { keep: 'system extension' } }, ...history]);
    expect(body.messages[0].content).toEqual(content);
  });
});
