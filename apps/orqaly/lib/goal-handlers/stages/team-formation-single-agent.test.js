import { beforeEach, describe, expect, it, vi } from 'vitest';

const teamPersistence = vi.hoisted(() => ({
  ensureGoalTeam: vi.fn(),
  replaceGoalTeamMembers: vi.fn(),
}));

vi.mock('../team-assigner.js', () => ({
  MAX_ROSTER_ROLES: 8,
  ensureGoalTeam: teamPersistence.ensureGoalTeam,
  formTeam: vi.fn(),
  pickBestAgent: vi.fn(),
  replaceGoalTeamMembers: teamPersistence.replaceGoalTeamMembers,
}));

import { formSingleAgentGoalTeam } from './team-formation.js';

describe('single-agent goal-team concurrency recovery', () => {
  beforeEach(() => {
    teamPersistence.ensureGoalTeam.mockReset();
    teamPersistence.replaceGoalTeamMembers.mockReset();
  });

  it('uses the committed conflict winner for the goal and its membership', async () => {
    const winner = {
      teamId: 'team-winning-row',
      teamName: 'Goal: Retention analysis',
      reused: true,
      recoveredFromConflict: true,
    };
    teamPersistence.ensureGoalTeam.mockResolvedValue(winner);
    teamPersistence.replaceGoalTeamMembers.mockResolvedValue({ memberCount: 1 });
    const goal = { id: 'goal-17', user_id: 'user-1', title: 'Retention analysis' };

    await expect(formSingleAgentGoalTeam({}, goal, 'agent-9')).resolves.toEqual(winner);
    expect(teamPersistence.ensureGoalTeam).toHaveBeenCalledWith({}, goal, 'user-1', 'agent-9');
    expect(teamPersistence.replaceGoalTeamMembers).toHaveBeenCalledWith(
      {},
      {
        teamId: 'team-winning-row',
        goalId: 'goal-17',
        userId: 'user-1',
        memberIds: ['agent-9'],
      }
    );
  });

  it('does not mutate memberships when team creation cannot resolve a winner', async () => {
    teamPersistence.ensureGoalTeam.mockRejectedValue(
      Object.assign(new Error('winner unavailable'), { code: '23505' })
    );

    await expect(
      formSingleAgentGoalTeam(
        {},
        { id: 'goal-18', user_id: 'user-1', title: 'Risk review' },
        'agent-10'
      )
    ).rejects.toThrow('winner unavailable');
    expect(teamPersistence.replaceGoalTeamMembers).not.toHaveBeenCalled();
  });
});
