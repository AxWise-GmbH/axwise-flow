import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('../../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../security/user-quotas.js', () => ({
  checkQuotas: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('../../agent-handlers/llm-executor.js', () => ({
  executeLlm: vi.fn(async () => ({
    content: 'Delegated work complete',
    usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    model: 'gemini-2.5-pro',
    provider: 'google',
    durationMs: 25,
    estimatedCostUsd: 0.001,
  })),
  parseLlmJson: vi.fn(() => null),
}));

import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { executeJob } from '../../agent-handlers/job-processor.js';
import { executeLlm } from '../../agent-handlers/llm-executor.js';
import { executeSubAgent } from './sub-agent-executor.js';

function createLookupQuery(resolveRow) {
  const filters = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column, value) => {
      filters.push([column, value]);
      return query;
    }),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: resolveRow(filters), error: null })),
  };
  return query;
}

function createInMemoryAdmin() {
  const rows = new Map();
  const blueprint = {
    id: 'blueprint-1',
    user_id: 'user-1',
    name: 'Researcher',
    description: 'Owned workflow researcher',
    category: 'research',
    system_prompt: 'OWNED BLUEPRINT PROMPT: use only the delegated research brief.',
    provider: 'google',
    model: 'gemini-2.5-pro',
  };

  const admin = {
    rows,
    from: vi.fn((table) => {
      if (table === 'agent_blueprints') {
        return createLookupQuery((filters) => {
          const matches = filters.every(([column, value]) => blueprint[column] === value);
          return matches ? blueprint : null;
        });
      }

      if (table === 'agents' || table === 'concilium_agents') {
        // Same-name foreign rows model the service-role fallback leak. The
        // workflow blueprint's owned prompt must make these lookups unnecessary.
        return createLookupQuery(() => ({
          user_id: 'user-2',
          name: 'Researcher',
          status: 'active',
          metadata: {
            system_prompt: 'VICTIM TENANT PRIVATE PROMPT',
            rules: { private_rule: 'VICTIM TENANT PRIVATE RULE' },
          },
        }));
      }

      if (table === 'agent_jobs') {
        const filters = [];
        const query = {
          upsert: vi.fn(async (row) => {
            if (!rows.has(row.id)) rows.set(row.id, structuredClone(row));
            return { data: null, error: null };
          }),
          insert: vi.fn(async (row) => {
            rows.set(row.id, structuredClone(row));
            return { data: null, error: null };
          }),
          select: vi.fn(() => query),
          eq: vi.fn((column, value) => {
            filters.push([column, value]);
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            const id = filters.find(([column]) => column === 'id')?.[1];
            return { data: id ? rows.get(id) || null : null, error: null };
          }),
        };
        return query;
      }

      return createLookupQuery(() => null);
    }),
  };

  return admin;
}

describe('sub-agent enqueue-to-dispatch contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('WORKER_SECRET', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('persists a schema-valid owned agent job that the real job processor can execute', async () => {
    const admin = createInMemoryAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const input = {
      prompt: 'Compare the shortlisted vendors',
      vendors: ['Alpha', 'Beta'],
    };

    const enqueueResult = await executeSubAgent({ blueprint_id: 'blueprint-1' }, input, {
      executionId: 'execution-1',
      currentNodeId: 'node-7',
      userId: 'user-1',
    });

    expect(enqueueResult).toMatchObject({
      outputPort: 'out',
      output: { status: 'queued' },
    });
    const row = admin.rows.get(enqueueResult.output.job_id);
    expect(row).toMatchObject({
      id: enqueueResult.output.job_id,
      user_id: 'user-1',
      status: 'queued',
      worker_scope: 'production',
      payload: {
        type: 'agent',
        userId: 'user-1',
        _userId: 'user-1',
        agentId: 'blueprint-1',
        task: 'Compare the shortlisted vendors',
        context: input,
        blueprint_id: 'blueprint-1',
        parent_execution_id: 'execution-1',
        parent_node_id: 'node-7',
        agentContext: {
          id: 'blueprint-1',
          _agentId: 'blueprint-1',
          _userId: 'user-1',
          blueprint_id: 'blueprint-1',
          name: 'Researcher',
          role: 'research',
          description: 'Owned workflow researcher',
          system_prompt: 'OWNED BLUEPRINT PROMPT: use only the delegated research brief.',
        },
      },
    });
    expect(row).not.toHaveProperty('type');
    expect(row.payload.task.trim()).not.toBe('');

    const { result, error } = await executeJob(admin, row, null);

    expect(error).toBeNull();
    expect(result).toMatchObject({
      type: 'agent',
      content: 'Delegated work complete',
      provider: 'google',
      model: 'gemini-2.5-pro',
    });
    expect(executeLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'google',
        model: 'gemini-2.5-pro',
        prompt: expect.stringContaining('Task: Compare the shortlisted vendors'),
        systemPrompt: expect.stringContaining('OWNED BLUEPRINT PROMPT'),
      })
    );
    expect(executeLlm.mock.calls[0][0].systemPrompt).not.toContain('VICTIM TENANT PRIVATE');
    expect(admin.from).not.toHaveBeenCalledWith('agents');
    expect(admin.from).not.toHaveBeenCalledWith('concilium_agents');
    expect(executeLlm.mock.calls[0][0].prompt).toContain('"vendors": [');
  });

  it("cannot use the service-role client to enqueue another owner's blueprint", async () => {
    const admin = createInMemoryAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);

    const result = await executeSubAgent(
      { blueprint_id: 'blueprint-1' },
      { prompt: 'Attempt cross-tenant delegation' },
      { executionId: 'execution-2', currentNodeId: 'node-1', userId: 'user-2' }
    );

    expect(result).toEqual({
      output: { error: 'Blueprint blueprint-1 not found' },
      outputPort: 'error',
    });
    expect(admin.rows.size).toBe(0);
    expect(executeLlm).not.toHaveBeenCalled();
  });
});
