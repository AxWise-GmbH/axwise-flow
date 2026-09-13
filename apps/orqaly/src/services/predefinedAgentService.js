/**
 * Predefined agent seeding service.
 *
 * Seeds 24 agents + 4 teams on first load.
 * Follows the same pattern as SEED_TEAMS in teamService.js.
 */
import { PREDEFINED_AGENTS, PREDEFINED_TEAMS } from '../config/predefinedAgents';
import {
  addAgent,
  getAgents,
  removeAgent,
  updateAgent,
  repairAgentProviderFields,
} from './agentHubService';
import { createTeam, getAllTeams, deleteTeam, updateTeam } from './teamService';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../config/assistantBrain';

const LOADED_KEY = 'orch_predefined_agents_loaded';

export function predefinedAgentId(role) {
  return `predefined:${String(role || 'general')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

export function hasLoadedPredefinedAgents() {
  try {
    return localStorage.getItem(LOADED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Remove duplicate agents (same role), keeping the first occurrence.
 */
function deduplicateAgents() {
  const agents = getAgents();
  const seen = new Set();
  for (const agent of agents) {
    if (seen.has(agent.role)) {
      removeAgent(agent.id);
    } else {
      seen.add(agent.role);
    }
  }
}

/**
 * Remove duplicate teams (same name), keeping the first occurrence.
 */
async function deduplicateTeams() {
  const teams = await getAllTeams();
  const seen = new Set();
  for (const team of teams) {
    if (seen.has(team.name)) {
      await deleteTeam(team.id);
    } else {
      seen.add(team.name);
    }
  }
}

/**
 * Ensure every predefined team has its agents attached.
 * Runs every load — patches teams that exist but have 0 agents.
 */
async function patchTeamAgents() {
  const teams = await getAllTeams();
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const allAgents = getAgents();

  for (const teamDef of PREDEFINED_TEAMS) {
    const team = teamByName.get(teamDef.name);
    if (!team || (team.agents && team.agents.length > 0)) continue;

    const agentRefs = allAgents
      .filter((a) => teamDef.agentRoles.includes(a.role))
      .map((a) => ({ id: a.id, agent_id: a.agent_id, role: a.role, category: a.category }));

    if (agentRefs.length > 0) {
      await updateTeam(team.id, { agents: agentRefs });
    }
  }
}

/**
 * Patch existing agents with system_prompt and tools from predefined definitions.
 * Runs every load — updates agents whose prompt or tools are missing or outdated.
 */
function patchAgentPrompts() {
  const agents = getAgents();
  const defByRole = new Map(PREDEFINED_AGENTS.map((d) => [d.role, d]));

  for (const agent of agents) {
    const def = defByRole.get(agent.role);
    if (!def) continue;

    const updates = {};
    if (def.system_prompt && agent.system_prompt !== def.system_prompt) {
      updates.system_prompt = def.system_prompt;
    }
    // Backfill tools — agents seeded before this fix have empty/missing tools arrays
    const currentTools = Array.isArray(agent.tools) ? agent.tools : [];
    const defTools = Array.isArray(def.tools) ? def.tools : [];
    if (defTools.length > 0 && currentTools.length === 0) {
      updates.tools = defTools;
    }
    // Backfill name — legacy agents have no name OR their name equals their
    // role (default fallback). Both cases get upgraded to the predefined name.
    if (def.name) {
      const hasMeaningfulName = agent.name && agent.name !== agent.role;
      if (!hasMeaningfulName) {
        updates.name = def.name;
      }
    }
    // Older seeders generated a fresh random identity on every browser. Give
    // the surviving logical row a catalogue-stable key so future browsers
    // update it instead of inserting another physical agent.
    if (agent.added_by?.email === 'predefined') {
      const stableAgentId = predefinedAgentId(def.role);
      if (agent.agent_id !== stableAgentId) updates.agent_id = stableAgentId;
    }

    if (Object.keys(updates).length > 0) {
      updateAgent(agent.id, updates);
    }
  }
}

/**
 * Seed all predefined agents and teams, then patch.
 * Agent/team creation only runs once (flag-guarded).
 * Dedup and team-agent patching always run.
 */
export async function loadPredefinedAgents() {
  // Align provider/model/connection_type on previously-seeded agents (one-shot)
  repairAgentProviderFields();

  // Always clean up duplicates and patch teams
  deduplicateAgents();
  await deduplicateTeams();

  const alreadySeeded = hasLoadedPredefinedAgents();

  let createdAgents = [];
  let createdTeams = [];

  // Always seed missing agents (handles new predefined agents added after initial seed)
  // Deduplicate by role first — eliminates localStorage ghosts with old names
  const currentAgents = getAgents();
  const seenRoles = new Set();
  for (const a of currentAgents) {
    if (a.role && seenRoles.has(a.role)) {
      removeAgent(a.id);
      continue;
    }
    if (a.role) seenRoles.add(a.role);
  }

  const existingRoles = new Set(getAgents().map((a) => a.role));

  for (const def of PREDEFINED_AGENTS) {
    if (existingRoles.has(def.role)) continue;
    // `connection_type: 'glm'` in the legacy starter catalogue was the old
    // platform default, not a user selection. Only a complete provider/model
    // pair is an explicit catalogue pin; otherwise seed the atomic default pair.
    const hasExplicitLlm = Boolean(def.provider && def.model);
    const provider = hasExplicitLlm ? def.provider : DEFAULT_LLM_PROVIDER;
    const model = hasExplicitLlm ? def.model : DEFAULT_LLM_MODEL;
    const record = addAgent({
      agent_id: predefinedAgentId(def.role),
      name: def.name || def.role,
      role: def.role,
      capabilities: def.capabilities,
      connection_type: provider,
      provider,
      model,
      cost_per_task: def.cost_per_task,
      availability_status: 'available',
      category: def.category,
      description: def.description,
      system_prompt: def.system_prompt || null,
      tools: def.tools || [],
      added_by: { uid: 'system', email: 'predefined', date: new Date().toISOString() },
    });
    createdAgents.push(record);
  }

  if (!alreadySeeded) {
    // Create missing teams
    const existingTeams = await getAllTeams();
    const existingTeamNames = new Set(existingTeams.map((t) => t.name));
    const allAgents = getAgents();

    for (const teamDef of PREDEFINED_TEAMS) {
      if (existingTeamNames.has(teamDef.name)) continue;
      const agentRefs = allAgents
        .filter((a) => teamDef.agentRoles.includes(a.role))
        .map((a) => ({ id: a.id, agent_id: a.agent_id, role: a.role, category: a.category }));
      const team = await createTeam({
        name: teamDef.name,
        description: teamDef.description,
        status: 'active',
        agents: agentRefs,
      });
      createdTeams.push(team);
    }

    localStorage.setItem(LOADED_KEY, 'true');
  }

  // Always patch system prompts and teams
  patchAgentPrompts();
  await patchTeamAgents();

  return { agents: createdAgents, teams: createdTeams };
}

/**
 * Reset the loaded flag so agents can be re-seeded.
 */
export function resetPredefinedFlag() {
  try {
    localStorage.removeItem(LOADED_KEY);
  } catch {}
}
