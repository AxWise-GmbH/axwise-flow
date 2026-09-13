import { describe, it, expect } from 'vitest';
import {
  MODEL_COST_TIERS,
  TIER_RANK,
  TOKEN_COSTS,
  SUGGESTION_TYPES,
  resolveAgentModel,
  getAgentCostTier,
  getAgentOutputCostPer1K,
  isSimpleTask,
  capabilityOverlap,
  getAssignedAgentIds,
  findCheaperAlternative,
  profileAgents,
  findUnassignedJobs,
  groupJobsByCategory,
  findIdleAgents,
  generateTeamSuggestions,
} from './teamSuggestionEngine';

// ── Test Helpers ─────────────────────────────────────────────────
const makeAgent = (overrides = {}) => ({
  id: 'agent-1',
  agent_id: 'a1',
  role: 'Test Agent',
  capabilities: [],
  availability_status: 'available',
  cost_per_task: 0.01,
  ...overrides,
});

const makeJob = (overrides = {}) => ({
  id: 'job-1',
  description: 'Test job',
  status: 'active',
  category: 'general',
  requirements: '',
  teamId: null,
  assignedAgentId: null,
  ...overrides,
});

const makeTeam = (overrides = {}) => ({
  id: 'team-1',
  name: 'Test Team',
  status: 'active',
  agents: [],
  ...overrides,
});

// ── Constants ────────────────────────────────────────────────────
describe('Constants', () => {
  it('MODEL_COST_TIERS has 15 models', () => {
    expect(Object.keys(MODEL_COST_TIERS)).toHaveLength(15);
  });

  it('TIER_RANK has 4 tiers', () => {
    expect(Object.keys(TIER_RANK)).toHaveLength(4);
    expect(TIER_RANK.budget).toBe(0);
    expect(TIER_RANK.enterprise).toBe(3);
  });

  it('TOKEN_COSTS has 15 entries matching MODEL_COST_TIERS', () => {
    expect(Object.keys(TOKEN_COSTS)).toHaveLength(15);
    for (const model of Object.keys(MODEL_COST_TIERS)) {
      expect(TOKEN_COSTS[model]).toBeDefined();
      expect(TOKEN_COSTS[model].input).toBeGreaterThan(0);
      expect(TOKEN_COSTS[model].output).toBeGreaterThan(0);
    }
  });

  it('SUGGESTION_TYPES has 4 types', () => {
    expect(Object.keys(SUGGESTION_TYPES)).toHaveLength(4);
  });
});

// ── resolveAgentModel ────────────────────────────────────────────
describe('resolveAgentModel', () => {
  it('finds model name in capabilities', () => {
    const agent = makeAgent({ capabilities: ['llama-3.1-8b-instant', 'summarize'] });
    expect(resolveAgentModel(agent)).toBe('llama-3.1-8b-instant');
  });

  it('finds model from metadata fallback', () => {
    const agent = makeAgent({ capabilities: ['data'], metadata: { model: 'gpt-4o' } });
    expect(resolveAgentModel(agent)).toBe('gpt-4o');
  });

  it('returns null when no model found', () => {
    const agent = makeAgent({ capabilities: ['data', 'analysis'] });
    expect(resolveAgentModel(agent)).toBeNull();
  });
});

// ── getAgentCostTier ─────────────────────────────────────────────
describe('getAgentCostTier', () => {
  it('returns budget for budget models', () => {
    expect(getAgentCostTier(makeAgent({ capabilities: ['llama-3.1-8b-instant'] }))).toBe('budget');
  });

  it('returns enterprise for enterprise models', () => {
    expect(getAgentCostTier(makeAgent({ capabilities: ['gpt-4-turbo'] }))).toBe('enterprise');
  });

  it('returns unknown when no model', () => {
    expect(getAgentCostTier(makeAgent({ capabilities: ['custom'] }))).toBe('unknown');
  });
});

// ── getAgentOutputCostPer1K ──────────────────────────────────────
describe('getAgentOutputCostPer1K', () => {
  it('returns output cost for known model', () => {
    const agent = makeAgent({ capabilities: ['gpt-4o'] });
    expect(getAgentOutputCostPer1K(agent)).toBe(0.01);
  });

  it('returns 0 for unknown model', () => {
    expect(getAgentOutputCostPer1K(makeAgent())).toBe(0);
  });
});

// ── isSimpleTask ─────────────────────────────────────────────────
describe('isSimpleTask', () => {
  it('detects simple tasks by keyword', () => {
    expect(isSimpleTask(makeJob({ description: 'Summarize partner metrics' }))).toBe(true);
    expect(isSimpleTask(makeJob({ requirements: 'Generate weekly report digest' }))).toBe(true);
  });

  it('returns false for complex tasks', () => {
    expect(isSimpleTask(makeJob({ description: 'Train custom neural network' }))).toBe(false);
  });
});

// ── capabilityOverlap ────────────────────────────────────────────
describe('capabilityOverlap', () => {
  it('returns overlap score based on keyword match', () => {
    const agent = makeAgent({ capabilities: ['data', 'analysis'] });
    const job = makeJob({ description: 'data analysis report' });
    expect(capabilityOverlap(agent, job)).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    const agent = makeAgent({ capabilities: ['design'] });
    const job = makeJob({ description: 'data analysis report' });
    expect(capabilityOverlap(agent, job)).toBe(0);
  });

  it('returns 0.5 for agents with no capabilities', () => {
    expect(capabilityOverlap(makeAgent(), makeJob())).toBe(0.5);
  });
});

// ── getAssignedAgentIds ──────────────────────────────────────────
describe('getAssignedAgentIds', () => {
  it('collects all agent IDs from teams', () => {
    const teams = [
      makeTeam({ agents: [{ id: 'a1' }, { id: 'a2' }] }),
      makeTeam({ id: 'team-2', agents: [{ id: 'a3' }] }),
    ];
    const ids = getAssignedAgentIds(teams);
    expect(ids.size).toBe(3);
    expect(ids.has('a1')).toBe(true);
    expect(ids.has('a3')).toBe(true);
  });

  it('returns empty set for no teams', () => {
    expect(getAssignedAgentIds([]).size).toBe(0);
  });
});

// ── findCheaperAlternative ───────────────────────────────────────
describe('findCheaperAlternative', () => {
  it('finds cheapest lower-tier agent', () => {
    const expensive = makeAgent({ id: 'exp', capabilities: ['gpt-4-turbo'] });
    const pool = [
      expensive,
      makeAgent({ id: 'cheap1', capabilities: ['llama-3.1-8b-instant'] }),
      makeAgent({ id: 'cheap2', capabilities: ['gpt-4o-mini'] }),
    ];
    const result = findCheaperAlternative(expensive, pool);
    expect(result).not.toBeNull();
    expect(result.id).toBe('cheap1');
  });

  it('returns null when no cheaper alternative exists', () => {
    const budget = makeAgent({ id: 'b', capabilities: ['llama-3.1-8b-instant'] });
    const pool = [budget, makeAgent({ id: 'b2', capabilities: ['gemma2-9b-it'] })];
    expect(findCheaperAlternative(budget, pool)).toBeNull();
  });
});

// ── findUnassignedJobs ───────────────────────────────────────────
describe('findUnassignedJobs', () => {
  it('returns active jobs without team or agent', () => {
    const jobs = [
      makeJob({ id: 'j1' }),
      makeJob({ id: 'j2', teamId: 'team-1' }),
      makeJob({ id: 'j3', assignedAgentId: 'a1' }),
      makeJob({ id: 'j4', status: 'completed' }),
    ];
    const result = findUnassignedJobs(jobs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('j1');
  });
});

// ── groupJobsByCategory ──────────────────────────────────────────
describe('groupJobsByCategory', () => {
  it('groups jobs by category', () => {
    const jobs = [
      makeJob({ id: 'j1', category: 'data' }),
      makeJob({ id: 'j2', category: 'data' }),
      makeJob({ id: 'j3', category: 'marketing' }),
    ];
    const groups = groupJobsByCategory(jobs);
    expect(groups.get('data')).toHaveLength(2);
    expect(groups.get('marketing')).toHaveLength(1);
  });

  it('uses "general" for null category', () => {
    const jobs = [makeJob({ category: null })];
    const groups = groupJobsByCategory(jobs);
    expect(groups.has('general')).toBe(true);
  });
});

// ── findIdleAgents ───────────────────────────────────────────────
describe('findIdleAgents', () => {
  it('returns available agents not in any team', () => {
    const agents = [
      makeAgent({ id: 'a1', agent_id: 'a1' }),
      makeAgent({ id: 'a2', agent_id: 'a2' }),
      makeAgent({ id: 'a3', agent_id: 'a3', availability_status: 'offline' }),
    ];
    const teams = [makeTeam({ agents: [{ id: 'a1' }] })];
    const idle = findIdleAgents(agents, teams);
    expect(idle).toHaveLength(1);
    expect(idle[0].id).toBe('a2');
  });
});

// ── profileAgents ────────────────────────────────────────────────
describe('profileAgents', () => {
  it('enriches agents with computed fields', () => {
    const agents = [makeAgent({ capabilities: ['gpt-4o'] })];
    const profiled = profileAgents(agents);
    expect(profiled[0]._model).toBe('gpt-4o');
    expect(profiled[0]._costTier).toBe('premium');
    expect(profiled[0]._outputCost).toBe(0.01);
    expect(profiled[0]._isAvailable).toBe(true);
  });
});

// ── generateTeamSuggestions (integration) ────────────────────────
describe('generateTeamSuggestions', () => {
  it('returns empty with reason when no agents', () => {
    const result = generateTeamSuggestions({ agents: [], jobs: [makeJob()], teams: [] });
    expect(result.suggestions).toHaveLength(0);
    expect(result.summary.analyzed).toBe(false);
    expect(result.summary.reason).toContain('Insufficient');
  });

  it('returns empty with reason when no jobs', () => {
    const result = generateTeamSuggestions({ agents: [makeAgent()], jobs: [], teams: [] });
    expect(result.suggestions).toHaveLength(0);
    expect(result.summary.analyzed).toBe(false);
  });

  it('generates new_team suggestion for unassigned jobs + idle agents', () => {
    const agents = [
      makeAgent({ id: 'a1', capabilities: ['data', 'analysis'] }),
      makeAgent({ id: 'a2', capabilities: ['data', 'report'] }),
    ];
    const jobs = [
      makeJob({ id: 'j1', description: 'data analysis task', category: 'analytics' }),
      makeJob({ id: 'j2', description: 'data processing job', category: 'analytics' }),
    ];
    const result = generateTeamSuggestions({ agents, jobs, teams: [] });
    expect(result.summary.analyzed).toBe(true);
    const newTeams = result.suggestions.filter((s) => s.type === SUGGESTION_TYPES.NEW_TEAM);
    expect(newTeams.length).toBeGreaterThanOrEqual(1);
    expect(newTeams[0].teamName).toContain('Analytics');
    expect(newTeams[0].agents.length).toBeGreaterThanOrEqual(2);
  });

  it('generates cost_downgrade suggestion for premium agent on simple tasks', () => {
    const expensiveAgent = makeAgent({
      id: 'exp',
      role: 'Premium Bot',
      capabilities: ['gpt-4-turbo'],
      availability_status: 'available',
    });
    const cheapAgent = makeAgent({
      id: 'cheap',
      role: 'Budget Bot',
      capabilities: ['llama-3.1-8b-instant'],
      availability_status: 'available',
    });
    const team = makeTeam({ agents: [expensiveAgent] });
    const jobs = [
      makeJob({ id: 'j1', description: 'Summarize weekly report', teamId: 'team-1' }),
      makeJob({ id: 'j2', description: 'Format data digest', teamId: 'team-1' }),
      makeJob({ id: 'j3', description: 'unassigned job' }), // needed so engine runs
    ];
    const result = generateTeamSuggestions({
      agents: [expensiveAgent, cheapAgent],
      jobs,
      teams: [team],
    });
    const downgrades = result.suggestions.filter((s) => s.type === SUGGESTION_TYPES.COST_DOWNGRADE);
    expect(downgrades.length).toBeGreaterThanOrEqual(1);
    expect(downgrades[0].savingsPercent).toBeGreaterThan(0);
    expect(downgrades[0].cheaperAlternative.id).toBe('cheap');
  });

  it('generates idle_agents suggestion', () => {
    const agents = [makeAgent({ id: 'a1' }), makeAgent({ id: 'a2' })];
    const jobs = [makeJob()];
    const result = generateTeamSuggestions({ agents, jobs, teams: [] });
    const idle = result.suggestions.filter((s) => s.type === SUGGESTION_TYPES.IDLE_AGENTS);
    expect(idle).toHaveLength(1);
    expect(idle[0].agents).toHaveLength(2);
  });

  it('sorts suggestions with high priority first', () => {
    const agents = [
      makeAgent({ id: 'a1', capabilities: ['data'] }),
      makeAgent({ id: 'a2', capabilities: ['data'] }),
      makeAgent({ id: 'a3', capabilities: ['data'] }),
      makeAgent({ id: 'a4', capabilities: ['data'] }),
    ];
    const jobs = [
      makeJob({ id: 'j1', category: 'data', description: 'data task' }),
      makeJob({ id: 'j2', category: 'data', description: 'data task' }),
      makeJob({ id: 'j3', category: 'data', description: 'data task' }),
      makeJob({ id: 'j4', category: 'data', description: 'data task' }),
    ];
    const result = generateTeamSuggestions({ agents, jobs, teams: [] });
    expect(result.suggestions.length).toBeGreaterThan(0);
    // Verify high comes before medium/low
    for (let i = 1; i < result.suggestions.length; i++) {
      const rankPrev = { high: 0, medium: 1, low: 2 }[result.suggestions[i - 1].priority] ?? 2;
      const rankCurr = { high: 0, medium: 1, low: 2 }[result.suggestions[i].priority] ?? 2;
      expect(rankPrev).toBeLessThanOrEqual(rankCurr);
    }
  });

  it('returns summary stats', () => {
    const result = generateTeamSuggestions({
      agents: [makeAgent()],
      jobs: [makeJob()],
      teams: [],
    });
    expect(result.summary.analyzed).toBe(true);
    expect(result.summary.agentsAnalyzed).toBe(1);
    expect(result.summary.jobsAnalyzed).toBe(1);
    expect(typeof result.summary.unassignedJobs).toBe('number');
    expect(typeof result.summary.idleAgents).toBe('number');
  });
});
