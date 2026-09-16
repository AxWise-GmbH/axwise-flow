import { EventEmitter } from 'node:events';
import express from 'express';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { createCorsMiddleware, createWorkflowHttpApp } from './http-app.js';

const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const revisionId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const base = `/v2/solutions/${solutionId}`;
const revisions = `${base}/revisions`;
const selected = `${revisions}/${revisionId}`;
const verified = { userId: 'user_verified' };
const auth = (identity) => ({ middleware: (_req, _res, next) => next(), context: () => identity });
function invoke(app, { method = 'POST', url, body = {}, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method, url, body, headers });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}
function fixture(identity = verified) {
  const service = Object.fromEntries(
    ['read', 'createDraft', 'forkRevision', 'saveDraft', 'review', 'decide', 'invoke'].map(
      (name) => [name, vi.fn().mockResolvedValue({ revisions: [] })]
    )
  );
  const native = {
    router: express.Router(),
    issue: vi.fn().mockResolvedValue({ token: 'test-launch-token' }),
  };
  const app = createWorkflowHttpApp({
    commandService: {},
    auth: auth(identity),
    solutionRevisionService: service,
    nativeN8nGateway: native,
    cors: createCorsMiddleware(['https://orqaly.example']),
  });
  return { app, service, native };
}
const mutations = [
  { method: 'POST', url: revisions, serviceMethod: 'createDraft' },
  { method: 'PATCH', url: selected, serviceMethod: 'saveDraft' },
  { method: 'POST', url: `${selected}/review`, serviceMethod: 'review' },
  { method: 'POST', url: `${selected}/decision`, serviceMethod: 'decide' },
  { method: 'POST', url: `${selected}/fork`, serviceMethod: 'forkRevision' },
];

describe('native workflow HTTP authorization and immutable version boundary', () => {
  it('forks only the exact candidate with header CAS and a stable request key', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, {
      url: `${selected}/fork`,
      headers: { 'if-match': '"7"', 'idempotency-key': 'fork_candidate_once' },
      body: { expectedVersion: 999, workflowHash: 'b'.repeat(64), bundleHash: 'c'.repeat(64) },
    });
    expect(result.statusCode).toBe(200);
    expect(service.forkRevision).toHaveBeenCalledExactlyOnceWith(
      verified,
      solutionId,
      revisionId,
      { expectedVersion: 7, workflowHash: 'b'.repeat(64), bundleHash: 'c'.repeat(64) },
      'fork_candidate_once'
    );
    expect(service.createDraft).not.toHaveBeenCalled();
    expect(service.invoke).not.toHaveBeenCalled();
    await invoke(app, {
      url: `${selected}/review`,
      headers: { 'if-match': '"7"' },
      body: { bundleHash: 'c'.repeat(64) },
    });
    expect(service.review).toHaveBeenCalledWith(verified, solutionId, revisionId, {
      expectedVersion: 7,
      bundleHash: 'c'.repeat(64),
    });
  });
  it.each([
    { method: 'GET', url: revisions },
    ...mutations,
    { method: 'POST', url: `${selected}/invocations` },
    { method: 'POST', url: `${base}/native-session` },
  ])('requires verified identity for $method $url', async ({ method, url }) => {
    const { app, service, native } = fixture(null);
    const result = await invoke(app, {
      method,
      url,
      headers: { 'if-match': '"4"' },
      body: { userId: 'user_forged', tenantId: 'forged-tenant' },
    });
    expect(result.statusCode).toBe(401);
    expect(result._getJSONData().error.code).toBe('UNAUTHENTICATED');
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    expect(native.issue).not.toHaveBeenCalled();
  });

  it.each(mutations)(
    'rejects missing If-Match before $serviceMethod can modify a revision',
    async ({ method, url, serviceMethod }) => {
      const { app, service } = fixture();
      const result = await invoke(app, {
        method,
        url,
        body: { expectedVersion: 4, workflow: {}, action: 'approve', workflowHash: 'a'.repeat(64) },
      });
      expect(result.statusCode).toBe(428);
      expect(result._getJSONData().error.code).toBe('IF_MATCH_REQUIRED');
      expect(service[serviceMethod]).not.toHaveBeenCalled();
    }
  );

  it.each(['*', '4', 'W/"4"', '"4", "5"', '"-1"', '"4.5"'])(
    'rejects non-exact If-Match %s',
    async (value) => {
      const { app, service } = fixture();
      const result = await invoke(app, {
        url: `${selected}/decision`,
        headers: { 'if-match': value },
        body: { action: 'approve', workflowHash: 'a'.repeat(64) },
      });
      expect(result.statusCode).toBe(428);
      expect(service.decide).not.toHaveBeenCalled();
    }
  );

  it('rejects row versions that cannot be represented exactly', async () => {
    const { app, service } = fixture();
    const result = await invoke(app, {
      url: `${selected}/decision`,
      headers: { 'if-match': '"9007199254740992"' },
      body: { action: 'approve', workflowHash: 'a'.repeat(64) },
    });
    expect(result.statusCode).toBe(400);
    expect(result._getJSONData().error.code).toBe('IF_MATCH_INVALID');
    expect(service.decide).not.toHaveBeenCalled();
  });

  it('takes identity and mutation versions from verified auth and If-Match, never the submitted identity/version', async () => {
    const { app, service } = fixture();
    const headers = { 'if-match': '"7"' };
    const spoof = { expectedVersion: 999, userId: 'user_attacker', tenantId: 'attacker-tenant' };
    const workflow = { name: 'Edited native draft', nodes: [] };
    await invoke(app, { url: revisions, headers, body: spoof });
    expect(service.createDraft).toHaveBeenCalledWith(verified, solutionId, { expectedVersion: 7 });
    await invoke(app, {
      method: 'PATCH',
      url: selected,
      headers,
      body: { ...spoof, workflow, status: 'approved' },
    });
    expect(service.saveDraft).toHaveBeenCalledWith(verified, solutionId, revisionId, {
      workflow,
      expectedVersion: 7,
    });
    await invoke(app, {
      url: `${selected}/review`,
      headers,
      body: { ...spoof, review: { valid: true } },
    });
    expect(service.review).toHaveBeenCalledWith(verified, solutionId, revisionId, {
      expectedVersion: 7,
    });
    await invoke(app, {
      url: `${selected}/decision`,
      headers,
      body: { expectedVersion: 999, action: 'approve', workflowHash: 'b'.repeat(64) },
    });
    expect(service.decide).toHaveBeenCalledWith(verified, solutionId, revisionId, {
      action: 'approve',
      workflowHash: 'b'.repeat(64),
      expectedVersion: 7,
    });
  });

  it('passes exact revision and explicit idempotency key to execution, without an alternate execute proxy', async () => {
    const { app, service, native } = fixture();
    const body = { input: { name: ' Alice ' } };
    const result = await invoke(app, {
      url: `${selected}/invocations`,
      headers: { 'idempotency-key': 'customer-request-123' },
      body,
    });
    expect(result.statusCode).toBe(200);
    expect(service.invoke).toHaveBeenCalledWith(
      verified,
      solutionId,
      revisionId,
      body,
      'customer-request-123'
    );
    expect(native.issue).not.toHaveBeenCalled();
    for (const method of ['createDraft', 'saveDraft', 'review', 'decide'])
      expect(service[method]).not.toHaveBeenCalled();
  });

  it('issues scoped native sessions only through the authenticated API and marks tokens/revisions non-cacheable', async () => {
    const { app, service, native } = fixture();
    const body = { revisionId, mode: 'edit' };
    const session = await invoke(app, { url: `${base}/native-session`, body });
    expect(session.statusCode).toBe(200);
    expect(session.getHeader('cache-control')).toBe('no-store');
    expect(native.issue).toHaveBeenCalledWith(verified, solutionId, body);
    const listing = await invoke(app, { method: 'GET', url: revisions });
    expect(listing.getHeader('cache-control')).toBe('no-store');
    expect(service.read).toHaveBeenCalledWith(verified, solutionId);
  });

  it('denies untrusted browser origins before issuing launch tokens or forwarding decisions', async () => {
    const { app, service, native } = fixture();
    for (const url of [`${base}/native-session`, `${selected}/decision`]) {
      const result = await invoke(app, {
        url,
        headers: { origin: 'https://untrusted.example', 'if-match': '"7"' },
      });
      expect(result.statusCode).toBe(403);
      expect(result._getJSONData().error.code).toBe('ORIGIN_DENIED');
    }
    expect(service.decide).not.toHaveBeenCalled();
    expect(native.issue).not.toHaveBeenCalled();
  });

  it('fails closed if the native gateway or revision service is not configured', async () => {
    const app = createWorkflowHttpApp({ commandService: {}, auth: auth(verified) });
    const native = await invoke(app, { url: `${base}/native-session` });
    expect(native.statusCode).toBe(503);
    expect(native._getJSONData().error.code).toBe('NATIVE_EDITOR_UNAVAILABLE');
    const listing = await invoke(app, { method: 'GET', url: revisions });
    expect(listing.statusCode).toBe(503);
    expect(listing._getJSONData().error.code).toBe('SOLUTION_REVISIONS_UNAVAILABLE');
  });
});
