import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

const { fetchProviderCatalog } = await import('./providerCatalogService');

function mockFetchOnce(body, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({ ok, status, json: async () => body }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.window = { location: { origin: 'http://localhost' } };
});

describe('providerCatalogService', () => {
  it('GETs provider-catalog with provider, category, q and returns items', async () => {
    mockFetchOnce({ items: [{ id: 'a' }, { id: 'b' }] });
    const out = await fetchProviderCatalog({ provider: 'openrouter', category: 'models', q: 'claude' });
    expect(out).toEqual([{ id: 'a' }, { id: 'b' }]);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('path=provider-catalog');
    expect(url).toContain('provider=openrouter');
    expect(url).toContain('category=models');
    expect(url).toContain('q=claude');
  });

  it('omits q when blank', async () => {
    mockFetchOnce({ items: [] });
    await fetchProviderCatalog({ provider: 'composio', category: 'tools' });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).not.toContain('q=');
  });

  it('sends the bearer auth header', async () => {
    mockFetchOnce({ items: [] });
    await fetchProviderCatalog({ provider: 'openrouter', category: 'models' });
    const opts = globalThis.fetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('throws the server error on non-ok', async () => {
    mockFetchOnce({ error: 'Composio is not configured' }, false, 503);
    await expect(fetchProviderCatalog({ provider: 'composio', category: 'tools' })).rejects.toThrow(
      'Composio is not configured'
    );
  });

  it('returns [] when items is missing', async () => {
    mockFetchOnce({});
    const out = await fetchProviderCatalog({ provider: 'openrouter', category: 'models' });
    expect(out).toEqual([]);
  });
});
