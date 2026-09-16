import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

const { getMonitor, getHistory, recordSnapshot } = await import('./storageMonitorService');

function mockFetchOnce(body, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({ ok, status, json: async () => body }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.window = { location: { origin: 'http://localhost' } };
});

describe('storageMonitorService', () => {
  it('getMonitor GETs the current view', async () => {
    mockFetchOnce({ overview: {}, providers: [] });
    await getMonitor();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('path=storage-monitor');
    expect(opts.method).toBe('GET');
  });

  it('getHistory passes view=history + range', async () => {
    mockFetchOnce({ series: [] });
    await getHistory(30);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('view=history');
    expect(url).toContain('range=30');
  });

  it('recordSnapshot POSTs action=snapshot and swallows errors', async () => {
    mockFetchOnce({ error: 'nope' }, false, 500);
    const out = await recordSnapshot();
    expect(out).toEqual({ snapped: 0 });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('action=snapshot');
    expect(opts.method).toBe('POST');
  });
});
