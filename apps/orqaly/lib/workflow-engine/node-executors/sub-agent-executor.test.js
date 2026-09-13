import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));
vi.mock('../../goal-handlers/_helpers.js', () => ({
  deterministicAgentJobId: vi.fn(() => 'deterministic-sub-agent-job'),
  enqueueAgentJob: vi.fn(),
}));
vi.mock('../../security/user-quotas.js', () => ({
  checkQuotas: vi.fn(async () => ({ allowed: true })),
}));

import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { deterministicAgentJobId, enqueueAgentJob } from '../../goal-handlers/_helpers.js';
import { checkQuotas } from '../../security/user-quotas.js';
import { executeSubAgent } from './sub-agent-executor.js';

function adminWithBlueprint(blueprint = {}) {
  const filters = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column, value) => {
      filters.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: 'blueprint-1',
        name: 'Researcher',
        description: 'Research specialist',
        category: 'research',
        system_prompt: 'Use the owned research playbook.',
        provider: 'google',
        model: 'gemini-2.5-pro',
        ...blueprint,
      },
      error: null,
    })),
  };
  return { from: vi.fn(() => query), filters };
}

describe('sub-agent durable enqueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the exact queued id and carries workflow/goal pickup context', async () => {
    const admin = adminWithBlueprint();
    buildSupabaseAdminClient.mockReturnValue(admin);
    enqueueAgentJob.mockResolvedValue({ id: 'exact-job-id', status: 'queued' });

    const result = await executeSubAgent(
      { blueprint_id: 'blueprint-1' },
      { prompt: 'Research this market' },
      {
        executionId: 'execution-1',
        currentNodeId: 'node-7',
        userId: 'user-1',
        triggerData: { goalId: 'goal-1' },
      }
    );

    expect(admin.from).toHaveBeenCalledWith('agent_blueprints');
    expect(admin.filters).toEqual([
      ['id', 'blueprint-1'],
      ['user_id', 'user-1'],
    ]);
    expect(deterministicAgentJobId).toHaveBeenCalledWith('workflow-sub-agent', {
      userId: 'user-1',
      executionId: 'execution-1',
      nodeId: 'node-7',
      blueprintId: 'blueprint-1',
    });
    expect(enqueueAgentJob).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        id: 'deterministic-sub-agent-job',
        user_id: 'user-1',
        payload: expect.objectContaining({
          type: 'agent',
          userId: 'user-1',
          _userId: 'user-1',
          user_id: 'user-1',
          agentId: 'blueprint-1',
          task: 'Research this market',
          context: { prompt: 'Research this market' },
          goalId: 'goal-1',
          parent_execution_id: 'execution-1',
          parent_node_id: 'node-7',
          agentContext: {
            id: 'blueprint-1',
            _agentId: 'blueprint-1',
            _userId: 'user-1',
            blueprint_id: 'blueprint-1',
            name: 'Researcher',
            role: 'research',
            description: 'Research specialist',
            system_prompt: 'Use the owned research playbook.',
          },
        }),
      }),
      { idempotent: true }
    );
    expect(enqueueAgentJob.mock.calls[0][1]).not.toHaveProperty('type');
    expect(result).toMatchObject({
      outputPort: 'out',
      output: { status: 'queued', job_id: 'exact-job-id' },
    });
  });

  it('returns an error instead of acknowledging a job rejected by the durable producer', async () => {
    buildSupabaseAdminClient.mockReturnValue(adminWithBlueprint());
    enqueueAgentJob.mockRejectedValue(new Error('Preview exact worker trigger is unavailable'));

    const result = await executeSubAgent(
      { blueprint_id: 'blueprint-1' },
      {},
      { executionId: 'execution-1', currentNodeId: 'node-7', userId: 'user-1' }
    );

    expect(result).toEqual({
      output: { error: 'Preview exact worker trigger is unavailable' },
      outputPort: 'error',
    });
  });

  it('rejects an over-quota delegated child before durable enqueue', async () => {
    buildSupabaseAdminClient.mockReturnValue(adminWithBlueprint());
    checkQuotas.mockResolvedValueOnce({
      allowed: false,
      code: 'QUOTA_JOBS_PER_HOUR',
      message: 'Hourly job limit reached',
    });

    const result = await executeSubAgent(
      { blueprint_id: 'blueprint-1' },
      {},
      { executionId: 'execution-1', currentNodeId: 'node-7', userId: 'user-1' }
    );

    expect(checkQuotas).toHaveBeenCalledWith(expect.any(Object), 'user-1', {
      jobType: 'agent',
    });
    expect(result).toEqual({
      output: {
        error: 'Hourly job limit reached',
        code: 'QUOTA_JOBS_PER_HOUR',
      },
      outputPort: 'error',
    });
    expect(enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('rejects execution without a workflow owner before using the service-role client', async () => {
    const result = await executeSubAgent({ blueprint_id: 'blueprint-1' }, {}, {});

    expect(result).toEqual({
      output: { error: 'userId is required to execute a sub-agent' },
      outputPort: 'error',
    });
    expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
    expect(enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('always supplies a nonempty delegated task while preserving the complete input as context', async () => {
    const admin = adminWithBlueprint();
    buildSupabaseAdminClient.mockReturnValue(admin);
    enqueueAgentJob.mockResolvedValue({ id: 'fallback-task-job', status: 'queued' });
    const input = { rows: [{ id: 1 }], nested: { source: 'upstream' } };

    await executeSubAgent({ blueprint_id: 'blueprint-1' }, input, {
      executionId: 'execution-1',
      currentNodeId: 'node-7',
      userId: 'user-1',
    });

    expect(enqueueAgentJob.mock.calls[0][1].payload).toMatchObject({
      task: 'Complete the delegated workflow step as Researcher.',
      context: input,
    });
  });
});
