/**
 * Tests for the bookmark helpers in knowledgeBaseService.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  // Skip auth-header logic — we only care about the request payloads here.
  hasSupabase: () => false,
}));

import { addBookmark, listBookmarks } from './knowledgeBaseService';

function mockFetchOnce(payload, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('addBookmark', () => {
  it('posts a link doc under category bookmark with the collection as a tag', async () => {
    mockFetchOnce({ id: 'bm1' });
    await addBookmark({ url: 'https://x.com', title: 'X', collection: 'research' });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('op=add');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      content_type: 'link',
      category: 'bookmark',
      url: 'https://x.com',
      title: 'X',
    });
    expect(body.tags).toEqual(['bookmark', 'research']);
  });

  it('omits the collection tag when none is given', async () => {
    mockFetchOnce({ id: 'bm2' });
    await addBookmark({ url: 'https://y.com' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tags).toEqual(['bookmark']);
  });
});

describe('listBookmarks', () => {
  it('requests link docs under category bookmark', async () => {
    mockFetchOnce([]);
    await listBookmarks({});
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('op=list');
    expect(url).toContain('category=bookmark');
    expect(url).toContain('content_type=link');
  });

  it('filters by collection client-side', async () => {
    mockFetchOnce([
      { id: '1', url: 'https://a.com', tags: ['bookmark', 'research'] },
      { id: '2', url: 'https://b.com', tags: ['bookmark', 'competitors'] },
    ]);
    const out = await listBookmarks({ collection: 'research' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });
});
