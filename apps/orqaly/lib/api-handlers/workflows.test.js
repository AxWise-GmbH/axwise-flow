/**
 * Tests for /api/app?path=workflows
 * Covers: GET (list, single), POST (create), PUT (update), DELETE, auth, rate limit, validation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 30, remaining: 29, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res) => {
    res._status = 500;
    res._body = { error: 'internal' };
    return res;
  }),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));
const mockAdminFrom = vi.fn();
const enqueueAgentJobMock = vi.fn();
const checkQuotasMock = vi.fn();

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: vi.fn(() => ({ from: mockFrom })),
  buildSupabaseAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));
vi.mock('../goal-handlers/_helpers.js', () => ({
  enqueueAgentJob: (...args) => enqueueAgentJobMock(...args),
}));
vi.mock('../security/user-quotas.js', () => ({
  checkQuotas: (...args) => checkQuotasMock(...args),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './workflows.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
    },
  };
}

function makeReq(method, query = '', body = null) {
  return {
    method,
    headers: { host: 'localhost' },
    url: `/api/app?path=workflows${query}`,
    body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  enqueueAgentJobMock.mockResolvedValue({ id: 'agent-job-1', status: 'queued' });
  checkQuotasMock.mockResolvedValue({ allowed: true });
});

describe('/api/app?path=workflows', () => {
  describe('auth', () => {
    it('returns 401 when token is invalid', async () => {
      verifySupabaseToken.mockResolvedValueOnce(null);
      const res = makeRes();
      await handler(makeReq('GET'), res);
      expect(res._status).toBe(401);
    });
  });

  describe('rate limit', () => {
    it('returns 429 when rate limited', async () => {
      checkRateLimit.mockReturnValueOnce({ allowed: false, limit: 30, remaining: 0, resetAt: 0 });
      const res = makeRes();
      await handler(makeReq('GET'), res);
      expect(res._status).toBe(429);
    });
  });

  describe('method guard', () => {
    it('returns 200 for OPTIONS', async () => {
      const res = makeRes();
      await handler(makeReq('OPTIONS'), res);
      expect(res._status).toBe(200);
    });

    it('returns 405 for PATCH', async () => {
      const res = makeRes();
      await handler(makeReq('PATCH'), res);
      expect(res._status).toBe(405);
    });
  });

  describe('GET', () => {
    it('lists workflows', async () => {
      const workflows = [{ id: 'wf-1', name: 'Test' }];
      mockSelect.mockReturnValue({
        order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: workflows, error: null })) })),
      });
      const res = makeRes();
      await handler(makeReq('GET'), res);
      expect(res._status).toBe(200);
      expect(res._body.workflows).toEqual(workflows);
    });

    it('gets single workflow by id', async () => {
      const wf = { id: 'wf-1', name: 'Test' };
      mockSelect.mockReturnValue({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: wf, error: null })) })),
      });
      const res = makeRes();
      await handler(makeReq('GET', '&id=wf-1'), res);
      expect(res._status).toBe(200);
      expect(res._body.workflow).toEqual(wf);
    });

    it('returns 404 for missing workflow', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      });
      const res = makeRes();
      await handler(makeReq('GET', '&id=missing'), res);
      expect(res._status).toBe(404);
    });
  });

  describe('POST', () => {
    it('creates a workflow', async () => {
      const wf = { id: 'wf-1', name: 'New' };
      mockInsert.mockReturnValue({
        select: vi.fn(() => ({ single: vi.fn(async () => ({ data: wf, error: null })) })),
      });
      const res = makeRes();
      await handler(makeReq('POST', '', { name: 'New', data: {} }), res);
      expect(res._status).toBe(201);
      expect(res._body.workflow).toEqual(wf);
    });

    it('returns 400 without name', async () => {
      const res = makeRes();
      await handler(makeReq('POST', '', {}), res);
      expect(res._status).toBe(400);
    });

    it('queues an owned workflow through the exact internal producer', async () => {
      const ownershipQuery = {
        select: vi.fn(() => ownershipQuery),
        eq: vi.fn(() => ownershipQuery),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'wf-owned', user_id: 'user-1' },
          error: null,
        })),
      };
      mockAdminFrom.mockReturnValue(ownershipQuery);

      const res = makeRes();
      await handler(
        makeReq('POST', '&action=execute', {
          workflowId: 'wf-owned',
          triggerData: { source: 'button' },
          userId: 'user-2',
          goalId: 'foreign-goal',
          agentContext: { id: 'foreign-agent' },
        }),
        res
      );

      expect(res._status).toBe(202);
      expect(enqueueAgentJobMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          user_id: 'user-1',
          payload: expect.objectContaining({
            type: 'execute-workflow',
            workflowId: 'wf-owned',
            triggerData: { source: 'button' },
            _userId: 'user-1',
            userId: 'user-1',
            user_id: 'user-1',
          }),
        })
      );
      const payload = enqueueAgentJobMock.mock.calls[0][1].payload;
      expect(payload.goalId).toBeUndefined();
      expect(payload.agentContext).toBeUndefined();
      expect(checkQuotasMock).toHaveBeenCalledWith(expect.any(Object), 'user-1', {
        jobType: 'execute-workflow',
      });
    });

    it('rejects an over-quota workflow before enqueue', async () => {
      const ownershipQuery = {
        select: vi.fn(() => ownershipQuery),
        eq: vi.fn(() => ownershipQuery),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'wf-owned', user_id: 'user-1' },
          error: null,
        })),
      };
      mockAdminFrom.mockReturnValue(ownershipQuery);
      checkQuotasMock.mockResolvedValueOnce({
        allowed: false,
        code: 'QUOTA_JOBS_PER_HOUR',
        message: 'Hourly job limit reached',
        quotas: { max_jobs_per_hour: 200 },
        usage: { jobs_this_hour: 200 },
      });

      const res = makeRes();
      await handler(
        makeReq('POST', '&action=execute', { workflowId: 'wf-owned', triggerData: {} }),
        res
      );

      expect(res._status).toBe(429);
      expect(res._body).toMatchObject({
        error: 'Hourly job limit reached',
        code: 'QUOTA_JOBS_PER_HOUR',
      });
      expect(enqueueAgentJobMock).not.toHaveBeenCalled();
      expect(checkQuotasMock).toHaveBeenCalledWith(expect.any(Object), 'user-1', {
        jobType: 'execute-workflow',
      });
    });

    it('does not queue a workflow owned by another tenant', async () => {
      const ownershipQuery = {
        select: vi.fn(() => ownershipQuery),
        eq: vi.fn(() => ownershipQuery),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      mockAdminFrom.mockReturnValue(ownershipQuery);

      const res = makeRes();
      await handler(
        makeReq('POST', '&action=execute', { workflowId: 'wf-foreign', triggerData: {} }),
        res
      );

      expect(res._status).toBe(404);
      expect(enqueueAgentJobMock).not.toHaveBeenCalled();
    });

    it('does not attribute workflow work to a goal owned by another tenant', async () => {
      const ownedWorkflowQuery = {
        select: vi.fn(() => ownedWorkflowQuery),
        eq: vi.fn(() => ownedWorkflowQuery),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'wf-owned', user_id: 'user-1' },
          error: null,
        })),
      };
      const foreignGoalQuery = {
        select: vi.fn(() => foreignGoalQuery),
        eq: vi.fn(() => foreignGoalQuery),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      mockAdminFrom.mockImplementation((table) =>
        table === 'workflows' ? ownedWorkflowQuery : foreignGoalQuery
      );

      const res = makeRes();
      await handler(
        makeReq('POST', '&action=execute', {
          workflowId: 'wf-owned',
          triggerData: { goalId: 'goal-foreign' },
        }),
        res
      );

      expect(res._status).toBe(404);
      expect(res._body.error).toBe('Workflow goal not found');
      expect(enqueueAgentJobMock).not.toHaveBeenCalled();
      expect(foreignGoalQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('canonicalizes an owned legacy trigger goal before enqueue', async () => {
      const ownedWorkflowQuery = {
        select: vi.fn(() => ownedWorkflowQuery),
        eq: vi.fn(() => ownedWorkflowQuery),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'wf-owned', user_id: 'user-1' },
          error: null,
        })),
      };
      const ownedGoalQuery = {
        select: vi.fn(() => ownedGoalQuery),
        eq: vi.fn(() => ownedGoalQuery),
        maybeSingle: vi.fn(async () => ({ data: { id: 'goal-owned' }, error: null })),
      };
      mockAdminFrom.mockImplementation((table) =>
        table === 'workflows' ? ownedWorkflowQuery : ownedGoalQuery
      );

      const res = makeRes();
      await handler(
        makeReq('POST', '&action=execute', {
          workflowId: 'wf-owned',
          triggerData: { goal_id: 'goal-owned', source: 'test' },
        }),
        res
      );

      expect(res._status).toBe(202);
      expect(enqueueAgentJobMock.mock.calls[0][1].payload.triggerData).toEqual({
        source: 'test',
        goalId: 'goal-owned',
        goal_id: 'goal-owned',
      });
    });
  });

  describe('PUT', () => {
    it('updates a workflow', async () => {
      const wf = { id: 'wf-1', name: 'Updated' };
      mockUpdate.mockReturnValue({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({ single: vi.fn(async () => ({ data: wf, error: null })) })),
        })),
      });
      const res = makeRes();
      await handler(makeReq('PUT', '&id=wf-1', { name: 'Updated' }), res);
      expect(res._status).toBe(200);
      expect(res._body.workflow).toEqual(wf);
    });

    it('returns 400 without id', async () => {
      const res = makeRes();
      await handler(makeReq('PUT', '', { name: 'X' }), res);
      expect(res._status).toBe(400);
    });

    it('returns 400 with no valid fields', async () => {
      const res = makeRes();
      await handler(makeReq('PUT', '&id=wf-1', { invalid: true }), res);
      expect(res._status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('deletes a workflow', async () => {
      mockDelete.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
      const res = makeRes();
      await handler(makeReq('DELETE', '&id=wf-1'), res);
      expect(res._status).toBe(200);
      expect(res._body.deleted).toBe(true);
    });

    it('returns 400 without id', async () => {
      const res = makeRes();
      await handler(makeReq('DELETE'), res);
      expect(res._status).toBe(400);
    });
  });
});
