import { describe, it, expect, vi } from 'vitest';

vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: vi.fn(async () => ({ content: 'Overview: all good.' })),
}));

const { withAxwiseTracked } = vi.hoisted(() => ({
  withAxwiseTracked: vi.fn(async () => ({ processedOutputs: {}, degraded: false })),
}));
vi.mock('../integrations/axwise/index.js', () => ({
  withAxwiseTracked,
  buildCopilotContext: (o) => ({ integrationPoint: 'copilot.chat', ...o }),
  buildAgentGenerateContext: (o) => ({ integrationPoint: 'agent.generate', ...o }),
}));
vi.mock('../concilium-handlers/agent-config-validator.js', () => ({
  screenSystemPrompt: () => ({ decision: 'allowed', reason: null }),
}));

import {
  resolveAssistantLlm,
  executeToolCall,
  normalizeGoalComplexity,
} from './assistant-bridge.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';

const DEFAULTS = { provider: 'groq', model: 'llama-3.3-70b-versatile' };

describe('normalizeGoalComplexity', () => {
  it.each([
    ['medium', 'complex'],
    ['standard', 'complex'],
    ['moderate', 'complex'],
    ['advanced', 'complex'],
    ['unexpected', 'simple'],
  ])('maps %s to the persisted goals enum %s', (input, expected) => {
    expect(normalizeGoalComplexity(input)).toBe(expected);
  });
});

/** Minimal chainable Supabase stub whose maybeSingle() resolves to `row`. */
function mockAdmin(row, { throws = false } = {}) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      if (throws) throw new Error('db down');
      return { data: row, error: null };
    },
  };
  return { from: vi.fn(() => chain) };
}

describe('resolveAssistantLlm', () => {
  it('returns the current assistant’s saved provider/model (templates off by default)', async () => {
    const admin = mockAdmin({ config: { provider: 'gemini', model: 'gemini-3.5-flash' } });
    const out = await resolveAssistantLlm(admin, 'user-1', DEFAULTS);
    expect(out).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash', useTemplates: false });
    expect(admin.from).toHaveBeenCalledWith('assistants');
  });

  it('surfaces useTemplates true only when the config flag is explicitly set', async () => {
    const admin = mockAdmin({ config: { provider: 'gemini', model: 'x', useTemplates: true } });
    expect(await resolveAssistantLlm(admin, 'user-1', DEFAULTS)).toEqual({
      provider: 'gemini',
      model: 'x',
      useTemplates: true,
    });
  });

  it('falls back to defaults when config has no provider/model', async () => {
    const admin = mockAdmin({ config: { tone: 'friendly' } });
    expect(await resolveAssistantLlm(admin, 'user-1', DEFAULTS)).toEqual({
      ...DEFAULTS,
      useTemplates: false,
    });
  });

  it('falls back to defaults when there is no current assistant row', async () => {
    const admin = mockAdmin(null);
    expect(await resolveAssistantLlm(admin, 'user-1', DEFAULTS)).toEqual({
      ...DEFAULTS,
      useTemplates: false,
    });
  });

  it('falls back to defaults when the lookup throws', async () => {
    const admin = mockAdmin(null, { throws: true });
    expect(await resolveAssistantLlm(admin, 'user-1', DEFAULTS)).toEqual({
      ...DEFAULTS,
      useTemplates: false,
    });
  });

  it('completes a saved provider with that provider compatible default model', async () => {
    const admin = mockAdmin({ config: { provider: 'anthropic' } });
    expect(await resolveAssistantLlm(admin, 'user-1', DEFAULTS)).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      useTemplates: false,
    });
  });

  it('infers the saved provider when only a model was persisted', async () => {
    const admin = mockAdmin({ config: { model: 'gpt-4o' } });
    expect(await resolveAssistantLlm(admin, 'user-1', DEFAULTS)).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      useTemplates: false,
    });
  });

  it('repairs a mismatched default atomically before using it', async () => {
    const admin = mockAdmin(null);
    expect(
      await resolveAssistantLlm(admin, 'user-1', {
        provider: 'openai',
        model: 'gemini-3.8-flash',
      })
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      useTemplates: false,
    });
  });
});

/** Admin stub for insert().select().single() returning `row`. */
function insertAdmin(row) {
  const chain = { select: () => chain, single: async () => ({ data: row, error: null }) };
  return { from: vi.fn(() => ({ insert: () => chain })) };
}

describe('executeToolCall agent.create records AxWise agent.generate', () => {
  it('calls withAxwiseTracked with an agent.generate context before inserting', async () => {
    withAxwiseTracked.mockClear();
    const admin = insertAdmin({ agent_id: 'agent-1', role: 'research' });
    const out = await executeToolCall(admin, 'user-1', 'agent.create', {
      name: 'Analyst',
      role: 'research',
    });
    expect(out.created).toEqual({ agent_id: 'agent-1', role: 'research' });
    expect(withAxwiseTracked).toHaveBeenCalledTimes(1);
    expect(withAxwiseTracked.mock.calls[0][0].integrationPoint).toBe('agent.generate');
  });
});

function goalCreateAdmin() {
  let insertedGoal = null;
  let insertedJob = null;
  const from = vi.fn((table) => {
    if (table === 'organizations') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: { id: 'org-1' }, error: null }),
      };
      return chain;
    }
    if (table === 'goals') {
      const chain = {
        insert: (row) => {
          insertedGoal = row;
          return chain;
        },
        select: () => chain,
        single: async () => ({
          data: {
            id: 'goal-1',
            user_id: insertedGoal.user_id,
            title: insertedGoal.title,
            status: insertedGoal.status,
            budget_usd: insertedGoal.budget_usd,
            data: insertedGoal.data,
            updated_at: '2026-08-22T10:00:00.000Z',
          },
          error: null,
        }),
      };
      return chain;
    }
    if (table === 'agent_jobs') {
      return {
        insert: async (row) => {
          insertedJob = row;
          return { error: null };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return {
    admin: { from },
    getGoalInsert: () => insertedGoal,
    getJobInsert: () => insertedJob,
  };
}

function goalCreateFailureAdmin({ jobInspectionError = null, terminalStatus = 'failed' } = {}) {
  let goal = null;
  let inspectedJobId = null;
  const goalUpdates = [];
  const goalUpdateFilters = [];

  const organizationChain = {
    select: () => organizationChain,
    eq: () => organizationChain,
    ilike: () => organizationChain,
    order: () => organizationChain,
    limit: () => organizationChain,
    maybeSingle: async () => ({ data: { id: 'org-1' }, error: null }),
  };

  const from = vi.fn((table) => {
    if (table === 'organizations') return organizationChain;
    if (table === 'agent_jobs') {
      const chain = {
        select: () => chain,
        eq: (field, value) => {
          if (field === 'id') inspectedJobId = value;
          return chain;
        },
        maybeSingle: async () => {
          if (jobInspectionError) return { data: null, error: jobInspectionError };
          return {
            data: {
              id: inspectedJobId,
              user_id: 'user-1',
              status: terminalStatus,
              worker_scope: 'preview',
              payload: {
                type: 'orchestrate-goal',
                action: 'feasibility-analysis',
                goalId: 'goal-1',
                _userId: 'user-1',
                userId: 'user-1',
                user_id: 'user-1',
                _workerDeployment: 'vercel-url:preview.example.test',
              },
              updated_at: '2026-08-22T10:01:00.000Z',
            },
            error: null,
          };
        },
      };
      return chain;
    }
    if (table === 'goals') {
      const chain = {
        insert: (row) => {
          goal = {
            ...row,
            id: 'goal-1',
            updated_at: '2026-08-22T10:00:00.000Z',
          };
          return chain;
        },
        update: (updates) => {
          goalUpdates.push(updates);
          return chain;
        },
        select: () => chain,
        eq: (field, value) => {
          goalUpdateFilters.push([field, value]);
          return chain;
        },
        single: async () => ({ data: goal, error: null }),
        maybeSingle: async () => {
          if (goalUpdates.length) goal = { ...goal, ...goalUpdates.at(-1) };
          return { data: goal, error: null };
        },
      };
      return chain;
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    admin: { from },
    getGoal: () => goal,
    getGoalUpdates: () => goalUpdates,
    getGoalUpdateFilters: () => goalUpdateFilters,
  };
}

describe('executeToolCall goal.create normalizes the production boundary', () => {
  it('maps medium to the binary production enum and persists an unambiguous no-tools request', async () => {
    const { admin, getGoalInsert, getJobInsert } = goalCreateAdmin();

    const result = await executeToolCall(admin, 'user-1', 'goal.create', {
      title: 'Bremen commercial plan',
      description: 'Prepare the offer without external tools.',
      complexity: 'medium',
    });

    expect(getGoalInsert()).toMatchObject({
      complexity: 'complex',
      org_id: 'org-1',
      data: {
        tool_mode: 'no_tools',
        skip_tools: true,
        skip_tools_reason: 'User requested a tool-free goal at creation',
      },
    });
    expect(result.job_id).toBe(getJobInsert().id);
    expect(getJobInsert().payload.goalId).toBe(result.created.id);
  });

  it('returns the durable goal and parks it exactly when its Preview job is terminal', async () => {
    const { admin, getGoal, getGoalUpdates, getGoalUpdateFilters } = goalCreateFailureAdmin();
    const enqueueError = Object.assign(new Error('exact Preview wake failed'), {
      code: 'PREVIEW_EXACT_WAKE_UNAVAILABLE',
    });

    const result = await executeToolCall(
      admin,
      'user-1',
      'goal.create',
      { title: 'Durable goal', description: 'Run once', complexity: 'simple' },
      {
        env: {
          NODE_ENV: 'test',
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_URL: 'preview.example.test',
        },
        enqueueAgentJobImpl: vi.fn(async () => {
          throw enqueueError;
        }),
      }
    );

    expect(result).toMatchObject({
      created: { id: 'goal-1', status: 'needs_human' },
      pipeline_status: 'parked',
      reconciliation_required: false,
    });
    expect(getGoal().data.assistant_goal_handoff).toMatchObject({
      status: 'stopped',
      job_state: 'failed',
      reconciliation_required: false,
    });
    expect(getGoalUpdates()).toHaveLength(1);
    expect(getGoalUpdateFilters()).toEqual(
      expect.arrayContaining([
        ['id', 'goal-1'],
        ['user_id', 'user-1'],
        ['status', 'feasibility'],
        ['updated_at', '2026-08-22T10:00:00.000Z'],
      ])
    );
  });

  it('returns the durable goal without parking when the exact job outcome is unknown', async () => {
    const { admin, getGoalUpdates } = goalCreateFailureAdmin({
      jobInspectionError: { message: 'read unavailable' },
    });

    const result = await executeToolCall(
      admin,
      'user-1',
      'goal.create',
      { title: 'Reconcile me', complexity: 'simple' },
      {
        env: {
          NODE_ENV: 'test',
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_URL: 'preview.example.test',
        },
        enqueueAgentJobImpl: vi.fn(async () => {
          throw new Error('ambiguous enqueue response');
        }),
      }
    );

    expect(result).toMatchObject({
      created: { id: 'goal-1', status: 'feasibility' },
      pipeline_status: 'reconciliation_required',
      reconciliation_required: true,
      reconciliation_state: 'unknown',
    });
    expect(result.message).toContain('instead of creating it again');
    expect(getGoalUpdates()).toHaveLength(0);
  });
});

const KD_OWNER_TYPES = ['user', 'agent', 'team', 'partner']; // chk_kd_owner_type

/** Admin stub for the brief.generate path; captures the KB insert payload. */
function briefAdmin({ assistantConfig } = {}) {
  let insertedRow = null;
  const from = vi.fn((table) => {
    if (table === 'goals') {
      const c = { select: () => c, eq: () => c, order: () => c, limit: async () => ({ data: [] }) };
      return c;
    }
    if (table === 'assistants') {
      const c = {
        select: () => c,
        eq: () => c,
        maybeSingle: async () => ({ data: assistantConfig ? { config: assistantConfig } : null }),
      };
      return c;
    }
    if (table === 'knowledge_documents') {
      const c = {
        insert: (row) => {
          insertedRow = row;
          return c;
        },
        select: () => c,
        single: async () => ({ data: { id: 'kd-1', title: insertedRow?.title }, error: null }),
      };
      return c;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { admin: { from }, getInsert: () => insertedRow };
}

describe('brief.generate insert', () => {
  it('scopes to the org via organization_id with a valid owner_type', async () => {
    const { admin, getInsert } = briefAdmin({
      assistantConfig: { provider: 'gemini', model: 'gemini-3.5-flash' },
    });
    await executeToolCall(admin, 'user-1', 'brief.generate', { organization_id: 'org-9' });
    const row = getInsert();
    expect(row.organization_id).toBe('org-9');
    expect(KD_OWNER_TYPES).toContain(row.owner_type); // never 'organization'
    // uses the user's selected model, not hardcoded groq
    expect(executeLlmV2Tracked).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-3.5-flash' })
    );
  });

  it('works with no org (organization_id null, owner_type user)', async () => {
    const { admin, getInsert } = briefAdmin();
    await executeToolCall(admin, 'user-1', 'brief.generate', {});
    const row = getInsert();
    expect(row.organization_id).toBeNull();
    expect(row.owner_type).toBe('user');
  });

  it('User templates OFF (default): saves the free-form model text, no template headings', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce({ content: 'Overview: all good.' });
    const { admin, getInsert } = briefAdmin({ assistantConfig: { useTemplates: false } });
    await executeToolCall(admin, 'user-1', 'brief.generate', {});
    expect(getInsert().content).toBe('Overview: all good.');
    expect(getInsert().content).not.toContain('## Current Focus');
  });

  it('User templates ON: runs the structured template and saves deterministic markdown', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce({
      content: JSON.stringify({
        overview: 'Two initiatives in flight.',
        focus_areas: ['Ship the page'],
        risks: ['Page stalled'],
        next_steps: ['Confirm owner'],
      }),
    });
    const { admin, getInsert } = briefAdmin({ assistantConfig: { useTemplates: true } });
    await executeToolCall(admin, 'user-1', 'brief.generate', {});
    const content = getInsert().content;
    expect(content).toContain('## Overview');
    expect(content).toContain('## Current Focus');
    expect(content).toContain('- Ship the page');
    expect(content).toContain('## Next Steps');
  });
});

describe('chat.searchHistory', () => {
  /** Records the query chain calls and resolves .limit() to `rows`. */
  function searchAdmin(rows = []) {
    const calls = { eq: [], ilike: [], neq: [] };
    const chain = {
      select: () => chain,
      eq: (...a) => {
        calls.eq.push(a);
        return chain;
      },
      ilike: (...a) => {
        calls.ilike.push(a);
        return chain;
      },
      neq: (...a) => {
        calls.neq.push(a);
        return chain;
      },
      order: () => chain,
      limit: async () => ({ data: rows, error: null }),
    };
    return { admin: { from: vi.fn(() => chain) }, calls };
  }

  it('searches assistant_chat_messages scoped to the user, filtered by query, excluding the current chat', async () => {
    const rows = [
      { conversation_id: 'c-old', role: 'user', content: 'the budget was $500', created_at: 't1' },
    ];
    const { admin, calls } = searchAdmin(rows);
    const out = await executeToolCall(admin, 'user-1', 'chat.searchHistory', {
      query: 'budget',
      excludeConversationId: 'c-now',
      limit: 5,
    });
    expect(admin.from).toHaveBeenCalledWith('assistant_chat_messages');
    expect(calls.eq).toContainEqual(['user_id', 'user-1']);
    expect(calls.ilike).toContainEqual(['content', '%budget%']);
    expect(calls.neq).toContainEqual(['conversation_id', 'c-now']);
    expect(out.count).toBe(1);
    expect(out.matches[0]).toMatchObject({ conversationId: 'c-old', role: 'user' });
  });

  it('omits the content filter when no query is given', async () => {
    const { admin, calls } = searchAdmin([]);
    const out = await executeToolCall(admin, 'user-1', 'chat.searchHistory', {});
    expect(calls.ilike).toHaveLength(0);
    expect(calls.neq).toHaveLength(0);
    expect(out).toMatchObject({ count: 0, query: null });
  });
});

describe('tool.get credential redaction', () => {
  /** Separate tool/public-metadata and encrypted-key status query stubs. */
  function toolAdmin(row, { configured = false } = {}) {
    const calls = { select: [] };
    const toolChain = {
      select: (cols) => {
        calls.select.push(cols);
        return toolChain;
      },
      eq: () => toolChain,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    const keyChain = {
      select: (cols) => {
        calls.select.push(cols);
        return keyChain;
      },
      eq: () => keyChain,
      in: async () => ({
        data: configured ? [{ provider: `tool:${row.id}`, slot: 'default' }] : [],
        error: null,
      }),
    };
    return {
      admin: {
        from: vi.fn((table) => (table === 'user_api_keys' ? keyChain : toolChain)),
      },
      calls,
    };
  }

  const ROW = {
    id: 'tool-github',
    name: 'GitHub',
    status: 'active',
    connection_type: 'api',
    description: 'Repos',
    data: { apiKey: 'ghp_supersecret', url: 'https://api.github.com' },
  };

  it('never returns the plaintext credential — this value goes into an LLM context', async () => {
    const { admin } = toolAdmin(ROW);
    const out = await executeToolCall(admin, 'user-1', 'tool.get', { id: 'tool-github' });
    expect(JSON.stringify(out)).not.toContain('ghp_supersecret');
    expect(out.tool.data).toBeUndefined();
  });

  it('reports whether a credential exists without disclosing it', async () => {
    const { admin } = toolAdmin(ROW, { configured: true });
    const out = await executeToolCall(admin, 'user-1', 'tool.get', { id: 'tool-github' });
    expect(out.tool.configured).toBe(true);
    expect(out.tool.id).toBe('tool-github');
    expect(out.tool.name).toBe('GitHub');
  });

  it('reports configured:false when the tool has no credential', async () => {
    // A legacy plaintext field is deliberately ignored; only encrypted-key
    // metadata can make this status true.
    const { admin } = toolAdmin(ROW);
    const out = await executeToolCall(admin, 'user-1', 'tool.get', { id: 'tool-github' });
    expect(out.tool.configured).toBe(false);
  });

  it('does not select(*) — the data column must never be fetched wholesale here', async () => {
    const { admin, calls } = toolAdmin(ROW);
    await executeToolCall(admin, 'user-1', 'tool.get', { id: 'tool-github' });
    expect(calls.select).not.toContain('*');
  });
});

describe('executeToolCall workflow execution ownership', () => {
  function workflowAdmin(workflow) {
    const filters = [];
    const chain = {
      select: () => chain,
      eq: (field, value) => {
        filters.push([field, value]);
        return chain;
      },
      maybeSingle: async () => ({ data: workflow, error: null }),
    };
    return { admin: { from: vi.fn(() => chain) }, filters };
  }

  it('does not enqueue a workflow that is not owned by the caller', async () => {
    const { admin, filters } = workflowAdmin(null);
    const enqueueAgentJobImpl = vi.fn();

    const result = await executeToolCall(
      admin,
      'user-1',
      'workflow.execute',
      { id: 'workflow-foreign' },
      { enqueueAgentJobImpl }
    );

    expect(result).toEqual({ error: 'workflow not found' });
    expect(filters).toEqual([
      ['id', 'workflow-foreign'],
      ['user_id', 'user-1'],
    ]);
    expect(enqueueAgentJobImpl).not.toHaveBeenCalled();
  });

  it('stamps all trusted owner fields when enqueuing an owned workflow', async () => {
    const { admin } = workflowAdmin({ id: 'workflow-owned', user_id: 'user-1' });
    const enqueueAgentJobImpl = vi.fn(async () => ({ id: 'job-1', status: 'queued' }));
    const checkQuotasImpl = vi.fn(async () => ({ allowed: true }));

    const result = await executeToolCall(
      admin,
      'user-1',
      'workflow.retry',
      { id: 'workflow-owned' },
      { enqueueAgentJobImpl, checkQuotasImpl }
    );

    expect(enqueueAgentJobImpl).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        user_id: 'user-1',
        payload: expect.objectContaining({
          type: 'execute-workflow',
          workflowId: 'workflow-owned',
          userId: 'user-1',
          user_id: 'user-1',
          _userId: 'user-1',
        }),
      })
    );
    expect(checkQuotasImpl).toHaveBeenCalledWith(admin, 'user-1', {
      jobType: 'execute-workflow',
    });
    expect(result).toMatchObject({ queued: 'workflow-owned', job_id: 'job-1' });
  });

  it('does not enqueue an owned workflow after the durable quota is exhausted', async () => {
    const { admin } = workflowAdmin({ id: 'workflow-owned', user_id: 'user-1' });
    const enqueueAgentJobImpl = vi.fn();
    const checkQuotasImpl = vi.fn(async () => ({
      allowed: false,
      code: 'QUOTA_JOBS_PER_HOUR',
      message: 'Hourly job limit reached',
      quotas: { max_jobs_per_hour: 200 },
      usage: { jobs_this_hour: 200 },
    }));

    const result = await executeToolCall(
      admin,
      'user-1',
      'workflow.execute',
      { id: 'workflow-owned' },
      { enqueueAgentJobImpl, checkQuotasImpl }
    );

    expect(result).toMatchObject({
      error: 'Hourly job limit reached',
      code: 'QUOTA_JOBS_PER_HOUR',
    });
    expect(enqueueAgentJobImpl).not.toHaveBeenCalled();
  });
});

describe('executeToolCall workflow execution error ownership', () => {
  it('does not expose step output for a caller-supplied execution owned by another tenant', async () => {
    const executionFilters = [];
    const executionQuery = {
      select: vi.fn(() => executionQuery),
      eq: vi.fn((field, value) => {
        executionFilters.push([field, value]);
        return executionQuery;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const stepQuery = {
      select: vi.fn(() => stepQuery),
      eq: vi.fn(() => stepQuery),
      in: vi.fn(() => stepQuery),
      limit: vi.fn(async () => ({
        data: [{ output_data: { secret: 'victim workflow output' } }],
        error: null,
      })),
    };
    const admin = {
      from: vi.fn((table) => (table === 'workflow_executions' ? executionQuery : stepQuery)),
    };

    const result = await executeToolCall(admin, 'user-1', 'workflow.errors', {
      executionId: 'victim-execution',
    });

    expect(executionFilters).toEqual([
      ['id', 'victim-execution'],
      ['user_id', 'user-1'],
    ]);
    expect(admin.from).not.toHaveBeenCalledWith('workflow_step_results');
    expect(result).toEqual({ errors: [], count: 0, message: 'No execution found.' });
  });
});
