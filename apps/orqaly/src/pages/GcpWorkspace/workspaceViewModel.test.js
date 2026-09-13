import { describe, expect, it } from 'vitest';
import {
  activityItems,
  attentionItems,
  normalizeDelegatedAgents,
  normalizeOverview,
  normalizeWorkspace,
  overviewMetrics,
  resultItems,
  threadHref,
  workflowHref,
  workspaceName,
} from './workspaceViewModel.js';

const RUN_ID = '10000000-0000-4000-8000-000000000001';

function overviewResponse() {
  return {
    counts: { total: 7, active: 2, awaitingApproval: 1, completed: 4, attention: 1 },
    workflows: [
      {
        id: RUN_ID,
        title: 'Prepare launch evidence',
        mode: 'advanced',
        status: 'awaiting_gate_1',
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: '2026-09-01T09:00:00.000Z',
        evidenceReadiness: null,
        progress: { completedStages: 1, totalStages: 8 },
        pendingApproval: 'scope',
        finalArtifact: null,
      },
    ],
    results: [
      {
        runId: '20000000-0000-4000-8000-000000000002',
        title: 'Completed market brief',
        status: 'completed',
        completedAt: '2026-09-01T07:00:00.000Z',
        evidenceReadiness: 'ready',
        artifact: {
          artifactId: '30000000-0000-4000-8000-000000000003',
          artifactHash: 'a'.repeat(64),
          kind: 'final_markdown',
        },
      },
    ],
    notifications: [
      {
        id: `${RUN_ID}:awaiting_gate_1`,
        kind: 'approval_required',
        severity: 'action',
        title: 'Scope approval required',
        message: 'Prepare launch evidence is waiting for scope approval.',
        runId: RUN_ID,
        occurredAt: '2026-09-01T09:00:00.000Z',
      },
    ],
  };
}

describe('GCP workspace view model', () => {
  it('normalizes the GCP overview contract and respects server-side totals', () => {
    const overview = normalizeOverview({
      ...overviewResponse(),
      threads: [{ id: 'thread-1', title: 'Launch chat' }],
    });

    expect(overview.workflows[0].run).toMatchObject({
      id: RUN_ID,
      title: 'Prepare launch evidence',
    });
    expect(overviewMetrics(overview)).toEqual({
      conversations: 1,
      goals: 7,
      active: 2,
      approvals: 1,
      completed: 4,
    });
  });

  it('maps the GCP workspace projection without leaking an identity dependency', () => {
    const workspace = normalizeWorkspace({
      workspace: {
        displayName: 'Personal workspace',
        status: 'active',
        agentCount: 2,
        activeAgentCount: 1,
        capabilityCount: 2,
        toolCount: 3,
      },
      agents: [
        {
          id: 'agent-1',
          name: 'Research lead',
          status: 'active',
          capabilities: ['research', 'evidence_synthesis'],
          toolIds: ['search'],
        },
      ],
      capabilities: [
        { name: 'research', agentCount: 1 },
        { name: 'evidence_synthesis', agentCount: 1 },
      ],
    });

    expect(workspaceName(workspace)).toBe('Personal workspace');
    expect(workspace.tenantBound).toBe(true);
    expect(workspace.agents).toHaveLength(1);
    expect(workspace.capabilities).toEqual([
      { id: 'research', label: 'Research', description: '', agentCount: 1 },
      {
        id: 'evidence_synthesis',
        label: 'Evidence synthesis',
        description: '',
        agentCount: 1,
      },
    ]);
  });

  it('normalizes delegated Agent identity, lifetime, runtime, and memory contracts', () => {
    const agents = normalizeDelegatedAgents({
      agents: [
        {
          agentId: 'agent-1',
          workflowRunId: RUN_ID,
          assistantThreadId: 'thread-1',
          objective: 'Prepare launch evidence',
          lifecycle: 'digital_twin',
          workflowStatus: 'running',
          persona: 'task_executor',
          memory: 'thread_and_goal',
          executionRuntime: 'orqaly_workflow_v2',
          tool_execution: 'not_configured',
        },
      ],
    });

    expect(agents).toEqual([
      expect.objectContaining({
        id: 'agent-1',
        runId: RUN_ID,
        threadId: 'thread-1',
        task: 'Prepare launch evidence',
        lifetime: 'persistent',
        status: 'running',
        executorPersona: { kind: 'task_executor', label: 'Task executor' },
        memoryScope: { kind: 'thread_and_goal', label: 'Thread and goal' },
        runtime: { kind: 'orqaly_workflow_v2', label: 'Orqaly workflow v2' },
        toolExecution: { kind: 'not_configured', label: 'Not configured' },
      }),
    ]);
  });

  it('normalizes the first-class control-plane Agent profile and lifecycle', () => {
    const [agent] = normalizeDelegatedAgents({
      agents: [
        {
          id: 'agent-profile-1',
          agentKind: 'persistent',
          state: 'paused',
          version: 4,
          createdFrom: 'manual',
          sourceTaskId: null,
          originating_run_id: 'run-origin-1',
          workflow_run_id: RUN_ID,
          runCount: 3,
          currentProfile: {
            versionNumber: 2,
            contentHash: 'b'.repeat(64),
            profile: {
              version: 'orqaly_agent_profile_input_v1',
              displayName: 'Mara Ops',
              roleLabel: 'Operations lead',
              description: 'Owns recurring operational work.',
              instructions: 'Keep task memory isolated and stop at external-effect approval.',
              avatar: { kind: 'emoji', value: '🤖', color: '#3559E0' },
            },
          },
          createdAt: '2026-09-03T08:00:00.000Z',
          updatedAt: '2026-09-04T09:00:00.000Z',
        },
      ],
    });

    expect(agent).toMatchObject({
      id: 'agent-profile-1',
      name: 'Mara Ops',
      role: 'Operations lead',
      description: 'Owns recurring operational work.',
      instructions: 'Keep task memory isolated and stop at external-effect approval.',
      avatar: { kind: 'emoji', value: '🤖', color: '#3559E0' },
      lifetime: 'persistent',
      status: 'paused',
      version: 4,
      profileVersion: 2,
      profileHash: 'b'.repeat(64),
      createdFrom: 'manual',
      sourceTaskId: null,
      originatingRunId: 'run-origin-1',
      workflowRunId: RUN_ID,
      runId: RUN_ID,
      runCount: 3,
    });
  });

  it('does not duplicate a server notification with its workflow-derived fallback', () => {
    const attention = attentionItems(normalizeOverview(overviewResponse()));
    expect(attention).toHaveLength(1);
    expect(attention[0]).toMatchObject({
      title: 'Scope approval required',
      status: 'awaiting_approval',
      href: `/goals?run=${RUN_ID}`,
      at: '2026-09-01T09:00:00.000Z',
    });
  });

  it('normalizes result and activity projections into navigable records', () => {
    const overview = normalizeOverview({
      ...overviewResponse(),
      activity: [
        {
          id: 'event-1',
          runId: RUN_ID,
          workflowTitle: 'Prepare launch evidence',
          kind: 'stage_completed',
          label: 'Research completed',
          occurredAt: '2026-09-01T08:30:00.000Z',
        },
      ],
    });

    expect(resultItems(overview)[0].run).toMatchObject({
      title: 'Completed market brief',
      status: 'completed',
    });
    expect(activityItems(overview)).toEqual([
      expect.objectContaining({
        title: 'Prepare launch evidence',
        description: 'Research completed',
        href: `/goals?run=${RUN_ID}`,
      }),
    ]);
    expect(workflowHref(overview.workflows[0])).toBe(`/goals?run=${RUN_ID}`);
    expect(threadHref({ id: 'thread 1' })).toBe('/assistant?thread=thread%201');
  });
});
