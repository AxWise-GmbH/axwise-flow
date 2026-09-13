// @vitest-environment node
import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { createCorsMiddleware, createWorkflowHttpApp } from './http-app.js';
import { SolutionError } from './solution-service.js';
const id = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const turnId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const url = `/v2/solutions/${id}/conversation`;
const identity = { userId: 'user_owner' };
const body = {
  turnId,
  mode: 'change',
  message: 'Add a meaningful negative acceptance case.',
  expectedSolutionVersion: 0,
  workflowHash: 'a'.repeat(64),
};
function fixture(authenticated = true) {
  const service = {
    read: vi.fn().mockResolvedValue({ solutionId: id, enabled: true, turns: [] }),
    send: vi
      .fn()
      .mockResolvedValue({
        solutionId: id,
        turns: [{ id: turnId, status: 'queued' }],
        replayed: false,
      }),
  };
  const solutions = {
    list: vi
      .fn()
      .mockResolvedValue({
        solutions: [{ id, name: 'Owned workflow' }],
        privateConfig: 'never exposed',
      }),
  };
  const app = createWorkflowHttpApp({
    commandService: {},
    solutionConversationService: service,
    solutionService: solutions,
    auth: {
      middleware: (_req, _res, next) => next(),
      context: () => (authenticated ? identity : null),
    },
    cors: createCorsMiddleware(['https://orqaly.example']),
  });
  return { app, service, solutions };
}
function invoke(
  app,
  {
    method = 'POST',
    target = `${url}/turns`,
    input = body,
    headers = { 'idempotency-key': 'turn_key_001' },
  } = {}
) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method, url: target, body: input, headers });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}
describe('workflow conversation routes use signed-in ownership, explicit CAS and durable acknowledgements', () => {
  it.each([
    { method: 'GET', target: url },
    { method: 'POST', target: `${url}/turns` },
    { method: 'GET', target: '/v2/solutions' },
  ])('requires auth for $method $target', async (command) => {
    const { app, service, solutions } = fixture(false);
    const res = await invoke(app, command);
    expect(res.statusCode).toBe(401);
    expect(service.send).not.toHaveBeenCalled();
    expect(service.read).not.toHaveBeenCalled();
    expect(solutions.list).not.toHaveBeenCalled();
  });
  it('acknowledges queue202 with exact identity, rowversion0, immutablehash and idempotency key', async () => {
    const { app, service } = fixture();
    const res = await invoke(app);
    expect(res.statusCode).toBe(202);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(service.send).toHaveBeenCalledExactlyOnceWith(identity, id, body, 'turn_key_001');
    expect(res._getJSONData().turns[0].status).toBe('queued');
  });
  it('accepts consent only for one exact run and only the literal explicit opt-in', async () => {
    const { app, service } = fixture();
    const input = { ...body, includeInvocation: { id: turnId, inputOutput: true } };
    expect((await invoke(app, { input })).statusCode).toBe(202);
    expect(service.send).toHaveBeenCalledWith(identity, id, input, 'turn_key_001');
    service.send.mockClear();
    for (const includeInvocation of [
      { id: turnId, inputOutput: false },
      { id: turnId },
      { id: turnId, inputOutput: true, allRuns: true },
      { id: 'bad', inputOutput: true },
    ])
      expect((await invoke(app, { input: { ...body, includeInvocation } })).statusCode).toBe(400);
    expect(service.send).not.toHaveBeenCalled();
  });
  it('returns200 for same durable turn replay, not a second message', async () => {
    const { app, service } = fixture();
    service.send.mockResolvedValue({
      solutionId: id,
      replayed: true,
      turns: [{ id: turnId, status: 'completed' }],
    });
    expect((await invoke(app)).statusCode).toBe(200);
  });
  it.each([
    { ...body, userId: 'user_other' },
    { ...body, tenantId: 'other' },
    { ...body, activate: true },
    { ...body, expectedSolutionVersion: -1 },
    { ...body, workflowHash: 'bad' },
    { ...body, draft: { id: turnId, rowVersion: 0 } },
    { ...body, message: 'Use orqaly_app_private_key_in_chat' },
  ])(
    'rejects untrusted extra fields and incomplete version bindings before dispatch',
    async (input) => {
      const { app, service } = fixture();
      const res = await invoke(app, { input });
      expect(res.statusCode).toBe(400);
      expect(service.send).not.toHaveBeenCalled();
    }
  );
  it('rejects missing idempotency key and untrusted browser origin', async () => {
    const { app, service } = fixture();
    expect((await invoke(app, { headers: {} })).statusCode).toBe(400);
    expect(
      (
        await invoke(app, {
          headers: { origin: 'https://attacker.example', 'idempotency-key': 'key_12345' },
        })
      ).statusCode
    ).toBe(403);
    expect(service.send).not.toHaveBeenCalled();
  });
  it('passes an explicit selected draft and rejects unsupported query selectors', async () => {
    const { app, service } = fixture();
    const res = await invoke(app, { method: 'GET', target: `${url}?draftId=${turnId}` });
    expect(res.statusCode).toBe(200);
    expect(service.read).toHaveBeenCalledExactlyOnceWith(identity, id, { draftId: turnId });
    service.read.mockClear();
    expect((await invoke(app, { method: 'GET', target: `${url}?tenantId=other` })).statusCode).toBe(
      400
    );
    expect(service.read).not.toHaveBeenCalled();
  });
  it('surfaces stale-draft conflict instead of success and never accepts a caller model reply', async () => {
    const { app, service } = fixture();
    service.send.mockRejectedValue(
      new SolutionError('SOLUTION_CONVERSATION_CONFLICT', 'Refresh the selected draft', 409)
    );
    const res = await invoke(app);
    expect(res.statusCode).toBe(409);
    expect(res._getJSONData().error.code).toBe('SOLUTION_CONVERSATION_CONFLICT');
    service.send.mockClear();
    expect((await invoke(app, { input: { ...body, reply: 'Saved' } })).statusCode).toBe(400);
    expect(service.send).not.toHaveBeenCalled();
  });
  it('lists only the authenticated owner library without exposing runtime config or caller tenant override', async () => {
    const { app, solutions } = fixture();
    const res = await invoke(app, { method: 'GET', target: '/v2/solutions' });
    expect(res.statusCode).toBe(200);
    expect(solutions.list).toHaveBeenCalledExactlyOnceWith(identity);
    expect(res._getJSONData()).toEqual({ solutions: [{ id, name: 'Owned workflow' }] });
    expect(
      (await invoke(app, { method: 'GET', target: '/v2/solutions?tenantId=another' })).statusCode
    ).toBe(400);
  });
});
