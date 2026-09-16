/**
 * Team service — CRUD for agent teams in the Job Pool.
 */
import * as teamBackend from './teamBackend';

const TEAM_STATUSES = ['active', 'paused', 'disbanded'];

const SEED_TEAMS = [
  {
    name: 'Alpha Squad',
    description: 'Primary analysis and data processing team',
    status: 'active',
    agents: [],
    jobIds: [],
    messages: [],
  },
];

function generateId() {
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildTeam(data) {
  return {
    id: generateId(),
    name: data.name || 'Untitled Team',
    description: data.description || '',
    status: TEAM_STATUSES.includes(data.status) ? data.status : 'active',
    agents: Array.isArray(data.agents) ? data.agents : [],
    jobIds: Array.isArray(data.jobIds) ? data.jobIds : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    createdById: data.createdById || null,
    createdByName: data.createdByName || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────
export const TEAM_STATUSES_LIST = TEAM_STATUSES;

export { buildTeam };

export async function createTeam(data, agentContext = null) {
  const team = buildTeam(data);
  await teamBackend.createTeam(team, agentContext);
  return team;
}

export async function getAllTeams() {
  let teams = await teamBackend.loadTeams();
  // Seed if empty — creates 1 sample team on first load
  if (teams.length === 0) {
    for (const seed of SEED_TEAMS) {
      const team = buildTeam(seed);
      await teamBackend.createTeam(team);
      teams.push(team);
    }
  }
  return teams;
}

export async function getTeamById(id) {
  const list = await teamBackend.loadTeams();
  return list.find((t) => t.id === id) || null;
}

export async function updateTeam(id, data, agentContext = null) {
  const list = await teamBackend.loadTeams();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const updated = {
    ...existing,
    name: data.name !== undefined ? data.name : existing.name,
    description: data.description !== undefined ? data.description : existing.description,
    status: data.status !== undefined ? data.status : existing.status,
    agents: data.agents !== undefined ? data.agents : existing.agents || [],
    jobIds: data.jobIds !== undefined ? data.jobIds : existing.jobIds || [],
    messages: data.messages !== undefined ? data.messages : existing.messages || [],
    updatedAt: new Date().toISOString(),
  };
  await teamBackend.updateTeamById(id, updated, agentContext);
  return updated;
}

export async function deleteTeam(id, agentContext = null) {
  await teamBackend.deleteTeamById(id, agentContext);
  return true;
}
