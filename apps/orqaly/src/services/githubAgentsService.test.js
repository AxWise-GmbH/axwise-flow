/**
 * Tests for githubAgentsService - frontend client for github-agents-import API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
  hasSupabase: () => false,
}));

let fetchImpl = vi.fn();
global.fetch = fetchImpl;

const { fetchGithubAgents } = await import('./githubAgentsService.js');

beforeEach(() => {
  fetchImpl.mockClear();
});

describe('fetchGithubAgents', () => {
  it('builds correct query params and returns normalized response', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repo: { owner: 'o', repo: 'r', branch: 'main', fullName: 'o/r', url: 'https://github.com/o/r' },
        items: [{ _id: 'a1', role: 'Triage', system_prompt: 'You are a triage agent.' }],
        total: 1,
        offset: 0,
        limit: 30,
        hasMore: false,
        rejected: 0,
        truncated: false,
        warnings: [],
      }),
    });

    const result = await fetchGithubAgents({ url: 'https://github.com/o/r', offset: 0, limit: 30, q: '' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const callUrl = fetchImpl.mock.calls[0][0];
    expect(callUrl).toContain('/api/app?path=github-agents-import');
    expect(callUrl).toContain('url=https%3A%2F%2Fgithub.com%2Fo%2Fr');
    expect(callUrl).toContain('offset=0');
    expect(callUrl).toContain('limit=30');

    expect(result).toEqual({
      repo: { owner: 'o', repo: 'r', branch: 'main', fullName: 'o/r', url: 'https://github.com/o/r' },
      items: [{ _id: 'a1', role: 'Triage', system_prompt: 'You are a triage agent.' }],
      total: 1,
      offset: 0,
      limit: 30,
      hasMore: false,
      rejected: 0,
      truncated: false,
      warnings: [],
    });
  });

  it('includes q param when provided', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repo: null,
        items: [],
        total: 0,
        offset: 0,
        limit: 30,
        hasMore: false,
        rejected: 0,
        truncated: false,
        warnings: [],
      }),
    });

    await fetchGithubAgents({ url: 'https://github.com/o/r', offset: 0, limit: 30, q: 'engineer' });

    const callUrl = fetchImpl.mock.calls[0][0];
    expect(callUrl).toContain('q=engineer');
  });

  it('defaults offset to 0, limit to 30, q to empty string', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repo: null,
        items: [],
        total: 0,
        offset: 0,
        limit: 30,
        hasMore: false,
        rejected: 0,
        truncated: false,
        warnings: [],
      }),
    });

    await fetchGithubAgents({ url: 'https://github.com/o/r' });

    const callUrl = fetchImpl.mock.calls[0][0];
    expect(callUrl).toContain('offset=0');
    expect(callUrl).toContain('limit=30');
  });

  it('throws error when response is not ok', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Repository not found' }),
    });

    await expect(fetchGithubAgents({ url: 'https://github.com/o/notfound' })).rejects.toThrow(
      /repository not found/i
    );
  });

  it('handles malformed JSON gracefully', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(fetchGithubAgents({ url: 'https://github.com/o/r' })).rejects.toThrow(
      /failed to fetch agents/i
    );
  });

  it('normalizes missing fields with safe defaults', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: 'not-an-array',
        total: 'not-a-number',
      }),
    });

    const result = await fetchGithubAgents({ url: 'https://github.com/o/r' });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.rejected).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});
