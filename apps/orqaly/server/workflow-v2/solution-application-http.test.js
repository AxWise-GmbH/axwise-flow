import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createWorkflowHttpApp } from './http-app.js';
import { createApplicationRequestLimiter } from './solution-application-http.js';
import { SolutionError } from './solution-service.js';

const solutionId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const invocationId = '44444444-4444-4444-8444-444444444444';
const machinePath = `/invoke/v1/solutions/${solutionId}`;
const managementPath = `/v2/solutions/${solutionId}/app-keys`;
const identity = { userId: 'user_testowner' };
const authorization = 'Bearer unit-test-credential';
const body = { input: { name: ' Alice ' } };
const receipt = { id: invocationId, status: 'succeeded', output: { name: 'Alice' } };

// These unit tests exercise middleware dispatch and identity separation. The
// separate real-HTTP/n8n acceptance harness verifies streamed body parsing.
function invoke(app, { method = 'GET', url, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method, url, body, headers });
    Object.defineProperty(req, 'path', {
      get: () => new URL(req.url, 'https://api.example.test').pathname,
    });
    req.is = (type) => req.headers['content-type']?.split(';')[0] === type;
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}
function fixture(context = null, available = true) {
  const auth = {
    middleware: vi.fn((_req, _res, next) => next()),
    context: vi.fn(() => context),
  };
  const service = {
    invoke: vi.fn(async () => ({ invocation: receipt, replayed: false })),
    readInvocation: vi.fn(async () => ({ invocation: receipt })),
    list: vi.fn(async () => ({ keys: [], policy: {} })),
    create: vi.fn(async () => ({ key: { id: keyId }, token: 'one-time-unit-test-token' })),
    revoke: vi.fn(async () => ({ key: { id: keyId, status: 'revoked' } })),
  };
  const app = createWorkflowHttpApp({
    commandService: {},
    auth,
    solutionApplicationKeyService: available ? service : null,
  });
  const post = (overrides = {}) =>
    invoke(app, {
      method: 'POST',
      url: machinePath,
      body,
      headers: {
        authorization,
        'idempotency-key': 'request_key_1',
        'content-type': 'application/json',
      },
      ...overrides,
    });
  return { app, auth, service, post };
}

describe('Solution application HTTP boundary', () => {
  it('dispatches production requests and key-owned receipts without calling Clerk or CORS', async () => {
    const f = fixture();
    const invoked = await f.post();
    expect(invoked.statusCode).toBe(200);
    expect(invoked._getJSONData()).toEqual({ invocation: receipt, replayed: false });
    expect(f.service.invoke).toHaveBeenCalledExactlyOnceWith(
      authorization,
      solutionId,
      body,
      'request_key_1'
    );
    const read = await invoke(f.app, {
      url: `${machinePath}/invocations/${invocationId}`,
      headers: { authorization },
    });
    expect(read.statusCode).toBe(200);
    expect(f.service.readInvocation).toHaveBeenCalledExactlyOnceWith(
      authorization,
      solutionId,
      invocationId
    );
    for (const res of [invoked, read]) {
      expect(res.getHeader('cache-control')).toBe('no-store');
      expect(res.getHeader('x-content-type-options')).toBe('nosniff');
      expect(res.getHeader('access-control-allow-origin')).toBeUndefined();
      expect(res.getHeader('access-control-allow-credentials')).toBeUndefined();
    }
    expect(f.auth.middleware).not.toHaveBeenCalled();
    expect(f.auth.context).not.toHaveBeenCalled();
  });
  it('returns an accepted receipt for an existing running invocation without claiming success', async () => {
    const f = fixture();
    f.service.invoke.mockResolvedValue({
      invocation: { ...receipt, status: 'running', output: null },
      replayed: true,
    });
    const res = await f.post();
    expect(res.statusCode).toBe(202);
    expect(res._getJSONData().invocation).toMatchObject({ status: 'running', output: null });
    expect(f.service.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([
    { origin: 'https://orqaly.example.test' },
    { origin: '' },
    { cookie: '' },
    { cookie: 'session=x' },
  ])('rejects browser authority before inspecting a key: %j', async (headers) => {
    const f = fixture();
    const res = await f.post({ headers: { ...headers, authorization } });
    expect(res.statusCode).toBe(403);
    expect(res._getJSONData().error.code).toBe('APPLICATION_CLIENT_REQUIRED');
    expect(f.service.invoke).not.toHaveBeenCalled();
    expect(f.auth.middleware).not.toHaveBeenCalled();
  });
  it.each(['HEAD', 'OPTIONS', 'DELETE', 'PUT'])(
    'denies %s instead of falling into browser routes',
    async (method) => {
      const f = fixture();
      const res = await f.post({ method });
      expect(res.statusCode).toBe(405);
      expect(f.auth.middleware).not.toHaveBeenCalled();
      expect(f.service.invoke).not.toHaveBeenCalled();
    }
  );
  it.each([machinePath, `${machinePath}/invocations/${invocationId}`])(
    'rejects credential or authority query parameters on %s',
    async (path) => {
      const f = fixture();
      const res = await f.post({
        method: path === machinePath ? 'POST' : 'GET',
        url: `${path}?token=do-not-reflect-this-value`,
      });
      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().error.code).toBe('INVALID_COMMAND');
      expect(res._getData()).not.toContain('do-not-reflect');
      expect(f.service.invoke).not.toHaveBeenCalled();
      expect(f.service.readInvocation).not.toHaveBeenCalled();
      expect(f.auth.middleware).not.toHaveBeenCalled();
    }
  );
  it('rejects non-JSON requests and unavailable or unknown endpoints without falling through', async () => {
    const f = fixture();
    const notJson = await f.post({ headers: { authorization, 'content-type': 'text/plain' } });
    expect(notJson.statusCode).toBe(415);
    const unknown = await f.post({ url: `${machinePath}/activate` });
    expect(unknown.statusCode).toBe(404);
    expect(f.service.invoke).not.toHaveBeenCalled();
    expect(f.auth.middleware).not.toHaveBeenCalled();
    const missing = fixture(null, false);
    expect((await missing.post()).statusCode).toBe(503);
    expect(missing.auth.middleware).not.toHaveBeenCalled();
  });
  it('forwards a durable quota denial with Retry-After and never retries dispatch', async () => {
    const f = fixture();
    f.service.invoke.mockRejectedValue(
      Object.assign(new SolutionError('APP_KEY_RATE_LIMITED', 'Allowance reached.', 429), {
        retryAfter: 60,
      })
    );
    const res = await f.post();
    expect(res.statusCode).toBe(429);
    expect(res.getHeader('retry-after')).toBe('60');
    expect(f.service.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      new Error('Sensitive provider error: do-not-reflect-this-value'),
      500,
      'APPLICATION_REQUEST_FAILED',
    ],
    [z.string().safeParse({ secret: 'do-not-reflect-this-value' }).error, 400, 'INVALID_COMMAND'],
    [
      Object.assign(new Error('do-not-reflect-this-value'), { type: 'entity.too.large' }),
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ])('sanitizes non-domain error details', async (error, status, code) => {
    const f = fixture();
    f.service.invoke.mockRejectedValue(error);
    const res = await f.post();
    expect(res.statusCode).toBe(status);
    expect(res._getJSONData().error.code).toBe(code);
    expect(res._getData()).not.toContain('do-not-reflect');
    expect(f.service.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['GET', managementPath],
    ['POST', managementPath],
    ['POST', `${managementPath}/${keyId}/revoke`],
  ])('preserves human authentication for %s %s', async (method, url) => {
    const f = fixture();
    const res = await f.post({ method, url });
    expect(res.statusCode).toBe(401);
    expect(f.auth.middleware).toHaveBeenCalledTimes(1);
    expect(f.service.list).not.toHaveBeenCalled();
    expect(f.service.create).not.toHaveBeenCalled();
    expect(f.service.revoke).not.toHaveBeenCalled();
  });
  it('uses verified identity, exact quoted versions and one-time no-store responses for management', async () => {
    const f = fixture(identity);
    const command = { label: 'Backend', workflowHash: 'a'.repeat(64), expiresInDays: 30 };
    const created = await invoke(f.app, {
      method: 'POST',
      url: managementPath,
      body: command,
      headers: { 'if-match': '"7"', 'idempotency-key': 'create_key_1' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.getHeader('cache-control')).toBe('no-store');
    expect(created._getJSONData().token).toBe('one-time-unit-test-token');
    expect(f.service.create).toHaveBeenCalledExactlyOnceWith(
      identity,
      solutionId,
      command,
      7,
      'create_key_1'
    );
    const listed = await invoke(f.app, { url: managementPath });
    expect(listed.statusCode).toBe(200);
    expect(listed._getJSONData()).not.toHaveProperty('token');
    expect(f.service.list).toHaveBeenCalledExactlyOnceWith(identity, solutionId);
    const revoked = await invoke(f.app, {
      method: 'POST',
      url: `${managementPath}/${keyId}/revoke`,
      body: {},
      headers: { 'if-match': '"1"' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(f.service.revoke).toHaveBeenCalledExactlyOnceWith(identity, solutionId, keyId, 1);
  });
  it.each([undefined, '1', '*', 'W/"1"', '"1", "2"'])(
    'denies ambiguous management If-Match %s before calling key service',
    async (version) => {
      const f = fixture(identity);
      const res = await invoke(f.app, {
        method: 'POST',
        url: managementPath,
        body: {},
        headers: version === undefined ? {} : { 'if-match': version },
      });
      expect(res.statusCode).toBe(428);
      expect(f.service.create).not.toHaveBeenCalled();
    }
  );
});

describe('bounded pre-authentication application limiter', () => {
  it('bounds identities as well as per-address requests and releases capacity when buckets expire', () => {
    let time = 1_000;
    const limiter = createApplicationRequestLimiter({ limit: 2, maxBuckets: 2, now: () => time });
    const request = (ip) => {
      const next = vi.fn();
      const res = httpMocks.createResponse();
      limiter({ ip }, res, next);
      return { next, res };
    };
    expect(request('ip1').next).toHaveBeenCalledTimes(1);
    expect(request('ip1').next).toHaveBeenCalledTimes(1);
    const exceeded = request('ip1');
    expect(exceeded.next).not.toHaveBeenCalled();
    expect(exceeded.res.statusCode).toBe(429);
    expect(request('ip2').next).toHaveBeenCalledTimes(1);
    expect(request('ip3').next).not.toHaveBeenCalled();
    time += 60_000;
    expect(request('ip3').next).toHaveBeenCalledTimes(1);
    expect(request('ip4').next).toHaveBeenCalledTimes(1);
    expect(request('ip5').res.statusCode).toBe(429);
  });
});
