import { describe, it, expect } from 'vitest';
import { PREDEFINED_AGENTS, PREDEFINED_TEAMS } from './predefinedAgents';

describe('predefinedAgents config', () => {
  it('has 43 agents', () => {
    expect(PREDEFINED_AGENTS).toHaveLength(43);
  });

  it('every agent has required fields', () => {
    for (const agent of PREDEFINED_AGENTS) {
      expect(agent.role).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(Array.isArray(agent.capabilities)).toBe(true);
      expect(agent.capabilities.length).toBeGreaterThan(0);
      expect(agent.category).toBeTruthy();
      expect(agent.connection_type).toBeTruthy();
      expect(typeof agent.cost_per_task).toBe('number');
      expect(agent.cost_per_task).toBeGreaterThan(0);
      expect(agent.system_role).toBe('Agent');
    }
  });

  it('every agent has a non-empty system_prompt', () => {
    for (const agent of PREDEFINED_AGENTS) {
      expect(typeof agent.system_prompt).toBe('string');
      expect(agent.system_prompt.length).toBeGreaterThan(50);
    }
  });

  it('uses only valid provider connection types', () => {
    const validProviders = ['anthropic', 'openai', 'groq', 'deepseek', 'glm'];
    for (const agent of PREDEFINED_AGENTS) {
      expect(validProviders).toContain(agent.connection_type);
    }
  });

  it('has 6 categories', () => {
    const categories = [...new Set(PREDEFINED_AGENTS.map((a) => a.category))];
    expect(categories.sort()).toEqual([
      'Development',
      'Founder',
      'Marketing & Sales',
      'Operations',
      'Sector Specialists',
      'System',
    ]);
  });

  it('has correct agent counts per category', () => {
    const counts = {};
    for (const a of PREDEFINED_AGENTS) {
      counts[a.category] = (counts[a.category] || 0) + 1;
    }
    expect(counts['Founder']).toBe(4);
    expect(counts['Development']).toBe(11);
    expect(counts['Marketing & Sales']).toBe(5);
    expect(counts['Operations']).toBe(9);
    expect(counts['System']).toBe(2);
    expect(counts['Sector Specialists']).toBe(12);
  });
});

describe('predefinedTeams config', () => {
  it('has 6 teams', () => {
    expect(PREDEFINED_TEAMS).toHaveLength(6);
  });

  it('every team has required fields', () => {
    for (const team of PREDEFINED_TEAMS) {
      expect(team.name).toBeTruthy();
      expect(team.description).toBeTruthy();
      expect(Array.isArray(team.agentRoles)).toBe(true);
      expect(team.agentRoles.length).toBeGreaterThan(0);
    }
  });

  it('team agentRoles reference valid agent roles', () => {
    const agentRoles = new Set(PREDEFINED_AGENTS.map((a) => a.role));
    for (const team of PREDEFINED_TEAMS) {
      for (const role of team.agentRoles) {
        expect(agentRoles.has(role)).toBe(true);
      }
    }
  });

  it('all agents are assigned to exactly one team', () => {
    const allTeamRoles = PREDEFINED_TEAMS.flatMap((t) => t.agentRoles);
    const agentRoles = PREDEFINED_AGENTS.map((a) => a.role);
    // Every agent appears in some team
    for (const role of agentRoles) {
      expect(allTeamRoles).toContain(role);
    }
    // Total assignments matches agent count (no duplicates across teams)
    expect(allTeamRoles).toHaveLength(agentRoles.length);
  });
});
