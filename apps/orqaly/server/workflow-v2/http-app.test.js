import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { AgenticControlPlaneError } from './agentic-control-plane-client.js';
import {
  browserOriginsFromEnvironment,
  clerkMiddlewareOptionsFromEnvironment,
  createCorsMiddleware,
  createWorkflowHttpApp,
  isClerkEnvironmentConfigured,
  personalClerkAuthContext,
} from './http-app.js';

function auth(context) {
  return { middleware: (_req, _res, next) => next(), context: () => context };
}

function invoke(app, { method, url, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method, url, body, headers });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}

describe('workflow v2 Cloud Run HTTP app', () => {
  it.each(['/v2/agents/a/solutions', '/v2/solutions/a', '/v2/solutions/a/invocations'])(
    'requires authentication for solution route %s',
    async (url) => {
      const app = createWorkflowHttpApp({ commandService: {}, auth: auth(null) });
      const response = await invoke(app, {
        method: url.endsWith('invocations') ? 'POST' : 'GET',
        url,
      });
      expect(response.statusCode).toBe(401);
    }
  );
  it('passes only verified identity, exact row version and supplied invocation key to solution services', async () => {
    const solutionService = {
      decide: vi.fn().mockResolvedValue({ solution: { id: 'solution' } }),
      invoke: vi.fn().mockResolvedValue({ invocation: { id: 'invocation' } }),
    };
    const identity = { userId: 'user_verified' };
    const app = createWorkflowHttpApp({
      commandService: {},
      solutionService,
      auth: auth(identity),
    });
    await invoke(app, {
      method: 'POST',
      url: '/v2/solutions/solution/decision',
      headers: { 'if-match': '"4"' },
      body: { action: 'deploy', workflowHash: 'a'.repeat(64) },
    });
    expect(solutionService.decide).toHaveBeenCalledWith(
      identity,
      'solution',
      { action: 'deploy', workflowHash: 'a'.repeat(64) },
      4
    );
    await invoke(app, {
      method: 'POST',
      url: '/v2/solutions/solution/invocations',
      headers: { 'idempotency-key': 'safe-key-123' },
      body: { mode: 'test', input: { name: 'Alice' } },
    });
    expect(solutionService.invoke).toHaveBeenCalledWith(
      identity,
      'solution',
      { mode: 'test', input: { name: 'Alice' } },
      'safe-key-123'
    );
  });
  it('requires both Clerk keys before reporting the identity boundary configured', () => {
    expect(isClerkEnvironmentConfigured({})).toBe(false);
    expect(isClerkEnvironmentConfigured({ CLERK_SECRET_KEY: 'secret' })).toBe(false);
    expect(isClerkEnvironmentConfigured({ CLERK_PUBLISHABLE_KEY: 'publishable' })).toBe(false);
    expect(
      isClerkEnvironmentConfigured({
        CLERK_SECRET_KEY: 'secret',
        CLERK_PUBLISHABLE_KEY: 'publishable',
      })
    ).toBe(false);
    expect(
      isClerkEnvironmentConfigured({
        CLERK_SECRET_KEY: 'secret',
        CLERK_PUBLISHABLE_KEY: 'publishable',
        ORQALY_BROWSER_ORIGINS: 'https://orqaly-v2-web-preview.example.com',
      })
    ).toBe(true);
  });

  it('uses the exact HTTPS browser origins as Clerk authorized parties', () => {
    const environment = {
      ORQALY_BROWSER_ORIGINS:
        'https://orqaly-v2-web-preview.example.com, https://preview.example.com',
    };
    const expected = ['https://orqaly-v2-web-preview.example.com', 'https://preview.example.com'];
    expect(browserOriginsFromEnvironment(environment)).toEqual(expected);
    expect(clerkMiddlewareOptionsFromEnvironment(environment)).toEqual({
      authorizedParties: expected,
    });
    expect(() =>
      browserOriginsFromEnvironment({ ORQALY_BROWSER_ORIGINS: 'http://preview.example.com' })
    ).toThrow(/exact HTTPS origins/);
    expect(() =>
      browserOriginsFromEnvironment({
        ORQALY_BROWSER_ORIGINS: 'https://preview.example.com/path',
      })
    ).toThrow(/exact HTTPS origins/);
  });

  it('derives only the personal Clerk user identity from verified auth', () => {
    expect(
      personalClerkAuthContext({
        isAuthenticated: true,
        userId: 'user_httptest123',
        orgId: 'org_mustnotpropagate123',
      })
    ).toEqual({ userId: 'user_httptest123' });
    expect(
      personalClerkAuthContext({ isAuthenticated: false, userId: 'user_httptest123' })
    ).toBeNull();
  });

  it('serves a public readiness endpoint outside the authenticated API boundary', async () => {
    const commandService = {
      ready: vi.fn().mockResolvedValue({ database: 'ready', pool: { total: 1, idle: 1 } }),
    };
    const app = createWorkflowHttpApp({ commandService, auth: auth(null) });
    const response = await invoke(app, { method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response._getJSONData()).toEqual({
      status: 'ok',
      database: 'ready',
      pool: { total: 1, idle: 1 },
      executionConfigured: false,
    });
    expect(commandService.ready).toHaveBeenCalledOnce();
  });

  it('exposes loaded execution configuration in readiness without secrets', async () => {
    const commandService = {
      ready: vi.fn().mockResolvedValue({ database: 'ready', pool: { total: 1, idle: 1 } }),
    };
    const app = createWorkflowHttpApp({
      commandService,
      auth: auth(null),
      executionConfigured: true,
    });
    const response = await invoke(app, { method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response._getJSONData()).toMatchObject({
      status: 'ok',
      database: 'ready',
      executionConfigured: true,
    });
  });

  it('fails readiness closed when the database or identity boundary is unavailable', async () => {
    const unavailable = Object.assign(new Error('database unavailable'), {
      code: 'DATABASE_UNAVAILABLE',
    });
    const commandService = { ready: vi.fn().mockRejectedValue(unavailable) };
    const app = createWorkflowHttpApp({ commandService, auth: auth(null) });
    const response = await invoke(app, { method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response._getJSONData()).toEqual({
      status: 'unavailable',
      code: 'DATABASE_UNAVAILABLE',
    });
  });

  it('creates an idempotent personal session through the authenticated v2 boundary', async () => {
    const verified = { userId: 'user_httptest123' };
    const commandService = {
      session: vi.fn().mockResolvedValue({ userId: verified.userId, tenantBound: true }),
    };
    const app = createWorkflowHttpApp({ commandService, auth: auth(verified) });

    const response = await invoke(app, { method: 'POST', url: '/v2/session', body: {} });

    expect(response.statusCode).toBe(200);
    expect(response.getHeader('cache-control')).toBe('no-store');
    expect(response._getJSONData()).toEqual({
      session: { userId: verified.userId, tenantBound: true },
    });
    expect(commandService.session).toHaveBeenCalledOnce();
    expect(commandService.session).toHaveBeenCalledWith(verified);
  });

  it('rejects an unauthenticated session request before service execution', async () => {
    const commandService = { session: vi.fn() };
    const app = createWorkflowHttpApp({ commandService, auth: auth(null) });

    const response = await invoke(app, { method: 'POST', url: '/v2/session', body: {} });

    expect(response.statusCode).toBe(401);
    expect(response._getJSONData()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'sign-in required' },
    });
    expect(commandService.session).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated workflow commands before service execution', async () => {
    const commandService = { start: vi.fn() };
    const app = createWorkflowHttpApp({ commandService, auth: auth(null) });
    const response = await invoke(app, { method: 'POST', url: '/v2/workflows', body: {} });
    expect(response.statusCode).toBe(401);
    expect(commandService.start).not.toHaveBeenCalled();
  });

  it('keeps executable actions behind the same Clerk personal-user boundary', async () => {
    const executableActionService = { read: vi.fn() };
    const app = createWorkflowHttpApp({
      commandService: {},
      executableActionService,
      auth: auth(null),
    });
    const response = await invoke(app, {
      method: 'GET',
      url: '/v1/runs/00000000-0000-4000-8000-000000000020/executable-actions',
    });
    expect(response.statusCode).toBe(401);
    expect(executableActionService.read).not.toHaveBeenCalled();
  });

  it('returns action-null for a visible run without an executable proposal', async () => {
    const aggregate = { version: 'orqaly_executable_action_aggregate_v1', action: null };
    const executableActionService = { read: vi.fn().mockResolvedValue(aggregate) };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({
      commandService: {},
      executableActionService,
      auth: auth(verified),
    });
    const runId = '00000000-0000-4000-8000-000000000020';
    const response = await invoke(app, {
      method: 'GET',
      url: `/v1/runs/${runId}/executable-actions`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.getHeader('cache-control')).toBe('no-store');
    expect(response._getJSONData()).toEqual(aggregate);
    expect(executableActionService.read).toHaveBeenCalledWith(verified, runId);
  });

  it('requires and forwards an exact quoted row version for action approval', async () => {
    const actionId = '00000000-0000-4000-8000-000000000021';
    const command = {
      version: 'orqaly_executable_action_decision_v1',
      idempotencyKey: 'approval-http-001',
      decision: 'approve',
    };
    const executableActionService = {
      decide: vi.fn().mockResolvedValue({
        idempotent: false,
        aggregate: {
          version: 'orqaly_executable_action_aggregate_v1',
          action: { id: actionId, rowVersion: 3 },
        },
      }),
    };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({
      commandService: {},
      executableActionService,
      auth: auth(verified),
    });
    const missing = await invoke(app, {
      method: 'POST',
      url: `/v1/executable-actions/${actionId}/decision`,
      body: command,
    });
    expect(missing.statusCode).toBe(428);
    expect(executableActionService.decide).not.toHaveBeenCalled();

    const approved = await invoke(app, {
      method: 'POST',
      url: `/v1/executable-actions/${actionId}/decision`,
      body: command,
      headers: { 'if-match': '"2"' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.getHeader('etag')).toBe('"3"');
    expect(executableActionService.decide).toHaveBeenCalledWith(verified, actionId, command, 2);
  });

  it('returns a typed 413 instead of a 500 for oversized JSON bodies', async () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    const commandService = { workspace: vi.fn().mockRejectedValue(tooLarge) };
    const app = createWorkflowHttpApp({
      commandService,
      auth: auth({ userId: 'user_httptest123' }),
    });

    const response = await invoke(app, { method: 'GET', url: '/v2/workspace' });

    expect(response.statusCode).toBe(413);
    expect(response._getJSONData()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'request body is too large' },
    });
  });

  it('uses the same start endpoint for both chat modes and passes only personal auth context', async () => {
    const commandService = {
      start: vi.fn().mockResolvedValue({
        receipt: { idempotent: false },
        workflow: { run: { mode: 'advanced' } },
      }),
    };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({ commandService, auth: auth(verified) });
    const command = {
      commandId: '00000000-0000-4000-8000-000000000002',
      issuedAt: '2026-08-27T12:00:00.000Z',
      mode: 'advanced',
      request: 'Create an Estonia cat-food launch PRD.',
    };
    const response = await invoke(app, {
      method: 'POST',
      url: '/v2/workflows',
      body: command,
      headers: { 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(201);
    expect(commandService.start).toHaveBeenCalledWith(verified, command);
  });

  it('exposes authenticated Assistant send, resume, retry, and cancel routes', async () => {
    const commandService = {};
    const assistantService = {
      send: vi.fn().mockResolvedValue({
        route: 'DIRECT_ANSWER',
        persisted: false,
        idempotent: false,
        message: { role: 'assistant' },
      }),
      resume: vi.fn().mockResolvedValue({
        route: 'DIRECT_ANSWER',
        persisted: true,
        idempotent: false,
        message: { role: 'assistant' },
      }),
      retry: vi.fn().mockResolvedValue({
        route: 'DIRECT_ANSWER',
        persisted: false,
        idempotent: false,
        message: { role: 'assistant' },
      }),
      cancel: vi.fn().mockResolvedValue({
        route: 'DIRECT_ANSWER',
        persisted: false,
        idempotent: false,
        message: { role: 'assistant' },
      }),
    };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({
      commandService,
      assistantService,
      auth: auth(verified),
    });
    const command = {
      turnId: '00000000-0000-4000-8000-000000000010',
      issuedAt: '2026-08-31T18:00:00.000Z',
      message: 'Hello',
    };
    const sent = await invoke(app, {
      method: 'POST',
      url: '/v2/assistant/threads/00000000-0000-4000-8000-000000000011/messages',
      body: command,
    });
    expect(sent.statusCode).toBe(202);
    expect(assistantService.send).toHaveBeenCalledWith(
      verified,
      '00000000-0000-4000-8000-000000000011',
      command
    );
    const resumed = await invoke(app, {
      method: 'POST',
      url: '/v2/assistant/threads/00000000-0000-4000-8000-000000000011/turns/00000000-0000-4000-8000-000000000010/resume',
      body: {},
    });
    expect(resumed.statusCode).toBe(200);
    expect(assistantService.resume).toHaveBeenCalledWith(
      verified,
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000010'
    );
    const retryCommand = {
      turnId: '00000000-0000-4000-8000-000000000012',
      issuedAt: '2026-08-31T18:01:00.000Z',
    };
    const retried = await invoke(app, {
      method: 'POST',
      url: '/v2/assistant/threads/00000000-0000-4000-8000-000000000011/turns/00000000-0000-4000-8000-000000000010/retry',
      body: retryCommand,
    });
    expect(retried.statusCode).toBe(202);
    expect(assistantService.retry).toHaveBeenCalledWith(
      verified,
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000010',
      retryCommand
    );
    const cancelled = await invoke(app, {
      method: 'POST',
      url: '/v2/assistant/threads/00000000-0000-4000-8000-000000000011/turns/00000000-0000-4000-8000-000000000010/cancel',
      body: {},
    });
    expect(cancelled.statusCode).toBe(202);
    expect(assistantService.cancel).toHaveBeenCalledWith(
      verified,
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000010'
    );
  });

  it('reads Assistant threads through the authenticated service boundary', async () => {
    const assistantService = {
      list: vi.fn().mockResolvedValue({ threads: [] }),
      read: vi.fn().mockResolvedValue({ thread: { id: 'thread' }, messages: [] }),
    };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({
      commandService: {},
      assistantService,
      auth: auth(verified),
    });
    expect(
      (await invoke(app, { method: 'GET', url: '/v2/assistant/threads?limit=20' })).statusCode
    ).toBe(200);
    expect(assistantService.list).toHaveBeenCalledWith(verified, 20);
    expect(
      (
        await invoke(app, {
          method: 'GET',
          url: '/v2/assistant/threads/00000000-0000-4000-8000-000000000011',
        })
      ).statusCode
    ).toBe(200);
    expect(assistantService.read).toHaveBeenCalledWith(
      verified,
      '00000000-0000-4000-8000-000000000011'
    );
  });

  it('lists delegated Agents through the authenticated owner-scoped service boundary', async () => {
    const agents = [{ id: '00000000-0000-4000-8000-000000000099' }];
    const assistantService = {
      agents: vi.fn().mockResolvedValue({ agents }),
    };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({
      commandService: {},
      assistantService,
      auth: auth(verified),
    });

    const response = await invoke(app, { method: 'GET', url: '/v2/agents?limit=12' });

    expect(response.statusCode).toBe(200);
    expect(response.getHeader('cache-control')).toBe('no-store');
    expect(response._getJSONData()).toEqual({ agents });
    expect(assistantService.agents).toHaveBeenCalledWith(verified, 12);
  });

  it('uses the first-class Agent service for every configured Agent entity route', async () => {
    const verified = { userId: 'user_agenthttp123' };
    const agentId = '00000000-0000-4000-8000-000000000099';
    const result = (body, status = 200, headers = {}) => ({ status, body, headers });
    const agentService = {
      list: vi.fn().mockResolvedValue(result({ version: 'agent-list', agents: [] })),
      create: vi.fn().mockResolvedValue(result({ version: 'agent-create' }, 201)),
      read: vi.fn().mockResolvedValue(result({ version: 'agent-detail' }, 200, { etag: '"3"' })),
      updateProfile: vi.fn().mockResolvedValue(
        result({ version: 'agent-profile-update' }, 200, {
          etag: '"4"',
          requestId: 'profile-request',
        })
      ),
      lifecycle: vi.fn().mockResolvedValue(result({ version: 'agent-lifecycle' })),
      runs: vi.fn().mockResolvedValue(result({ version: 'agent-runs', runs: [] })),
      runtimeStatus: vi
        .fn()
        .mockResolvedValue(result({ version: 'orqaly_agent_runtime_status_v1', status: 'ready' })),
    };
    const assistantService = { agents: vi.fn() };
    const app = createWorkflowHttpApp({
      commandService: {},
      assistantService,
      agentService,
      auth: auth(verified),
    });
    const createRequest = { version: 'create', idempotencyKey: 'create-1' };
    const profileRequest = { version: 'profile', idempotencyKey: 'profile-1' };
    const lifecycleRequest = { version: 'lifecycle', idempotencyKey: 'lifecycle-1' };

    const listed = await invoke(app, {
      method: 'GET',
      url: '/v2/agents?limit=9&state=paused',
    });
    const created = await invoke(app, { method: 'POST', url: '/v2/agents', body: createRequest });
    const read = await invoke(app, { method: 'GET', url: `/v2/agents/${agentId}` });
    const updated = await invoke(app, {
      method: 'PATCH',
      url: `/v2/agents/${agentId}/profile`,
      body: profileRequest,
      headers: { 'if-match': '"3"' },
    });
    const lifecycle = await invoke(app, {
      method: 'POST',
      url: `/v2/agents/${agentId}/lifecycle`,
      body: lifecycleRequest,
      headers: { 'if-match': '"4"' },
    });
    const runs = await invoke(app, {
      method: 'GET',
      url: `/v2/agents/${agentId}/runs?limit=6`,
    });
    const runtime = await invoke(app, { method: 'GET', url: '/v2/agent-runtime/status' });

    expect(listed.statusCode).toBe(200);
    expect(created.statusCode).toBe(201);
    expect(read.getHeader('etag')).toBe('"3"');
    expect(updated.getHeader('etag')).toBe('"4"');
    expect(updated.getHeader('x-request-id')).toBe('profile-request');
    expect(lifecycle.statusCode).toBe(200);
    expect(runs._getJSONData()).toEqual({ version: 'agent-runs', runs: [] });
    expect(runtime._getJSONData()).toEqual({
      version: 'orqaly_agent_runtime_status_v1',
      status: 'ready',
    });
    expect(agentService.list).toHaveBeenCalledWith(verified, 9, 'paused');
    expect(agentService.create).toHaveBeenCalledWith(verified, createRequest);
    expect(agentService.read).toHaveBeenCalledWith(verified, agentId);
    expect(agentService.updateProfile).toHaveBeenCalledWith(
      verified,
      agentId,
      '"3"',
      profileRequest
    );
    expect(agentService.lifecycle).toHaveBeenCalledWith(verified, agentId, '"4"', lifecycleRequest);
    expect(agentService.runs).toHaveBeenCalledWith(verified, agentId, 6);
    expect(agentService.runtimeStatus).toHaveBeenCalledWith(verified);
    expect(assistantService.agents).not.toHaveBeenCalled();
  });

  it('preserves the legacy Agent projection only for list when the runtime is unconfigured', async () => {
    const verified = { userId: 'user_agentfallback123' };
    const assistantService = {
      agents: vi.fn().mockResolvedValue({ agents: [{ id: 'legacy-agent' }] }),
    };
    const app = createWorkflowHttpApp({
      commandService: {},
      assistantService,
      auth: auth(verified),
    });

    const list = await invoke(app, { method: 'GET', url: '/v2/agents' });
    const create = await invoke(app, { method: 'POST', url: '/v2/agents', body: {} });
    const status = await invoke(app, { method: 'GET', url: '/v2/agent-runtime/status' });

    expect(list._getJSONData()).toEqual({ agents: [{ id: 'legacy-agent' }] });
    expect(create.statusCode).toBe(503);
    expect(create._getJSONData()).toEqual({
      error: {
        code: 'AGENT_RUNTIME_NOT_CONFIGURED',
        message: 'Agent runtime is not configured',
      },
    });
    expect(status.statusCode).toBe(200);
    expect(status._getJSONData()).toMatchObject({
      configured: false,
      status: 'not_configured',
      execution: {
        enabled: false,
        connected: false,
        status: 'not_connected',
        provider: 'n8n',
        mode: 'self_hosted',
      },
    });
  });

  it('returns a typed safe Agent runtime failure without losing its request correlation', async () => {
    const error = new AgenticControlPlaneError('upstream conflict', {
      code: 'agent_version_conflict',
      status: 409,
      retryable: false,
      requestId: 'agent-upstream-request',
      publicBody: {
        error: {
          code: 'agent_version_conflict',
          requestId: 'agent-upstream-request',
          details: { expected: 2 },
        },
      },
    });
    const app = createWorkflowHttpApp({
      commandService: {},
      agentService: { read: vi.fn().mockRejectedValue(error) },
      auth: auth({ userId: 'user_agenterror123' }),
    });

    const response = await invoke(app, {
      method: 'GET',
      url: '/v2/agents/00000000-0000-4000-8000-000000000099',
    });

    expect(response.statusCode).toBe(409);
    expect(response.getHeader('cache-control')).toBe('no-store');
    expect(response.getHeader('x-request-id')).toBe('agent-upstream-request');
    expect(response._getJSONData()).toEqual(error.publicBody);
  });

  it('allows the profile concurrency and idempotency headers in browser preflight', async () => {
    const app = createWorkflowHttpApp({
      commandService: {},
      auth: auth(null),
      cors: createCorsMiddleware(['https://preview.example.com']),
    });

    const response = await invoke(app, {
      method: 'OPTIONS',
      url: '/v2/agents/00000000-0000-4000-8000-000000000099/profile',
      headers: { origin: 'https://preview.example.com' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.getHeader('access-control-allow-methods')).toBe('GET,POST,PATCH,OPTIONS');
    expect(response.getHeader('access-control-allow-headers')).toBe(
      'Authorization,Content-Type,If-Match,Idempotency-Key'
    );
  });

  it('serves authenticated assistant events as cursor JSON or content-free SSE', async () => {
    const verified = { userId: 'user_httptest123' };
    const threadId = '00000000-0000-4000-8000-000000000011';
    const event = {
      id: '00000000-0000-4000-8000-000000000012',
      threadId,
      turnId: '00000000-0000-4000-8000-000000000013',
      sequence: 4,
      type: 'completed',
      route: 'DIRECT_ANSWER',
      operationId: '00000000-0000-4000-8000-000000000014',
      retryOfTurnId: null,
      occurredAt: '2026-09-02T10:00:00.000Z',
    };
    const assistantService = {
      events: vi.fn().mockResolvedValue({ events: [event], cursor: 4 }),
    };
    const app = createWorkflowHttpApp({
      commandService: {},
      assistantService,
      auth: auth(verified),
    });

    const json = await invoke(app, {
      method: 'GET',
      url: `/v2/assistant/threads/${threadId}/events?after=3&limit=25`,
      headers: { accept: 'application/json' },
    });
    expect(json.statusCode).toBe(200);
    expect(json._getJSONData()).toEqual({ events: [event], cursor: 4 });

    const stream = await invoke(app, {
      method: 'GET',
      url: `/v2/assistant/threads/${threadId}/events?after=3&limit=25`,
      headers: { accept: 'text/event-stream' },
    });
    expect(stream.statusCode).toBe(200);
    expect(stream.getHeader('content-type')).toContain('text/event-stream');
    expect(stream._getData()).toContain('id: 4\nevent: assistant_turn\ndata:');
    expect(stream._getData()).toContain('event: cursor\ndata: {"cursor":4}');
    expect(stream._getData()).not.toContain('secret prompt');
    expect(assistantService.events).toHaveBeenCalledWith(verified, threadId, 3, 25);
  });

  it('never returns an attempt lease credential in an authenticated workflow read', async () => {
    const inputPayload = {
      type: 'CompileScopeV2',
      request: 'Create an Estonia cat-food launch PRD.',
      objectiveOnlyContext: [],
      safeDefaults: {
        geography: [],
        acceptedSourceTypes: [],
        assumptions: [],
        limits: [],
        policies: [],
      },
    };
    const leaseToken = '00000000-0000-4000-8000-000000000099';
    const workflow = {
      run: {
        id: '00000000-0000-4000-8000-000000000003',
        tenantId: '00000000-0000-4000-8000-000000000001',
        ownerUserId: 'user_httptest123',
        ownerOrganizationId: null,
        mode: 'simple',
        status: 'running',
        requestHash: 'a'.repeat(64),
        rowVersion: 1,
        evidenceReadiness: null,
        finalArtifact: null,
      },
      stages: [],
      attempts: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          stageId: '00000000-0000-4000-8000-000000000005',
          attemptNumber: 1,
          status: 'running',
          operationId: '00000000-0000-4000-8000-000000000006',
          inputHash: canonicalHash(inputPayload),
          inputPayload,
          rowVersion: 2,
          leaseToken,
          leaseExpiresAt: '2026-08-27T12:05:00.000Z',
        },
      ],
      dependencies: [],
      approvals: [],
    };
    const commandService = { read: vi.fn().mockResolvedValue(workflow) };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({ commandService, auth: auth(verified) });

    const response = await invoke(app, {
      method: 'GET',
      url: `/v2/workflows/${workflow.run.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(commandService.read).toHaveBeenCalledWith(verified, workflow.run.id);
    const attempt = response._getJSONData().workflow.attempts[0];
    expect(attempt).not.toHaveProperty('leaseToken');
    expect(JSON.stringify(response._getJSONData())).not.toContain(leaseToken);
    expect(attempt.leaseExpiresAt).toBe('2026-08-27T12:05:00.000Z');
  });

  it('returns the stable revise_scope command response shape', async () => {
    const workflow = { run: { id: '00000000-0000-4000-8000-000000000003' } };
    const commandService = {
      reviseScope: vi.fn().mockResolvedValue({
        receipt: { idempotent: false },
        workflow,
      }),
    };
    const verified = { userId: 'user_httptest123' };
    const app = createWorkflowHttpApp({ commandService, auth: auth(verified) });
    const command = {
      type: 'revise_scope',
      commandId: '00000000-0000-4000-8000-000000000004',
      issuedAt: '2026-08-27T12:00:00.000Z',
      acceptedScope: {
        artifactId: '00000000-0000-4000-8000-000000000005',
        artifactHash: 'a'.repeat(64),
        kind: 'scope',
      },
      correction: 'Focus on premium indoor-cat nutrition.',
      idempotencyKey: 'revise-scope-http-test',
    };
    const response = await invoke(app, {
      method: 'POST',
      url: `/v2/workflows/${workflow.run.id}/commands`,
      body: command,
      headers: { 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(200);
    expect(response._getJSONData()).toEqual({ workflow });
    expect(commandService.reviseScope).toHaveBeenCalledWith(verified, workflow.run.id, command);
  });

  it('serves the immutable final Markdown representation', async () => {
    const artifactHash = 'c'.repeat(64);
    const commandService = {
      artifact: vi.fn().mockResolvedValue({
        contentType: 'text/markdown',
        markdown: '# Final artifact',
        artifactHash,
      }),
    };
    const app = createWorkflowHttpApp({
      commandService,
      auth: auth({ userId: 'user_httptest123' }),
      cors: createCorsMiddleware(['https://preview.example.com']),
    });
    const response = await invoke(app, {
      method: 'GET',
      url: '/v2/workflows/00000000-0000-4000-8000-000000000003/artifacts/00000000-0000-4000-8000-000000000004',
      headers: { accept: 'text/markdown', origin: 'https://preview.example.com' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.getHeader('content-type')).toContain('text/markdown');
    expect(response.getHeader('etag')).toBe(`"sha256-${artifactHash}"`);
    expect(response.getHeader('access-control-expose-headers')).toBe(
      'ETag,X-Request-ID,Retry-After'
    );
    expect(response._getData()).toBe('# Final artifact');
  });

  it('serves workspace, overview, and activity projections behind personal Clerk auth', async () => {
    const verified = { userId: 'user_httptest123' };
    const workspace = {
      workspace: {
        displayName: 'Personal workspace',
        status: 'active',
        agentCount: 0,
        activeAgentCount: 0,
        capabilityCount: 0,
        toolCount: 0,
      },
      agents: [],
      capabilities: [],
    };
    const overview = {
      counts: { total: 0, active: 0, awaitingApproval: 0, completed: 0, attention: 0 },
      workflows: [],
      results: [],
      notifications: [],
    };
    const activity = { activities: [] };
    const commandService = {
      workspace: vi.fn().mockResolvedValue(workspace),
      overview: vi.fn().mockResolvedValue(overview),
      activity: vi.fn().mockResolvedValue(activity),
    };
    const app = createWorkflowHttpApp({ commandService, auth: auth(verified) });

    const workspaceResponse = await invoke(app, { method: 'GET', url: '/v2/workspace' });
    const overviewResponse = await invoke(app, { method: 'GET', url: '/v2/overview' });
    const activityResponse = await invoke(app, { method: 'GET', url: '/v2/activity?limit=7' });

    expect(workspaceResponse.statusCode).toBe(200);
    expect(workspaceResponse.getHeader('cache-control')).toBe('no-store');
    expect(workspaceResponse._getJSONData()).toEqual(workspace);
    expect(commandService.workspace).toHaveBeenCalledWith(verified);
    expect(overviewResponse.statusCode).toBe(200);
    expect(overviewResponse.getHeader('cache-control')).toBe('no-store');
    expect(overviewResponse._getJSONData()).toEqual(overview);
    expect(commandService.overview).toHaveBeenCalledWith(verified, 25);
    expect(activityResponse.statusCode).toBe(200);
    expect(activityResponse.getHeader('cache-control')).toBe('no-store');
    expect(activityResponse._getJSONData()).toEqual(activity);
    expect(commandService.activity).toHaveBeenCalledWith(verified, 7);
  });

  it.each([
    ['/v2/overview?limit=0', 'overview'],
    ['/v2/overview?limit=101', 'overview'],
    ['/v2/overview?limit=1.5', 'overview'],
    ['/v2/activity?limit=invalid', 'activity'],
  ])('rejects an invalid projection limit at %s', async (url, method) => {
    const commandService = { [method]: vi.fn() };
    const app = createWorkflowHttpApp({
      commandService,
      auth: auth({ userId: 'user_httptest123' }),
    });

    const response = await invoke(app, { method: 'GET', url });

    expect(response.statusCode).toBe(400);
    expect(response._getJSONData()).toEqual({
      error: { code: 'INVALID_LIMIT', message: 'limit must be 1..100' },
    });
    expect(commandService[method]).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated workspace projection reads before service execution', async () => {
    const commandService = { workspace: vi.fn() };
    const app = createWorkflowHttpApp({ commandService, auth: auth(null) });

    const response = await invoke(app, { method: 'GET', url: '/v2/workspace' });

    expect(response.statusCode).toBe(401);
    expect(response._getJSONData()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'sign-in required' },
    });
    expect(commandService.workspace).not.toHaveBeenCalled();
  });
});
