import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

const {
  getTopology,
  saveTopology,
  reseedTopology,
  listVersions,
  getVersion,
  restoreVersion,
  listActivity,
} = await import('./consiliumTopologyService');

function mockFetchOnce(body, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({ ok, status, json: async () => body }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.window = { location: { origin: 'http://localhost' } };
});

describe('consiliumTopologyService', () => {
  it('getTopology GETs the diagram', async () => {
    mockFetchOnce({ diagram: { id: 'd1' } });
    const out = await getTopology();
    expect(out.diagram).toEqual({ id: 'd1' });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('path=consilium-topology');
    expect(url).toContain('op=get');
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('saveTopology POSTs nodes/edges/expectedVersion', async () => {
    mockFetchOnce({ diagram: { id: 'd1' }, version: 4 });
    const out = await saveTopology({ nodes: [{ id: 'n' }], edges: [], expectedVersion: 3 });
    expect(out.version).toBe(4);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('op=save');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ expectedVersion: 3, nodes: [{ id: 'n' }] });
  });

  it('reseedTopology POSTs the reseed op', async () => {
    mockFetchOnce({ diagram: { id: 'd1' }, version: 2 });
    await reseedTopology();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('op=reseed');
    expect(opts.method).toBe('POST');
  });

  it('listVersions GETs version metadata', async () => {
    mockFetchOnce({ versions: [{ version: 1 }] });
    const out = await listVersions();
    expect(out.versions).toEqual([{ version: 1 }]);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('op=list-versions');
  });

  it('getVersion passes the version param', async () => {
    mockFetchOnce({ version: { version: 2, nodes: [] } });
    await getVersion(2);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('version=2');
  });

  it('restoreVersion POSTs with the version', async () => {
    mockFetchOnce({ diagram: { id: 'd1' }, version: 5 });
    const out = await restoreVersion(3);
    expect(out.version).toBe(5);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('op=restore-version');
    expect(url).toContain('version=3');
    expect(opts.method).toBe('POST');
  });

  it('listActivity GETs the feed with a limit', async () => {
    mockFetchOnce({ activity: [{ action: 'save' }] });
    const out = await listActivity(50);
    expect(out.activity).toHaveLength(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('op=list-activity');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('limit=50');
  });

  it('throws (with status) on a non-ok response', async () => {
    mockFetchOnce({ error: 'boom' }, false, 409);
    await expect(saveTopology({ nodes: [], edges: [] })).rejects.toThrow('boom');
  });
});
