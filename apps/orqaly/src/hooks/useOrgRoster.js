/**
 * useOrgRoster — who an organization can hand work to.
 *
 * Resolves, for one organization: the teams and agents explicitly assigned to it
 * (the `org_teams` / `org_agents` junctions), each team's lead, and the board
 * governing it (`organizations.consilium_id`), plus a flat `targets` list ready
 * for a picker.
 *
 * Lifted out of useOrgCommander so the goal composer's setup drawer resolves the
 * same roster the Communicator does. Two copies of this join would drift, and the
 * mapping from an assignment row to a display name is the fiddly part: teams live
 * in two tables (governance + workforce) and an agent id can be stored as either
 * `id` or `agent_id`.
 */
import { useEffect, useState } from 'react';
import { getOrgTeams } from '../services/orgTeamService';
import { getOrgAgents } from '../services/orgAgentService';
import { getAllAgentTeams, getAllTeams } from '../services/conciliumTeamsService';
import { getAgents } from '../services/agentHubService';
import { getAllConcilium } from '../services/conciliumService';

export const EMPTY_ORG_ROSTER = Object.freeze({
  teams: [],
  agents: [],
  leads: [],
  consilium: null,
  targets: [],
});

/**
 * @param {{ orgId: string, orgs?: Array<{id: string, name?: string, consilium_id?: string}> }} params
 * @returns {Promise<{teams: Array, agents: Array, leads: Array, consilium: object|null, targets: Array}>}
 */
export async function loadOrgRoster({ orgId, orgs = [] }) {
  if (!orgId) return { ...EMPTY_ORG_ROSTER };

  const org = orgs.find((o) => o.id === orgId);
  const [teamIds, agentIds, agentTeams, govTeams, agents, boards] = await Promise.all([
    getOrgTeams(orgId).catch(() => []),
    getOrgAgents(orgId).catch(() => []),
    getAllAgentTeams().catch(() => []),
    getAllTeams().catch(() => []),
    Promise.resolve(getAgents()),
    getAllConcilium().catch(() => []),
  ]);
  const allTeams = [...agentTeams, ...govTeams];
  const teams = teamIds
    .map((tid) => allTeams.find((t) => String(t.id) === String(tid)))
    .filter(Boolean);
  const assignedAgents = agentIds
    .map((aid) => agents.find((a) => String(a.agent_id || a.id) === String(aid)))
    .filter(Boolean);
  const leads = teams
    .filter((t) => t.leader_id)
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      leaderId: t.leader_id,
      leaderName:
        agents.find((a) => String(a.id) === String(t.leader_id))?.name ||
        agents.find((a) => String(a.agent_id) === String(t.leader_id))?.name ||
        'Team lead',
    }));
  // A board id with no row behind it still names a real assignment, so it is
  // shown by id rather than dropped — silently losing it would read as "this
  // workspace has no board".
  const consilium = org?.consilium_id
    ? boards.find((b) => b.id === org.consilium_id) || {
        id: org.consilium_id,
        name: org.consilium_id,
      }
    : null;

  const targets = [
    { type: 'organization', id: orgId, label: org?.name || 'Whole organization' },
    ...teams.map((t) => ({ type: 'team', id: t.id, label: `Team: ${t.name}` })),
    ...leads.map((l) => ({
      type: 'team_lead',
      id: l.leaderId,
      label: `Lead: ${l.leaderName} (${l.teamName})`,
    })),
    ...assignedAgents.map((a) => ({
      type: 'agent',
      id: a.agent_id || a.id,
      label: `Agent: ${a.name || a.agent_id || a.id}`,
    })),
    ...(consilium
      ? [{ type: 'consilium', id: consilium.id, label: `Consilium: ${consilium.name}` }]
      : []),
  ];

  return { teams, agents: assignedAgents, leads, consilium, targets };
}

/**
 * Hook wrapper: reloads whenever the org (or the org list backing its name and
 * board) changes. `boards` is returned as well so a caller can offer every board
 * the user owns, not only the governing one.
 */
export function useOrgRoster(orgId, orgs = []) {
  // Roster and the org it belongs to move together. Keeping them in one value
  // lets `loading` be derived - "what I hold is not for the org I was asked
  // about" - instead of a second state written from inside the effect.
  const [resolved, setResolved] = useState({ orgId: null, roster: EMPTY_ORG_ROSTER });

  useEffect(() => {
    let alive = true;
    const requested = orgId || '';
    loadOrgRoster({ orgId: requested, orgs })
      .then((next) => {
        if (alive) setResolved({ orgId: requested, roster: next });
      })
      .catch(() => {
        if (alive) setResolved({ orgId: requested, roster: EMPTY_ORG_ROSTER });
      });
    return () => {
      alive = false;
    };
  }, [orgId, orgs]);

  return { roster: resolved.roster, loading: resolved.orgId !== (orgId || '') };
}
