/**
 * Concilium agents service: business logic for AI agent lifecycle.
 */
import {
  loadAgents,
  registerAgent,
  updateAgentStatus,
  deleteAgent,
} from './conciliumAgentsBackend';

export const AGENT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'expired', label: 'Expired' },
];

export const AGENT_TYPES = [
  { value: 'external', label: 'External' },
  { value: 'internal', label: 'Internal' },
  { value: 'hybrid', label: 'Hybrid' },
];

export async function getAllAgents(boardId = null) {
  return loadAgents(boardId);
}
export async function createAgent(data) {
  return registerAgent(data);
}
export async function acceptAgent(id) {
  return updateAgentStatus(id, 'accept');
}
export async function pauseAgent(id) {
  return updateAgentStatus(id, 'pause');
}
export async function resumeAgent(id) {
  return updateAgentStatus(id, 'resume');
}
export async function terminateAgent(id, reason) {
  return updateAgentStatus(id, 'terminate', { reason });
}
export async function removeAgent(id) {
  return deleteAgent(id);
}
