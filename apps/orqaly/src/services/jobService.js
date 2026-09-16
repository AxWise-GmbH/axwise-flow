/**
 * Job service — CRUD for Job Pool jobs.
 */
import * as jobBackend from './jobBackend';
import { maybeNotify } from './emailNotificationDispatcher';

const JOB_STATUSES = ['active', 'paused', 'completed', 'cancelled'];

const SEED_JOBS = [
  {
    description: 'Analyze partner engagement metrics',
    status: 'active',
    requirements: 'Pull engagement data from all active partners and produce a summary report',
    relatedProjects: [],
    relatedWorkflows: [],
    relatedTasks: [],
    relatedPartners: [],
  },
  {
    description: 'Generate weekly campaign performance digest',
    status: 'active',
    requirements: 'Aggregate campaign KPIs and format into a digest email',
    relatedProjects: [],
    relatedWorkflows: [],
    relatedTasks: [],
    relatedPartners: [],
  },
];

function generateId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildJob(data) {
  return {
    id: generateId(),
    description: data.description || '',
    status: JOB_STATUSES.includes(data.status) ? data.status : 'active',
    category: data.category || null,
    assignedAgentId: data.assignedAgentId || null,
    assignedAgentName: data.assignedAgentName || '',
    requirements: data.requirements || '',
    conciliumId: data.conciliumId || null,
    conciliumName: data.conciliumName || '',
    teamId: data.teamId || null,
    teamName: data.teamName || '',
    addedBy: data.addedBy || null,
    relatedProjects: Array.isArray(data.relatedProjects) ? data.relatedProjects : [],
    relatedWorkflows: Array.isArray(data.relatedWorkflows) ? data.relatedWorkflows : [],
    relatedTasks: Array.isArray(data.relatedTasks) ? data.relatedTasks : [],
    relatedPartners: Array.isArray(data.relatedPartners) ? data.relatedPartners : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────
export const JOB_STATUSES_LIST = JOB_STATUSES;

export { buildJob };

export async function createJob(data, agentContext = null) {
  const job = buildJob(data);
  await jobBackend.createJob(job, agentContext);
  maybeNotify('job_created', { description: job.description, status: job.status });
  return job;
}

export async function getAllJobs() {
  let jobs = await jobBackend.loadJobs();
  // Seed if empty — creates 2 sample jobs on first load
  if (jobs.length === 0) {
    for (const seed of SEED_JOBS) {
      const job = buildJob(seed);
      await jobBackend.createJob(job);
      jobs.push(job);
    }
  }
  return jobs;
}

export async function getJobById(id) {
  const list = await jobBackend.loadJobs();
  return list.find((j) => j.id === id) || null;
}

export async function updateJob(id, data, agentContext = null) {
  const list = await jobBackend.loadJobs();
  const idx = list.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const updated = {
    ...existing,
    description: data.description !== undefined ? data.description : existing.description,
    status: data.status !== undefined ? data.status : existing.status,
    category: data.category !== undefined ? data.category : existing.category,
    assignedAgentId:
      data.assignedAgentId !== undefined ? data.assignedAgentId : existing.assignedAgentId,
    assignedAgentName:
      data.assignedAgentName !== undefined ? data.assignedAgentName : existing.assignedAgentName,
    requirements: data.requirements !== undefined ? data.requirements : existing.requirements,
    conciliumId: data.conciliumId !== undefined ? data.conciliumId : existing.conciliumId,
    conciliumName: data.conciliumName !== undefined ? data.conciliumName : existing.conciliumName,
    teamId: data.teamId !== undefined ? data.teamId : existing.teamId || null,
    teamName: data.teamName !== undefined ? data.teamName : existing.teamName || '',
    addedBy: data.addedBy !== undefined ? data.addedBy : existing.addedBy || null,
    relatedProjects:
      data.relatedProjects !== undefined ? data.relatedProjects : existing.relatedProjects || [],
    relatedWorkflows:
      data.relatedWorkflows !== undefined ? data.relatedWorkflows : existing.relatedWorkflows || [],
    relatedTasks: data.relatedTasks !== undefined ? data.relatedTasks : existing.relatedTasks || [],
    relatedPartners:
      data.relatedPartners !== undefined ? data.relatedPartners : existing.relatedPartners || [],
    updatedAt: new Date().toISOString(),
  };
  await jobBackend.updateJobById(id, updated, agentContext);
  maybeNotify('job_updated', { description: updated.description, status: updated.status });
  return updated;
}

export async function deleteJob(id, agentContext = null) {
  await jobBackend.deleteJobById(id, agentContext);
  maybeNotify('job_deleted', { id });
  return true;
}
