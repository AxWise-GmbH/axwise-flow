import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { table: null, rows: [], on: true };
function builder(table) {
  state.table = table;
  const b = {
    select: () => b,
    order: () => b,
    limit: async () => ({ data: state.rows, error: null }),
  };
  return b;
}
vi.mock('../lib/supabase', () => ({
  hasSupabase: () => state.on,
  supabase: { from: (t) => builder(t) },
}));

import {
  loadAxwiseCalls,
  loadLlmCalls,
  loadGoalEvents,
  loadConsiliumEvals,
  OBSERVABILITY_LOADERS,
} from './observabilityService';

beforeEach(() => {
  state.table = null;
  state.rows = [{ id: '1' }];
  state.on = true;
});

describe('observabilityService loaders', () => {
  it('reads the right table per source and returns rows', async () => {
    expect(await loadAxwiseCalls()).toEqual([{ id: '1' }]);
    expect(state.table).toBe('axwise_calls');
    await loadLlmCalls();
    expect(state.table).toBe('llm_usage');
    await loadGoalEvents();
    expect(state.table).toBe('goal_log');
    await loadConsiliumEvals();
    expect(state.table).toBe('concilium_evaluations');
  });

  it('registry maps source keys to loaders', () => {
    expect(Object.keys(OBSERVABILITY_LOADERS).sort()).toEqual([
      'axwise',
      'consilium',
      'goals',
      'llm',
    ]);
  });

  it('returns [] when Supabase is unavailable', async () => {
    state.on = false;
    expect(await loadAxwiseCalls()).toEqual([]);
  });
});
