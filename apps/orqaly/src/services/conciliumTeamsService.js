/**
 * Concilium teams service: business logic for team management.
 */
import {
  loadTeams,
  createTeam,
  updateTeamById,
  deleteTeamById,
  addTeamMember,
  removeTeamMember,
  loadAgentTeams,
} from './conciliumTeamsBackend';

// Consilium governance teams
export async function getAllTeams() {
  return loadTeams();
}
export async function addTeam(data) {
  return createTeam(data);
}
export async function editTeam(id, updates) {
  return updateTeamById(id, updates);
}
export async function removeTeam(id) {
  return deleteTeamById(id);
}
export async function addMemberToTeam(teamId, memberId) {
  return addTeamMember(teamId, memberId);
}
export async function removeMemberFromTeam(teamId, memberId) {
  return removeTeamMember(teamId, memberId);
}

// Agent workforce teams (My Agents page)
export async function getAllAgentTeams() {
  return loadAgentTeams();
}
