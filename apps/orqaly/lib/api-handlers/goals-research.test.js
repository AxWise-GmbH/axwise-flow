import { describe, expect, it, vi } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({ processNextJob: vi.fn() }));
vi.mock('../goal-handlers/_helpers.js', () => ({ triggerProcessNext: vi.fn() }));

import { handleResearchArtifact, handleResearchBundle } from './goals.js';

function query(data, error = null) {
  const value = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    order: vi.fn(async () => ({ data, error })),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  return value;
}

describe('goal research retrieval', () => {
  it('does not reveal a foreign goal before touching research tables', async () => {
    const goalQuery = query(null);
    const admin = {
      from: vi.fn((table) => {
        if (table === 'goals') return goalQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await handleResearchBundle(admin, { id: 'user-1' }, { id: 'goal-foreign' });

    expect(result).toEqual({ status: 404, error: 'Goal not found' });
    expect(goalQuery.eq).toHaveBeenCalledWith('id', 'goal-foreign');
    expect(goalQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('returns only the current owned goal research bundle', async () => {
    const tables = {
      goals: query({ id: 'goal-1', user_id: 'user-1', org_id: 'org-1' }),
      goal_research_runs: query({
        id: 'run-1',
        goal_id: 'goal-1',
        user_id: 'user-1',
        org_id: 'org-1',
        version_status: 'current',
        raw_bundle: { version: 'axwise_research_bundle_v1' },
      }),
      goal_research_sources: query([]),
      goal_research_personas: query([]),
      goal_research_artifacts: query([]),
      goal_agent_persona_assignments: query([]),
    };
    const admin = { from: vi.fn((table) => tables[table]) };

    const result = await handleResearchBundle(admin, { id: 'user-1' }, { id: 'goal-1' });

    expect(result.status).toBe(200);
    expect(result.data.run).toMatchObject({ id: 'run-1', version_status: 'current' });
    expect(result.data.bundle).toEqual({ version: 'axwise_research_bundle_v1' });
    expect(tables.goal_research_runs.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(tables.goal_research_runs.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(tables.goal_research_runs.eq).toHaveBeenCalledWith('version_status', 'current');
  });

  it('scopes artifact retrieval by artifact, goal and authenticated owner', async () => {
    const artifactQuery = query({
      id: 'artifact-1',
      goal_id: 'goal-1',
      content_hash: 'a'.repeat(64),
      content_text: '# Research PRD',
      payload: { artifact_type: 'research_prd' },
    });
    const admin = { from: vi.fn(() => artifactQuery) };

    const result = await handleResearchArtifact(
      admin,
      { id: 'user-1' },
      { id: 'goal-1', artifact_id: 'artifact-1' }
    );

    expect(result.data).toMatchObject({
      id: 'artifact-1',
      content: '# Research PRD',
      hash: 'a'.repeat(64),
      data: { artifact_type: 'research_prd' },
    });
    expect(artifactQuery.eq).toHaveBeenCalledWith('id', 'artifact-1');
    expect(artifactQuery.eq).toHaveBeenCalledWith('goal_id', 'goal-1');
    expect(artifactQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
