import { describe, expect, it, vi } from 'vitest';
import { recordLlmUsage, recordStageLlmUsage } from './_helpers.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GOAL_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_JOB_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZATION_ID = '44444444-4444-4444-8444-444444444444';
const TEAM_ID = '55555555-5555-4555-8555-555555555555';

function makeInsertAdmin({
  userId = USER_ID,
  goalId = GOAL_ID,
  organizationId = ORGANIZATION_ID,
  teamId = TEAM_ID,
} = {}) {
  const insert = vi.fn(async () => ({ error: null }));
  return {
    admin: {
      from: vi.fn((table) => {
        if (table === 'llm_usage') return { insert };
        if (table === 'agent_jobs' || table === 'jobs') {
          const filters = [];
          const query = {
            eq: (column, value) => {
              filters.push([column, value]);
              return query;
            },
            maybeSingle: async () => {
              const id = filters.find(([column]) => column === 'id')?.[1];
              const matchesOwner = filters.some(
                ([column, value]) => column === 'user_id' && value === userId
              );
              return {
                data:
                  id && matchesOwner
                    ? {
                        id,
                        user_id: userId,
                        ...(table === 'jobs' ? { goal_id: goalId } : {}),
                      }
                    : null,
                error: null,
              };
            },
          };
          return { select: () => query };
        }
        if (table === 'organizations' || table === 'agent_teams') {
          const filters = [];
          const query = {
            eq: (column, value) => {
              filters.push([column, value]);
              return query;
            },
            maybeSingle: async () => {
              const expectedId = table === 'organizations' ? organizationId : teamId;
              return {
                data:
                  filters.some(([column, value]) => column === 'id' && value === expectedId) &&
                  filters.some(([column, value]) => column === 'user_id' && value === userId)
                    ? { id: expectedId, user_id: userId }
                    : null,
                error: null,
              };
            },
          };
          return { select: () => query };
        }
        if (table === 'goals') {
          const filters = [];
          const query = {
            eq: (column, value) => {
              filters.push([column, value]);
              return query;
            },
            maybeSingle: async () => ({
              data:
                filters.some(([column, value]) => column === 'id' && value === goalId) &&
                filters.some(([column, value]) => column === 'user_id' && value === userId)
                  ? {
                      id: goalId,
                      user_id: userId,
                      org_id: organizationId,
                      agent_team_id: teamId,
                      team_id: null,
                      concilium_id: null,
                      status: 'active',
                      updated_at: '2026-08-24T10:00:00.000Z',
                      data: {},
                    }
                  : null,
              error: null,
            }),
          };
          const update = {
            eq: () => update,
            is: () => update,
            select: () => update,
            maybeSingle: async () => ({ data: { id: goalId }, error: null }),
          };
          return {
            select: () => query,
            update: () => update,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    insert,
  };
}

describe('LLM usage UUID links', () => {
  it('keeps valid UUID entity links in their typed columns', async () => {
    const { admin, insert } = makeInsertAdmin();

    await recordLlmUsage(admin, {
      userId: USER_ID,
      goalId: GOAL_ID,
      jobId: AGENT_JOB_ID,
      organizationId: ORGANIZATION_ID,
      teamId: TEAM_ID,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      totalTokens: 12,
      updateGoalRollup: false,
      updateTask: false,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        goal_id: GOAL_ID,
        job_id: AGENT_JOB_ID,
        organization_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
      })
    );
  });

  it('moves a text runtime job ID into metadata instead of a UUID column', async () => {
    const { admin, insert } = makeInsertAdmin();
    const runtimeJobId = 'job-live-execution-42';

    await recordStageLlmUsage(
      admin,
      {
        id: GOAL_ID,
        user_id: USER_ID,
        org_id: ORGANIZATION_ID,
        agent_team_id: TEAM_ID,
      },
      {
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        usage: { total_tokens: 18 },
      },
      { source: 'execute-task', jobId: runtimeJobId }
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: null,
        metadata: expect.objectContaining({ runtime_job_id: runtimeJobId }),
      })
    );
  });

  it('never writes malformed identifiers into any UUID-backed link column', async () => {
    const { admin, insert } = makeInsertAdmin({
      userId: 'user-local',
      goalId: 'goal-local',
      organizationId: 'org-local',
      teamId: 'team-local',
    });

    await recordLlmUsage(admin, {
      userId: 'user-local',
      goalId: 'goal-local',
      jobId: 'job-local',
      organizationId: 'org-local',
      teamId: 'team-local',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      totalTokens: 7,
      updateGoalRollup: false,
      updateTask: false,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-local',
        goal_id: null,
        job_id: null,
        organization_id: null,
        team_id: null,
        metadata: expect.objectContaining({
          goal_id: 'goal-local',
          runtime_job_id: 'job-local',
        }),
      })
    );
  });
});
