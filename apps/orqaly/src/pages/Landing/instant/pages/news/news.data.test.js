import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEWS, NEWS_CATEGORIES, findNews, formatNewsDate, newsPath } from './news.data';
import BODIES from './news.bodies.json';

describe('news data', () => {
  it('keeps every slug unique and every post complete', () => {
    expect(new Set(NEWS.map((post) => post.slug)).size).toBe(NEWS.length);
    for (const post of NEWS) {
      expect(post.slug).toMatch(/^[a-z0-9-]+$/);
      expect(NEWS_CATEGORIES).toContain(post.category);
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('gives every post a real article: 380-580 words, an opening, then 3-4 headed sections', () => {
    expect(Object.keys(BODIES).sort()).toEqual(NEWS.map((post) => post.slug).sort());
    for (const post of NEWS) {
      const body = BODIES[post.slug];
      const words = body
        .filter((block) => !block.h)
        .map((block) => (typeof block === 'string' ? block : block.list.join(' ')))
        .join(' ')
        .split(/\s+/).length;
      expect(words, post.slug).toBeGreaterThanOrEqual(380);
      expect(words, post.slug).toBeLessThanOrEqual(580);
      expect(typeof body[0], post.slug).toBe('string');
      const headings = body.filter((block) => block.h).length;
      expect(headings, post.slug).toBeGreaterThanOrEqual(3);
      expect(headings, post.slug).toBeLessThanOrEqual(4);
      expect(body.filter((block) => block.list).length, post.slug).toBeLessThanOrEqual(1);
    }
  });

  it('lists the newest first', () => {
    const dates = NEWS.map((post) => post.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('dates by the day only what a git commit backs; the rest by month', () => {
    for (const post of NEWS) {
      if (post.precision === 'day') {
        expect(post.source).toEqual(
          expect.objectContaining({
            repo: expect.any(String),
            commit: expect.stringMatching(/^[0-9a-f]{7,}$/),
          })
        );
      } else {
        expect(post.precision).toBe('month');
        expect(post.source).toBeNull();
      }
    }
  });

  it('carries the git-backed milestones on their commit days', () => {
    expect(findNews('orqaly-and-axwise-merge')).toMatchObject({
      date: '2026-09-13',
      source: { commit: '26e447a9' },
    });
    expect(findNews('orqanix-for-mac')).toMatchObject({
      date: '2026-09-13',
      source: { commit: 'bb58b868d' },
    });
    expect(findNews('business-api')).toMatchObject({
      date: '2026-07-16',
      source: { commit: '91619931' },
    });
    expect(findNews('opening-the-source')).toMatchObject({
      date: '2026-07-05',
      source: { commit: '1a7bcb74' },
    });
  });

  it('formats dates and paths', () => {
    expect(formatNewsDate(findNews('business-api'))).toBe('Jul 16, 2026');
    expect(formatNewsDate(findNews('building-the-mobile-app'))).toBe('September 2026');
    expect(formatNewsDate(findNews('business-api'), 'de')).toBe('16. Juli 2026');
    expect(newsPath()).toBe('/instant/news');
    expect(newsPath('business-api')).toBe('/instant/news/business-api');
    expect(findNews('nope')).toBeNull();
  });

  it('uses no "planned" or "soon" badge wording (owner rule)', () => {
    const text = JSON.stringify([NEWS, BODIES]);
    expect(text).not.toMatch(/\bplanned\b|\bsoon\b|coming soon|what's next/i);
    // The owner took these credits off the site.
    expect(text).not.toMatch(/Built on Goose|Powered by Gemini/i);
  });

  describe('loadNewsBody', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    it('fetches all texts once and hands out one article', async () => {
      const fetch = vi.fn(async () => ({ ok: true, json: async () => BODIES }));
      vi.stubGlobal('fetch', fetch);
      const { loadNewsBody } = await import('./news.data');
      expect(await loadNewsBody('business-api')).toEqual(BODIES['business-api']);
      expect(await loadNewsBody('orqanix-for-mac')).toEqual(BODIES['orqanix-for-mac']);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('fails loudly on a bad response, and tries again next time', async () => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, json: async () => BODIES });
      vi.stubGlobal('fetch', fetch);
      const { loadNewsBody } = await import('./news.data');
      await expect(loadNewsBody('business-api')).rejects.toThrow(/did not load/);
      expect(await loadNewsBody('business-api')).toEqual(BODIES['business-api']);
      await expect(loadNewsBody('not-a-post')).rejects.toThrow(/No news text/);
    });

    it('reads a language edition, and falls back to English per missing file or post', async () => {
      const [first, second] = NEWS.map((post) => post.slug);
      const german = { [first]: ['Hallo.'] };
      const fetch = vi.fn(async (url) => ({
        ok: true,
        json: async () => (url === 'de-url' ? german : BODIES),
      }));
      vi.stubGlobal('fetch', fetch);
      const { NEWS_BODY_FILES, loadNewsBody } = await import('./news.data');
      NEWS_BODY_FILES['./bodies/de.json'] = 'de-url';
      try {
        expect(await loadNewsBody(first, 'de')).toEqual(['Hallo.']);
        // The German file lacks this post: its English text.
        expect(await loadNewsBody(second, 'de')).toEqual(BODIES[second]);
        // A language with no file at all: English, without asking for one.
        expect(await loadNewsBody(first, 'xx')).toEqual(BODIES[first]);
        // One request per language.
        expect(await loadNewsBody(first, 'de')).toEqual(['Hallo.']);
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally {
        delete NEWS_BODY_FILES['./bodies/de.json'];
      }
    });

    it('shows English when a language file does not load', async () => {
      const fetch = vi.fn(async (url) =>
        url === 'de-url' ? { ok: false, status: 404 } : { ok: true, json: async () => BODIES }
      );
      vi.stubGlobal('fetch', fetch);
      const { NEWS_BODY_FILES, loadNewsBody } = await import('./news.data');
      NEWS_BODY_FILES['./bodies/de.json'] = 'de-url';
      try {
        expect(await loadNewsBody('business-api', 'de')).toEqual(BODIES['business-api']);
      } finally {
        delete NEWS_BODY_FILES['./bodies/de.json'];
      }
    });
  });
});
