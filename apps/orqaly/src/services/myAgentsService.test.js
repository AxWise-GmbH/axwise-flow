/**
 * Tests for myAgentsService.js — derives user-agent relationships from existing data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./jobService', () => ({
  getAllJobs: vi.fn(),
}));
vi.mock('./agentHubService', () => ({
  getAgents: vi.fn(),
}));
vi.mock('./agentRatingService', () => ({
  getAllUserRatings: vi.fn(),
}));

import { getAllJobs } from './jobService';
import { getAgents } from './agentHubService';
import { getAllUserRatings } from './agentRatingService';
import { getMyAgents, getMyAgentStats, estimateCost } from './myAgentsService';

beforeEach(() => {
  vi.clearAllMocks();
});

const JOBS = [
  {
    id: 'j1',
    assignedAgentId: 'a1',
    assignedAgentName: 'Researcher',
    status: 'completed',
    costUsd: 0.5,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
  },
  {
    id: 'j2',
    assignedAgentId: 'a1',
    assignedAgentName: 'Researcher',
    status: 'active',
    costUsd: 0.3,
    createdAt: '2026-02-01',
    updatedAt: '2026-02-02',
  },
  {
    id: 'j3',
    assignedAgentId: 'a2',
    assignedAgentName: 'Coder',
    status: 'completed',
    costUsd: 1.0,
    createdAt: '2026-01-15',
    updatedAt: '2026-01-16',
    approvalStatus: 'pending_approval',
  },
  { id: 'j4', assignedAgentId: null, status: 'active', costUsd: 0 }, // no agent — should be excluded
];

const AGENTS = [
  {
    id: 'a1',
    role: 'Researcher',
    category: 'Research',
    capabilities: ['analysis'],
    cost_per_task: 0.25,
    availability_status: 'available',
  },
  {
    id: 'a2',
    role: 'Coder',
    category: 'Development',
    capabilities: ['code', 'api'],
    cost_per_task: 0.5,
    availability_status: 'busy',
  },
];

const RATINGS = [
  { id: 'r1', agent_id: 'a1', rating: 5, created_at: '2026-01-03' },
  { id: 'r2', agent_id: 'a1', rating: 4, created_at: '2026-01-04' },
];

describe('getMyAgents', () => {
  it('groups jobs by agent and enriches with metadata + ratings', async () => {
    getAllJobs.mockResolvedValue(JOBS);
    getAgents.mockReturnValue(AGENTS);
    getAllUserRatings.mockResolvedValue(RATINGS);

    const result = await getMyAgents();

    expect(result).toHaveLength(2);

    // Sorted by lastUsed — a1 (Feb) before a2 (Jan)
    expect(result[0].agentId).toBe('a1');
    expect(result[1].agentId).toBe('a2');
  });

  it('computes correct stats for agent a1', async () => {
    getAllJobs.mockResolvedValue(JOBS);
    getAgents.mockReturnValue(AGENTS);
    getAllUserRatings.mockResolvedValue(RATINGS);

    const result = await getMyAgents();
    const a1 = result[0];

    expect(a1.agentName).toBe('Researcher');
    expect(a1.category).toBe('Research');
    expect(a1.jobsCompleted).toBe(1);
    expect(a1.jobsTotal).toBe(2);
    expect(a1.jobsActive).toBe(1);
    expect(a1.totalSpend).toBe(0.8);
    expect(a1.userRating).toBe(4.5);
    expect(a1.ratingCount).toBe(2);
  });

  it('handles agent with no metadata gracefully', async () => {
    getAllJobs.mockResolvedValue([
      {
        id: 'j5',
        assignedAgentId: 'unknown',
        assignedAgentName: 'Mystery',
        status: 'completed',
        costUsd: 0,
        createdAt: '2026-03-01',
        updatedAt: '2026-03-01',
      },
    ]);
    getAgents.mockReturnValue([]);
    getAllUserRatings.mockResolvedValue([]);

    const result = await getMyAgents();
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe('Mystery');
    expect(result[0].role).toBe('general');
    expect(result[0].userRating).toBeNull();
  });

  it('excludes jobs with no agent', async () => {
    getAllJobs.mockResolvedValue(JOBS);
    getAgents.mockReturnValue(AGENTS);
    getAllUserRatings.mockResolvedValue([]);

    const result = await getMyAgents();
    expect(result.every((a) => a.agentId !== null)).toBe(true);
  });

  it('tracks pending approval count', async () => {
    getAllJobs.mockResolvedValue(JOBS);
    getAgents.mockReturnValue(AGENTS);
    getAllUserRatings.mockResolvedValue([]);

    const result = await getMyAgents();
    const a2 = result.find((a) => a.agentId === 'a2');
    expect(a2.approvalPending).toBe(1);
  });
});

describe('getMyAgentStats', () => {
  it('computes aggregate stats', () => {
    const agents = [
      { userRating: 4.5, totalSpend: 0.8, jobsActive: 1, approvalPending: 0 },
      { userRating: null, totalSpend: 1.0, jobsActive: 0, approvalPending: 1 },
    ];

    const stats = getMyAgentStats(agents);
    expect(stats.totalAgents).toBe(2);
    expect(stats.avgRating).toBe(4.5);
    expect(stats.totalSpend).toBe(1.8);
    expect(stats.activeJobs).toBe(1);
    expect(stats.pendingApproval).toBe(1);
  });

  it('returns 0 avg rating when no ratings', () => {
    const stats = getMyAgentStats([
      { userRating: null, totalSpend: 0, jobsActive: 0, approvalPending: 0 },
    ]);
    expect(stats.avgRating).toBe(0);
  });
});

describe('estimateCost', () => {
  it('estimates cost for simple tier', () => {
    const cost = estimateCost({ costPerTask: 0.25 }, 'simple');
    expect(cost.min).toBe(0.25);
    expect(cost.max).toBe(0.75);
  });

  it('estimates cost for complex tier', () => {
    const cost = estimateCost({ costPerTask: 0.5 }, 'complex');
    expect(cost.min).toBe(2.5);
    expect(cost.max).toBe(3.5);
  });

  it('uses default cost when agent has no cost_per_task', () => {
    const cost = estimateCost({ costPerTask: 0 }, 'standard');
    expect(cost.min).toBe(0.75);
    expect(cost.max).toBe(1.25);
  });
});
