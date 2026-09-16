import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

import {
  searchHuggingFaceModels,
  listModelFiles,
  resolveCuratedModels,
} from './huggingfaceModelsService';

beforeEach(() => {
  global.fetch = vi.fn();
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost' },
      writable: true,
    });
  }
});

describe('searchHuggingFaceModels', () => {
  it('calls the handler with the query + limit and returns models', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ id: 'hf-x', repoId: 'a/x' }] }),
    });
    const models = await searchHuggingFaceModels('Cydonia 24B', { limit: 10 });
    expect(models).toHaveLength(1);
    expect(models[0].repoId).toBe('a/x');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('path=huggingface-models');
    expect(url).toContain('q=Cydonia+24B');
    expect(url).toContain('limit=10');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('omits q for the seeded default search', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    await searchHuggingFaceModels('', { limit: 1 });
    const [url] = global.fetch.mock.calls[0];
    expect(url).not.toContain('q=');
    expect(url).toContain('limit=1');
  });

  it('falls back to a direct HF call when the backend endpoint fails', async () => {
    global.fetch
      // backend endpoint not available (e.g. dev proxies to a deploy without it)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unknown path' }) })
      // direct HF call succeeds and is normalized client-side
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'TheDrummer/Cydonia-24B-v4', downloads: 100 }],
      });
    const models = await searchHuggingFaceModels('Cydonia', { limit: 5 });
    expect(models).toHaveLength(1);
    expect(models[0].repoId).toBe('TheDrummer/Cydonia-24B-v4');
    expect(models[0].source).toBe('huggingface');
    // second call hit huggingface.co directly
    expect(global.fetch.mock.calls[1][0]).toContain('huggingface.co/api/models');
  });

  it('propagates aborts without falling back', async () => {
    global.fetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const ctrl = { aborted: true };
    await expect(searchHuggingFaceModels('x', { signal: ctrl })).rejects.toThrow();
    // no fallback attempt when aborted
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('resolveCuratedModels', () => {
  it('resolves each entry, attaches displayName + rank, and preserves list order', async () => {
    // Every query resolves to one model; the backend returns them by search term.
    global.fetch.mockImplementation(async (url) => {
      const map = {
        'q=one': { id: 'hf-one', repoId: 'a/one', downloads: 10 },
        'q=two': { id: 'hf-two', repoId: 'b/two', downloads: 9999 }, // more dl, ranked 2nd
        'q=three': { id: 'hf-three', repoId: 'c/three', downloads: 500 },
      };
      const hit = Object.entries(map).find(([k]) => url.includes(k));
      return { ok: true, json: async () => ({ models: hit ? [hit[1]] : [] }) };
    });

    const list = [
      { name: 'First', query: 'one' },
      { name: 'Second', query: 'two' },
      { name: 'Third', query: 'three' },
    ];
    const out = await resolveCuratedModels(list);

    // order follows the list (the rank), NOT downloads
    expect(out.map((m) => m.repoId)).toEqual(['a/one', 'b/two', 'c/three']);
    expect(out.map((m) => m.rank)).toEqual([1, 2, 3]);
    expect(out.map((m) => m.displayName)).toEqual(['First', 'Second', 'Third']);
    // each resolved with limit=1
    expect(global.fetch.mock.calls.every(([u]) => u.includes('limit=1'))).toBe(true);
  });

  it('dedupes when two entries resolve to the same repo and skips misses', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (url.includes('q=dup1') || url.includes('q=dup2')) {
        return {
          ok: true,
          json: async () => ({ models: [{ id: 'hf-same', repoId: 'same/repo', downloads: 1 }] }),
        };
      }
      // a query that finds nothing
      return { ok: true, json: async () => ({ models: [] }) };
    });
    const out = await resolveCuratedModels([
      { name: 'Dup A', query: 'dup1' },
      { name: 'Dup B', query: 'dup2' },
      { name: 'Missing', query: 'nope' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].repoId).toBe('same/repo');
    expect(out[0].displayName).toBe('Dup A'); // first occurrence wins
  });
});

describe('listModelFiles', () => {
  it('lists weight files with size, quant tag and a direct download URL', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { type: 'file', path: 'README.md', size: 1000 },
        { type: 'file', path: 'model-Q8_0.gguf', size: 26000000000 },
        { type: 'file', path: 'model-IQ4_XS.gguf', size: 13000000000 },
        { type: 'directory', path: 'sub' },
      ],
    });
    const files = await listModelFiles('acme/Model-GGUF');
    // only weight files, sorted smallest-first
    expect(files.map((f) => f.name)).toEqual(['model-IQ4_XS.gguf', 'model-Q8_0.gguf']);
    expect(files[0].quant).toBe('IQ4_XS');
    expect(files[1].quant).toBe('Q8_0');
    expect(files[0].url).toBe(
      'https://huggingface.co/acme/Model-GGUF/resolve/main/model-IQ4_XS.gguf?download=true'
    );
    expect(global.fetch.mock.calls[0][0]).toContain(
      'huggingface.co/api/models/acme/Model-GGUF/tree/main'
    );
  });

  it('throws when the tree request fails', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(listModelFiles('acme/x')).rejects.toThrow(/Hugging Face returned/);
  });
});
