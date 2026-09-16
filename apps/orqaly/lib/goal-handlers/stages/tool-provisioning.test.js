import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', async () => {
  const actual = await vi.importActual('../_helpers.js');
  return {
    ...actual,
    enqueueGoalAction: vi.fn(async () => {}),
    loadGoal: vi.fn(),
    logGoalEvent: vi.fn(async () => {}),
    notifyGoalEvent: vi.fn(async () => {}),
    reserveGoalToolProvisioningAttempt: vi.fn(async () => true),
    updateGoal: vi.fn(async () => {}),
    updateGoalIfNativeScopeBinding: vi.fn(async () => true),
    updateGoalIfToolProvisioningAttempt: vi.fn(async () => true),
    generateId: vi.fn(() => 'ntp-test-attempt'),
  };
});
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../agent-handlers/tool-credentials.js', () => ({
  resolveToolCredential: vi.fn(),
}));
vi.mock('../healing-strategies/h45-human-credential.js', () => ({
  apply: vi.fn(async () => ({ action: 'created-human-task', humanTaskId: 'human-task-1' })),
}));

import { handle } from './tool-provisioning.js';
import {
  enqueueGoalAction,
  loadGoal,
  logGoalEvent,
  reserveGoalToolProvisioningAttempt,
  updateGoal,
  updateGoalIfNativeScopeBinding,
  updateGoalIfToolProvisioningAttempt,
} from '../_helpers.js';
import { resolveToolCredential } from '../../agent-handlers/tool-credentials.js';
import { acceptedNativeGoalFixture } from '../../_shared/native-goal-authority.test-fixture.js';
import { canonicalContractHash } from '../../agent-handlers/compact-agent-contracts.js';

function goal(overrides = {}) {
  const value = {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'provisioning_tools',
    updated_at: '2026-08-24T10:00:00.000Z',
    mode: 'simple',
    title: 'Prepare a warehouse handoff checklist',
    plan: { strategy: 'Produce the operational checklist' },
    data: {
      team_formation_attempt: {
        version: 'orqaly_team_formation_attempt_v1',
        attempt_id: 'ntf-legacy-current',
        status: 'completed',
        completed_at: '2026-08-24T09:59:00.000Z',
      },
    },
    ...overrides,
  };
  value.data = {
    team_formation_attempt: {
      version: 'orqaly_team_formation_attempt_v1',
      attempt_id: 'ntf-legacy-current',
      status: 'completed',
      completed_at: '2026-08-24T09:59:00.000Z',
    },
    ...(overrides.data || {}),
  };
  return value;
}

function createAdmin({ tasks, toolRows = [], existingToolIds = [] }) {
  const inserts = [];
  const taskUpdates = [];
  const selects = [];
  const from = vi.fn((table) => {
    if (table === 'team_tasks') {
      let pendingUpdate = null;
      const query = {
        select: vi.fn((columns) => {
          selects.push({ table, columns });
          return query;
        }),
        update: vi.fn((value) => {
          pendingUpdate = value;
          return query;
        }),
        eq: vi.fn((column, value) => {
          if (pendingUpdate && column === 'id') {
            taskUpdates.push({ id: value, ...pendingUpdate });
            pendingUpdate = null;
            return Promise.resolve({ error: null });
          }
          return query;
        }),
        in: vi.fn(async () => ({ data: tasks, error: null })),
      };
      return query;
    }

    if (table === 'tools') {
      let selectedId = null;
      const query = {
        select: vi.fn((columns) => {
          selects.push({ table, columns });
          return query;
        }),
        eq: vi.fn((column, value) => {
          if (column === 'id') selectedId = value;
          return query;
        }),
        in: vi.fn(async () => ({ data: toolRows, error: null })),
        maybeSingle: vi.fn(async () => ({
          data: existingToolIds.includes(selectedId) ? { id: selectedId } : null,
          error: null,
        })),
        insert: vi.fn(async (row) => {
          inserts.push(row);
          return { data: row, error: null };
        }),
      };
      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, inserts, taskUpdates, selects };
}

beforeEach(() => {
  vi.clearAllMocks();
  reserveGoalToolProvisioningAttempt.mockResolvedValue(true);
  updateGoalIfNativeScopeBinding.mockResolvedValue(true);
  updateGoalIfToolProvisioningAttempt.mockResolvedValue(true);
});

function nativeToolGoal(overrides = {}) {
  const value = acceptedNativeGoalFixture({
    status: 'provisioning_tools',
    plan: { strategy: 'Canonical native plan', phases: [] },
    ...overrides,
  });
  const scopeHash = value.data.axwise_customer_intelligence.scope_packet.scope_hash;
  const planHash = canonicalContractHash(value.plan);
  value.data.native_planning_attempt = {
    version: 'orqaly_native_planning_attempt_v1',
    attempt_id: 'npa-current',
    scope_hash: scopeHash,
    plan_hash: planHash,
    plan_snapshot: structuredClone(value.plan),
    status: 'completed',
    completed_at: '2026-08-24T08:00:30.000Z',
  };
  value.data.native_team_formation_attempt = {
    version: 'orqaly_team_formation_attempt_v1',
    attempt_id: 'ntf-current',
    scope_hash: scopeHash,
    planning_attempt_id: 'npa-current',
    plan_hash: planHash,
    status: 'completed',
    started_at: '2026-08-24T08:01:00.000Z',
    completed_at: '2026-08-24T08:02:00.000Z',
  };
  value.data.team_formation_attempt = structuredClone(value.data.native_team_formation_attempt);
  value.data.team_work_materialization = {
    version: 'orqaly_team_work_materialization_v1',
    formation_attempt: 'ntf-current',
    native_scope_hash: scopeHash,
  };
  return value;
}

describe('tool provisioning for Simple goals', () => {
  it('ignores retained planned tasks from an older no-AxWise full retry', async () => {
    const value = goal({
      data: {
        retry_count: 2,
        goal_task_attempt: { version: 1, retry_count: 2 },
        tool_mode: 'no_tools',
      },
    });
    const admin = createAdmin({
      tasks: [
        {
          id: 'task-old',
          data: {
            goal_id: value.id,
            goal_retry_count: 1,
            tool_requirements: ['web-search'],
          },
        },
        {
          id: 'task-current',
          data: {
            goal_id: value.id,
            goal_retry_count: 2,
            tool_requirements: ['tool-doc-generator'],
          },
        },
      ],
    });
    loadGoal.mockResolvedValue(value);

    const result = await handle(admin, { goalId: value.id }, {});

    expect(result.status).toBe('tools_ready');
    expect(admin.taskUpdates).toEqual([]);
    expect(resolveToolCredential).not.toHaveBeenCalled();
  });

  it('enforces an explicit no-tools policy even when planned tasks request tools', async () => {
    const value = goal({ data: { tool_mode: 'no_tools' } });
    const admin = createAdmin({
      tasks: [
        {
          id: 'task-1',
          data: { goal_id: value.id, tool_requirements: ['web-search', 'tool-doc-generator'] },
        },
      ],
    });
    loadGoal.mockResolvedValue(value);

    const result = await handle(admin, { goalId: value.id }, {});

    expect(result.status).toBe('tools_ready');
    expect(resolveToolCredential).not.toHaveBeenCalled();
    expect(admin.taskUpdates).toEqual([]);
    expect(logGoalEvent).toHaveBeenCalledWith(admin, value.id, 'tool_policy_enforced', {
      tool_mode: 'no_tools',
      allowed: [],
      removed: ['tool-web-search', 'tool-doc-generator'],
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'discovery-estimation', value.id);
  });

  it('continues quickly when planned tasks require no tools', async () => {
    const value = goal({
      // Neither this broader analysis nor the task category may invent a tool.
      tech_doc: { tool_requirements: ['web-search'] },
    });
    const admin = createAdmin({
      tasks: [
        {
          id: 'task-1',
          title: 'Draft checklist',
          category: 'research',
          data: { tool_requirements: [] },
        },
      ],
    });
    loadGoal.mockResolvedValue(value);

    const result = await handle(admin, { goalId: value.id }, {});

    expect(result.status).toBe('tools_ready');
    expect(resolveToolCredential).not.toHaveBeenCalled();
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'discovery-estimation', value.id);
    expect(logGoalEvent).toHaveBeenCalledWith(admin, value.id, 'tools_provisioned', {
      required: [],
      unconfigured: [],
      message: 'No tools required',
    });
  });

  it('continues through estimation when an explicitly required tool is configured', async () => {
    const value = goal();
    const toolRow = {
      id: 'tool-web-search',
      data: {},
      connection_type: 'api',
      status: 'active',
    };
    const admin = createAdmin({
      tasks: [{ id: 'task-1', data: { tool_requirements: ['web-search'] } }],
      toolRows: [toolRow],
    });
    loadGoal.mockResolvedValue(value);
    resolveToolCredential.mockResolvedValue({ source: 'user', apiKey: 'redacted', ready: true });

    const result = await handle(admin, { goalId: value.id }, {});

    expect(result.status).toBe('tools_ready');
    expect(resolveToolCredential).toHaveBeenCalledWith({
      def: expect.objectContaining({ id: 'tool-web-search', connectionType: 'api' }),
      row: toolRow,
      userId: value.user_id,
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'discovery-estimation', value.id);
    expect(updateGoal).not.toHaveBeenCalledWith(
      admin,
      value.id,
      expect.objectContaining({ status: 'awaiting_tools' })
    );
  });

  it('pauses at awaiting_tools when an explicitly required external tool is missing', async () => {
    const value = goal();
    const admin = createAdmin({
      tasks: [{ id: 'task-1', data: { tool_requirements: ['web-search'] } }],
    });
    loadGoal.mockResolvedValue(value);
    resolveToolCredential.mockResolvedValue({ source: 'none', apiKey: null, ready: false });

    const result = await handle(admin, { goalId: value.id }, {});

    expect(result).toMatchObject({
      status: 'awaiting_tools',
      requiredTools: ['tool-web-search'],
      unconfiguredTools: ['tool-web-search'],
    });
    expect(updateGoalIfToolProvisioningAttempt).toHaveBeenLastCalledWith(
      admin,
      expect.objectContaining({
        id: value.id,
        status: 'provisioning_tools',
        data: expect.objectContaining({
          tool_provisioning_attempt: expect.objectContaining({
            attempt_id: 'ntp-test-attempt',
            status: 'running',
          }),
        }),
      }),
      'ntp-test-attempt',
      expect.objectContaining({
        status: 'awaiting_tools',
        data: expect.objectContaining({
          required_tools: ['tool-web-search'],
          unconfigured_tools: ['tool-web-search'],
          tool_provisioning_attempt: expect.objectContaining({ status: 'awaiting_user' }),
        }),
      })
    );
    expect(admin.inserts).toEqual([
      expect.objectContaining({
        id: 'tool-web-search',
        user_id: value.user_id,
        connection_type: 'api',
        status: 'inactive',
      }),
    ]);
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('drops unavailable task tools instead of pausing in existing-only mode', async () => {
    const value = goal({ data: { tool_mode: 'existing_only' } });
    const toolRow = {
      id: 'tool-doc-generator',
      data: {},
      connection_type: 'internal',
      status: 'active',
    };
    const admin = createAdmin({
      tasks: [
        {
          id: 'task-1',
          data: { tool_requirements: ['tool-doc-generator', 'web-search'] },
        },
      ],
      toolRows: [toolRow],
    });
    loadGoal.mockResolvedValue(value);
    resolveToolCredential.mockImplementation(async ({ def }) => ({
      ready: def.id === 'tool-doc-generator',
    }));

    const result = await handle(admin, { goalId: value.id }, {});

    expect(result.status).toBe('tools_ready');
    expect(admin.taskUpdates).toEqual([]);
    expect(updateGoal).not.toHaveBeenCalledWith(
      admin,
      value.id,
      expect.objectContaining({ status: 'awaiting_tools' })
    );
  });

  it('keeps only the current materialization when collecting required tools', async () => {
    const value = goal({
      data: {
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'ntf-legacy-current',
        },
      },
    });
    const admin = createAdmin({
      tasks: [
        {
          id: 'task-current',
          status: 'planned',
          materialization_attempt: 'ntf-legacy-current',
          data: {
            goal_id: value.id,
            materialization_attempt: 'ntf-legacy-current',
            tool_requirements: ['doc-generator'],
          },
        },
        {
          id: 'task-stale',
          status: 'planned',
          materialization_attempt: 'ntf-stale',
          data: {
            goal_id: value.id,
            materialization_attempt: 'ntf-stale',
            tool_requirements: ['web-search'],
          },
        },
      ],
      toolRows: [{ id: 'tool-doc-generator', data: {}, status: 'active' }],
    });
    loadGoal.mockResolvedValue(value);
    resolveToolCredential.mockResolvedValue({ source: 'internal', apiKey: null, ready: true });

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'tools_ready',
    });

    expect(admin.selects.find(({ table }) => table === 'team_tasks')?.columns).toContain(
      'materialization_attempt'
    );
    expect(resolveToolCredential).toHaveBeenCalledTimes(1);
    expect(updateGoalIfToolProvisioningAttempt.mock.calls.at(-1)[3]).toMatchObject({
      data: {
        required_tools: ['tool-doc-generator'],
        unconfigured_tools: [],
      },
    });
  });
});

describe('native tool-provisioning authority and attempt ownership', () => {
  it('rejects a queued native job when team formation has not completed', async () => {
    const value = nativeToolGoal();
    value.data.native_team_formation_attempt.status = 'running';
    const admin = createAdmin({ tasks: [] });
    loadGoal.mockResolvedValue(value);

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'state_changed',
    });

    expect(updateGoalIfNativeScopeBinding).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('acquires the exact native row before inspecting tasks or tools', async () => {
    const value = nativeToolGoal();
    const admin = createAdmin({ tasks: [] });
    loadGoal.mockResolvedValue(value);
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(false);

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'state_changed',
    });

    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledWith(
      admin,
      value.id,
      'provisioning_tools',
      expect.objectContaining({
        goal_updated_at: value.updated_at,
        team_formation_attempt_id: 'ntf-current',
      }),
      expect.objectContaining({
        status: 'provisioning_tools',
        data: expect.objectContaining({
          native_tool_provisioning_attempt: expect.objectContaining({
            version: 'orqaly_tool_provisioning_attempt_v1',
            attempt_id: 'ntp-test-attempt',
            scope_hash: value.data.axwise_customer_intelligence.scope_packet.scope_hash,
            team_formation_attempt_id: 'ntf-current',
            status: 'running',
          }),
        }),
      })
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('does not emit or enqueue after losing ownership to a cancellation or correction', async () => {
    const value = nativeToolGoal();
    const admin = createAdmin({ tasks: [] });
    loadGoal.mockResolvedValue(value);
    updateGoalIfNativeScopeBinding.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'state_changed',
    });

    expect(updateGoalIfNativeScopeBinding).toHaveBeenCalledTimes(2);
    expect(updateGoalIfNativeScopeBinding).toHaveBeenLastCalledWith(
      admin,
      value.id,
      'provisioning_tools',
      expect.objectContaining({
        goal_updated_at: expect.any(String),
        team_formation_attempt_id: 'ntf-current',
        tool_provisioning_attempt_id: 'ntp-test-attempt',
      }),
      expect.objectContaining({ status: 'estimating' })
    );
    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('seals its native attempt before handing discovery-estimation a job', async () => {
    const value = nativeToolGoal();
    const admin = createAdmin({ tasks: [] });
    loadGoal.mockResolvedValue(value);

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'tools_ready',
    });

    const terminalPatch = updateGoalIfNativeScopeBinding.mock.calls[1][4];
    expect(terminalPatch).toMatchObject({
      status: 'estimating',
      data: {
        native_tool_provisioning_attempt: {
          attempt_id: 'ntp-test-attempt',
          status: 'completed',
        },
      },
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'discovery-estimation', value.id);
  });

  it('does not let a legacy retry flag bypass a native credential checkpoint', async () => {
    const value = nativeToolGoal({ data: { retry_skip_gates: true } });
    const admin = createAdmin({
      tasks: [
        {
          id: 'task-1',
          status: 'planned',
          materialization_attempt: 'ntf-current',
          data: {
            goal_id: value.id,
            materialization_attempt: 'ntf-current',
            tool_requirements: ['web-search'],
          },
        },
      ],
    });
    loadGoal.mockResolvedValue(value);
    resolveToolCredential.mockResolvedValue({ source: 'none', apiKey: null, ready: false });

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'awaiting_tools',
    });

    expect(updateGoalIfNativeScopeBinding.mock.calls[1][4]).toMatchObject({
      status: 'awaiting_tools',
      data: {
        native_tool_provisioning_attempt: {
          attempt_id: 'ntp-test-attempt',
          status: 'awaiting_user',
        },
      },
    });
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });
});

describe('legacy tool-provisioning stage ownership', () => {
  it.each(['cancelled', 'paused', 'awaiting_tools'])(
    'does not revive a %s goal from a stale queued job',
    async (status) => {
      const value = goal({ status });
      const admin = createAdmin({ tasks: [] });
      loadGoal.mockResolvedValue(value);

      await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
        status: 'state_changed',
      });

      expect(reserveGoalToolProvisioningAttempt).not.toHaveBeenCalled();
      expect(admin.from).not.toHaveBeenCalled();
      expect(enqueueGoalAction).not.toHaveBeenCalled();
    }
  );

  it('stops before inspecting tasks when the exact post-seal snapshot was replaced', async () => {
    const value = goal();
    const admin = createAdmin({ tasks: [] });
    loadGoal.mockResolvedValue(value);
    reserveGoalToolProvisioningAttempt.mockResolvedValueOnce(false);

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'state_changed',
    });

    expect(reserveGoalToolProvisioningAttempt).toHaveBeenCalledWith(
      admin,
      value,
      'ntf-legacy-current',
      expect.objectContaining({ status: 'provisioning_tools' })
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('does not enqueue discovery after cancellation wins the terminal race', async () => {
    const value = goal();
    const admin = createAdmin({ tasks: [] });
    loadGoal.mockResolvedValue(value);
    updateGoalIfToolProvisioningAttempt.mockResolvedValueOnce(false);

    await expect(handle(admin, { goalId: value.id }, {})).resolves.toMatchObject({
      status: 'state_changed',
    });

    expect(logGoalEvent).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });
});
