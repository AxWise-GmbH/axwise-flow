import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { executeCostGuard } from './cost-guard-executor.js';
import { executeHumanApproval } from './human-approval-executor.js';
import { executeReport } from './report-executor.js';
import { WORKFLOW_RESOURCE_AUTHORIZATION_ERROR } from './resource-authorization.js';

function makeAdmin({ agents = [], boards = [], limit = null } = {}) {
  const rowsByTable = {
    concilium_agents: agents,
    concilium: boards,
    concilium_rate_limits: limit ? [limit] : [],
  };
  const reads = [];
  const inserts = [];

  return {
    reads,
    inserts,
    from: vi.fn((table) => {
      const filters = [];
      let insertedRow = null;
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => {
          filters.push({ column, value });
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          reads.push({ table, filters: [...filters] });
          const rows = rowsByTable[table] || [];
          const data =
            rows.find((row) => filters.every(({ column, value }) => row[column] === value)) || null;
          return { data, error: null };
        }),
        insert: vi.fn((row) => {
          insertedRow = row;
          inserts.push({ table, row });
          return query;
        }),
        single: vi.fn(async () => ({
          data: { id: 'report-1', ...insertedRow },
          error: null,
        })),
      };
      return query;
    }),
  };
}

const ownerContext = {
  userId: 'owner-user',
  executionId: 'execution-1',
  nodeId: 'node-1',
};

describe('workflow node resource authorization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects all three external-resource executors without ctx.userId', async () => {
    const results = await Promise.all([
      executeCostGuard({ agent_id: 'agent-1' }, {}, {}),
      executeReport({ agent_id: 'agent-1' }, {}, {}),
      executeHumanApproval({ agent_id: 'agent-1' }, {}, {}),
    ]);

    for (const result of results) {
      expect(result).toMatchObject({
        output: { code: WORKFLOW_RESOURCE_AUTHORIZATION_ERROR },
        outputPort: 'error',
      });
    }
    expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a victim agent before the cost-limit read', async () => {
    const admin = makeAdmin({
      agents: [{ id: 'victim-agent', user_id: 'victim-user' }],
      limit: {
        user_id: 'victim-user',
        entity_type: 'agent',
        entity_id: 'victim-agent',
        current_cost_day_usd: 0,
        max_cost_per_day_usd: 10,
      },
    });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const result = await executeCostGuard(
      { agent_id: 'victim-agent' },
      {},
      { userId: 'attacker-user' }
    );

    expect(result).toMatchObject({
      output: { code: WORKFLOW_RESOURCE_AUTHORIZATION_ERROR },
      outputPort: 'error',
    });
    expect(admin.reads).toEqual([
      {
        table: 'concilium_agents',
        filters: [
          { column: 'id', value: 'victim-agent' },
          { column: 'user_id', value: 'attacker-user' },
        ],
      },
    ]);
    expect(admin.inserts).toEqual([]);
  });

  it('preserves a user-owned cost guard with no resource reference', async () => {
    const result = await executeCostGuard({}, {}, ownerContext);

    expect(result).toMatchObject({ output: { within_budget: true }, outputPort: 'out' });
    expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['report', executeReport],
    ['human approval', executeHumanApproval],
  ])('rejects a victim board before the %s report insert', async (_label, executor) => {
    const admin = makeAdmin({
      agents: [{ id: 'owned-agent', user_id: 'owner-user' }],
      boards: [{ id: 'victim-board', user_id: 'victim-user' }],
    });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const result = await executor(
      { agent_id: 'owned-agent', board_id: 'victim-board' },
      { summary: 'poison' },
      ownerContext
    );

    expect(result).toMatchObject({
      output: { code: WORKFLOW_RESOURCE_AUTHORIZATION_ERROR },
      outputPort: 'error',
    });
    expect(admin.inserts).toEqual([]);
    expect(admin.reads.map(({ table }) => table)).toEqual(['concilium_agents', 'concilium']);
  });

  it('rejects conflicting configured and incoming references before opening the database', async () => {
    const result = await executeReport(
      { agent_id: 'configured-agent' },
      { agent_id: 'incoming-agent' },
      ownerContext
    );

    expect(result).toMatchObject({
      output: { code: WORKFLOW_RESOURCE_AUTHORIZATION_ERROR },
      outputPort: 'error',
    });
    expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('owner-scopes cost reads and stamps report and approval rows with ctx.userId', async () => {
    const admin = makeAdmin({
      agents: [{ id: 'owned-agent', user_id: 'owner-user' }],
      boards: [{ id: 'owned-board', user_id: 'owner-user' }],
      limit: {
        user_id: 'owner-user',
        entity_type: 'agent',
        entity_id: 'owned-agent',
        current_cost_day_usd: 1,
        max_cost_per_day_usd: 10,
      },
    });
    buildSupabaseAdminClient.mockReturnValue(admin);
    const config = { agent_id: 'owned-agent', board_id: 'owned-board' };

    const cost = await executeCostGuard(config, {}, ownerContext);
    const report = await executeReport(config, { summary: 'owned' }, ownerContext);
    const approval = await executeHumanApproval(config, { summary: 'owned' }, ownerContext);

    expect(cost).toMatchObject({ output: { within_budget: true }, outputPort: 'out' });
    expect(report.outputPort).toBe('out');
    expect(approval.outputPort).toBe('pending');
    const rateRead = admin.reads.find(({ table }) => table === 'concilium_rate_limits');
    expect(rateRead.filters).toEqual([
      { column: 'user_id', value: 'owner-user' },
      { column: 'entity_type', value: 'agent' },
      { column: 'entity_id', value: 'owned-agent' },
    ]);
    expect(admin.inserts).toHaveLength(2);
    for (const { table, row } of admin.inserts) {
      expect(table).toBe('concilium_agent_reports');
      expect(row).toMatchObject({
        user_id: 'owner-user',
        agent_id: 'owned-agent',
        board_id: 'owned-board',
      });
    }
  });
});
