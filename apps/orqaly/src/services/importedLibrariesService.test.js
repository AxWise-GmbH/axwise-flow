import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

const { listImportedLibraries, importLibrary, removeImportedLibrary } =
  await import('./importedLibrariesService');

function mockFetchOnce(body, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.window = { location: { origin: 'http://localhost' } };
});

describe('importedLibrariesService', () => {
  it('listImportedLibraries GETs with the category and returns libraries', async () => {
    mockFetchOnce({ libraries: [{ id: '1', name: 'X' }] });
    const out = await listImportedLibraries('agents');
    expect(out).toEqual([{ id: '1', name: 'X' }]);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('path=marketplace-imports');
    expect(url).toContain('category=agents');
  });

  it('importLibrary POSTs the payload and returns the library', async () => {
    mockFetchOnce({ library: { id: 'row1' } });
    const out = await importLibrary({ category: 'tools', sourceId: 's', name: 'n' });
    expect(out).toEqual({ id: 'row1' });
    const opts = globalThis.fetch.mock.calls[0][1];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ category: 'tools', sourceId: 's' });
  });

  it('removeImportedLibrary DELETEs by id', async () => {
    mockFetchOnce({ ok: true });
    await removeImportedLibrary('abc');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('id=abc');
    expect(opts.method).toBe('DELETE');
  });

  it('throws on a non-ok response', async () => {
    mockFetchOnce({ error: 'boom' }, false, 500);
    await expect(listImportedLibraries('agents')).rejects.toThrow('boom');
  });
});
