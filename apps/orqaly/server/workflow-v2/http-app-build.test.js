import { EventEmitter } from 'node:events';
import express from 'express';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { createCorsMiddleware, createWorkflowHttpApp } from './http-app.js';
import { SolutionBuildError } from './solution-build-service.js';

const id = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const agentId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const base = '/v2/solution-build-requests';
const selected = `${base}/${id}`;
const identity = { userId: 'user_verified' };
const instruction = { runId: id, agentId, instruction: 'Build a webhook from this task' };
const answer = { expectedVersion: 4, questionId: 'output_name', value: 'customer_name' };
const confirm = { expectedVersion: 4, workflowHash: 'a'.repeat(64) };
function invoke(app, { method = 'POST', url, body = {}, headers = {}, query }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({
      method,
      url,
      body,
      headers,
      ...(query ? { query } : {}),
    });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}
function fixture({ user = identity, configured = true, nativeConfigured = true } = {}) {
  const service = Object.fromEntries(
    ['list', 'read', 'create', 'answer', 'saveDraft', 'review', 'retry', 'confirm'].map(
      (method) => [method, vi.fn().mockResolvedValue({ buildRequest: { id } })]
    )
  );
  const native = {
    router: express.Router(),
    issueBuild: vi
      .fn()
      .mockResolvedValue({
        launchUrl: 'https://api.orqaly.example/native-n8n/launch',
        token: 'test-scoped-token',
        expiresAt: 12345,
      }),
  };
  const app = createWorkflowHttpApp({
    commandService: {},
    auth: { middleware: (_req, _res, next) => next(), context: () => user },
    solutionBuildService: configured ? service : null,
    nativeN8nGateway: nativeConfigured ? native : null,
    cors: createCorsMiddleware(['https://orqaly.example']),
  });
  return { app, service, native };
}
const routes = [
  { method: 'GET', url: base },
  { method: 'POST', url: base, body: instruction },
  { method: 'GET', url: selected },
  { method: 'POST', url: `${selected}/answers`, body: answer },
  { method: 'PATCH', url: `${selected}/draft`, body: { ...confirm, workflow: { nodes: [] } } },
  { method: 'POST', url: `${selected}/review`, body: { expectedVersion: 4 } },
  { method: 'POST', url: `${selected}/retry`, body: { expectedVersion: 4 } },
  { method: 'POST', url: `${selected}/confirm`, body: confirm },
  { method: 'POST', url: `${selected}/native-session`, body: { mode: 'view' } },
];

describe('solution-build HTTP boundary', () => {
  it.each(routes)('requires authenticated identity for $method $url', async (route) => {
    const { app, service, native } = fixture({ user: null });
    const result = await invoke(app, { ...route, headers: { 'idempotency-key': 'test_identity' } });
    expect(result.statusCode).toBe(401);
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    expect(native.issueBuild).not.toHaveBeenCalled();
  });
  it('passes exact validated instruction and verified identity without inferring deployment', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, {
      url: base,
      body: instruction,
      headers: { 'idempotency-key': 'create_request' },
    });
    expect(result.statusCode).toBe(201);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(service.create).toHaveBeenCalledWith(identity, instruction, 'create_request');
    expect(service.confirm).not.toHaveBeenCalled();
  });
  it('rejects supplied owner/context fields rather than treating them as authority', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, {
      url: base,
      body: { ...instruction, userId: 'user_other', context: { approved: true } },
      headers: { 'idempotency-key': 'create_request' },
    });
    expect(result.statusCode).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it.each([
    { url: base, body: instruction, method: 'create' },
    { url: `${selected}/answers`, body: answer, method: 'answer' },
    { url: `${selected}/retry`, body: { expectedVersion: 4 }, method: 'retry' },
    { url: `${selected}/confirm`, body: confirm, method: 'confirm' },
  ])('requires idempotency before $method', async ({ url, body, method }) => {
    const { app, service } = fixture();
    const result = await invoke(app, { url, body });
    expect(result.statusCode).toBe(400);
    expect(service[method]).not.toHaveBeenCalled();
  });
  it.each(['answers', 'review', 'retry', 'confirm'])(
    'requires current numeric version for %s',
    async (path) => {
      const { app, service } = fixture();
      const body =
        path === 'answers'
          ? { questionId: 'output_name', value: 'name' }
          : path === 'confirm'
            ? { workflowHash: 'a'.repeat(64) }
            : {};
      const result = await invoke(app, {
        url: `${selected}/${path}`,
        body,
        headers: { 'idempotency-key': 'version_request' },
      });
      expect(result.statusCode).toBe(400);
      expect(service[path === 'answers' ? 'answer' : path]).not.toHaveBeenCalled();
    }
  );
  it('forwards answers and exact review/confirmation contracts', async () => {
    const { app, service } = fixture();
    await invoke(app, {
      url: `${selected}/answers`,
      body: answer,
      headers: { 'idempotency-key': 'answer_request' },
    });
    await invoke(app, { url: `${selected}/review`, body: { expectedVersion: 4 } });
    await invoke(app, {
      url: `${selected}/confirm`,
      body: confirm,
      headers: { 'idempotency-key': 'confirm_request' },
    });
    expect(service.answer).toHaveBeenCalledWith(identity, id, answer, 'answer_request');
    expect(service.review).toHaveBeenCalledWith(identity, id, { expectedVersion: 4 });
    expect(service.confirm).toHaveBeenCalledWith(identity, id, confirm, 'confirm_request');
  });
  it('requires previous workflow checksum for native draft saves', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, {
      method: 'PATCH',
      url: `${selected}/draft`,
      body: { expectedVersion: 4, workflow: {} },
    });
    expect(result.statusCode).toBe(400);
    expect(service.saveDraft).not.toHaveBeenCalled();
    const body = { ...confirm, workflow: { nodes: [] } };
    expect(
      (await invoke(app, { method: 'PATCH', url: `${selected}/draft`, body })).statusCode
    ).toBe(200);
    expect(service.saveDraft).toHaveBeenCalledWith(identity, id, body);
  });
  it('rejects recognizable credentials without echoing them in validation output', async () => {
    const { app, service } = fixture();
    const secret = 'sk_live_abcdefghijklmnop';
    const result = await invoke(app, {
      url: `${selected}/answers`,
      body: { ...answer, value: secret },
      headers: { 'idempotency-key': 'secret_request' },
    });
    expect(result.statusCode).toBe(400);
    expect(JSON.stringify(result._getJSONData())).not.toContain(secret);
    expect(service.answer).not.toHaveBeenCalled();
  });
  it('reads lists under authenticated scope with only validated filters', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { method: 'GET', url: base, query: { runId: id, agentId } });
    expect(result.statusCode).toBe(200);
    expect(service.list).toHaveBeenCalledWith(identity, { runId: id, agentId });
  });
  it.each([`${base}/not-a-uuid`, `${base}/not-a-uuid/native-session`])(
    'rejects invalid IDs at %s',
    async (url) => {
      const { app } = fixture();
      const result = await invoke(app, {
        method: url.endsWith('native-session') ? 'POST' : 'GET',
        url,
        body: { mode: 'view' },
      });
      expect(result.statusCode).toBe(400);
    }
  );
  it('issues only the native build-request session, without allowing an injected target', async () => {
    const { app, native } = fixture();
    const result = await invoke(app, { url: `${selected}/native-session`, body: { mode: 'edit' } });
    expect(result.statusCode).toBe(200);
    expect(native.issueBuild).toHaveBeenCalledWith(identity, id, { mode: 'edit' });
    expect(
      (
        await invoke(app, {
          url: `${selected}/native-session`,
          body: { mode: 'edit', solutionId: agentId },
        })
      ).statusCode
    ).toBe(400);
  });
  it('fails closed when native building is not configured', async () => {
    const { app } = fixture({ nativeConfigured: false });
    const result = await invoke(app, { url: `${selected}/native-session`, body: { mode: 'view' } });
    expect(result.statusCode).toBe(503);
    expect(result._getJSONData().error.code).toBe('NATIVE_EDITOR_UNAVAILABLE');
  });
  it('fails closed when the build service is absent', async () => {
    const { app } = fixture({ configured: false });
    const result = await invoke(app, { method: 'GET', url: selected });
    expect(result.statusCode).toBe(503);
    expect(result._getJSONData().error.code).toBe('SOLUTION_BUILDS_UNAVAILABLE');
  });
  it('preserves service conflict semantics instead of reporting generic success', async () => {
    const { app, service } = fixture();
    service.answer.mockRejectedValue(
      new SolutionBuildError('BUILD_VERSION_CONFLICT', 'Refresh this build')
    );
    const result = await invoke(app, {
      url: `${selected}/answers`,
      body: answer,
      headers: { 'idempotency-key': 'conflict_request' },
    });
    expect(result.statusCode).toBe(409);
    expect(result._getJSONData().error.code).toBe('BUILD_VERSION_CONFLICT');
  });
});
