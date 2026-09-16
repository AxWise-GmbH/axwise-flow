import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hasLoadedPredefinedAgents,
  loadPredefinedAgents,
  predefinedAgentId,
  resetPredefinedFlag,
} from './predefinedAgentService';

// Mock agentHubService
vi.mock('./agentHubService', () => {
  const agents = [];
  return {
    getAgents: () => [...agents],
    addAgent: (agent) => {
      const record = {
        ...agent,
        id: `ah-${agents.length}`,
        agent_id: agent.agent_id || `agent-${agents.length}`,
      };
      agents.push(record);
      return record;
    },
    updateAgent: (id, updates) => {
      const idx = agents.findIndex((a) => a.id === id);
      if (idx >= 0) agents[idx] = { ...agents[idx], ...updates };
      return agents[idx] || null;
    },
    removeAgent: (id) => {
      const idx = agents.findIndex((a) => a.id === id);
      if (idx >= 0) agents.splice(idx, 1);
    },
    repairAgentProviderFields: vi.fn(),
    _reset: () => {
      agents.length = 0;
    },
  };
});

// Mock teamService
const mockTeams = [];
vi.mock('./teamService', () => ({
  createTeam: vi.fn(async (data) => {
    const team = { id: `team-${mockTeams.length}`, ...data, createdAt: new Date().toISOString() };
    mockTeams.push(team);
    return team;
  }),
  getAllTeams: vi.fn(async () => [...mockTeams]),
  deleteTeam: vi.fn(async (id) => {
    const idx = mockTeams.findIndex((t) => t.id === id);
    if (idx >= 0) mockTeams.splice(idx, 1);
  }),
  updateTeam: vi.fn(async (id, data) => {
    const idx = mockTeams.findIndex((t) => t.id === id);
    if (idx >= 0) mockTeams[idx] = { ...mockTeams[idx], ...data };
    return mockTeams[idx] || null;
  }),
}));

const { _reset: resetAgents } = await import('./agentHubService');

beforeEach(() => {
  localStorage.clear();
  resetAgents();
  mockTeams.length = 0;
});

describe('hasLoadedPredefinedAgents', () => {
  it('returns false when flag not set', () => {
    expect(hasLoadedPredefinedAgents()).toBe(false);
  });

  it('returns true when flag is set', () => {
    localStorage.setItem('orch_predefined_agents_loaded', 'true');
    expect(hasLoadedPredefinedAgents()).toBe(true);
  });
});

describe('loadPredefinedAgents', () => {
  it('creates 43 agents and 6 teams', async () => {
    const result = await loadPredefinedAgents();
    expect(result.agents).toHaveLength(43);
    expect(result.teams).toHaveLength(6);
  });

  it('seeds every legacy starter definition with the atomic Gemini default pair', async () => {
    const result = await loadPredefinedAgents();

    for (const agent of result.agents) {
      expect(agent).toMatchObject({
        connection_type: 'gemini',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
      });
    }
  });

  it('sets the loaded flag', async () => {
    await loadPredefinedAgents();
    expect(hasLoadedPredefinedAgents()).toBe(true);
  });

  it('uses stable catalogue identities across browser sessions', async () => {
    const result = await loadPredefinedAgents();
    const cto = result.agents.find((agent) => agent.role === 'CTO');
    expect(cto.agent_id).toBe(predefinedAgentId('CTO'));
    expect(cto.agent_id).toBe('predefined:cto');
  });

  it('skips teams if already loaded but still seeds missing agents', async () => {
    localStorage.setItem('orch_predefined_agents_loaded', 'true');
    const result = await loadPredefinedAgents();
    // Agents are always seeded if missing (handles new predefined agents after initial seed)
    expect(result.agents.length).toBeGreaterThan(0);
    // Teams are only created on first seed
    expect(result.teams).toHaveLength(0);
  });

  it('skips agents that already exist by role', async () => {
    const { addAgent } = await import('./agentHubService');
    addAgent({ role: 'CTO', capabilities: ['existing'], connection_type: 'api', cost_per_task: 0 });
    const result = await loadPredefinedAgents();
    // 43 predefined minus 1 duplicate = 42
    expect(result.agents).toHaveLength(42);
    expect(
      result.agents.find((a) => a.role === 'CTO' && a.added_by?.email === 'predefined')
    ).toBeUndefined();
  });
});

describe('patchAgentPrompts', () => {
  it('patches existing agents with system_prompt from predefined definitions', async () => {
    const { addAgent, getAgents } = await import('./agentHubService');
    // Add an agent without system_prompt
    addAgent({ role: 'CTO', capabilities: ['existing'], connection_type: 'api', cost_per_task: 0 });
    // Load should patch the CTO agent with the predefined system_prompt
    await loadPredefinedAgents();
    const cto = getAgents().find((a) => a.role === 'CTO');
    expect(cto.system_prompt).toBeTruthy();
    expect(cto.system_prompt).toContain('CTO');
  });

  it('seeds new agents with system_prompt included', async () => {
    const result = await loadPredefinedAgents();
    // Every seeded agent should have a system_prompt
    for (const agent of result.agents) {
      expect(agent.system_prompt).toBeTruthy();
    }
  });
});

describe('resetPredefinedFlag', () => {
  it('clears the flag', async () => {
    await loadPredefinedAgents();
    expect(hasLoadedPredefinedAgents()).toBe(true);
    resetPredefinedFlag();
    expect(hasLoadedPredefinedAgents()).toBe(false);
  });
});
