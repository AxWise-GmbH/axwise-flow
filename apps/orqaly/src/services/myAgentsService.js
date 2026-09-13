/**
 * My Agents service — derives user-agent relationships from jobs, agents, and ratings.
 * No new database table; aggregates existing data.
 */
import { getAllJobs } from './jobService';
import { getAgents } from './agentHubService';
import { getAllUserRatings } from './agentRatingService';

/**
 * Build the "my agents" list from user's job history.
 * Groups jobs by assignedAgentId, enriches with agent metadata and ratings.
 * @returns {Promise<Array>} sorted by lastUsed (most recent first)
 */
export async function getMyAgents() {
  const [jobs, allAgents, allRatings] = await Promise.all([
    getAllJobs(),
    Promise.resolve(getAgents()),
    getAllUserRatings(),
  ]);

  // Group jobs by agent
  const agentJobMap = {};
  for (const job of jobs) {
    if (!job.assignedAgentId) continue;
    if (!agentJobMap[job.assignedAgentId]) agentJobMap[job.assignedAgentId] = [];
    agentJobMap[job.assignedAgentId].push(job);
  }

  // Group ratings by agent
  const ratingMap = {};
  for (const r of allRatings) {
    if (!ratingMap[r.agent_id]) ratingMap[r.agent_id] = [];
    ratingMap[r.agent_id].push(r);
  }

  const myAgents = Object.entries(agentJobMap).map(([agentId, agentJobs]) => {
    const meta = allAgents.find((a) => a.id === agentId || a.agent_id === agentId);
    const ratings = ratingMap[agentId] || [];
    return buildMyAgent(agentId, agentJobs, meta, ratings);
  });

  return myAgents.sort((a, b) => new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0));
}

function buildMyAgent(agentId, jobs, meta, ratings) {
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );

  return {
    agentId,
    agentName: meta?.name || jobs[0]?.assignedAgentName || meta?.role || 'Agent',
    role: meta?.role || 'general',
    category: meta?.category || null,
    capabilities: meta?.capabilities || [],
    availability: meta?.availability_status || 'offline',
    costPerTask: Number(meta?.cost_per_task || 0),
    connectionType: meta?.connection_type || 'internal',
    supabaseId: meta?._supabase_id || meta?.agent_id || agentId,
    profile: null, // populated by useMyAgents after profile fetch

    jobsCompleted: jobs.filter((j) => j.status === 'completed').length,
    jobsTotal: jobs.length,
    jobsActive: jobs.filter((j) => j.status === 'active').length,
    totalSpend: jobs.reduce((s, j) => s + Number(j.costUsd || 0), 0),
    lastUsed: sorted[0]?.updatedAt || sorted[0]?.createdAt || null,
    firstUsed: sorted.at(-1)?.createdAt || null,
    approvalPending: jobs.filter((j) => j.approvalStatus === 'pending_approval').length,

    userRating:
      ratings.length > 0
        ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
        : null,
    ratingCount: ratings.length,

    recentJobs: sorted.slice(0, 5).map((j) => ({
      id: j.id,
      description: j.description,
      status: j.status,
      costUsd: j.costUsd,
      approvalStatus: j.approvalStatus,
      date: j.updatedAt || j.createdAt,
    })),
  };
}

/**
 * Compute aggregate stats across all my agents.
 */
export function getMyAgentStats(myAgents) {
  const rated = myAgents.filter((a) => a.userRating !== null);
  return {
    totalAgents: myAgents.length,
    avgRating:
      rated.length > 0
        ? Math.round((rated.reduce((s, a) => s + a.userRating, 0) / rated.length) * 10) / 10
        : 0,
    totalSpend: Math.round(myAgents.reduce((s, a) => s + a.totalSpend, 0) * 100) / 100,
    activeJobs: myAgents.reduce((s, a) => s + a.jobsActive, 0),
    pendingApproval: myAgents.reduce((s, a) => s + a.approvalPending, 0),
  };
}

/**
 * Estimate cost for a reuse request based on agent cost and complexity tier.
 */
export function estimateCost(agent, complexityTier) {
  const taskCountRange = { simple: [1, 3], standard: [3, 5], complex: [5, 7] };
  const [min, max] = taskCountRange[complexityTier] || [1, 3];
  const costPerTask = agent.costPerTask || 0.25;
  return {
    min: Math.round(min * costPerTask * 100) / 100,
    max: Math.round(max * costPerTask * 100) / 100,
  };
}
