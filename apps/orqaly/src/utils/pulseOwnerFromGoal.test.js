/**
 * [module: frontend]
 * Tests for derivePulseOwnerFromGoal.
 */
import { describe, it, expect } from 'vitest';
import { derivePulseOwnerFromGoal } from './pulseOwnerFromGoal';

describe('derivePulseOwnerFromGoal', () => {
  it('prefers team when agent_team_id is set', () => {
    const owner = derivePulseOwnerFromGoal({ id: 'g1', agent_team_id: 't1', team_name: 'Alpha' });
    expect(owner).toEqual({ ownerType: 'team', ownerId: 't1', ownerName: 'Alpha' });
  });

  it('uses organization when org_id is set without team', () => {
    const owner = derivePulseOwnerFromGoal({ id: 'g1', org_id: 'o1', org_name: 'Acme' });
    expect(owner).toEqual({ ownerType: 'organization', ownerId: 'o1', ownerName: 'Acme' });
  });

  it('falls back to agent executor', () => {
    const owner = derivePulseOwnerFromGoal({
      id: 'g1',
      executor_type: 'agent',
      executor_id: 'a1',
      executor_name: 'Bot',
    });
    expect(owner).toEqual({ ownerType: 'agent', ownerId: 'a1', ownerName: 'Bot' });
  });
});
