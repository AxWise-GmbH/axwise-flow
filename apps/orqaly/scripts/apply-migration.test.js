import { describe, expect, it, vi } from 'vitest';
import { projectRefFromUrl, runSql } from './apply-migration.mjs';

describe('projectRefFromUrl', () => {
  it('extracts the ref from a Supabase project url', () => {
    expect(projectRefFromUrl('https://zwzopaedmhwnndymitbs.supabase.co')).toBe('zwzopaedmhwnndymitbs');
    expect(projectRefFromUrl('https://abc123.supabase.co/rest/v1')).toBe('abc123');
  });

  it('returns null rather than guessing at a non-Supabase url', () => {
    // Guessing here would POST SQL at the wrong project.
    expect(projectRefFromUrl('http://localhost:54321')).toBeNull();
    expect(projectRefFromUrl('https://example.com')).toBeNull();
    expect(projectRefFromUrl(undefined)).toBeNull();
    expect(projectRefFromUrl('')).toBeNull();
  });
});

describe('runSql', () => {
  const ok = (body) => vi.fn(async () => ({ ok: true, status: 201, text: async () => body }));

  it('posts the query to the project and parses the reply', async () => {
    const fetchImpl = ok('[{"extname":"supabase_vault"}]');
    const out = await runSql({ ref: 'p1', token: 't', query: 'select 1', fetchImpl });

    expect(out).toEqual([{ extname: 'supabase_vault' }]);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects/p1/database/query');
    expect(opts.headers.Authorization).toBe('Bearer t');
    expect(JSON.parse(opts.body).query).toBe('select 1');
  });

  it('returns raw text when the reply is not json', async () => {
    expect(await runSql({ ref: 'p1', token: 't', query: 'x', fetchImpl: ok('OK') })).toBe('OK');
  });

  it('throws with the server message on failure — a silent failure would look like success', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'syntax error at or near "slect"' }));
    await expect(runSql({ ref: 'p1', token: 't', query: 'slect 1', fetchImpl })).rejects.toThrow(/400.*syntax error/);
  });
});
