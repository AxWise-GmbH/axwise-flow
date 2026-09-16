/**
 * Tests for Composio executor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFetchWithRetry = vi.fn();
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...args) => mockFetchWithRetry(...args),
}));

vi.mock('./client.js', () => ({
  composioHeaders: () => ({ 'x-api-key': 'test-key', 'Content-Type': 'application/json' }),
  composioBaseUrl: () => 'https://backend.composio.dev/api/v2',
}));

import { executeComposioAction, getComposioActions, listComposioConnections } from './executor.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeComposioAction', () => {
  it('returns success result on 200', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ data: { issue_id: 42 } }),
    });

    const result = await executeComposioAction('GITHUB_CREATE_ISSUE', { title: 'Bug' }, 'user-123');

    expect(result.success).toBe(true);
    expect(result.result).toContain('issue_id');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      'https://backend.composio.dev/api/v2/actions/GITHUB_CREATE_ISSUE/execute',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"entityId":"user-123"'),
      }),
      expect.anything(),
    );
  });

  it('returns error result on non-200', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'Unauthorized' }),
    });

    const result = await executeComposioAction('GITHUB_CREATE_ISSUE', {}, 'user-123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
    expect(result.result).toBeNull();
  });

  it('returns error result on network failure', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await executeComposioAction('GITHUB_CREATE_ISSUE', {}, 'user-123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
    expect(result.result).toBeNull();
  });

  it('uses default entityId when not provided', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      text: async () => '"ok"',
    });

    await executeComposioAction('DISCORD_SEND_MESSAGE', { content: 'hi' });

    const body = JSON.parse(mockFetchWithRetry.mock.calls[0][1].body);
    expect(body.entityId).toBe('default');
  });

  it('trims large responses to 3000 chars', async () => {
    const bigResponse = JSON.stringify({ data: 'x'.repeat(5000) });
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      text: async () => bigResponse,
    });

    const result = await executeComposioAction('TEST_ACTION', {}, 'u1');
    expect(result.result.length).toBeLessThanOrEqual(3000);
  });
});

describe('getComposioActions', () => {
  it('returns actions array on success', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ name: 'GITHUB_CREATE_ISSUE' }] }),
    });

    const actions = await getComposioActions('github');
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('GITHUB_CREATE_ISSUE');
  });

  it('returns empty array on failure', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({ ok: false });

    const actions = await getComposioActions('github');
    expect(actions).toEqual([]);
  });
});

describe('listComposioConnections', () => {
  it('returns connections on success', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 'conn-1', appName: 'github' }] }),
    });

    const conns = await listComposioConnections('user-123');
    expect(conns).toHaveLength(1);
  });

  it('returns empty array on failure', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('fail'));

    const conns = await listComposioConnections('user-123');
    expect(conns).toEqual([]);
  });
});
