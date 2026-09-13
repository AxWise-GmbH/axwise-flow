import { describe, it, expect } from 'vitest';
import { buildProfileIndex, resolveAgentIdentity, formatAgentIdentity } from './agentIdentity';

const profiles = [
  {
    agent_id: 'a1',
    agentName: 'Nova',
    display_name: 'Nadia Kowalska',
    job_title: 'CEO/Founder',
    role: 'CEO/Founder',
  },
  {
    agentName: 'Marketer',
    display_name: 'Cristina Lupescu',
    job_title: 'Marketing Project Manager',
    role: 'Marketing Project Manager',
  },
];
const index = buildProfileIndex(profiles);

describe('agentIdentity', () => {
  it('resolves by agent id', () => {
    expect(
      resolveAgentIdentity({ id: 'a1', name: 'Team Lead', role: 'whatever' }, index)
    ).toMatchObject({ name: 'Nadia Kowalska', position: 'CEO/Founder' });
  });

  it('resolves by role / job_title', () => {
    expect(
      resolveAgentIdentity({ name: 'agent-x', role: 'Marketing Project Manager' }, index)
    ).toMatchObject({ name: 'Cristina Lupescu', position: 'Marketing Project Manager' });
  });

  it('resolves a bare name string against a role', () => {
    expect(resolveAgentIdentity('Marketing Project Manager', index).name).toBe('Cristina Lupescu');
  });

  it('falls back to member name + role when no profile matches', () => {
    expect(resolveAgentIdentity({ name: 'QA Bot', role: 'QA Tester' }, index)).toMatchObject({
      name: 'QA Bot',
      position: 'QA Tester',
      profile: null,
    });
  });

  it('formats "Name (Position)"', () => {
    expect(formatAgentIdentity({ role: 'Marketing Project Manager' }, index)).toBe(
      'Cristina Lupescu (Marketing Project Manager)'
    );
  });
});
