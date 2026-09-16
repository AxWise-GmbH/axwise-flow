import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { createWorkflowHttpApp, createCorsMiddleware } from './http-app.js';
import { SolutionBuildError } from './solution-build-service.js';

const id = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const identity = { userId: 'user_verified' };
const hash = 'a'.repeat(64);
const commands = [
  [
    'test',
    'test',
    { expectedVersion: 3, workflowHash: hash, allowExternalEffects: false, repairOnFailure: true },
  ],
  [
    'repair',
    'repair',
    { expectedVersion: 3, workflowHash: hash, instruction: 'Preserve the agreed routing criteria' },
  ],
  ['cancel', 'cancel', { expectedVersion: 3 }],
  [
    'connections',
    'createConnection',
    {
      expectedVersion: 3,
      requirementId: 'github',
      credentials: { accessToken: 'private-value-held-only-in-request' },
    },
  ],
  ['connections/revoke', 'revokeConnection', { expectedVersion: 3, connectionId: id }],
];
function fixture(user = identity) {
  const service = Object.fromEntries(
    commands.map(([, method]) => [
      method,
      vi.fn().mockResolvedValue({ buildRequest: { id, status: 'draft' } }),
    ])
  );
  const app = createWorkflowHttpApp({
    commandService: {},
    solutionBuildService: service,
    auth: { middleware: (_req, _res, next) => next(), context: () => user },
    cors: createCorsMiddleware(['https://orqaly.example']),
  });
  return { service, app };
}
function invoke(app, path, body, headers = { 'idempotency-key': 'native_request_1' }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({
      method: 'POST',
      url: `/v2/solution-build-requests/${id}/${path}`,
      body,
      headers,
    });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}
describe('native build command HTTP boundary', () => {
  it.each(commands)(
    'forwards %s under verified identity with exact current command and idempotency',
    async (path, method, command) => {
      const { app, service } = fixture();
      const response = await invoke(app, path, command);
      expect(response.statusCode).toBe(method === 'createConnection' ? 201 : 200);
      expect(response.getHeader('Cache-Control')).toBe('no-store');
      expect(service[method]).toHaveBeenCalledWith(identity, id, command, 'native_request_1');
      expect(JSON.stringify(response._getJSONData())).not.toContain('private-value');
    }
  );
  it.each(commands)('requires auth for %s', async (path, method, command) => {
    const { app, service } = fixture(null);
    const response = await invoke(app, path, command);
    expect(response.statusCode).toBe(401);
    expect(service[method]).not.toHaveBeenCalled();
  });
  it.each(commands)(
    'requires idempotency for %s before dispatch',
    async (path, method, command) => {
      const { app, service } = fixture();
      const response = await invoke(app, path, command, {});
      expect(response.statusCode).toBe(400);
      expect(service[method]).not.toHaveBeenCalled();
    }
  );
  it.each(commands)(
    'rejects owner/environment injection or missing version for %s',
    async (path, method, command) => {
      const { app, service } = fixture();
      expect(
        (await invoke(app, path, { ...command, tenantId: id, environmentId: 'some-other-runtime' }))
          .statusCode
      ).toBe(400);
      const stale = { ...command };
      delete stale.expectedVersion;
      expect((await invoke(app, path, stale)).statusCode).toBe(400);
      expect(service[method]).not.toHaveBeenCalled();
    }
  );
  it('does not reflect malformed secret keys/values in connection errors', async () => {
    const { app, service } = fixture();
    const secret = 'sk_live_never_reflect_this_credential';
    const response = await invoke(app, 'connections', {
      expectedVersion: 3,
      requirementId: 'github',
      credentials: { [secret]: { nested: secret } },
    });
    expect(response.statusCode).toBe(400);
    expect(response._getJSONData().error.code).toBe('INVALID_CONNECTION_COMMAND');
    expect(JSON.stringify(response._getJSONData())).not.toContain(secret);
    expect(service.createConnection).not.toHaveBeenCalled();
  });
  it('rejects foreign browser origins and keeps secure connection creation separate from answers', async () => {
    const { app, service } = fixture();
    const response = await invoke(app, 'connections', commands[3][2], {
      'idempotency-key': 'native_request_1',
      origin: 'https://evil.example',
    });
    expect(response.statusCode).toBe(403);
    expect(service.createConnection).not.toHaveBeenCalled();
  });
  it('propagates stale revision conflict without converting it to a successful test', async () => {
    const { app, service } = fixture();
    service.test.mockRejectedValue(
      new SolutionBuildError('BUILD_VERSION_CONFLICT', 'Read the latest draft first', 409)
    );
    const response = await invoke(app, 'test', commands[0][2]);
    expect(response.statusCode).toBe(409);
    expect(response._getJSONData()).not.toHaveProperty('buildRequest');
  });
  it('reports unavailable service methods explicitly rather than dispatching another action', async () => {
    const { app, service } = fixture();
    delete service.test;
    expect((await invoke(app, 'test', commands[0][2])).statusCode).toBe(503);
    expect(service.repair).not.toHaveBeenCalled();
  });
});
