import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { checkPulseBudget } from './pulse-handler.js';

function budgetAdmin() {
  const filters = [];
  return {
    filters,
    from: vi.fn((table) => {
      const query = {
        select: () => query,
        eq: (column, value) => {
          filters.push([table, column, value]);
          return query;
        },
        gte: () => query,
        maybeSingle: async () => ({
          data: {
            id: 'agent-1',
            user_id: 'user-1',
            max_cost_per_day_usd: 5,
          },
          error: null,
        }),
        then: (resolve) =>
          Promise.resolve({ data: [{ cost_usd: 1.25 }], error: null }).then(resolve),
      };
      return query;
    }),
  };
}

describe('checkPulseBudget owner boundary', () => {
  it('requires a durable owner before any service-role read', async () => {
    const admin = budgetAdmin();

    await expect(checkPulseBudget(admin, 'agent-1')).rejects.toMatchObject({
      code: 'PULSE_OWNER_VALIDATION_ERROR',
    });

    expect(admin.from).not.toHaveBeenCalled();
  });

  it('scopes the agent and cycle reads to the same durable owner', async () => {
    const admin = budgetAdmin();

    const result = await checkPulseBudget(admin, 'agent-1', 'user-1');

    expect(result).toMatchObject({ allowed: true, todayCost: 1.25, maxCost: 5 });
    expect(admin.filters).toEqual(
      expect.arrayContaining([
        ['concilium_agents', 'id', 'agent-1'],
        ['concilium_agents', 'user_id', 'user-1'],
        ['pulse_cycles', 'agent_id', 'agent-1'],
        ['pulse_cycles', 'user_id', 'user-1'],
      ])
    );
  });
});
