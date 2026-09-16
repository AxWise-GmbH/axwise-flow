// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import httpMocks from 'node-mocks-http';
import { createMemoryRateLimiter, createWorkflowHttpApp } from './http-app.js';
import { createGoalWorkflowViewService } from './goal-workflow-view-service.js';
import {
  goalViewId as id,
  goalViewOwner as owner,
  goalViewProjection,
} from '../../shared/workflow-v2/fixtures/goal-workflow-view.js';

const invoke = (app, url, { method = 'GET', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method, url, headers }),
      res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
const path = `/v2/workflow-views/goal-runs/${id(2)}`;
function appFor({ userId = owner, repository, ...options } = {}) {
  const repo = repository || {
    resolveExistingTenant: vi.fn().mockResolvedValue(id(1)),
    loadGoalWorkflowView: vi.fn().mockResolvedValue(goalViewProjection()),
  };
  return {
    repository: repo,
    app: createWorkflowHttpApp({
      commandService: {},
      goalWorkflowViewService: createGoalWorkflowViewService({ repository: repo }),
      auth: {
        middleware: (_req, _res, next) => next(),
        context: () => (userId ? { userId } : null),
      },
      ...options,
    }),
  };
}
describe('additive Goal Workflow/Outputs endpoint', () => {
  it('uses authenticated /v2 middleware and returns no-store metadata', async () => {
    const { app } = appFor();
    const response = await invoke(app, path);
    expect(response.statusCode).toBe(200);
    expect(response.getHeader('cache-control')).toBe('no-store');
    expect(response._getJSONData().workflow.source).toEqual({ kind: 'goal_run', id: id(2) });
  });
  it('rejects unauthenticated reads before tenant resolution', async () => {
    const { app, repository } = appFor({ userId: null });
    expect((await invoke(app, path)).statusCode).toBe(401);
    expect(repository.resolveExistingTenant).not.toHaveBeenCalled();
  });
  it.each([
    `${path}?tenantId=${id(99)}`,
    `${path}?ownerUserId=user_other`,
    `${path}?limit=1000`,
    '/v2/workflow-views/goal-runs/not-a-uuid',
  ])('rejects caller scope/limit overrides or malformed identity: %s', async (url) => {
    const { app, repository } = appFor();
    expect((await invoke(app, url)).statusCode).toBe(400);
    expect(repository.loadGoalWorkflowView).not.toHaveBeenCalled();
  });
  it.each([
    { userId: 'user_other', tenant: id(1) },
    { userId: owner, tenant: id(99) },
  ])(
    'does not return a same-run record outside explicit owner and tenant scope',
    async ({ userId, tenant }) => {
      const repository = {
        resolveExistingTenant: vi.fn().mockResolvedValue(tenant),
        loadGoalWorkflowView: vi.fn(async (tenantId, ownerId, runId) =>
          tenantId === id(1) && ownerId === owner && runId === id(2) ? goalViewProjection() : null
        ),
      };
      const { app } = appFor({ userId, repository });
      const response = await invoke(app, path);
      expect(response.statusCode).toBe(404);
      expect(response._getJSONData()).toEqual({
        error: { code: 'RUN_NOT_FOUND', message: 'workflow run not found' },
      });
      expect(repository.loadGoalWorkflowView).toHaveBeenCalledWith(tenant, userId, id(2));
    }
  );
  it('inherits the existing per-identity rate limiter', async () => {
    const { app, repository } = appFor({ rateLimiter: createMemoryRateLimiter({ limit: 1 }) });
    expect((await invoke(app, path)).statusCode).toBe(200);
    expect((await invoke(app, path)).statusCode).toBe(429);
    expect(repository.loadGoalWorkflowView).toHaveBeenCalledTimes(1);
  });
  it('is explicitly unavailable if the additive service is not wired', async () => {
    const { app } = appFor({ goalWorkflowViewService: null });
    expect((await invoke(app, path)).statusCode).toBe(503);
  });
});
