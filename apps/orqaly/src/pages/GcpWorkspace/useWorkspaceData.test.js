import { describe, expect, it, vi } from 'vitest';
import {
  loadActivityResource,
  loadDelegatedAgentsResource,
  loadOverviewResource,
  loadWorkspaceResource,
} from './useWorkspaceData.js';

describe('GCP workspace resource loaders', () => {
  it('loads the new overview and durable Assistant history in parallel', async () => {
    const client = {
      overview: vi.fn().mockResolvedValue({
        counts: { total: 1, active: 1, awaitingApproval: 0, completed: 0, attention: 0 },
        workflows: [{ id: 'run-1', title: 'Run one', status: 'running' }],
      }),
      assistantThreads: vi
        .fn()
        .mockResolvedValue({ threads: [{ id: 'thread-1', title: 'Thread one' }] }),
    };

    const overview = await loadOverviewResource(client);
    expect(client.overview).toHaveBeenCalledWith({ limit: 50 });
    expect(client.assistantThreads).toHaveBeenCalledWith({ limit: 50 });
    expect(overview.workflows[0].run.id).toBe('run-1');
    expect(overview.threads[0].id).toBe('thread-1');
  });

  it('falls back to existing workflow endpoints during a rolling API deployment', async () => {
    const client = {
      overview: vi.fn().mockRejectedValue({ status: 404 }),
      assistantThreads: vi.fn().mockResolvedValue({ threads: [{ id: 'thread-1' }] }),
      list: vi.fn().mockResolvedValue({ workflows: [{ run: { id: 'run-1' } }] }),
    };

    const overview = await loadOverviewResource(client);
    expect(client.list).toHaveBeenCalledWith({ limit: 50 });
    expect(overview.threads).toHaveLength(1);
    expect(overview.workflows).toHaveLength(1);
  });

  it('loads the GCP workspace projection and tolerates an older activity route', async () => {
    const client = {
      workspace: vi.fn().mockResolvedValue({
        workspace: { displayName: 'Personal workspace', status: 'ready' },
        agents: [],
        capabilities: [],
      }),
      activity: vi.fn().mockRejectedValue({ status: 404 }),
    };

    await expect(loadWorkspaceResource(client)).resolves.toMatchObject({
      displayName: 'Personal workspace',
      tenantBound: true,
    });
    await expect(loadActivityResource(client)).resolves.toEqual([]);
  });

  it('loads real delegated Agents and tolerates the endpoint during a rolling API deploy', async () => {
    const response = {
      agents: [
        {
          id: 'agent-1',
          runId: 'run-1',
          name: 'Launch Agent',
          lifetime: 'persistent',
          executorPersona: {
            role: 'task_executor',
            version: 'axwise_executor_persona_v1',
            provider: 'axwise',
            status: 'contract_bound',
          },
          memoryScope: { kind: 'thread_and_goal', label: 'This chat and Goal only' },
          runtime: {
            provider: 'orqaly_workflow_v2',
            label: 'Orqaly GCP + AxWise',
            isolation: 'tenant_user',
          },
        },
      ],
    };
    const currentClient = { agents: vi.fn().mockResolvedValue(response) };
    const rollingClient = { agents: vi.fn().mockRejectedValue({ status: 404 }) };

    await expect(loadDelegatedAgentsResource(currentClient)).resolves.toMatchObject([
      {
        id: 'agent-1',
        runId: 'run-1',
        lifetime: 'persistent',
        executorPersona: { kind: 'task_executor', version: 'axwise_executor_persona_v1' },
        memoryScope: { kind: 'thread_and_goal', label: 'This chat and Goal only' },
      },
    ]);
    expect(currentClient.agents).toHaveBeenCalledWith({ limit: 50 });
    await expect(loadDelegatedAgentsResource(rollingClient)).resolves.toEqual([]);
    await expect(loadDelegatedAgentsResource({})).resolves.toEqual([]);
  });
});
