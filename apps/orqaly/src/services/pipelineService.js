/**
 * Pipeline service — orchestrates the request-to-report flow.
 *
 * Bridge 1: Request → Job auto-creation
 * Bridge 2: Job → Agent/Team auto-assignment (zero LLM cost)
 * Bridge 3: Job → Waterfall tasks (LLM-generated)
 * Bridge 4: Task completion → Job approval flow
 * Improvement 1: Performance feedback loop
 * Improvement 2: Client approval gate
 * Improvement 3: Cost tracking per job
 */
import { createJob, updateJob, getJobById } from './jobService';
import { updateRequest } from './requestService';
import { enqueueAndWait, waitForJobResult } from './agentJobService';
import { createTeamTask, loadTeamTasks } from './teamTaskBackend';
import {
  capabilityOverlap,
  getAgentCostTier,
  profileAgents,
  TIER_RANK,
} from './teamSuggestionEngine';
import { supabase, hasSupabase } from '../lib/supabase';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../config/assistantBrain';

// Complexity scoring belongs to the pipeline, not the request UI. Keeping the
// vocabulary here also avoids a service -> React component circular import.
export const TECHNICAL_KEYWORDS = [
  'api',
  'database',
  'integration',
  'architecture',
  'machine learning',
  'algorithm',
  'infrastructure',
  'microservice',
  'kubernetes',
  'deployment',
  'authentication',
  'encryption',
  'backend',
  'frontend',
  'pipeline',
  'ci/cd',
  'docker',
  'serverless',
  'graphql',
  'websocket',
];

// ── Helpers ──────────────────────────────────────────────────
async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

// ── Bridge 1: Request → Job ─────────────────────────────────
/**
 * Create a job from a submitted request and link them bidirectionally.
 * @param {object} request — saved request object
 * @returns {Promise<object>} the created job
 */
export async function requestToJob(request) {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  const job = {
    id,
    description: request.parsedTitle || (request.requestText || '').slice(0, 200),
    status: 'active',
    category: request.parsedCategory || null,
    requirements: request.parsedRequirements || request.requestText || '',
    conciliumId: request.assignedConciliumId || null,
    conciliumName: request.assignedConciliumName || '',
    sourceRequestId: request.id,
    createdAt: now,
    updatedAt: now,
  };

  await createJob(job);

  // Link request → job
  await updateRequest(request.id, {
    resultJobId: id,
    status: 'processing',
  });

  return job;
}

// ── Bridge 2: Agent selection (zero LLM cost) ───────────────
/**
 * Score and select the best agent for a job.
 * Composite score: 50% capability match, 20% cost efficiency, 20% reputation, 10% success rate.
 *
 * @param {object} job — job with description, requirements, category
 * @param {Array} agents — available agents (from conciliumAgentsService or agentHub)
 * @param {Array} [perfMetrics=[]] — from agent_performance_metrics (period='all_time')
 * @returns {{ agent: object, score: number, overlap: number } | null}
 */
export function selectBestAgent(job, agents, perfMetrics = []) {
  const profiled = profileAgents(agents);
  const available = profiled.filter((a) => a._isAvailable);
  if (available.length === 0) return null;

  // Build performance lookup
  const perfMap = new Map();
  for (const m of perfMetrics) {
    if (m.period === 'all_time') {
      perfMap.set(m.agent_id, m);
    }
  }

  const scored = available.map((agent) => {
    const overlap = capabilityOverlap(agent, job);
    const tierRank = TIER_RANK[getAgentCostTier(agent)] ?? 2;
    const costEfficiency = 1 - tierRank / 3;

    const perf = perfMap.get(agent.id) || perfMap.get(agent.agent_id);
    const reputation = perf ? Number(perf.reputation_score || 50) / 100 : 0.5;
    const successRate = perf ? Number(perf.success_rate || 0) / 100 : 0.5;

    const composite = overlap * 0.5 + costEfficiency * 0.2 + reputation * 0.2 + successRate * 0.1;

    return { agent, score: composite, overlap, costEfficiency, reputation };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

/**
 * Assign the best agent to a job.
 * @returns {Promise<{ agent: object, score: number } | null>}
 */
export async function assignAgentToJob(job, agents, perfMetrics = []) {
  const best = selectBestAgent(job, agents, perfMetrics);
  if (!best) return null;

  const agentId = best.agent.id || best.agent.agent_id;
  const agentName = best.agent.role || best.agent.name || '';

  await updateJob(job.id, {
    ...job,
    assignedAgentId: agentId,
    assignedAgentName: agentName,
  });

  return best;
}

// ── Smart LLM selection for task generation ─────────────────
const MODEL_TIERS = {
  simple: [{ provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL }],
  standard: [{ provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL }],
  complex: [{ provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL }],
};

/**
 * Unified complexity scorer — single source of truth.
 * Used by LLM selection, delegation recommendations, and cost estimation.
 * @param {string} text — combined description + requirements
 * @param {string} [priority=''] — low/medium/high/urgent
 * @returns {{ score: number, tier: 'simple'|'standard'|'complex' }}
 */
export function scoreComplexity(text, priority = '') {
  const lower = (text || '').toLowerCase();
  const charCount = lower.length;

  let score = 0;
  if (charCount > 200) score++;
  if (charCount > 500) score++;

  const kwMatches = TECHNICAL_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  score += Math.min(kwMatches, 3);

  const p = (priority || '').toLowerCase();
  if (p === 'high' || p === 'urgent') score++;

  let tier = 'complex';
  if (score <= 1) tier = 'simple';
  else if (score <= 3) tier = 'standard';

  return { score, tier };
}

/**
 * Recommend delegation strategy based on complexity.
 * @param {'simple'|'standard'|'complex'} tier
 * @param {Array} [team=[]] — team members if available
 * @returns {{ type: 'individual'|'partial_team'|'full_team', count?: number, reason: string }}
 */
export function recommendDelegation(tier, team = []) {
  if (tier === 'simple' || team.length === 0) {
    return { type: 'individual', reason: 'Quick task — 1 agent is optimal' };
  }
  if (tier === 'standard') {
    const count = Math.min(3, team.length);
    return {
      type: 'partial_team',
      count,
      reason: `Moderate complexity — ${count} specialists recommended`,
    };
  }
  return { type: 'full_team', reason: 'Complex task — full team collaboration recommended' };
}

/**
 * Select the best LLM for task generation based on job complexity.
 * @param {object} job — { description, requirements, category, priority, parsedPriority }
 * @returns {{ provider: string, model: string }}
 */
export function selectModelForTask(job) {
  const text = `${job.description || ''} ${job.requirements || ''}`;
  const priority = job.priority || job.parsedPriority || '';
  const { tier } = scoreComplexity(text, priority);
  return MODEL_TIERS[tier][0];
}

// ── Bridge 3: Job → Waterfall Tasks ─────────────────────────

/**
 * Build a task-generation system prompt tailored to the assigned agent.
 * When an agent is assigned, it plans its own work using its expertise.
 * Falls back to a generic project-manager prompt otherwise.
 */
function buildTaskGenPrompt(agent) {
  const role = agent?.role || 'project manager';
  const capabilities = agent?.capabilities?.length
    ? agent.capabilities.join(', ')
    : 'general project management';

  return `You are ${role}, planning your own work.
Your expertise: ${capabilities}.

Given the job description and requirements, create 3-7 sequential tasks that YOU will execute.
Each task should leverage your specific expertise and produce a concrete business deliverable.

Respond ONLY with a valid JSON array:
[{"title": "Task title", "description": "What to produce", "deliverable": "report", "priority": "medium", "estimate": "2h"}]

Rules:
- Tasks must be in execution order (first to last)
- Each task MUST specify a deliverable type: report | analysis | plan | code | design | audit
- Tasks should reflect YOUR role's perspective and expertise
- Priority: low, medium, or high
- Estimate: short time string (e.g. "1h", "4h", "1d")
- No markdown, no commentary — only the JSON array`;
}

/**
 * Generate waterfall tasks for a job using LLM, create them in team_tasks.
 * When an agent is assigned, it plans its own tasks using its expertise.
 * When teamMembers is provided, distributes tasks across members by capability overlap.
 * @param {object} job — job with description, requirements, category
 * @param {object} [agent=null] — assigned agent (role, capabilities)
 * @param {Array} [teamMembers=[]] — team members for distributed task assignment
 * @returns {Promise<{ tasks: Array, llmCost: number }>}
 */
export async function generateTasksForJob(job, agent = null, teamMembers = []) {
  const prompt = `Job: ${job.description}\nRequirements: ${job.requirements || 'None specified'}\nCategory: ${job.category || 'General'}`;

  const { provider, model } = selectModelForTask(job);

  const result = await enqueueAndWait(
    {
      type: 'run-llm',
      prompt,
      systemPrompt: buildTaskGenPrompt(agent),
      provider,
      model,
      temperature: 0.3,
      maxTokens: 1500,
      jsonMode: true,
    },
    30000
  );

  const llmCost = result?.result?.estimatedCostUsd || 0;

  if (result.status !== 'done') {
    console.warn('[pipeline] Task generation failed:', result.error);
    return { tasks: [], llmCost };
  }

  let taskDefs = [];
  try {
    const content = result.result?.content || '';
    const parsed = result.result?.parsed || JSON.parse(content);
    taskDefs = Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = (result.result?.content || '').match(/\[[\s\S]*\]/);
    if (match) {
      try {
        taskDefs = JSON.parse(match[0]);
      } catch {
        /* ignore */
      }
    }
  }

  const createdTasks = [];
  for (let i = 0; i < taskDefs.length; i++) {
    const def = taskDefs[i];
    const VALID_DELIVERABLES = ['report', 'analysis', 'plan', 'code', 'design', 'audit'];
    const deliverable = VALID_DELIVERABLES.includes(def.deliverable) ? def.deliverable : 'report';
    // Distribute tasks across team members by capability match, or use single agent
    let taskAgentId = job.assignedAgentId || null;
    if (teamMembers.length > 0) {
      const taskJob = { description: def.description || def.title || '', requirements: '' };
      const best = teamMembers
        .map((m) => ({ id: m.id || m.agent_id, overlap: capabilityOverlap(m, taskJob) }))
        .sort((a, b) => b.overlap - a.overlap);
      if (best.length > 0) taskAgentId = best[0].id;
    }
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: def.title || `Task ${i + 1}`,
      description: def.description || '',
      priority: def.priority || 'medium',
      status: 'todo',
      estimate: def.estimate || '',
      jobPoolId: job.id,
      category: 'AI Agents',
      agentId: taskAgentId,
      sequenceOrder: i,
      data: { deliverable },
    };
    await createTeamTask(task);
    createdTasks.push(task);
  }

  return { tasks: createdTasks, llmCost };
}

// ── Bridge 4: Task completion → Job closure ─────────────────
/**
 * Check if all tasks for a job are done.
 * If yes, set approvalStatus to 'pending_approval'.
 * @param {string} jobId
 * @param {Array} [allTasks] — optional pre-loaded tasks (avoids re-fetch)
 * @returns {Promise<{ allDone: boolean, total: number, completed: number }>}
 */
export async function checkJobTaskCompletion(jobId, allTasks) {
  const tasks = allTasks || (await loadTeamTasks());
  const jobTasks = tasks.filter((t) => t.jobPoolId === jobId);

  if (jobTasks.length === 0) return { allDone: false, total: 0, completed: 0 };

  const completed = jobTasks.filter((t) => t.status === 'done').length;
  const allDone = completed === jobTasks.length;

  if (allDone) {
    const job = await getJobById(jobId);
    if (job && job.status === 'active' && !job.approvalStatus) {
      await updateJob(jobId, { ...job, approvalStatus: 'pending_approval' });
    }
  }

  return { allDone, total: jobTasks.length, completed };
}

// ── Improvement 2: Client approval ──────────────────────────
/**
 * Approve or reject a job via server API.
 * Approved: records performance, generates report, closes job.
 * Rejected: reopens tasks for rework.
 * @param {string} jobId
 * @param {'approved'|'rejected'} decision
 * @returns {Promise<object|null>}
 */
export async function approveJob(jobId, decision) {
  try {
    const res = await fetch(`${getBase()}/api/app?path=pipeline&action=approve-job`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ jobId, decision }),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error('[pipeline] approveJob failed:', err);
    return null;
  }
}

// ── Improvement 3: Cost tracking ────────────────────────────
/**
 * Increment cost on a job record.
 * @param {string} jobId
 * @param {number} costIncrement — USD amount to add
 */
export async function addJobCost(jobId, costIncrement) {
  if (!costIncrement || costIncrement <= 0) return;
  const job = await getJobById(jobId);
  if (!job) return;
  const newCost = (job.costUsd || 0) + costIncrement;
  await updateJob(jobId, { ...job, costUsd: newCost });
}

// ── Bridge 5: Task execution ────────────────────────────────
/**
 * Enqueue execution of the first task for a job (waterfall — each task triggers the next).
 * Can be called from runPipeline or manually via "Run Tasks" button.
 *
 * @param {string} jobId
 * @param {Array} tasks — generated tasks (sorted by sequenceOrder)
 * @param {{ role?: string, name?: string, capabilities?: string[] }} [agentContext]
 * @param {string} [jobDescription]
 * @param {string} [jobRequirements]
 * @returns {Promise<object|null>} enqueue result or null if no tasks
 */
export async function executeJobTasks(jobId, tasks, agentContext, jobDescription, jobRequirements) {
  const todoTasks = tasks
    .filter((t) => t.status === 'todo')
    .sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));

  if (todoTasks.length === 0) return null;

  const firstTask = todoTasks[0];
  const response = await fetch(`${getBase()}/api/app?path=arena&op=run-agent`, {
    method: 'POST',
    headers: await getHeaders(),
    // The server derives the job, goal, agent, brief, and tool grants from the
    // owned task row. Never forward the caller's agent/tool context into the
    // service-role worker boundary.
    body: JSON.stringify({ task_id: firstTask.id, mode: 'mirror' }),
  });
  const queued = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(queued.error || 'Failed to start task execution');
  const result = await waitForJobResult(queued, 120000);

  return result;
}

// ── Full pipeline orchestrator ──────────────────────────────
/**
 * Run the full pipeline: Request → Job → Agent → Tasks → Execute.
 * Called after handleSmartCreate saves a request.
 *
 * @param {object} request — saved request object
 * @param {Array} agents — available agents
 * @param {Array} [perfMetrics=[]] — performance metrics
 * @param {Function} [onProgress] — optional callback for progress updates
 * @returns {Promise<{ job: object, assignment: object|null, tasks: Array, cost: number }>}
 */
export async function runPipeline(request, agents = [], perfMetrics = [], onProgress) {
  let totalCost = 0;

  try {
    // Bridge 1: Request → Job
    onProgress?.('Creating job from request...');
    const job = await requestToJob(request);

    // Bridge 2: Assign agent
    let assignment = null;
    if (agents.length > 0) {
      onProgress?.('Selecting best agent...');
      assignment = await assignAgentToJob(job, agents, perfMetrics);
      if (assignment) {
        job.assignedAgentId = assignment.agent.id || assignment.agent.agent_id;
        job.assignedAgentName = assignment.agent.role || assignment.agent.name || '';
      }
    }

    // Bridge 3: Generate tasks (agent plans its own work if assigned)
    onProgress?.('Generating tasks...');
    const { tasks, llmCost } = await generateTasksForJob(job, assignment?.agent);
    totalCost += llmCost;

    // Track cost on job
    if (totalCost > 0) {
      await addJobCost(job.id, totalCost);
    }

    // Bridge 5: Execute tasks (waterfall — first task triggers the rest)
    if (tasks.length > 0) {
      onProgress?.('Executing tasks...');
      const agentContext = assignment
        ? {
            role: assignment.agent.role || assignment.agent.name || '',
            name: assignment.agent.name || '',
            capabilities: assignment.agent.capabilities || [],
            system_prompt: assignment.agent.system_prompt || null,
          }
        : {};
      await executeJobTasks(job.id, tasks, agentContext, job.description, job.requirements);
    }

    // Update request as completed
    await updateRequest(request.id, { status: 'completed' });

    onProgress?.('Pipeline complete!');
    return { job, assignment, tasks, cost: totalCost };
  } catch (err) {
    // Persist error to request so user can see what failed
    await updateRequest(request.id, {
      status: 'failed',
      processingNotes: `Pipeline failed: ${err.message || 'Unknown error'}`,
    }).catch(() => {}); // don't mask original error
    throw err; // re-throw so caller knows
  }
}

/**
 * Estimate pipeline cost before execution.
 * Returns tier, model, estimated tasks, and cost range.
 */
export function estimatePipelineCost(request) {
  const MODEL_COSTS = {
    'llama-3.1-8b-instant': 0.0001,
    'deepseek-chat': 0.0003,
    'claude-sonnet-5': 0.003,
  };

  const { model } = selectModelForTask({
    description: request.parsedTitle || request.requestText || '',
    requirements: request.parsedRequirements || '',
    priority: request.parsedPriority || 'medium',
  });

  const costPerCall = MODEL_COSTS[model] || 0.001;

  let tier = 'complex';
  if (model === 'llama-3.1-8b-instant') tier = 'simple';
  else if (model === 'deepseek-chat') tier = 'standard';

  const TASK_COUNTS = { simple: 3, standard: 5, complex: 7 };
  const estimatedTasks = TASK_COUNTS[tier];

  return {
    tier,
    model,
    estimatedTasks,
    costPerTask: costPerCall,
    estimatedTotalCost: costPerCall * (1 + estimatedTasks),
    costRange: {
      min: costPerCall * 4,
      max: costPerCall * 8,
    },
  };
}
