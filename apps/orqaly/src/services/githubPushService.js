/**
 * GitHub Push service — business-logic layer for recording git pushes
 * and assigning multiple tasks to each push.
 */
import * as backend from './githubPushBackend';
import { maybeNotify } from './emailNotificationDispatcher';

function generateId() {
  return `gp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildPush(data) {
  return {
    id: generateId(),
    repo: data.repo || '',
    branch: data.branch || 'main',
    commitSha: data.commitSha || '',
    commitMessage: data.commitMessage || '',
    commitAuthor: data.commitAuthor || '',
    commitUrl: data.commitUrl || '',
    pushedAt: data.pushedAt || new Date().toISOString(),
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────
export async function getAllPushes() {
  return backend.loadPushes();
}

export async function getAllPushesWithTasks() {
  return backend.loadPushesWithTasks();
}

export async function getPushById(id) {
  const list = await backend.loadPushes();
  return list.find((p) => p.id === id) || null;
}

export async function createPush(data) {
  const push = buildPush(data);
  await backend.createPush(push);
  maybeNotify('github_push_created', {
    repo: push.repo,
    branch: push.branch,
    sha: push.commitSha,
    message: push.commitMessage,
  });
  return push;
}

export async function updatePush(id, data) {
  const existing = await getPushById(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    repo: data.repo !== undefined ? data.repo : existing.repo,
    branch: data.branch !== undefined ? data.branch : existing.branch,
    commitSha: data.commitSha !== undefined ? data.commitSha : existing.commitSha,
    commitMessage: data.commitMessage !== undefined ? data.commitMessage : existing.commitMessage,
    commitAuthor: data.commitAuthor !== undefined ? data.commitAuthor : existing.commitAuthor,
    commitUrl: data.commitUrl !== undefined ? data.commitUrl : existing.commitUrl,
    pushedAt: data.pushedAt !== undefined ? data.pushedAt : existing.pushedAt,
    notes: data.notes !== undefined ? data.notes : existing.notes,
    updatedAt: new Date().toISOString(),
  };
  await backend.updatePushById(id, updated);
  return updated;
}

export async function deletePush(id) {
  await backend.deletePushById(id);
  return true;
}

// ── Task assignment ───────────────────────────────────────────
export async function getTasksForPush(pushId) {
  return backend.loadTasksForPush(pushId);
}

/**
 * Assign a task to a push.
 * @param {string} pushId
 * @param {{ taskRef: string, taskTitle: string, taskType?: string, partnerId?: string, projectId?: string }} taskData
 */
export async function assignTaskToPush(pushId, taskData) {
  const entry = {
    pushId,
    taskRef: taskData.taskRef || '',
    taskTitle: taskData.taskTitle || '',
    taskType: taskData.taskType || 'partner_task',
    partnerId: taskData.partnerId || null,
    projectId: taskData.projectId || null,
  };
  const saved = await backend.addTaskToPush(entry);
  maybeNotify('task_assigned_to_push', {
    task: entry.taskTitle,
    pushId,
  });
  return saved;
}

/**
 * Assign multiple tasks to a push in one call.
 */
export async function assignMultipleTasksToPush(pushId, taskDataArray) {
  const results = [];
  for (const td of taskDataArray) {
    const saved = await assignTaskToPush(pushId, td);
    results.push(saved);
  }
  return results;
}

export async function unassignTaskFromPush(pushTaskId) {
  return backend.removeTaskFromPush(pushTaskId);
}

export async function clearTasksFromPush(pushId) {
  return backend.removeAllTasksFromPush(pushId);
}
