import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCorsMiddleware, createWorkflowHttpApp } from './http-app.js';
import { SolutionError } from './solution-service.js';

const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const revisionId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
const probeId = '75c8a4d0-a905-40cb-8cc0-fbc3c48cd8f7';
const identity = { userId: 'user_verified' };
const base = `/v2/solutions/${solutionId}/revisions/${revisionId}/failure-probes`;
const reconcilePath = `${base}/${probeId}/reconcile`;
const key = 'handler_probe_001';
const command = {
  expectedVersion: 3,
  workflowHash: 'a'.repeat(64),
  bundleHash: 'b'.repeat(64),
  confirmSyntheticFailure: true,
};
const probe = { id: probeId, status: 'outcome_unknown', cleanupState: 'unknown' };

function fixture({ user = identity, available = true } = {}) {
  const service = {
    read: vi.fn().mockResolvedValue({ allowed: true, probes: [] }),
    run: vi.fn().mockResolvedValue({ replayed: false, probe }),
    reconcile: vi.fn().mockResolvedValue({ probe }),
  };
  const app = createWorkflowHttpApp({
    commandService: {},
    solutionFailureProbeService: available ? service : null,
    auth: { middleware: (_req, _res, next) => next(), context: () => user },
    cors: createCorsMiddleware(['https://orqaly.example']),
  });
  return { app, service };
}

function invoke(app, { method = 'POST', url = base, body = command, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({
      method, url, body, headers: { 'idempotency-key': key, ...headers },
    });
    // node-mocks-http otherwise silently turns a JSON null into an empty object.
    req.body = body;
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}

function noDispatch(service) {
  for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
}

afterEach(() => vi.restoreAllMocks());

describe('isolated failure-probe HTTP boundary', () => {
  it('reads only the authenticated exact revision and never caches evidence', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { method: 'GET', body: undefined });
    expect(result.statusCode).toBe(200);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result._getJSONData()).toEqual({ allowed: true, probes: [] });
    expect(service.read).toHaveBeenCalledExactlyOnceWith(identity, solutionId, revisionId);
    expect(service.run).not.toHaveBeenCalled();
  });

  it('passes explicit synthetic-failure consent and exact source pins without adding effect authority', async () => {
    const { app, service } = fixture();
    const result = await invoke(app);
    expect(result.statusCode).toBe(200);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result._getJSONData()).toEqual({ replayed: false, probe });
    expect(service.run).toHaveBeenCalledExactlyOnceWith(identity, solutionId, revisionId, command, key);
    expect(service.reconcile).not.toHaveBeenCalled();
  });

  it('forwards a lost-response retry with the same key without inventing another dispatch', async () => {
    const { app, service } = fixture();
    service.run.mockResolvedValue({ replayed: true, probe });
    const result = await invoke(app);
    expect(result._getJSONData()).toEqual({ replayed: true, probe });
    expect(service.run).toHaveBeenCalledExactlyOnceWith(identity, solutionId, revisionId, command, key);
  });

  it.each([
    ['GET', base, undefined],
    ['POST', base, command],
    ['POST', reconcilePath, {}],
  ])('requires sign-in for %s %s', async (method, url, body) => {
    const { app, service } = fixture({ user: null });
    const result = await invoke(app, { method, url, body });
    expect(result.statusCode).toBe(401);
    noDispatch(service);
  });

  it.each([
    ['GET', base.replace(solutionId, 'not-a-uuid')],
    ['GET', base.replace(revisionId, 'not-a-uuid')],
    ['POST', base.replace(solutionId, 'not-a-uuid')],
    ['POST', base.replace(revisionId, 'not-a-uuid')],
    ['POST', reconcilePath.replace(solutionId, 'not-a-uuid')],
    ['POST', reconcilePath.replace(revisionId, 'not-a-uuid')],
    ['POST', reconcilePath.replace(probeId, 'not-a-uuid')],
  ])('rejects malformed identifiers before service access: %s %s', async (method, url) => {
    const { app, service } = fixture();
    const result = await invoke(app, { method, url, body: url.endsWith('/reconcile') ? {} : command });
    expect(result.statusCode).toBe(400);
    expect(result._getJSONData().error.code).toBe('INVALID_COMMAND');
    noDispatch(service);
  });

  it.each([
    ['version missing', { ...command, expectedVersion: undefined }],
    ['version negative', { ...command, expectedVersion: -1 }],
    ['version fractional', { ...command, expectedVersion: 1.5 }],
    ['workflow hash missing', { ...command, workflowHash: undefined }],
    ['workflow hash invalid', { ...command, workflowHash: 'not-a-hash' }],
    ['bundle hash missing', { ...command, bundleHash: undefined }],
    ['bundle hash uppercase', { ...command, bundleHash: 'B'.repeat(64) }],
    ['consent absent', { ...command, confirmSyntheticFailure: undefined }],
    ['consent false', { ...command, confirmSyntheticFailure: false }],
    ['consent string', { ...command, confirmSyntheticFailure: 'true' }],
    ['caller tenant', { ...command, tenantId: solutionId }],
    ['caller user', { ...command, userId: 'other_user' }],
    ['caller runtime', { ...command, environmentId: 'unowned-runtime' }],
    ['caller input', { ...command, input: { customer: 'must-not-run' } }],
    ['caller credentials', { ...command, credentials: { value: 'must-not-store' } }],
    ['provider consent', { ...command, allowExternalEffects: true }],
  ])('rejects invalid or expanded authority: %s', async (_label, body) => {
    const { app, service } = fixture();
    const result = await invoke(app, { body });
    expect(result.statusCode).toBe(400);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result._getJSONData().error.code).toBe('INVALID_COMMAND');
    expect(JSON.stringify(result._getJSONData())).not.toContain('must-not-store');
    noDispatch(service);
  });

  it.each([undefined, '', 'short', 'spaces are forbidden', 'x'.repeat(161)])('requires a bounded idempotency key: %s', async (invalidKey) => {
    const { app, service } = fixture();
    const result = await invoke(app, { headers: { 'idempotency-key': invalidKey } });
    expect(result.statusCode).toBe(400);
    noDispatch(service);
  });

  it('rejects query-based scope changes when listing evidence', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { method: 'GET', url: `${base}?owner=other`, body: undefined });
    expect(result.statusCode).toBe(400);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    noDispatch(service);
  });

  it('denies foreign origins before any effect or evidence access', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { headers: { origin: 'https://attacker.example' } });
    expect(result.statusCode).toBe(403);
    noDispatch(service);
  });

  it('reconciles only the stored exact probe with an empty body and no new run', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, { url: reconcilePath, body: {}, headers: { 'idempotency-key': '' } });
    expect(result.statusCode).toBe(200);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(service.reconcile).toHaveBeenCalledExactlyOnceWith(identity, solutionId, revisionId, probeId);
    expect(service.run).not.toHaveBeenCalled();
  });

  it.each([{ retry: true }, command, { input: {} }, null])('rejects expanded reconcile commands without caching the failure', async (body) => {
    const { app, service } = fixture();
    const result = await invoke(app, { url: reconcilePath, body });
    expect(result.statusCode).toBe(400);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    noDispatch(service);
  });

  it.each([
    ['GET', base, undefined],
    ['POST', base, command],
    ['POST', reconcilePath, {}],
  ])('reports unavailable instead of fabricated evidence: %s %s', async (method, url, body) => {
    const { app, service } = fixture({ available: false });
    const result = await invoke(app, { method, url, body });
    expect(result.statusCode).toBe(503);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result._getJSONData().error.code).toBe('FAILURE_PROBE_UNAVAILABLE');
    noDispatch(service);
  });

  it('preserves owner-denial semantics without exposing another source', async () => {
    const { app, service } = fixture();
    service.read.mockRejectedValue(new SolutionError('SOLUTION_REVISION_NOT_FOUND', 'Revision not found', 404));
    const result = await invoke(app, { method: 'GET' });
    expect(result.statusCode).toBe(404);
    expect(result._getJSONData()).toEqual({ error: { code: 'SOLUTION_REVISION_NOT_FOUND', message: 'Revision not found' } });
    expect(service.read).toHaveBeenCalledExactlyOnceWith(identity, solutionId, revisionId);
  });

  it.each([
    ['run', base, command],
    ['reconcile', reconcilePath, {}],
  ])('sanitizes unexpected %s runtime failures without retry or false success', async (method, url, body) => {
    const marker = 'private-runtime-token-and-source-must-not-leak';
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, service } = fixture();
    service[method].mockRejectedValue(new Error(marker));
    const result = await invoke(app, { url, body });
    expect(result.statusCode).toBe(500);
    expect(result.getHeader('Cache-Control')).toBe('no-store');
    expect(result._getJSONData()).toEqual({ error: { code: 'INTERNAL', message: 'request failed' } });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(marker);
    expect(service[method]).toHaveBeenCalledTimes(1);
  });
});
