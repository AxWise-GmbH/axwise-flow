import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeReleaseMigrationState,
  verifyRequiredReleaseSchema,
} from './preflight-release-migrations.mjs';

describe('release migration preflight', () => {
  it('detects exactly the duplicate rows targeted by migrations 191 and 192', () => {
    const result = analyzeReleaseMigrationState({
      outcomeJobs: [
        {
          id: 'job-1',
          status: 'queued',
          payload: { type: 'axwise-outcome', goalId: 'goal-a' },
        },
        {
          id: 'job-2',
          status: 'running',
          payload: { type: 'axwise-outcome', goalId: 'goal-a' },
        },
        {
          id: 'job-done',
          status: 'done',
          payload: { type: 'axwise-outcome', goalId: 'goal-a' },
        },
        { id: 'job-other', status: 'queued', payload: { type: 'other', goalId: 'goal-a' } },
      ],
      activeTeams: [
        { id: 'team-2', goal_id: 'goal-b', is_active: true },
        { id: 'team-1', goal_id: 'goal-b', is_active: true },
        { id: 'team-inactive', goal_id: 'goal-b', is_active: false },
        { id: 'team-unscoped', goal_id: null, is_active: true },
      ],
    });

    expect(result).toEqual({
      ok: false,
      duplicateOutcomeJobs: [{ goalId: 'goal-a', count: 2, rowIds: ['job-1', 'job-2'] }],
      duplicateActiveTeams: [{ goalId: 'goal-b', count: 2, rowIds: ['team-1', 'team-2'] }],
    });
  });

  it('passes when each goal has at most one active row of each kind', () => {
    expect(
      analyzeReleaseMigrationState({
        outcomeJobs: [
          {
            id: 'job-1',
            status: 'queued',
            payload: { type: 'axwise-outcome', goalId: 'goal-a' },
          },
        ],
        activeTeams: [{ id: 'team-1', goal_id: 'goal-a', is_active: true }],
      })
    ).toEqual({ ok: true, duplicateOutcomeJobs: [], duplicateActiveTeams: [] });
  });

  it('fails with the migration number when a required production column is absent', async () => {
    const client = {
      from: (table) => ({
        select: () => ({
          limit: async () => ({
            data: null,
            error:
              table === 'goals' ? { message: 'column goals.loop_advanced does not exist' } : null,
          }),
        }),
      }),
    };

    await expect(verifyRequiredReleaseSchema(client)).rejects.toThrow(
      /Migration 176 schema check failed.*loop_advanced does not exist/
    );
  });

  it('accepts the release-critical schema without writing to production', async () => {
    const client = {
      from: () => ({
        select: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    };

    await expect(verifyRequiredReleaseSchema(client)).resolves.toBeUndefined();
  });

  it('fails closed when migration 203 typed evidence storage is absent', async () => {
    const client = {
      from: (table) => ({
        select: () => ({
          limit: async () => ({
            data: null,
            error:
              table === 'goal_research_calculations'
                ? { message: 'relation goal_research_calculations does not exist' }
                : null,
          }),
        }),
      }),
    };

    await expect(verifyRequiredReleaseSchema(client)).rejects.toThrow(
      /Migration 203 schema check failed.*goal_research_calculations does not exist/
    );
  });

  it('keeps the production preflight read-only', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'scripts', 'preflight-release-migrations.mjs'),
      'utf8'
    );
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\s*\(/);
  });
});
