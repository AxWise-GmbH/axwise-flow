/**
 * Request service — CRUD for Job Pool requests.
 */
import * as requestBackend from './requestBackend';

const REQUEST_STATUSES = ['pending', 'processing', 'completed', 'rejected'];
const REQUEST_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function generateId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildRequest(data) {
  return {
    id: generateId(),
    requestText: data.requestText || '',
    status: REQUEST_STATUSES.includes(data.status) ? data.status : 'pending',
    parsedTitle: data.parsedTitle || null,
    parsedCategory: data.parsedCategory || null,
    parsedRequirements: data.parsedRequirements || null,
    parsedPriority: REQUEST_PRIORITIES.includes(data.parsedPriority)
      ? data.parsedPriority
      : 'medium',
    assignedConciliumId: data.assignedConciliumId || null,
    assignedConciliumName: data.assignedConciliumName || '',
    resultJobId: data.resultJobId || null,
    resultAgentId: data.resultAgentId || null,
    processingNotes: data.processingNotes || '',
    costUsd: data.costUsd || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────
export const REQUEST_STATUSES_LIST = REQUEST_STATUSES;
export const REQUEST_PRIORITIES_LIST = REQUEST_PRIORITIES;

export { buildRequest };

export async function createRequest(data, agentContext = null) {
  const request = buildRequest(data);
  await requestBackend.createRequest(request, agentContext);
  return request;
}

export async function getAllRequests() {
  return requestBackend.loadRequests();
}

export async function getRequestById(id) {
  const list = await requestBackend.loadRequests();
  return list.find((r) => r.id === id) || null;
}

export async function updateRequest(id, data, agentContext = null) {
  const list = await requestBackend.loadRequests();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const updated = {
    ...existing,
    requestText: data.requestText !== undefined ? data.requestText : existing.requestText,
    status: data.status !== undefined ? data.status : existing.status,
    parsedTitle: data.parsedTitle !== undefined ? data.parsedTitle : existing.parsedTitle,
    parsedCategory:
      data.parsedCategory !== undefined ? data.parsedCategory : existing.parsedCategory,
    parsedRequirements:
      data.parsedRequirements !== undefined ? data.parsedRequirements : existing.parsedRequirements,
    parsedPriority:
      data.parsedPriority !== undefined ? data.parsedPriority : existing.parsedPriority,
    assignedConciliumId:
      data.assignedConciliumId !== undefined
        ? data.assignedConciliumId
        : existing.assignedConciliumId,
    assignedConciliumName:
      data.assignedConciliumName !== undefined
        ? data.assignedConciliumName
        : existing.assignedConciliumName,
    resultJobId: data.resultJobId !== undefined ? data.resultJobId : existing.resultJobId,
    resultAgentId: data.resultAgentId !== undefined ? data.resultAgentId : existing.resultAgentId,
    processingNotes:
      data.processingNotes !== undefined ? data.processingNotes : existing.processingNotes,
    costUsd: data.costUsd !== undefined ? data.costUsd : existing.costUsd,
    updatedAt: new Date().toISOString(),
  };
  await requestBackend.updateRequestById(id, updated, agentContext);
  return updated;
}

export async function deleteRequest(id, agentContext = null) {
  await requestBackend.deleteRequestById(id, agentContext);
  return true;
}
