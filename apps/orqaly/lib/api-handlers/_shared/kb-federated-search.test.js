import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../security/resolve-user-key.js', () => ({
  resolveUserKey: vi.fn(async () => ({ key: 'ntn_x' })),
}));
vi.mock('../../../api/_lib/fetch.js', () => ({ fetchWithRetry: vi.fn() }));

import { resolveUserKey } from '../../security/resolve-user-key.js';
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { federatedLiveSearch } from './kb-federated-search.js';

// admin mock: kb_connections select chain resolves to `connsResult`.
function makeAdmin(connsResult) {
  return {
    from: vi.fn(() => {
      const b = {
        select: vi.fn(function () { return this; }),
        eq: vi.fn(function () { return this; }),
        then: (cb, eb) => Promise.resolve(connsResult).then(cb, eb),
      };
      return b;
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('federatedLiveSearch', () => {
  it('returns [] when there are no live connections', async () => {
    const out = await federatedLiveSearch({ admin: makeAdmin({ data: [] }), userId: 'u1', query: 'x' });
    expect(out).toEqual([]);
    expect(fetchWithRetry).not.toHaveBeenCalled();
  });

  it('queries Notion live and maps results', async () => {
    fetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: 'https://notion.so/p1', properties: { title: { title: [{ plain_text: 'Roadmap' }] } } }],
      }),
    });
    const out = await federatedLiveSearch({
      admin: makeAdmin({ data: [{ source_type: 'notion' }] }),
      userId: 'u1',
      query: 'roadmap',
      limit: 5,
    });
    expect(resolveUserKey).toHaveBeenCalled();
    expect(out).toEqual([
      { title: 'Roadmap', content: '', url: 'https://notion.so/p1', source: 'notion', live: true },
    ]);
  });

  it('fails soft when the Notion API errors', async () => {
    fetchWithRetry.mockResolvedValue({ ok: false, json: async () => ({}) });
    const out = await federatedLiveSearch({
      admin: makeAdmin({ data: [{ source_type: 'notion' }] }),
      userId: 'u1',
      query: 'x',
    });
    expect(out).toEqual([]);
  });

  it('returns [] on bad input', async () => {
    expect(await federatedLiveSearch({ admin: null, userId: 'u1', query: 'x' })).toEqual([]);
    expect(await federatedLiveSearch({ admin: makeAdmin({ data: [] }), userId: 'u1', query: '' })).toEqual([]);
  });
});
