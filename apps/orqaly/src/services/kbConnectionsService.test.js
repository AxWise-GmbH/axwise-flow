import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

const { listConnections, saveConnection, syncConnection, testConnection, deleteConnection, authorizeOAuth } =
  await import('./kbConnectionsService');

function mockFetchOnce(body, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({ ok, status, json: async () => body }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.window = { location: { origin: 'http://localhost' } };
});

describe('kbConnectionsService', () => {
  it('listConnections GETs and returns { connections, capabilities }', async () => {
    mockFetchOnce({ connections: [{ id: 'c1' }], capabilities: { dropbox: { methods: ['oauth'] } } });
    const out = await listConnections();
    expect(out.connections).toEqual([{ id: 'c1' }]);
    expect(out.capabilities.dropbox.methods).toEqual(['oauth']);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('path=kb-connections');
    expect(opts.method).toBe('GET');
  });

  it('authorizeOAuth POSTs to kb-oauth and returns the url', async () => {
    mockFetchOnce({ url: 'https://provider/consent' });
    const url = await authorizeOAuth('dropbox');
    expect(url).toBe('https://provider/consent');
    const [callUrl] = globalThis.fetch.mock.calls[0];
    expect(callUrl).toContain('path=kb-oauth');
    expect(callUrl).toContain('provider=dropbox');
    expect(callUrl).toContain('action=authorize');
  });

  it('saveConnection POSTs the connection body', async () => {
    mockFetchOnce({ connection: { id: 'c1', source_type: 'notion', mode: 'live' } });
    const out = await saveConnection({ source_type: 'notion', mode: 'live' });
    expect(out.mode).toBe('live');
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ source_type: 'notion', mode: 'live' });
  });

  it('syncConnection POSTs action=sync with id', async () => {
    mockFetchOnce({ synced: 5 });
    const out = await syncConnection('c1');
    expect(out.synced).toBe(5);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('action=sync');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('id=c1');
  });

  it('testConnection POSTs action=test', async () => {
    mockFetchOnce({ ok: true });
    const out = await testConnection('c1');
    expect(out.ok).toBe(true);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('action=test');
  });

  it('deleteConnection DELETEs by id', async () => {
    mockFetchOnce({ deleted: true });
    const out = await deleteConnection('c1');
    expect(out).toBe(true);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('id=c1');
  });

  it('throws with status on a non-ok response', async () => {
    mockFetchOnce({ error: 'nope' }, false, 501);
    await expect(syncConnection('c1')).rejects.toThrow('nope');
  });
});
