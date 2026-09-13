/**
 * Tests for goal-orchestrator pipeline actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockGenerateGoalPlan = vi.fn();
vi.mock('./goal-planner.js', () => ({
  generateGoalPlan: (...args) => mockGenerateGoalPlan(...args),
}));

const mockFormTeam = vi.fn();
const mockPickBestAgent = vi.fn();
vi.mock('./team-assigner.js', () => ({
  formTeam: (...args) => mockFormTeam(...args),
  pickBestAgent: (...args) => mockPickBestAgent(...args),
}));

const mockExecuteLlm = vi.fn();
const mockParseLlmJson = vi.fn();
vi.mock('../agent-handlers/llm-executor.js', () => ({
  executeLlm: (...args) => mockExecuteLlm(...args),
  parseLlmJson: (...args) => mockParseLlmJson(...args),
}));

const mockScopeAdmission = vi.fn();
vi.mock('./stages/customer-intelligence.js', () => ({
  handle: (...args) => mockScopeAdmission(...args),
}));

import { handleGoalOrchestration } from './goal-orchestrator.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeGoal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Test Goal',
    description: 'Build something',
    budget_usd: 100,
    spent_usd: 0,
    status: 'planning',
    iteration: 0,
    max_iterations: 5,
    complexity: 'simple',
    execution_mode: 'auto',
    team_id: null,
    plan: null,
    data: {},
    project_id: null,
    workflow_id: null,
    parsed_category: null,
    parsed_priority: 'medium',
    parsed_requirements: '',
    ...overrides,
  };
}

function mockAdmin(goal = makeGoal()) {
  const updates = {};
  const inserts = {};

  function trackInsert(table) {
    if (!inserts[table]) inserts[table] = [];
    return async (data) => {
      inserts[table].push(data);
      return { data: { id: `${table}-new-1` }, error: null };
    };
  }

  const admin = {
    _updates: updates,
    _inserts: inserts,
    from: vi.fn((table) => {
      if (table === 'goals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: goal, error: null })),
            maybeSingle: vi.fn(async () => ({ data: goal, error: null })),
          })),
          update: vi.fn((data) => {
            if (!updates.goals) updates.goals = [];
            updates.goals.push(data);
            return {
              eq: vi.fn(function () {
                return this;
              }),
              select: vi.fn(function () {
                return this;
              }),
              single: vi.fn(async () => ({ data: { ...goal, ...data }, error: null })),
            };
          }),
          insert: vi.fn(async (data) => {
            await trackInsert('goals')(data);
            return { data: { id: 'goal-new', ...data }, error: null };
          }),
        };
      }

      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            order: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
          })),
          insert: vi.fn(async (data) => {
            await trackInsert('jobs')(data);
            return {
              data: { id: data.id || 'job-new', ...data },
              error: null,
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: data.id || 'job-new' }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === 'team_tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            in: vi.fn(function () {
              return this;
            }),
            lt: vi.fn(function () {
              return this;
            }),
            gt: vi.fn(function () {
              return this;
            }),
            order: vi.fn(function () {
              return this;
            }),
            limit: vi.fn(function () {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          insert: vi.fn(async (data) => {
            await trackInsert('team_tasks')(data);
            return {
              data: { id: data.id || 'task-new' },
              error: null,
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: data.id || 'task-new' }, error: null })),
              })),
            };
          }),
        };
      }

      // Default for goal_log, agent_jobs, notification_log, knowledge_documents, etc.
      return {
        select: vi.fn(function () {
          return this;
        }),
        eq: vi.fn(function () {
          return this;
        }),
        in: vi.fn(function () {
          return this;
        }),
        order: vi.fn(function () {
          return this;
        }),
        limit: vi.fn(function () {
          return this;
        }),
        single: vi.fn(async () => ({ data: null, error: null })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        contains: vi.fn(function () {
          return this;
        }),
        insert: vi.fn(async (data) => {
          await trackInsert(table)(data);
          return { error: null };
        }),
        update: vi.fn(() => ({
          eq: vi.fn(function () {
            return this;
          }),
        })),
      };
    }),
  };

  return admin;
}

// ── Tests ────────────────────────────────────────────────────────

describe('handleGoalOrchestration', () => {
  it('throws on unknown action', async () => {
    const admin = mockAdmin();
    await expect(handleGoalOrchestration(admin, { action: 'bogus', goalId: 'g1' })).rejects.toThrow(
      'Unknown goal action: bogus'
    );
  });

  it('routes the domain-neutral scope-admission alias through the compatible AxWise handler', async () => {
    const admin = mockAdmin();
    const payload = { action: 'scope-admission', goalId: 'goal-1' };
    mockScopeAdmission.mockResolvedValue({ status: 'awaiting_context_approval' });

    await expect(handleGoalOrchestration(admin, payload, {})).resolves.toEqual({
      status: 'awaiting_context_approval',
    });
    expect(mockScopeAdmission).toHaveBeenCalledWith(admin, payload, {});
  });
});

describe('evaluate-phase: deferred guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defers when tasks are still inProgress', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: {
        phases: [
          { name: 'Phase 1', status: 'executing', started_at: new Date().toISOString(), jobs: [] },
        ],
      },
    });
    const admin = mockAdmin(goal);

    // Override jobs + tasks queries to return inProgress tasks
    const originalFrom = admin.from;
    admin.from = vi.fn((table) => {
      if (table === 'jobs') {
        const goalJobs = [
          { id: 'j1', title: 'Job 1', status: 'active', cost_usd: 0, assigned_agent_name: '' },
        ];
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return {
                ...this,
                data: goalJobs,
                error: null,
                then: (fn) => Promise.resolve(fn({ data: goalJobs, error: null })),
                order: vi.fn(function () {
                  return this;
                }),
                single: vi.fn(async () => ({ data: goal, error: null })),
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              };
            }),
            order: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: goal, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        };
      }
      if (table === 'team_tasks') {
        const taskData = [
          { id: 't1', title: 'Task 1', status: 'done', data: { output: 'ok', phase_index: 0 } },
          { id: 't2', title: 'Task 2', status: 'inProgress', data: { phase_index: 0 } },
        ];
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            in: vi.fn(function () {
              return {
                ...this,
                data: taskData,
                error: null,
                then: (fn) => Promise.resolve(fn({ data: taskData, error: null })),
              };
            }),
          })),
        };
      }
      if (table === 'goals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: goal, error: null })),
            maybeSingle: vi.fn(async () => ({ data: goal, error: null })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
          })),
        };
      }
      return originalFrom(table);
    });

    const result = await handleGoalOrchestration(admin, {
      action: 'evaluate-phase',
      goalId: goal.id,
    });

    expect(result.status).toBe('deferred');
    expect(result.pendingTasks).toBe(1);
  });
});

describe('evaluate-phase: no executing phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no phase is executing', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: { phases: [{ name: 'Phase 1', status: 'completed', jobs: [] }] },
    });
    const admin = mockAdmin(goal);

    const result = await handleGoalOrchestration(admin, {
      action: 'evaluate-phase',
      goalId: goal.id,
    });

    expect(result.status).toBe('no_executing_phase');
  });
});

describe('iterate: budget guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pauses goal when budget is at 90% (warning)', async () => {
    const goal = makeGoal({ budget_usd: 100, spent_usd: 91, status: 'active', iteration: 0 });
    const admin = mockAdmin(goal);

    mockExecuteLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0 });
    mockParseLlmJson.mockReturnValue({ strategy: 'new', phases: [] });

    const result = await handleGoalOrchestration(admin, {
      action: 'iterate',
      goalId: goal.id,
      feedback: 'test',
    });

    expect(result.status).toBe('budget_warning');
    // Goal should be paused, not failed
    expect(admin._updates.goals?.find((u) => u.status)?.status).toBe('paused');
  });

  it('fails goal when budget is fully exhausted', async () => {
    const goal = makeGoal({ budget_usd: 100, spent_usd: 100, status: 'active', iteration: 0 });
    const admin = mockAdmin(goal);

    const result = await handleGoalOrchestration(admin, {
      action: 'iterate',
      goalId: goal.id,
      feedback: 'test',
    });

    expect(result.status).toBe('budget_exhausted');
    expect(admin._updates.goals?.find((u) => u.status)?.status).toBe('failed');
  });

  it('fails goal when max iterations reached', async () => {
    const goal = makeGoal({ iteration: 5, max_iterations: 5, status: 'active' });
    const admin = mockAdmin(goal);

    const result = await handleGoalOrchestration(admin, {
      action: 'iterate',
      goalId: goal.id,
      feedback: 'test',
    });

    expect(result.status).toBe('max_iterations');
    expect(admin._updates.goals?.[0]?.status).toBe('failed');
  });
});

describe('execute-phase: already executing guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when phase is already executing', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: {
        phases: [
          { name: 'Phase 1', status: 'executing', jobs: [{ title: 'J1', description: 'D1' }] },
        ],
      },
    });
    const admin = mockAdmin(goal);

    const result = await handleGoalOrchestration(admin, {
      action: 'execute-phase',
      goalId: goal.id,
      phaseIndex: 0,
      _userId: goal.user_id,
      userId: goal.user_id,
      user_id: goal.user_id,
    });

    expect(result.status).toBe('already_executing');
  });
});

describe('execute-phase: budget exhausted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pauses goal when budget is exhausted', async () => {
    const goal = makeGoal({
      budget_usd: 100,
      spent_usd: 100,
      status: 'active',
      plan: { phases: [{ name: 'Phase 1', status: 'pending', jobs: [] }] },
    });
    const admin = mockAdmin(goal);

    const result = await handleGoalOrchestration(admin, {
      action: 'execute-phase',
      goalId: goal.id,
      phaseIndex: 0,
      _userId: goal.user_id,
      userId: goal.user_id,
      user_id: goal.user_id,
    });

    expect(result.status).toBe('budget_paused');
  });
});

describe('evaluate-phase: no jobs guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Phase 2.2: the no-jobs path now throws instead of returning silently,
  // so the self-healer (h03) can match and re-run team-formation. This
  // replaces the previous "returns { status: 'no_jobs' }" contract.
  it('throws descriptive error when goal has no jobs (Phase 2.2)', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: {
        phases: [
          { name: 'Phase 1', status: 'executing', started_at: new Date().toISOString(), jobs: [] },
        ],
      },
    });
    const admin = mockAdmin(goal);

    // Override jobs + team_tasks queries to return empty so we hit the no-jobs throw
    const originalFrom = admin.from;
    const jobsSelect = vi.fn(() => ({
      eq: vi.fn(function () {
        return {
          ...this,
          data: [],
          error: null,
          then: (fn) => Promise.resolve(fn({ data: [], error: null })),
        };
      }),
      single: vi.fn(async () => ({ data: null, error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    }));
    admin.from = vi.fn((table) => {
      if (table === 'jobs') {
        return { select: jobsSelect };
      }
      if (table === 'team_tasks') {
        return {
          select: vi.fn(() => ({
            contains: vi.fn(async () => ({ data: [], error: null })),
            in: vi.fn(async () => ({ data: [], error: null })),
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }
      if (table === 'goals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: goal, error: null })),
            maybeSingle: vi.fn(async () => ({ data: goal, error: null })),
          })),
        };
      }
      return originalFrom(table);
    });

    await expect(
      handleGoalOrchestration(admin, { action: 'evaluate-phase', goalId: goal.id })
    ).rejects.toThrow(/no jobs found/i);
    expect(jobsSelect).toHaveBeenCalledWith(
      'id, user_id, goal_id, description, status, cost_usd, assigned_agent_name, materialization_attempt'
    );
  });
});

describe('evaluate-phase: no tasks for current phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no_tasks when current phase has no matching tasks', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: {
        phases: [
          { name: 'Phase 1', status: 'executing', started_at: new Date().toISOString(), jobs: [] },
        ],
      },
    });
    const admin = mockAdmin(goal);

    // Jobs exist but tasks belong to a different phase_index
    const originalFrom = admin.from;
    admin.from = vi.fn((table) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return {
                ...this,
                data: [
                  {
                    id: 'j1',
                    title: 'Old Job',
                    status: 'active',
                    cost_usd: 0,
                    assigned_agent_name: '',
                  },
                ],
                error: null,
                then: (fn) =>
                  Promise.resolve(
                    fn({
                      data: [
                        {
                          id: 'j1',
                          title: 'Old Job',
                          status: 'active',
                          cost_usd: 0,
                          assigned_agent_name: '',
                        },
                      ],
                      error: null,
                    })
                  ),
              };
            }),
          })),
        };
      }
      if (table === 'team_tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            in: vi.fn(function () {
              // Tasks exist but for phase_index 5 (old iteration), not phase 0
              return {
                ...this,
                data: [
                  {
                    id: 't1',
                    title: 'Old Task',
                    status: 'done',
                    data: { output: 'old output', phase_index: 5 },
                  },
                ],
                error: null,
                then: (fn) =>
                  Promise.resolve(
                    fn({
                      data: [
                        {
                          id: 't1',
                          title: 'Old Task',
                          status: 'done',
                          data: { output: 'old output', phase_index: 5 },
                        },
                      ],
                      error: null,
                    })
                  ),
              };
            }),
          })),
        };
      }
      if (table === 'goals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: goal, error: null })),
          })),
        };
      }
      return originalFrom(table);
    });

    const result = await handleGoalOrchestration(admin, {
      action: 'evaluate-phase',
      goalId: goal.id,
    });

    expect(result.status).toBe('no_tasks');
  });
});

describe('plan: awaiting_tools when unconfigured tools needed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets awaiting_tools when plan needs unconfigured tools', async () => {
    const goal = makeGoal({ complexity: 'simple', execution_mode: 'auto' });
    const admin = mockAdmin(goal);

    // Plan returns a "research" category job → needs tool-web-search
    mockGenerateGoalPlan.mockResolvedValue({
      strategy: 'Research first',
      phases: [
        {
          name: 'Phase 1',
          status: 'pending',
          jobs: [
            {
              title: 'Research',
              description: 'Find info',
              category: 'research',
              requirements: '',
              estimate_hours: 1,
            },
          ],
        },
      ],
      planCost: 0.01,
      confidenceScore: 80,
      estimatedHours: 1,
    });
    mockFormTeam.mockResolvedValue({ teamId: null });

    // Override tools table to return empty (no configured tools)
    const originalFrom = admin.from;
    admin.from = vi.fn((table) => {
      if (table === 'tools') {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            in: vi.fn(function () {
              return {
                ...this,
                data: [],
                error: null,
                then: (fn) => Promise.resolve(fn({ data: [], error: null })),
              };
            }),
          })),
        };
      }
      return originalFrom(table);
    });

    const result = await handleGoalOrchestration(admin, {
      action: 'plan',
      goalId: goal.id,
    });

    expect(result.status).toBe('awaiting_tools');
    expect(result.unconfiguredTools).toContain('tool-web-search');
    // Goal status should be set to awaiting_tools
    const goalUpdates = admin._updates.goals || [];
    const statusUpdate = goalUpdates.find((u) => u.status === 'awaiting_tools');
    expect(statusUpdate).toBeTruthy();
  });

  it('proceeds when all required tools are configured', async () => {
    const goal = makeGoal({ complexity: 'simple', execution_mode: 'auto' });
    const admin = mockAdmin(goal);

    mockGenerateGoalPlan.mockResolvedValue({
      strategy: 'Research first',
      phases: [
        {
          name: 'Phase 1',
          status: 'pending',
          jobs: [
            {
              title: 'Research',
              description: 'Find info',
              category: 'research',
              requirements: '',
              estimate_hours: 1,
            },
          ],
        },
      ],
      planCost: 0.01,
      confidenceScore: 80,
      estimatedHours: 1,
    });
    mockFormTeam.mockResolvedValue({ teamId: null });

    // Configuration comes from encrypted BYOK/Vault metadata, never tools.data.
    const originalFrom = admin.from;
    admin.from = vi.fn((table) => {
      if (table === 'user_api_keys') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            in: vi.fn(function () {
              return {
                ...this,
                data: [{ provider: 'tool:tool-web-search', slot: 'default' }],
                error: null,
                then: (fn) =>
                  Promise.resolve(
                    fn({
                      data: [{ provider: 'tool:tool-web-search', slot: 'default' }],
                      error: null,
                    })
                  ),
              };
            }),
          })),
        };
      }
      return originalFrom(table);
    });

    const result = await handleGoalOrchestration(admin, {
      action: 'plan',
      goalId: goal.id,
    });

    // Should NOT be awaiting_tools — should proceed to active
    expect(result.status).not.toBe('awaiting_tools');
    expect(result.strategy).toBe('Research first');
  });

  it('skips tool check when plan has only content jobs (internal tools)', async () => {
    const goal = makeGoal({ complexity: 'simple', execution_mode: 'auto' });
    const admin = mockAdmin(goal);

    mockGenerateGoalPlan.mockResolvedValue({
      strategy: 'Write content',
      phases: [
        {
          name: 'Phase 1',
          status: 'pending',
          jobs: [
            {
              title: 'Write',
              description: 'Create doc',
              category: 'content',
              requirements: '',
              estimate_hours: 1,
            },
          ],
        },
      ],
      planCost: 0.01,
      confidenceScore: 85,
      estimatedHours: 1,
    });
    mockFormTeam.mockResolvedValue({ teamId: null });

    const result = await handleGoalOrchestration(admin, {
      action: 'plan',
      goalId: goal.id,
    });

    // content category maps to empty tool array → no tools needed → proceeds
    expect(result.status).not.toBe('awaiting_tools');
    expect(result.strategy).toBe('Write content');
  });
});

describe('evaluate-phase: quality thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes phase when quality >= 70 (lowered threshold)', async () => {
    const goal = makeGoal({
      status: 'active',
      plan: {
        phases: [
          {
            name: 'Phase 1',
            status: 'executing',
            started_at: new Date().toISOString(),
            description: 'Test phase',
            jobs: [],
          },
          { name: 'Phase 2', status: 'pending', jobs: [] },
        ],
      },
    });
    const admin = mockAdmin(goal);

    // Mock LLM to return quality_score 72 with passed=false (would have failed with old threshold)
    mockExecuteLlm.mockResolvedValue({ content: '{}', estimatedCostUsd: 0.001 });
    mockParseLlmJson.mockReturnValue({
      quality_score: 72,
      passed: false,
      progress_percent: 70,
      feedback: 'Acceptable work',
      next_action: 'continue',
    });

    // Override to return completed tasks for phase 0
    const originalFrom = admin.from;
    admin.from = vi.fn((table) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return {
                ...this,
                data: [
                  {
                    id: 'j1',
                    title: 'Job 1',
                    status: 'active',
                    cost_usd: 0.01,
                    assigned_agent_name: 'Agent A',
                  },
                ],
                error: null,
                then: (fn) =>
                  Promise.resolve(
                    fn({
                      data: [
                        {
                          id: 'j1',
                          title: 'Job 1',
                          status: 'active',
                          cost_usd: 0.01,
                          assigned_agent_name: 'Agent A',
                        },
                      ],
                      error: null,
                    })
                  ),
              };
            }),
          })),
        };
      }
      if (table === 'team_tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            in: vi.fn(function () {
              return {
                ...this,
                data: [
                  {
                    id: 't1',
                    title: 'Task 1',
                    status: 'done',
                    data: { output: 'Good deliverable', phase_index: 0 },
                  },
                ],
                error: null,
                then: (fn) =>
                  Promise.resolve(
                    fn({
                      data: [
                        {
                          id: 't1',
                          title: 'Task 1',
                          status: 'done',
                          data: { output: 'Good deliverable', phase_index: 0 },
                        },
                      ],
                      error: null,
                    })
                  ),
              };
            }),
          })),
        };
      }
      if (table === 'goals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            single: vi.fn(async () => ({ data: goal, error: null })),
            maybeSingle: vi.fn(async () => ({ data: goal, error: null })),
          })),
          update: vi.fn((data) => {
            if (!admin._updates.goals) admin._updates.goals = [];
            admin._updates.goals.push(data);
            return {
              eq: vi.fn(function () {
                return this;
              }),
              select: vi.fn(function () {
                return this;
              }),
              single: vi.fn(async () => ({ data: { ...goal, ...data }, error: null })),
            };
          }),
        };
      }
      return originalFrom(table);
    });

    const result = await handleGoalOrchestration(admin, {
      action: 'evaluate-phase',
      goalId: goal.id,
    });

    // With new threshold, score 72 + passed=false → overridden to passed=true (>= 70)
    expect(result.passed).toBe(true);
    expect(result.quality_score).toBe(72);
  });
});
