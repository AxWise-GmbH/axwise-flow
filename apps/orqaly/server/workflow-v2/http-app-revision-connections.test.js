import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createWorkflowHttpApp, createCorsMiddleware } from './http-app.js';

const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const revisionId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
const identity = { userId: 'user_verified' };
const base = `/v2/solutions/${solutionId}/revisions/${revisionId}/connections`;
const create = {
  expectedVersion: 3,
  workflowHash: 'a'.repeat(64),
  bundleHash: 'b'.repeat(64),
  requirementId: 'service-api',
  credentials: { name: 'Authorization', value: 'synthetic-test-only' },
  acknowledge: true,
  confirmedScopeHash: 'c'.repeat(64),
};
const revoke = {
  expectedVersion: 4,
  workflowHash: 'd'.repeat(64),
  bundleHash: 'e'.repeat(64),
  connectionId: solutionId,
  acknowledge: true,
  confirmedScopeHash: 'c'.repeat(64),
};

function fixture(user = identity, serviceOverride = {}) {
  const service = {
    revisionSetup: vi.fn().mockResolvedValue({ connectionRequirements: [] }),
    createRevisionConnection: vi.fn().mockResolvedValue({ setup: { ready: true } }),
    revokeRevisionConnection: vi.fn().mockResolvedValue({ setup: { ready: false } }),
    ...serviceOverride,
  };
  return {
    service,
    app: createWorkflowHttpApp({
      commandService: {},
      solutionRevisionService: service,
      auth: { middleware: (_req, _res, next) => next(), context: () => user },
      cors: createCorsMiddleware(['https://orqaly.example']),
    }),
  };
}
function invoke(app, { method = 'POST', path = '', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({
      method,
      url: `${base}${path}`,
      body,
      headers: { 'idempotency-key': 'draft_connection_001', ...headers },
    });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}

describe('secure revision connection HTTP boundary', () => {
  it('loads only exact authenticated revision setup with no caching', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { method: 'GET' });
    expect(result.statusCode).toBe(200);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result.getHeader('Pragma')).toBe('no-cache');
    expect(service.revisionSetup).toHaveBeenCalledExactlyOnceWith(identity, solutionId, revisionId);
  });
  it.each([
    ['', 'createRevisionConnection', create, 201],
    ['/revoke', 'revokeRevisionConnection', revoke, 200],
  ])('passes exact %s command and idempotency to the service', async (path, method, body, status) => {
    const { app, service } = fixture();
    const result = await invoke(app, { path, body });
    expect(result.statusCode).toBe(status);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result.getHeader('Pragma')).toBe('no-cache');
    expect(service[method]).toHaveBeenCalledExactlyOnceWith(
      identity, solutionId, revisionId, body, 'draft_connection_001'
    );
    expect(JSON.stringify(result._getJSONData())).not.toContain('synthetic-test-only');
  });
  it.each([
    ['GET', '', undefined, 'revisionSetup'],
    ['POST', '', create, 'createRevisionConnection'],
    ['POST', '/revoke', revoke, 'revokeRevisionConnection'],
  ])('requires sign-in for %s %s', async (method, path, body, target) => {
    const { app, service } = fixture(null);
    expect((await invoke(app, { method, path, body })).statusCode).toBe(401);
    expect(service[target]).not.toHaveBeenCalled();
  });
  it.each([
    { ...create, acknowledge: false },
    { ...create, confirmedScopeHash: undefined },
    { ...create, tenantId: solutionId },
    { ...create, environmentId: 'some-other-runtime' },
    { ...create, expectedVersion: undefined },
  ])('rejects missing scope consent and caller ownership/runtime injection', async (body) => {
    const { app, service } = fixture();
    const result = await invoke(app, { body });
    expect(result.statusCode).toBe(400);
    expect(result._getJSONData().error.code).toBe('INVALID_CONNECTION_COMMAND');
    expect(service.createRevisionConnection).not.toHaveBeenCalled();
  });
  it('requires idempotency before dispatch', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { body: create, headers: { 'idempotency-key': '' } });
    expect(result.statusCode).toBe(400);
    expect(service.createRevisionConnection).not.toHaveBeenCalled();
  });
  it('never reflects credential keys from command or deeper service validation', async () => {
    const marker = 'secret_value_must_not_be_reflected';
    const { app, service } = fixture();
    const malformed = await invoke(app, {
      body: { ...create, credentials: { [marker]: { nested: marker } } },
    });
    expect(malformed.statusCode).toBe(400);
    expect(JSON.stringify(malformed._getJSONData())).not.toContain(marker);
    service.createRevisionConnection.mockImplementation(() =>
      z.record(z.string(), z.string()).parse({ [marker]: {} })
    );
    const nested = await invoke(app, { body: create });
    expect(nested.statusCode).toBe(400);
    expect(JSON.stringify(nested._getJSONData())).not.toContain(marker);
  });
  it('rejects cross-origin secret posts before dispatch', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, {
      body: create, headers: { origin: 'https://attacker.example' },
    });
    expect(result.statusCode).toBe(403);
    expect(service.createRevisionConnection).not.toHaveBeenCalled();
  });
  it('reports unavailable setup instead of simulating a saved credential', async () => {
    const { app } = fixture(identity, { createRevisionConnection: undefined });
    const result = await invoke(app, { body: create });
    expect(result.statusCode).toBe(503);
  });
});
