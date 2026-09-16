import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: null,
}));

import { clearUsageCache, fetchAxwiseDivergence, fetchUsage } from './usageService';

beforeEach(() => {
  clearUsageCache();
  globalThis.fetch = vi.fn();
});

describe('lean GCP usage fallback', () => {
  it('returns an empty usage projection without probing the retired API', async () => {
    const result = await fetchUsage('goal', { id: 'goal-1' });

    expect(result.entity).toBe('goal');
    expect(result.entityId).toBe('goal-1');
    expect(result.totals.tokens).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns an empty divergence projection without probing the retired API', async () => {
    const result = await fetchAxwiseDivergence();

    expect(result.detail).toBe('divergence');
    expect(result.totals.calls).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
