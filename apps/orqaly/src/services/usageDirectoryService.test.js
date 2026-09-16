import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: null,
}));

import { clearDirectoryCache, fetchDirectory } from './usageDirectoryService';

beforeEach(() => {
  clearDirectoryCache();
  globalThis.fetch = vi.fn();
});

describe('lean GCP usage-directory fallback', () => {
  it('returns an empty directory without probing the retired API', async () => {
    const result = await fetchDirectory('agent');

    expect(result.entity).toBe('agent');
    expect(result.count).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
