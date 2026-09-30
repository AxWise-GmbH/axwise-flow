// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createGooseProviderRouter, GOOSE_PROVIDER_MODEL, validateGooseChatRequest } from './goose-provider-http.js';
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
      informationService: { lookup: vi.fn(async (_auth, input) => ({ ...input, status: 'completed' })) },
      searchService: { search: vi.fn(async (_auth, input) => ({ ...input, outcome: 'grounded', sources: [] })) },
      decisionService: { decide: vi.fn(async (_auth, input) => ({ ...input, decision: 'queue' })) },
    };
  }

  it('authenticates every added route before parsing, context lookup or AxWise work', async () => {
    const s = services();
    const f = await fixture(s);
    for (const [path, payload] of [
      ['/work', '{invalid'], [workPath, null], [`${workPath}/cancel`, {}],
      [`${workPath}/events`, null], [`/goals/${runId}/context`, null],
      [`/goals/${runId}/artifacts/${artifactId}`, null],
      ['/information', '{invalid'], ['/decisions', '{invalid'],
      ['/search', '{invalid'],
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
    expect(s.desktopWorkService.read).toHaveBeenCalledWith({ userId: 'user-1' }, { conversationId, requestId },
      { waitMs: 0, signal: expect.any(AbortSignal) });
    expect((await f.call(`${workPath}/cancel`, {})).status).toBe(200);
    expect(s.desktopWorkService.cancel).toHaveBeenCalledWith({ userId: 'user-1' }, { conversationId, requestId });
    expect((await f.call(`${workPath}/events?after=2&limit=10`, null)).status).toBe(200);
    expect(s.desktopWorkService.events).toHaveBeenCalledWith({ userId: 'user-1' }, { conversationId, requestId }, 2, 10);
    expect((await f.call(`/goals/${runId}/context`, null)).status).toBe(200);
    expect(s.desktopContextService.read).toHaveBeenCalledWith({ userId: 'user-1' }, runId);
    expect((await f.call(`/goals/${runId}/artifacts/${artifactId}`, null)).status).toBe(200);
    expect(s.desktopContextService.artifact).toHaveBeenCalledWith({ userId: 'user-1' }, runId, artifactId);
    expect((await f.call('/information', body)).status).toBe(200);
    expect(s.informationService.lookup).toHaveBeenCalledWith({ userId: 'user-1' }, body,
      { signal: expect.any(AbortSignal) });
    expect((await f.call('/search', { query: 'Bremen headlines' })).status).toBe(200);
    expect(s.searchService.search).toHaveBeenCalledWith({ userId: 'user-1' },
      { query: 'Bremen headlines' }, { signal: expect.any(AbortSignal) });
    const decision = { kind: 'message_disposition', incomingMessage: 'Also add a test.' };
    expect((await f.call('/decisions', decision)).status).toBe(200);
    expect(s.decisionService.decide).toHaveBeenCalledWith({ userId: 'user-1' }, decision);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts an optional bounded status wait without spending another auth or request-rate budget', async () => {
    const s = services();
    const rateLimiter = vi.fn((_req, _res, next) => next());
    const f = await fixture({ ...s, rateLimiter });
    for (const waitMs of [0, 8_000]) {
      expect((await f.call(`${workPath}?waitMs=${waitMs}`, null)).status).toBe(200);
      expect(s.desktopWorkService.read).toHaveBeenLastCalledWith(
        { userId: 'user-1' }, { conversationId, requestId }, { waitMs, signal: expect.any(AbortSignal) }
      );
    }
    expect(rateLimiter).toHaveBeenCalledTimes(2);
    expect(f.verifyDesktopAuth).toHaveBeenCalledTimes(2);
    expect(f.commandService.session).toHaveBeenCalledTimes(2);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['-1', '8001', '1.5', '', 'NaN', 'Infinity', '1e3', '0001', '1&waitMs=2'])('rejects malformed waitMs=%s before a status lookup', async (waitMs) => {
    const s = services();
    const f = await fixture(s);
    const response = await f.call(`${workPath}?waitMs=${waitMs}`, null);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_DESKTOP_REQUEST' } });
    expect(s.desktopWorkService.read).not.toHaveBeenCalled();
  });

  it('authenticates bounded waits before query parsing and rejects a tenant mismatch before work', async () => {
    const s = services();
    const commandService = { session: vi.fn().mockResolvedValue({ userId: 'different-owner', tenantBound: true }) };
    const f = await fixture({ ...s, commandService });
    expect((await f.call(`${workPath}?waitMs=invalid`, null, { headers: {} })).status).toBe(401);
    expect(commandService.session).not.toHaveBeenCalled();
    expect((await f.call(`${workPath}?waitMs=8000`, null)).status).toBe(403);
    expect(s.desktopWorkService.read).not.toHaveBeenCalled();
  });

  it('aborts an outstanding status wait on disconnect without cancelling or restarting work', async () => {
    const s = services();
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    let waitSignal;
    s.desktopWorkService.read.mockImplementation((_auth, _identity, { signal }) => new Promise((_resolve, reject) => {
      waitSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      markStarted();
    }));
    const f = await fixture(s);
    const controller = new AbortController();
    const request = f.call(`${workPath}?waitMs=8000`, null, { signal: controller.signal });
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    controller.abort();
    await rejected;
    await vi.waitFor(() => expect(waitSignal.aborted).toBe(true));
    expect(s.desktopWorkService.read).toHaveBeenCalledOnce();
    expect(s.desktopWorkService.cancel).not.toHaveBeenCalled();
    expect(s.desktopWorkService.start).not.toHaveBeenCalled();
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
function imageBytes(mime, size = 16) {
  const bytes = Buffer.alloc(size);
  if (mime === 'image/jpeg') bytes.set([0xff, 0xd8, 0xff]);
  else if (mime === 'image/png') bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  else if (mime === 'image/webp') {
    bytes.write('RIFF', 0, 'ascii');
    bytes.writeUInt32LE(Math.max(0, size - 8), 4);
    bytes.write('WEBP', 8, 'ascii');
  }
  return bytes;
}
const imagePart = (mime, bytes = imageBytes(mime)) => ({
  type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` },
});
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
  it('runs thin chat and search with account identity and no workflow session or prompt injection', async () => {
    const searchService = { search: vi.fn(async () => ({
      markdown: '- Cited result — [Source](<https://example.com/story>)',
      sources: [{ title: 'Source', url: 'https://example.com/story' }],
      outcome: 'grounded', retrievedAt: '2026-09-23T09:00:00.000Z',
    })) };
    const f = await fixture({ commandService: undefined, searchService });
    expect(await (await f.call('/session', null)).json()).toEqual({
      userId: 'user-1', accountScoped: true,
      model: GOOSE_PROVIDER_MODEL, input_modalities: ['text', 'image'],
    });
    const search = await f.call('/search', { query: 'Bremen headlines' });
    expect(search.status).toBe(200);
    expect((await search.json()).outcome).toBe('grounded');
    expect(searchService.search).toHaveBeenCalledWith({ userId: 'user-1' },
      { query: 'Bremen headlines' }, { signal: expect.any(AbortSignal) });
    const body = { model: GOOSE_PROVIDER_MODEL,
      messages: [{ role: 'system', content: 'Goose controls tool use.' }, { role: 'user', content: 'Hello.' }] };
    expect((await f.call('/chat/completions', body)).status).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).messages).toEqual(body.messages);
    expect(f.commandService).toBeUndefined();
  });
  it('keeps optional engineering review authenticated and isolated from thin chat', async () => {
    const engineeringReviewService = { review: vi.fn(async (auth, input) => ({
      owner: auth.userId, taskId: input.taskId, review: { status: 'passed', advisory: true },
    })) };
    const f = await fixture({ commandService: undefined, engineeringReviewService });
    const reviewBody = { taskId: 'task-1' };

    const unauthenticated = await f.call('/engineering/review', '{private-evidence', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(unauthenticated.status).toBe(401);
    expect(engineeringReviewService.review).not.toHaveBeenCalled();

    const accountChanged = await f.call('/engineering/review', reviewBody, {
      headers: { Authorization: 'Bearer desktop-token', 'Content-Type': 'application/json',
        'X-Orqaly-Account-Hash': 'wrong-account' },
    });
    expect(accountChanged.status).toBe(403);
    expect(engineeringReviewService.review).not.toHaveBeenCalled();

    expect(await (await f.call('/session', null)).json()).toMatchObject({
      userId: 'user-1', accountScoped: true,
    });
    expect((await f.call('/work', reviewBody)).status).toBe(404);
    expect((await f.call('/information', reviewBody)).status).toBe(404);
    expect((await f.call('/goals/any/context', null)).status).toBe(404);
    expect(engineeringReviewService.review).not.toHaveBeenCalled();

    const review = await f.call('/engineering/review', reviewBody);
    expect(review.status).toBe(200);
    expect(await review.json()).toMatchObject({ owner: 'user-1', taskId: 'task-1',
      review: { status: 'passed', advisory: true } });
    expect(engineeringReviewService.review).toHaveBeenCalledOnce();
    expect(engineeringReviewService.review).toHaveBeenCalledWith({ userId: 'user-1' }, reviewBody,
      { signal: expect.any(AbortSignal) });

    const chat = { model: GOOSE_PROVIDER_MODEL,
      messages: [{ role: 'system', content: 'Goose decides how to work.' },
        { role: 'user', content: 'Hello.' }] };
    expect((await f.call('/chat/completions', chat)).status).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).messages).toEqual(chat.messages);
    expect(engineeringReviewService.review).toHaveBeenCalledOnce();
    expect(f.commandService).toBeUndefined();
  });
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
    expect(await (await f.call('/models', null)).json()).toMatchObject({
      data: [{ id: GOOSE_PROVIDER_MODEL, input_modalities: ['text', 'image'] }],
    });
    expect(await (await f.call('/session', null)).json()).toEqual({ userId: 'user-1', tenantBound: true,
      model: GOOSE_PROVIDER_MODEL, input_modalities: ['text', 'image'] });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('enforces the 18 MiB authenticated parser envelope', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', { ...requestBody(), messages: [{ role: 'user', content: 'x'.repeat(18 * 1024 * 1024) }] });
    expect(response.status).toBe(413);
    expect(f.commandService.session).toHaveBeenCalledOnce();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_REQUEST_TOO_LARGE' } });
  });
  it('keeps non-image prompt and tool metadata within the prior 2 MiB budget', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', { ...requestBody(),
      messages: [{ role: 'user', content: 'x'.repeat(2 * 1024 * 1024) }] });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_REQUEST_TOO_LARGE' } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    { ...requestBody(), model: 'gemini-3.8-flash' },
    { ...requestBody(), upstream: 'https://attacker.invalid' },
    { ...requestBody(), tenantId: 'some-other-tenant' },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://169.254.169.254/' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://external.invalid/image.png' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'file:///private/etc/passwd' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,not-base64' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [imagePart('image/jpeg', imageBytes('image/png'))] }] },
    { ...requestBody(), messages: [{ role: 'assistant', content: [imagePart('image/jpeg')] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ ...imagePart('image/jpeg'), caption: 'untrusted' }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { ...imagePart('image/jpeg').image_url, detail: 'auto' } }] }] },
    { ...requestBody(), messages: [{ role: 'user', content: [{ type: 'file', file: { file_id: 'external-file' } }] }] },
    { ...requestBody(), tools: [{ type: 'url_context' }] },
    { ...requestBody(), messages: [{ role: 'user', content: 'Text', attachments: [{ url: 'https://external.invalid/file' }] }] },
  ])('rejects unsupported model/routing/identity/modalities before upstream spend: %#', async (body) => {
    const f = await fixture();
    const response = await f.call('/chat/completions', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CHAT_REQUEST' } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['image/jpeg', 'image/png', 'image/webp'])('forwards an inline %s Goose image without changing its bytes', async (mime) => {
    const f = await fixture();
    const image = imagePart(mime);
    const content = [
      { type: 'text', text: 'First instruction.' }, image,
      { type: 'text', text: 'Second instruction.', extra_content: { keep: true } },
    ];
    const body = { ...requestBody(), messages: [{ role: 'user', content }] };
    expect((await f.call('/chat/completions', body)).status).toBe(200);
    const sent = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    expect(sent.messages[0].content).toEqual(content);
    expect(sent.messages[0].content[1].image_url.url).toBe(image.image_url.url);
  });
  it('accepts an image exactly at the 1 MiB per-image bound', () => {
    const body = { ...requestBody(), messages: [{ role: 'user',
      content: [imagePart('image/jpeg', imageBytes('image/jpeg', 1024 * 1024))] }] };
    expect(validateGooseChatRequest(body)).toBe(true);
  });
  it('rejects a decoded image over 1 MiB with a bounded-size error', async () => {
    const f = await fixture();
    const body = { ...requestBody(), messages: [{ role: 'user',
      content: [imagePart('image/jpeg', imageBytes('image/jpeg', 1024 * 1024 + 4))] }] };
    const response = await f.call('/chat/completions', body);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_IMAGES_TOO_LARGE' } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('keeps aggregate decoded image bytes within the upstream request budget', async () => {
    const f = await fixture();
    const images = Array.from({ length: 11 }, () =>
      imagePart('image/jpeg', imageBytes('image/jpeg', 1024 * 1024)));
    const body = { ...requestBody(), messages: [
      { role: 'user', content: images.slice(0, 10) },
      { role: 'assistant', content: 'Continue.' },
      { role: 'user', content: images.slice(10) },
    ] };
    const response = await f.call('/chat/completions', body);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_IMAGES_TOO_LARGE' } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('accepts exactly 10 MiB of decoded images', () => {
    const body = { ...requestBody(), messages: [{ role: 'user',
      content: Array.from({ length: 10 }, () =>
        imagePart('image/jpeg', imageBytes('image/jpeg', 1024 * 1024))) }] };
    expect(validateGooseChatRequest(body)).toBe(true);
  });
  it('rejects more than the desktop maximum of 10 images in one user message', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', { ...requestBody(), messages: [{ role: 'user',
      content: Array.from({ length: 11 }, () => imagePart('image/png')) }] });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_IMAGES_TOO_LARGE' } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('does not strand a persisted conversation after more than 20 small historical images', async () => {
    const f = await fixture();
    const images = Array.from({ length: 21 }, () => imagePart('image/png'));
    const body = { ...requestBody(), messages: [
      { role: 'user', content: images.slice(0, 10) },
      { role: 'assistant', content: 'Continue.' },
      { role: 'user', content: images.slice(10, 20) },
      { role: 'assistant', content: 'I reviewed those screenshots.' },
      { role: 'user', content: [images[20]] },
      { role: 'assistant', content: 'I reviewed the last screenshot.' },
      { role: 'user', content: 'Summarize the result.' },
    ] };
    const response = await f.call('/chat/completions', body);
    expect(response.status).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).messages).toEqual(body.messages);
  });
  it('rejects more than Gemini\'s 3,600-image request ceiling', async () => {
    const f = await fixture();
    const messages = Array.from({ length: 361 }, (_value, index) => ({
      role: 'user',
      content: Array.from({ length: index === 360 ? 1 : 10 }, () => imagePart('image/png')),
    }));
    const response = await f.call('/chat/completions', { ...requestBody(), messages });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'CHAT_IMAGES_TOO_LARGE' } });
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
  it('accepts store false but never forwards a persistence request upstream', async () => {
    const f = await fixture();
    const response = await f.call('/chat/completions', {
      ...requestBody(),
      store: false,
      max_completion_tokens: 64_000,
      reasoning_effort: 'high',
    });
    expect(response.status).toBe(200);
    const sent = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    expect(sent.store).toBeUndefined();
    expect(sent.reasoning_effort).toBe('high');
    expect(sent.max_completion_tokens).toBe(64_000);
  });
  it('rejects a non-boolean persistence preference before upstream spend', async () => {
    const f = await fixture();
    expect((await f.call('/chat/completions', { ...requestBody(), store: 'false' })).status).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
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
