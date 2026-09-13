import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deterministicAgentJobId: vi.fn(),
  enqueueAgentJob: vi.fn(),
}));

vi.mock('../goal-handlers/_helpers.js', () => ({
  deterministicAgentJobId: mocks.deterministicAgentJobId,
  enqueueAgentJob: mocks.enqueueAgentJob,
}));

import handler from './deals.js';

function councilStatusAdmin(rows, { ignoreFilters = false } = {}) {
  const state = { selected: null, filters: [] };
  const query = {
    eq(column, value) {
      state.filters.push([column, value]);
      return query;
    },
    async maybeSingle() {
      const row = rows.find(
        (candidate) =>
          ignoreFilters ||
          state.filters.every(([column, value]) => String(candidate[column]) === String(value))
      );
      return { data: row ? structuredClone(row) : null, error: null };
    },
  };

  return {
    state,
    from: vi.fn((table) => {
      if (table !== 'agent_jobs') throw new Error(`Unexpected table: ${table}`);
      return {
        select(columns) {
          state.selected = columns;
          return query;
        },
      };
    }),
  };
}

function councilStartAdmin(team) {
  const state = { filters: [] };
  const query = {
    eq(column, value) {
      state.filters.push([column, value]);
      return query;
    },
    async single() {
      const owned = state.filters.every(
        ([column, value]) => String(team[column]) === String(value)
      );
      return {
        data: owned ? structuredClone(team) : null,
        error: owned ? null : { message: 'none' },
      };
    },
  };

  return {
    state,
    from: vi.fn((table) => {
      if (table !== 'agent_teams') throw new Error(`Unexpected table: ${table}`);
      return { select: vi.fn(() => query) };
    }),
  };
}

function statusRequest(jobId = 'job-1') {
  return {
    method: 'GET',
    query: { op: 'council-status', job_id: jobId },
  };
}

const ownedJob = {
  id: 'job-1',
  user_id: 'user-1',
  status: 'done',
  result: { decision: 'approve' },
  error: null,
  created_at: '2026-08-22T10:00:00.000Z',
  updated_at: '2026-08-22T10:01:00.000Z',
};

describe('investment council job ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deterministicAgentJobId.mockReturnValue('job-1');
    mocks.enqueueAgentJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
  });

  it('stamps the authenticated owner on both the job row and council payload', async () => {
    const admin = councilStartAdmin({
      id: 'team-1',
      user_id: 'user-1',
      name: 'Deal Council',
      last_deal_posted_at: null,
    });

    const response = await handler(
      admin,
      { id: 'user-1' },
      {
        method: 'POST',
        query: { op: 'council-start' },
        body: { team_id: 'team-1' },
      }
    );

    expect(response).toEqual({
      status: 202,
      data: { job_id: 'job-1', status: 'queued', team_name: 'Deal Council' },
    });
    expect(mocks.enqueueAgentJob).toHaveBeenCalledWith(
      admin,
      {
        id: 'job-1',
        user_id: 'user-1',
        payload: {
          type: 'council-meeting',
          team_id: 'team-1',
          user_id: 'user-1',
          _userId: 'user-1',
          userId: 'user-1',
          _ts: expect.any(Number),
        },
      },
      { idempotent: true }
    );
  });

  it('returns council status only when the top-level job owner matches', async () => {
    const admin = councilStatusAdmin([ownedJob]);

    const response = await handler(admin, { id: 'user-1' }, statusRequest());

    expect(admin.state.selected).toContain('user_id');
    expect(admin.state.filters).toEqual([
      ['id', 'job-1'],
      ['user_id', 'user-1'],
    ]);
    expect(response).toEqual({
      status: 200,
      data: {
        id: 'job-1',
        status: 'done',
        result: { decision: 'approve' },
        error: null,
        created_at: '2026-08-22T10:00:00.000Z',
        updated_at: '2026-08-22T10:01:00.000Z',
      },
    });
  });

  it('denies a cross-user job id without disclosing that the job exists', async () => {
    const admin = councilStatusAdmin([{ ...ownedJob, user_id: 'user-2' }]);

    const response = await handler(admin, { id: 'user-1' }, statusRequest());

    expect(admin.state.filters).toContainEqual(['user_id', 'user-1']);
    expect(response).toEqual({ status: 404, error: 'Job not found' });
  });

  it('rejects a mismatched owner even if a service client returns it despite the filter', async () => {
    const admin = councilStatusAdmin([{ ...ownedJob, user_id: 'user-2' }], {
      ignoreFilters: true,
    });

    const response = await handler(admin, { id: 'user-1' }, statusRequest());

    expect(response).toEqual({ status: 404, error: 'Job not found' });
  });
});
