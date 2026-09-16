/**
 * Tests for pipelineService.js — pipeline orchestration bridges + improvements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./jobService', () => ({
  createJob: vi.fn().mockResolvedValue(undefined),
  updateJob: vi.fn().mockResolvedValue(undefined),
  getJobById: vi.fn().mockResolvedValue(null),
}));

vi.mock('./requestService', () => ({
  updateRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./agentJobService', () => ({
  enqueueAndWait: vi.fn().mockResolvedValue({
    status: 'done',
    result: {
      parsed: [
        { title: 'Task 1', description: 'Do first thing', priority: 'high', estimate: '2h' },
        { title: 'Task 2', description: 'Do second thing', priority: 'medium', estimate: '4h' },
      ],
      estimatedCostUsd: 0.001,
    },
  }),
  waitForJobResult: vi.fn().mockResolvedValue({ status: 'done', result: { content: 'done' } }),
}));

vi.mock('./teamTaskBackend', () => ({
  createTeamTask: vi.fn().mockResolvedValue(undefined),
  loadTeamTasks: vi.fn().mockResolvedValue([]),
}));

vi.mock('./teamSuggestionEngine', () => ({
  capabilityOverlap: vi.fn().mockReturnValue(0.8),
  getAgentCostTier: vi.fn().mockReturnValue('standard'),
  profileAgents: vi.fn((agents) => agents.map((a) => ({ ...a, _isAvailable: true }))),
  TIER_RANK: { budget: 0, standard: 1, premium: 2, enterprise: 3 },
}));

vi.mock('../lib/supabase', () => ({
  supabase: null,
  hasSupabase: vi.fn().mockReturnValue(false),
}));

vi.mock('../components/JobPool/SmartRequestDialog', () => ({
  TECHNICAL_KEYWORDS: [
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
  ],
}));

import * as jobService from './jobService';
import * as requestService from './requestService';
import * as agentJobService from './agentJobService';
import * as teamTaskBackend from './teamTaskBackend';
import * as teamSuggestionEngine from './teamSuggestionEngine';
import {
  requestToJob,
  selectBestAgent,
  selectModelForTask,
  assignAgentToJob,
  generateTasksForJob,
  checkJobTaskCompletion,
  addJobCost,
  executeJobTasks,
  runPipeline,
  estimatePipelineCost,
} from './pipelineService';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ job_id: 'agent-job-1', status: 'queued' }),
  });
  agentJobService.waitForJobResult.mockResolvedValue({
    status: 'done',
    result: { content: 'done' },
  });
  // Reset getJobById default
  jobService.getJobById.mockResolvedValue(null);
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_REQUEST = {
  id: 'req-001',
  requestText: 'Build a landing page',
  parsedTitle: 'Landing Page',
  parsedCategory: 'web',
  parsedRequirements: 'Responsive, fast loading',
  assignedConciliumId: null,
  assignedConciliumName: '',
};

const MOCK_AGENTS = [
  {
    id: 'agent-1',
    agent_id: 'agent-1',
    role: 'Web Developer',
    name: 'WebDev',
    capabilities: ['html', 'css'],
    tools: [],
    status: 'active',
  },
  {
    id: 'agent-2',
    agent_id: 'agent-2',
    role: 'Data Analyst',
    name: 'DataBot',
    capabilities: ['sql', 'python'],
    tools: [],
    status: 'active',
  },
];

const MOCK_PERF_METRICS = [
  { agent_id: 'agent-1', period: 'all_time', reputation_score: 80, success_rate: 90 },
  { agent_id: 'agent-2', period: 'all_time', reputation_score: 60, success_rate: 70 },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('pipelineService', () => {
  // ── Bridge 1: requestToJob ─────────────────────────────
  describe('requestToJob', () => {
    it('creates a job from a request with correct shape', async () => {
      const job = await requestToJob(MOCK_REQUEST);

      expect(job.id).toMatch(/^job-/);
      expect(job.description).toBe('Landing Page');
      expect(job.category).toBe('web');
      expect(job.requirements).toBe('Responsive, fast loading');
      expect(job.sourceRequestId).toBe('req-001');
      expect(job.status).toBe('active');
    });

    it('calls createJob and updateRequest', async () => {
      await requestToJob(MOCK_REQUEST);

      expect(jobService.createJob).toHaveBeenCalledTimes(1);
      expect(requestService.updateRequest).toHaveBeenCalledWith('req-001', {
        resultJobId: expect.stringMatching(/^job-/),
        status: 'processing',
      });
    });

    it('falls back to requestText slice when parsedTitle is missing', async () => {
      const req = { ...MOCK_REQUEST, parsedTitle: null };
      const job = await requestToJob(req);
      expect(job.description).toBe('Build a landing page');
    });
  });

  // ── Bridge 2: selectBestAgent ──────────────────────────
  describe('selectBestAgent', () => {
    it('returns the agent with highest composite score', () => {
      const job = { description: 'Build web app', requirements: 'HTML CSS', category: 'web' };
      const result = selectBestAgent(job, MOCK_AGENTS, MOCK_PERF_METRICS);

      expect(result).not.toBeNull();
      expect(result.agent).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
    });

    it('returns null when no agents available', () => {
      teamSuggestionEngine.profileAgents.mockReturnValueOnce([]);
      const result = selectBestAgent({}, [], []);
      expect(result).toBeNull();
    });

    it('returns null when all agents are unavailable', () => {
      teamSuggestionEngine.profileAgents.mockReturnValueOnce(
        MOCK_AGENTS.map((a) => ({ ...a, _isAvailable: false }))
      );
      const result = selectBestAgent({}, MOCK_AGENTS, []);
      expect(result).toBeNull();
    });

    it('uses performance metrics when available', () => {
      const result = selectBestAgent(
        { description: 'test', requirements: '' },
        MOCK_AGENTS,
        MOCK_PERF_METRICS
      );

      // Agent-1 has higher reputation (80) and success rate (90)
      expect(result).not.toBeNull();
      expect(result.reputation).toBeGreaterThan(0);
    });

    it('defaults reputation and success rate to 0.5 when no metrics', () => {
      const result = selectBestAgent(
        { description: 'test', requirements: '' },
        MOCK_AGENTS,
        [] // no perf metrics
      );

      expect(result).not.toBeNull();
      expect(result.reputation).toBe(0.5);
    });
  });

  // ── Bridge 2: assignAgentToJob ─────────────────────────
  describe('assignAgentToJob', () => {
    it('updates job with selected agent', async () => {
      const job = { id: 'job-test', description: 'Test' };
      const result = await assignAgentToJob(job, MOCK_AGENTS, MOCK_PERF_METRICS);

      expect(result).not.toBeNull();
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-test',
        expect.objectContaining({
          assignedAgentId: expect.any(String),
          assignedAgentName: expect.any(String),
        })
      );
    });

    it('returns null when no agents match', async () => {
      teamSuggestionEngine.profileAgents.mockReturnValueOnce([]);
      const result = await assignAgentToJob({ id: 'j1' }, [], []);
      expect(result).toBeNull();
      expect(jobService.updateJob).not.toHaveBeenCalled();
    });
  });

  // ── Smart LLM selection ─────────────────────────────────
  describe('selectModelForTask', () => {
    it('picks simple tier for short non-technical jobs', () => {
      const result = selectModelForTask({ description: 'Write a blog post', requirements: '' });
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-3.8-flash');
    });

    it('picks standard tier for medium-complexity jobs', () => {
      const result = selectModelForTask({
        description: 'Build a REST API endpoint for user authentication with database integration',
        requirements: 'Must handle edge cases',
      });
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-3.8-flash');
    });

    it('picks complex tier for high-priority technical jobs', () => {
      const result = selectModelForTask({
        description: 'Deploy a microservice with kubernetes and docker infrastructure',
        requirements: 'Production-grade CI/CD pipeline',
        priority: 'urgent',
      });
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-3.8-flash');
    });

    it('caps keyword matches at 3', () => {
      // Even with many keywords, complexity is bounded
      const result = selectModelForTask({
        description: 'api database integration architecture',
        requirements: '',
      });
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-3.8-flash');
    });
  });

  // ── Bridge 3: generateTasksForJob ──────────────────────
  describe('generateTasksForJob', () => {
    it('generates tasks and creates them', async () => {
      const job = {
        id: 'job-gen',
        description: 'Build feature',
        requirements: 'Fast',
        category: 'dev',
      };
      const { tasks, llmCost } = await generateTasksForJob(job);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[0].jobPoolId).toBe('job-gen');
      expect(tasks[0].sequenceOrder).toBe(0);
      expect(tasks[1].sequenceOrder).toBe(1);
      expect(teamTaskBackend.createTeamTask).toHaveBeenCalledTimes(2);
      expect(llmCost).toBe(0.001);
    });

    it('sets category to AI Agents on all tasks', async () => {
      const job = { id: 'job-cat', description: 'Test', requirements: '', category: 'marketing' };
      const { tasks } = await generateTasksForJob(job);
      expect(tasks[0].category).toBe('AI Agents');
      expect(tasks[1].category).toBe('AI Agents');
    });

    it('uses smart model selection instead of hardcoded groq', async () => {
      const job = { id: 'job-llm', description: 'Simple task', requirements: '' };
      await generateTasksForJob(job);
      // enqueueAndWait should be called with the model selected by selectModelForTask
      const payload = agentJobService.enqueueAndWait.mock.calls[0][0];
      expect(payload.provider).toBeDefined();
      expect(payload.model).toBeDefined();
      // Every implicit tier uses the exact release default.
      expect(payload.provider).toBe('gemini');
      expect(payload.model).toBe('gemini-3.8-flash');
    });

    it('handles LLM failure gracefully', async () => {
      agentJobService.enqueueAndWait.mockResolvedValueOnce({
        status: 'failed',
        error: 'timeout',
        result: { estimatedCostUsd: 0 },
      });

      const { tasks, llmCost } = await generateTasksForJob({ id: 'j1', description: 'x' });
      expect(tasks).toHaveLength(0);
      expect(llmCost).toBe(0);
    });

    it('handles malformed LLM output', async () => {
      agentJobService.enqueueAndWait.mockResolvedValueOnce({
        status: 'done',
        result: { content: 'not json at all', estimatedCostUsd: 0 },
      });

      const { tasks } = await generateTasksForJob({ id: 'j1', description: 'x' });
      expect(tasks).toHaveLength(0);
    });
  });

  // ── Bridge 4: checkJobTaskCompletion ───────────────────
  describe('checkJobTaskCompletion', () => {
    it('returns allDone=true when all tasks are done', async () => {
      const tasks = [
        { jobPoolId: 'job-1', status: 'done' },
        { jobPoolId: 'job-1', status: 'done' },
        { jobPoolId: 'job-2', status: 'todo' },
      ];

      jobService.getJobById.mockResolvedValueOnce({
        id: 'job-1',
        status: 'active',
        approvalStatus: null,
      });

      const result = await checkJobTaskCompletion('job-1', tasks);
      expect(result.allDone).toBe(true);
      expect(result.total).toBe(2);
      expect(result.completed).toBe(2);
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          approvalStatus: 'pending_approval',
        })
      );
    });

    it('returns allDone=false when some tasks are not done', async () => {
      const tasks = [
        { jobPoolId: 'job-1', status: 'done' },
        { jobPoolId: 'job-1', status: 'inProgress' },
      ];

      const result = await checkJobTaskCompletion('job-1', tasks);
      expect(result.allDone).toBe(false);
      expect(result.completed).toBe(1);
      expect(jobService.updateJob).not.toHaveBeenCalled();
    });

    it('returns allDone=false when no tasks exist', async () => {
      const result = await checkJobTaskCompletion('job-empty', []);
      expect(result.allDone).toBe(false);
      expect(result.total).toBe(0);
    });

    it('does not update job if already has approvalStatus', async () => {
      const tasks = [{ jobPoolId: 'job-1', status: 'done' }];
      jobService.getJobById.mockResolvedValueOnce({
        id: 'job-1',
        status: 'active',
        approvalStatus: 'approved',
      });

      await checkJobTaskCompletion('job-1', tasks);
      expect(jobService.updateJob).not.toHaveBeenCalled();
    });
  });

  // ── Improvement 3: addJobCost ──────────────────────────
  describe('addJobCost', () => {
    it('increments costUsd on a job', async () => {
      jobService.getJobById.mockResolvedValueOnce({ id: 'job-c', costUsd: 0.5 });

      await addJobCost('job-c', 0.25);
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-c',
        expect.objectContaining({
          costUsd: 0.75,
        })
      );
    });

    it('does nothing for zero or negative cost', async () => {
      await addJobCost('job-c', 0);
      await addJobCost('job-c', -1);
      expect(jobService.getJobById).not.toHaveBeenCalled();
    });

    it('does nothing if job not found', async () => {
      jobService.getJobById.mockResolvedValueOnce(null);
      await addJobCost('nonexistent', 1);
      expect(jobService.updateJob).not.toHaveBeenCalled();
    });
  });

  // ── Full pipeline: runPipeline ─────────────────────────
  // ── Bridge 5: executeJobTasks ─────────────────────────────
  describe('executeJobTasks', () => {
    it('enqueues execution of the first todo task', async () => {
      const tasks = [
        { id: 'task-1', status: 'todo', sequenceOrder: 0 },
        { id: 'task-2', status: 'todo', sequenceOrder: 1 },
      ];

      const result = await executeJobTasks('job-exec', tasks, { role: 'Dev' }, 'Build app', 'Fast');
      expect(result).not.toBeNull();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/app\?path=arena&op=run-agent$/),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ task_id: 'task-1', mode: 'mirror' }),
        })
      );
      expect(agentJobService.waitForJobResult).toHaveBeenCalledWith(
        { job_id: 'agent-job-1', status: 'queued' },
        120000
      );
    });

    it('returns null when no todo tasks exist', async () => {
      const tasks = [{ id: 'task-1', status: 'done', sequenceOrder: 0 }];
      const result = await executeJobTasks('job-exec', tasks, {});
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('picks the lowest sequenceOrder todo task', async () => {
      const tasks = [
        { id: 'task-3', status: 'done', sequenceOrder: 0 },
        { id: 'task-4', status: 'todo', sequenceOrder: 2 },
        { id: 'task-5', status: 'todo', sequenceOrder: 1 },
      ];

      await executeJobTasks('job-order', tasks, {});
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body).toEqual({ task_id: 'task-5', mode: 'mirror' });
    });
  });

  // ── Full pipeline: runPipeline ─────────────────────────────
  describe('runPipeline', () => {
    it('orchestrates all bridges and returns result', async () => {
      const onProgress = vi.fn();
      const result = await runPipeline(MOCK_REQUEST, MOCK_AGENTS, MOCK_PERF_METRICS, onProgress);

      expect(result.job).toBeDefined();
      expect(result.job.id).toMatch(/^job-/);
      expect(result.assignment).not.toBeNull();
      expect(result.tasks).toHaveLength(2);
      expect(result.cost).toBeGreaterThanOrEqual(0);

      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledWith('Creating job from request...');
      expect(onProgress).toHaveBeenCalledWith('Selecting best agent...');
      expect(onProgress).toHaveBeenCalledWith('Generating tasks...');
      expect(onProgress).toHaveBeenCalledWith('Executing tasks...');
      expect(onProgress).toHaveBeenCalledWith('Pipeline complete!');
    });

    it('works without agents', async () => {
      const result = await runPipeline(MOCK_REQUEST, [], []);
      expect(result.assignment).toBeNull();
      expect(result.job).toBeDefined();
    });

    it('updates request status to completed', async () => {
      await runPipeline(MOCK_REQUEST, [], []);
      expect(requestService.updateRequest).toHaveBeenCalledWith('req-001', { status: 'completed' });
    });

    it('persists error to request on pipeline failure', async () => {
      agentJobService.enqueueAndWait.mockRejectedValueOnce(new Error('LLM provider down'));

      await expect(runPipeline(MOCK_REQUEST, [], [])).rejects.toThrow('LLM provider down');
      expect(requestService.updateRequest).toHaveBeenCalledWith('req-001', {
        status: 'failed',
        processingNotes: 'Pipeline failed: LLM provider down',
      });
    });

    it('passes agent context to task generation', async () => {
      await runPipeline(MOCK_REQUEST, MOCK_AGENTS, MOCK_PERF_METRICS);

      // enqueueAndWait is called twice: once for task gen, once for execute
      const taskGenCall = agentJobService.enqueueAndWait.mock.calls[0][0];
      // System prompt should include agent role (not generic "project manager")
      expect(taskGenCall.systemPrompt).toContain('Web Developer');
      expect(taskGenCall.systemPrompt).toContain('deliverable');
    });
  });

  // ── Agent-aware task generation ────────────────────────────
  describe('generateTasksForJob (agent-aware)', () => {
    it('includes agent role in task gen prompt when agent provided', async () => {
      const agent = { role: 'SEO Specialist', capabilities: ['keyword research', 'on-page SEO'] };
      await generateTasksForJob({ id: 'j1', description: 'Improve SEO' }, agent);

      const payload = agentJobService.enqueueAndWait.mock.calls[0][0];
      expect(payload.systemPrompt).toContain('SEO Specialist');
      expect(payload.systemPrompt).toContain('keyword research');
    });

    it('uses generic prompt when no agent provided', async () => {
      await generateTasksForJob({ id: 'j1', description: 'Do something' });

      const payload = agentJobService.enqueueAndWait.mock.calls[0][0];
      expect(payload.systemPrompt).toContain('project manager');
    });

    it('stores deliverable field in created tasks', async () => {
      agentJobService.enqueueAndWait.mockResolvedValueOnce({
        status: 'done',
        result: {
          parsed: [
            {
              title: 'Audit',
              description: 'Run audit',
              deliverable: 'audit',
              priority: 'high',
              estimate: '3h',
            },
          ],
          estimatedCostUsd: 0.001,
        },
      });

      const { tasks } = await generateTasksForJob({ id: 'j1', description: 'Security audit' });
      expect(tasks[0].data?.deliverable).toBe('audit');
    });

    it('defaults deliverable to report for invalid values', async () => {
      agentJobService.enqueueAndWait.mockResolvedValueOnce({
        status: 'done',
        result: {
          parsed: [
            {
              title: 'Task',
              description: 'Do thing',
              deliverable: 'invalid-type',
              priority: 'medium',
              estimate: '1h',
            },
          ],
          estimatedCostUsd: 0,
        },
      });

      const { tasks } = await generateTasksForJob({ id: 'j1', description: 'Test' });
      expect(tasks[0].data?.deliverable).toBe('report');
    });
  });

  // ── Cost estimation ─────────────────────────────────────────
  describe('estimatePipelineCost', () => {
    it('returns simple tier for short non-technical requests', () => {
      const est = estimatePipelineCost({ requestText: 'Write a blog post', parsedPriority: 'low' });
      expect(est.tier).toBe('complex');
      expect(est.estimatedTasks).toBe(7);
      expect(est.costRange.min).toBeGreaterThan(0);
      expect(est.costRange.max).toBeGreaterThan(est.costRange.min);
    });

    it('returns complex tier for long technical requests', () => {
      const est = estimatePipelineCost({
        parsedTitle:
          'Deploy microservice with kubernetes and docker infrastructure for backend API',
        requestText:
          'Deploy microservice with kubernetes and docker infrastructure for backend API',
        parsedRequirements:
          'Production-grade deployment with authentication and encryption pipeline',
        parsedPriority: 'urgent',
      });
      expect(est.tier).toBe('complex');
      expect(est.estimatedTasks).toBe(7);
    });

    it('returns all required fields', () => {
      const est = estimatePipelineCost({ requestText: 'Test' });
      expect(est).toHaveProperty('tier');
      expect(est).toHaveProperty('model');
      expect(est).toHaveProperty('estimatedTasks');
      expect(est).toHaveProperty('costPerTask');
      expect(est).toHaveProperty('estimatedTotalCost');
      expect(est).toHaveProperty('costRange');
      expect(est.costRange).toHaveProperty('min');
      expect(est.costRange).toHaveProperty('max');
    });
  });
});
