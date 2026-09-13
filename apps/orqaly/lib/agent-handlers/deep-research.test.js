import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecuteLlmTracked } = vi.hoisted(() => ({
  mockExecuteLlmTracked: vi.fn(),
}));

vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: (...args) => mockExecuteLlmTracked(...args),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { deepResearch } from './deep-research.js';

const AUTHORIZATION = {
  allowed: true,
  version: 'orqaly_deep_research_authorization_v1',
  tool_id: 'tool-web-search',
  source: 'axwise_research_assisted',
  routing_mode: 'research_assisted',
};

describe('deepResearch capability boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LLM_DEFAULT_PROVIDER', '');
    vi.stubEnv('LLM_DEFAULT_MODEL', '');
    process.env.TAVILY_API_KEY = 'test-tavily-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) }))
    );
  });

  afterEach(() => {
    delete process.env.TAVILY_API_KEY;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fails before query planning or Tavily when no approved capability is supplied', async () => {
    await expect(deepResearch('Market analysis')).rejects.toMatchObject({
      code: 'DEEP_RESEARCH_NOT_AUTHORIZED',
    });

    expect(mockExecuteLlmTracked).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('can reach Tavily when execute-task supplies the approved research capability', async () => {
    mockExecuteLlmTracked
      .mockResolvedValueOnce({
        content: JSON.stringify({ queries: ['bounded market query'] }),
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ gaps: [], followUpQueries: [] }),
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ queries: [] }),
        estimatedCostUsd: 0,
      });

    await deepResearch('Market analysis', null, { admin: {} }, AUTHORIZATION);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockExecuteLlmTracked).toHaveBeenCalledTimes(3);
    for (const [options] of mockExecuteLlmTracked.mock.calls) {
      expect(options).toMatchObject({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
      });
    }
  });

  it('preserves an explicit per-goal provider and model for every planning call', async () => {
    mockExecuteLlmTracked
      .mockResolvedValueOnce({
        content: JSON.stringify({ queries: ['bounded market query'] }),
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ gaps: [], followUpQueries: [] }),
        estimatedCostUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ queries: [] }),
        estimatedCostUsd: 0,
      });

    await deepResearch('Market analysis', null, { admin: {} }, AUTHORIZATION, {
      provider: 'openai',
      model: 'gpt-4.1-mini',
    });

    expect(mockExecuteLlmTracked).toHaveBeenCalledTimes(3);
    for (const [options] of mockExecuteLlmTracked.mock.calls) {
      expect(options).toMatchObject({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        pinnedProvider: true,
      });
    }
  });

  it('revalidates immediately before each external action and stops on revocation', async () => {
    mockExecuteLlmTracked.mockResolvedValueOnce({
      content: JSON.stringify({ queries: ['must not reach Tavily'] }),
      estimatedCostUsd: 0,
    });
    const revoked = Object.assign(new Error('revoked'), {
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
    });
    const beforeExternalAction = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(revoked);

    await expect(
      deepResearch(
        'Market analysis',
        null,
        { admin: {} },
        AUTHORIZATION,
        undefined,
        beforeExternalAction
      )
    ).rejects.toBe(revoked);

    expect(beforeExternalAction).toHaveBeenNthCalledWith(1, {
      kind: 'llm',
      operation: 'query-planning',
    });
    expect(beforeExternalAction).toHaveBeenNthCalledWith(2, {
      kind: 'tool',
      operation: 'web-search',
      query: 'must not reach Tavily',
    });
    expect(mockExecuteLlmTracked).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
