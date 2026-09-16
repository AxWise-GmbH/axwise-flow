/**
 * Project service — CRUD for projects that connect Partners, Workflows, and Campaigns.
 */
import * as projectBackend from './projectBackend';
import { maybeNotify } from './emailNotificationDispatcher';

const PROJECT_STATUSES = ['Active', 'Paused', 'Completed', 'Archived'];

function generateId() {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildProject(data) {
  const category = (data.category && String(data.category).trim()) || null;
  return {
    id: generateId(),
    name: data.name || 'Untitled Project',
    description: data.description || '',
    status: PROJECT_STATUSES.includes(data.status) ? data.status : 'Active',
    category: category || null,
    partnerId: data.partnerId || null,
    partnerName: data.partnerName || '',
    workflowId: data.workflowId || null,
    workflowName: data.workflowName || '',
    campaignId: data.campaignId || null,
    campaignName: data.campaignName || '',
    teamId: data.teamId || null,
    teamName: data.teamName || '',
    agentIds: Array.isArray(data.agentIds) ? data.agentIds : [],
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────
export const PROJECT_STATUSES_LIST = PROJECT_STATUSES;

export async function getAllProjects() {
  return projectBackend.loadProjects();
}

export async function getProjectById(id) {
  const list = await projectBackend.loadProjects();
  return list.find((p) => p.id === id) || null;
}

export async function createProject(data, agentContext = null) {
  const project = buildProject(data);
  await projectBackend.createProject(project, agentContext);
  maybeNotify('project_created', {
    name: project.name || project.id,
    partner: project.partnerName || '',
    status: project.status || 'Active',
  });
  return project;
}

export async function updateProject(id, data, agentContext = null) {
  const list = await projectBackend.loadProjects();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const updated = {
    ...existing,
    name: data.name !== undefined ? data.name : existing.name,
    description: data.description !== undefined ? data.description : existing.description,
    status: data.status !== undefined ? data.status : existing.status,
    category: data.category !== undefined ? data.category : existing.category,
    partnerId: data.partnerId !== undefined ? data.partnerId : existing.partnerId,
    partnerName: data.partnerName !== undefined ? data.partnerName : existing.partnerName,
    workflowId: data.workflowId !== undefined ? data.workflowId : existing.workflowId,
    workflowName: data.workflowName !== undefined ? data.workflowName : existing.workflowName,
    campaignId: data.campaignId !== undefined ? data.campaignId : existing.campaignId,
    campaignName: data.campaignName !== undefined ? data.campaignName : existing.campaignName,
    teamId: data.teamId !== undefined ? data.teamId : existing.teamId,
    teamName: data.teamName !== undefined ? data.teamName : existing.teamName,
    agentIds: data.agentIds !== undefined ? data.agentIds : existing.agentIds || [],
    notes: data.notes !== undefined ? data.notes : existing.notes,
    updatedAt: new Date().toISOString(),
  };
  await projectBackend.updateProjectById(id, updated, agentContext);

  if (data.status !== undefined && data.status !== existing.status) {
    maybeNotify('project_status_changed', {
      name: updated.name || id,
      oldStatus: existing.status || '',
      newStatus: data.status,
    });
  }

  const linkFields = [
    { key: 'partnerId', type: 'Partner', nameKey: 'partnerName' },
    { key: 'workflowId', type: 'Workflow', nameKey: 'workflowName' },
    { key: 'campaignId', type: 'Campaign', nameKey: 'campaignName' },
  ];
  for (const lf of linkFields) {
    if (data[lf.key] !== undefined && data[lf.key] !== existing[lf.key] && data[lf.key]) {
      maybeNotify('project_linked', {
        name: updated.name || id,
        linkedType: lf.type,
        linkedName: data[lf.nameKey] || data[lf.key] || '',
      });
    }
  }

  return updated;
}

export async function deleteProject(id, agentContext = null) {
  const p = await getProjectById(id);
  await projectBackend.deleteProjectById(id, agentContext);
  maybeNotify('project_deleted', { name: p?.name || id });
  return true;
}
