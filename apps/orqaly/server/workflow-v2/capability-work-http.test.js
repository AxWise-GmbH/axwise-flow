// @vitest-environment node
// Real Express parsing over in-memory streams only: no listener, credentials,
// database, browser, provider, or network calls.
import { EventEmitter } from 'node:events';
import { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  createCorsMiddleware,
  createMemoryRateLimiter,
  createWorkflowHttpApp,
} from './http-app.js';
import { WorkflowCommandError } from './command-service.js';

const runId = 'a1000000-0000-4000-8000-000000000001';
const identity = { userId: 'user_httpcapability123' };
const prefix = `/v2/capability-work/${runId}`;
const commands = [
  ['start', '/v2/capability-work'],
  ['approveScope', `${prefix}/scope`],
  ['admitCorpus', `${prefix}/corpus`],
  ['prepareOperation', `${prefix}/prepare`],
  ['confirmOperation', `${prefix}/confirm`],
];

function fixture({ authenticated = true, enabled = true, limiter } = {}) {
  const service = { enabled };
  for (const [name] of commands) service[name] = vi.fn().mockResolvedValue({ receipt: name });
  const auth = {
    middleware: vi.fn((_req, _res, next) => next()),
    context: vi.fn(() => (authenticated ? identity : null)),
  };
  const rateLimiter = limiter || vi.fn((_req, _res, next) => next());
  const commandService = { start: vi.fn().mockResolvedValue({ workflow: {} }) };
  const app = createWorkflowHttpApp({
    commandService,
    capabilityWorkService: service,
    auth,
    rateLimiter,
    cors: createCorsMiddleware(['https://preview.example.test']),
  });
  return { app, service, auth, rateLimiter, commandService };
}

async function invoke(app, { method = 'POST', url, body = {}, raw, headers = {} }) {
  const bytes = Buffer.from(raw === undefined ? JSON.stringify(body) : raw, 'utf8');
  const socket = new PassThrough();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(bytes.length),
    ...headers,
  };
  let bodySubscriptions = 0;
  const on = req.on;
  req.on = function (event, listener) {
    if (event === 'data') bodySubscriptions++;
    return on.call(this, event, listener);
  };
  req.push(bytes);
  req.push(null);
  const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
  try {
    await new Promise((resolve, reject) => {
      res.on('end', resolve);
      app.handle(req, res, (error) => {
        if (error) reject(error);
        else res.status(404).end();
      });
    });
    return { res, bodySubscriptions };
  } finally {
    req.destroy();
    socket.destroy();
  }
}

describe('capability command HTTP boundary', () => {
  it.each(commands)(
    'routes %s with verified personal identity and exact command bytes',
    async (name, url) => {
      const f = fixture();
      const body = { commandId: runId, selectedText: 'Fictional transcript é\r\n🦊' };
      const { res } = await invoke(f.app, { url, body });
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('cache-control')).toBe('no-store');
      expect(f.service[name]).toHaveBeenCalledExactlyOnceWith(
        ...(name === 'start' ? [identity, body] : [identity, runId, body])
      );
      expect(f.rateLimiter).toHaveBeenCalledTimes(1);
      for (const [other] of commands)
        if (other !== name) expect(f.service[other]).not.toHaveBeenCalled();
    }
  );

  it.each(commands)(
    'rejects unauthenticated %s without invoking any service',
    async (_name, url) => {
      const f = fixture({ authenticated: false });
      const { res } = await invoke(f.app, { url });
      expect(res.statusCode).toBe(401);
      for (const [name] of commands) expect(f.service[name]).not.toHaveBeenCalled();
    }
  );

  it.each(commands)('rejects disabled %s without invoking any service', async (_name, url) => {
    const f = fixture({ enabled: false });
    const { res } = await invoke(f.app, { url });
    expect(res.statusCode).toBe(503);
    expect(res.getHeader('cache-control')).toBe('no-store');
    for (const [name] of commands) expect(f.service[name]).not.toHaveBeenCalled();
  });

  it.each(commands)('rejects query overrides for %s', async (_name, url) => {
    const f = fixture();
    const { res } = await invoke(f.app, { url: `${url}?ownerUserId=user_other` });
    expect(res.statusCode).toBe(400);
    for (const [name] of commands) expect(f.service[name]).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'reports only configured=%s from authenticated configuration reads',
    async (enabled) => {
      const f = fixture({ enabled });
      const { res } = await invoke(f.app, {
        method: 'GET',
        url: '/v2/capability-work/configuration',
      });
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('cache-control')).toBe('no-store');
      expect(res._getJSONData()).toEqual({ configured: enabled });
      for (const [name] of commands) expect(f.service[name]).not.toHaveBeenCalled();
    }
  );

  it('does not expose configuration to an unauthenticated request', async () => {
    const f = fixture({ authenticated: false });
    const { res } = await invoke(f.app, {
      method: 'GET',
      url: '/v2/capability-work/configuration',
    });
    expect(res.statusCode).toBe(401);
  });

  it('leaves an absent service disabled', async () => {
    const f = fixture();
    const app = createWorkflowHttpApp({
      commandService: {},
      auth: f.auth,
      cors: createCorsMiddleware([]),
    });
    const { res } = await invoke(app, { url: `${prefix}/prepare` });
    expect(res.statusCode).toBe(503);
  });

  it('checks corpus CORS before authentication or body parsing', async () => {
    const f = fixture();
    const { res, bodySubscriptions } = await invoke(f.app, {
      url: `${prefix}/corpus`,
      raw: '{PRIVATE_TRANSCRIPT',
      headers: { origin: 'https://foreign.example.test' },
    });
    expect(res.statusCode).toBe(403);
    expect(f.auth.middleware).not.toHaveBeenCalled();
    expect(f.rateLimiter).not.toHaveBeenCalled();
    expect(bodySubscriptions).toBe(0);
    expect(f.service.admitCorpus).not.toHaveBeenCalled();
  });

  it('checks corpus authentication before rate limiting or body parsing', async () => {
    const f = fixture({ authenticated: false });
    const { res, bodySubscriptions } = await invoke(f.app, {
      url: `${prefix}/corpus`,
      raw: '{PRIVATE_TRANSCRIPT',
    });
    expect(res.statusCode).toBe(401);
    expect(f.rateLimiter).not.toHaveBeenCalled();
    expect(bodySubscriptions).toBe(0);
  });

  it('checks corpus rate limits before reading or validating source bytes', async () => {
    const limiter = vi.fn((_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED' } }));
    const f = fixture({ limiter });
    const { res, bodySubscriptions } = await invoke(f.app, {
      url: `${prefix}/corpus`,
      raw: '{PRIVATE_TRANSCRIPT',
    });
    expect(res.statusCode).toBe(429);
    expect(limiter).toHaveBeenCalledTimes(1);
    expect(bodySubscriptions).toBe(0);
    expect(f.service.admitCorpus).not.toHaveBeenCalled();
  });

  it('shares one existing rate-limit bucket between ordinary commands and corpus upload', async () => {
    const f = fixture({ limiter: createMemoryRateLimiter({ limit: 1 }) });
    expect((await invoke(f.app, { url: `${prefix}/prepare` })).res.statusCode).toBe(200);
    const { res, bodySubscriptions } = await invoke(f.app, {
      url: `${prefix}/corpus`,
      raw: '{PRIVATE_TRANSCRIPT',
    });
    expect(res.statusCode).toBe(429);
    expect(bodySubscriptions).toBe(0);
    expect(f.service.admitCorpus).not.toHaveBeenCalled();
  });

  it('checks the corpus feature flag before source body parsing', async () => {
    const f = fixture({ enabled: false });
    const { res, bodySubscriptions } = await invoke(f.app, {
      url: `${prefix}/corpus`,
      raw: '{PRIVATE_TRANSCRIPT',
    });
    expect(res.statusCode).toBe(503);
    expect(bodySubscriptions).toBe(0);
  });

  it('allows escaped source JSON above 192 KiB only through the dedicated corpus parser', async () => {
    const f = fixture();
    const body = { corpus: { documents: [{ text: '\u0001'.repeat(40_000) }] } };
    const raw = JSON.stringify(body);
    expect(Buffer.byteLength(raw)).toBeGreaterThan(192 * 1024);
    const { res, bodySubscriptions } = await invoke(f.app, { url: `${prefix}/corpus`, raw });
    expect(res.statusCode).toBe(200);
    expect(bodySubscriptions).toBeGreaterThan(0);
    expect(f.service.admitCorpus).toHaveBeenCalledExactlyOnceWith(identity, runId, body);
    // This tests parsing, not domain admission: the real service separately
    // validates corpus identity, explicit speaker assignments and source bounds.
    const ordinary = await invoke(f.app, { url: '/v2/workflows', raw });
    expect(ordinary.res.statusCode).toBe(413);
    expect(f.commandService.start).not.toHaveBeenCalled();
  });

  it('rejects a corpus body above exactly 1,000,000 wire bytes', async () => {
    const f = fixture();
    const raw = JSON.stringify({ text: 'x'.repeat(1_000_000) });
    const { res } = await invoke(f.app, { url: `${prefix}/corpus`, raw });
    expect(res.statusCode).toBe(413);
    expect(res._getJSONData()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'request body is too large' },
    });
    expect(f.service.admitCorpus).not.toHaveBeenCalled();
  });

  it('redacts malformed source JSON to a generic 400', async () => {
    const f = fixture();
    const { res } = await invoke(f.app, {
      url: `${prefix}/corpus`,
      raw: '{PRIVATE_TRANSCRIPT_AND_NAME',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res._getJSONData())).not.toContain('PRIVATE_TRANSCRIPT_AND_NAME');
    expect(f.service.admitCorpus).not.toHaveBeenCalled();
  });

  it.each(commands)('redacts source-bearing schema errors from %s', async (name, url) => {
    const f = fixture();
    f.service[name].mockRejectedValue(
      new ZodError([
        { code: 'custom', path: ['PRIVATE_SOURCE_PATH'], message: 'PRIVATE_TRANSCRIPT_AND_NAME' },
      ])
    );
    const { res } = await invoke(f.app, { url });
    expect(res.statusCode).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        code: 'INVALID_CAPABILITY_COMMAND',
        message: 'capability command validation failed',
      },
    });
  });

  it('preserves finite stale-review errors without automatically retrying', async () => {
    const f = fixture();
    f.service.confirmOperation.mockRejectedValue(
      new WorkflowCommandError('CAPABILITY_REVIEW_STALE', 'review again', 409)
    );
    const { res } = await invoke(f.app, { url: `${prefix}/confirm` });
    expect(res.statusCode).toBe(409);
    expect(f.service.confirmOperation).toHaveBeenCalledTimes(1);
    expect(f.service.prepareOperation).not.toHaveBeenCalled();
  });

  it('serves allowed corpus preflight without authentication, parsing or dispatch', async () => {
    const f = fixture();
    const { res, bodySubscriptions } = await invoke(f.app, {
      method: 'OPTIONS',
      url: `${prefix}/corpus`,
      headers: { origin: 'https://preview.example.test' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.getHeader('access-control-allow-origin')).toBe('https://preview.example.test');
    expect(f.auth.middleware).not.toHaveBeenCalled();
    expect(f.rateLimiter).not.toHaveBeenCalled();
    expect(bodySubscriptions).toBe(0);
  });
});
