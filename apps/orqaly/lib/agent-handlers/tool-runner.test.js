/**
 * Tests for the ReAct tool runner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

const mockExecuteLlmV2 = vi.fn();
vi.mock('../concilium-handlers/llm-executor-v2.js', () => ({
  executeLlmV2: (...args) => mockExecuteLlmV2(...args),
}));

const mockFetchWithRetry = vi.fn();
vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: (...args) => mockFetchWithRetry(...args),
}));

const mockExecuteComposioAction = vi.fn();
vi.mock('../composio/executor.js', () => ({
  executeComposioAction: (...args) => mockExecuteComposioAction(...args),
}));

const mockBuildAdmin = vi.fn();
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: (...args) => mockBuildAdmin(...args),
}));

import { runAgentWithTools, executeBookmarksTool } from './tool-runner.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeLlmTextResponse(content) {
  return {
    content,
    toolCalls: null,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: 'test-model',
    provider: 'groq',
    durationMs: 500,
    estimatedCostUsd: 0.001,
  };
}

function makeLlmToolCallResponse(toolCalls) {
  return {
    content: '',
    toolCalls,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: 'test-model',
    provider: 'groq',
    durationMs: 300,
    estimatedCostUsd: 0.001,
  };
}

const sampleToolDef = {
  id: 'tool-github',
  name: 'GitHub',
  connectionType: 'api',
  baseUrl: 'https://api.github.com',
  endpoints: [
    {
      name: 'list_repos',
      method: 'GET',
      path: '/user/repos',
      description: 'List repos',
      parameters: {},
    },
    {
      name: 'create_repo',
      method: 'POST',
      path: '/user/repos',
      description: 'Create a repo',
      parameters: { name: 'string', 'description?': 'string' },
    },
  ],
};

const sampleToolRecord = {
  id: 'tool-github',
  name: 'GitHub',
  connectionType: 'api',
  apiKey: 'ghp_testtoken',
};

const internalToolDef = {
  id: 'tool-doc-generator',
  name: 'Document Generator',
  connectionType: 'internal',
  endpoints: [
    {
      name: 'generate',
      method: 'POST',
      path: '/generate',
      description: 'Generate a document',
      parameters: { title: 'string', 'format?': 'string' },
    },
  ],
};

const internalToolRecord = {
  id: 'tool-doc-generator',
  name: 'Document Generator',
  connectionType: 'internal',
};

// ── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runAgentWithTools', () => {
  it('checks authority before the initial provider call', async () => {
    const authorizationResult = { status: 'authorization_revoked', reasons: ['cancelled'] };
    const beforeExternalAction = vi.fn(async () => authorizationResult);

    await expect(
      runAgentWithTools({
        prompt: 'List my repos',
        provider: 'groq',
        toolDefs: [sampleToolDef],
        toolRecords: [sampleToolRecord],
        beforeExternalAction,
      })
    ).rejects.toMatchObject({
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
      authorizationResult,
    });

    expect(beforeExternalAction).toHaveBeenCalledWith({
      kind: 'llm',
      phase: 'initial',
      iteration: 0,
    });
    expect(mockExecuteLlmV2).not.toHaveBeenCalled();
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('rechecks authority before each tool side effect and follow-up provider turn', async () => {
    mockExecuteLlmV2
      .mockResolvedValueOnce(
        makeLlmToolCallResponse([{ id: 'call_1', name: 'tool_github__list_repos', arguments: {} }])
      )
      .mockResolvedValueOnce(makeLlmTextResponse('Done.'));
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify([]),
    });
    const beforeExternalAction = vi.fn(async () => null);

    await runAgentWithTools({
      prompt: 'List my repos',
      provider: 'groq',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
      beforeExternalAction,
    });

    expect(beforeExternalAction.mock.calls.map(([action]) => action)).toEqual([
      { kind: 'llm', phase: 'initial', iteration: 0 },
      {
        kind: 'tool',
        phase: 'tool_call',
        iteration: 0,
        toolName: 'tool_github__list_repos',
        callId: 'call_1',
      },
      { kind: 'llm', phase: 'tool_continuation', iteration: 1 },
    ]);
  });

  it('rechecks authority before an internal HTTP retry and propagates revocation', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmToolCallResponse([{ id: 'call_1', name: 'tool_github__list_repos', arguments: {} }])
    );
    mockFetchWithRetry.mockImplementationOnce(async (url, _options, retryOptions) => {
      await retryOptions.beforeAttempt({ attempt: 0, url });
      await retryOptions.beforeAttempt({ attempt: 1, url });
      throw new Error('unreachable');
    });
    const authorizationResult = { status: 'authorization_revoked', reasons: ['cancelled'] };
    const beforeExternalAction = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(authorizationResult);

    await expect(
      runAgentWithTools({
        prompt: 'List my repos',
        provider: 'groq',
        toolDefs: [sampleToolDef],
        toolRecords: [sampleToolRecord],
        beforeExternalAction,
      })
    ).rejects.toMatchObject({
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
      authorizationResult,
    });

    expect(beforeExternalAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'tool',
        phase: 'tool_http_request',
        toolId: 'tool-github',
        endpointName: 'list_repos',
        attempt: 1,
      })
    );
    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(1);
  });

  it('does not start a capped-output continuation after authority is revoked', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce({
      ...makeLlmTextResponse('Partial result'),
      finishReason: 'length',
    });
    const authorizationResult = { status: 'authorization_revoked', reasons: ['scope_changed'] };
    const beforeExternalAction = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(authorizationResult);

    await expect(
      runAgentWithTools({
        prompt: 'Produce the report',
        provider: 'groq',
        toolDefs: [sampleToolDef],
        toolRecords: [sampleToolRecord],
        beforeExternalAction,
      })
    ).rejects.toMatchObject({
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
      authorizationResult,
    });

    expect(beforeExternalAction).toHaveBeenLastCalledWith({
      kind: 'llm',
      phase: 'output_continuation',
      iteration: 0,
    });
    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(1);
  });

  it('does not run exhausted-iteration synthesis after authority is revoked', async () => {
    mockExecuteLlmV2.mockResolvedValue(
      makeLlmToolCallResponse([
        { id: 'call_repeat', name: 'tool_github__list_repos', arguments: {} },
      ])
    );
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([]),
    });
    const authorizationResult = { status: 'authorization_revoked', reasons: ['cancelled'] };
    const beforeExternalAction = vi.fn(async (action) =>
      action.phase === 'exhausted_iterations_synthesis' ? authorizationResult : null
    );

    await expect(
      runAgentWithTools({
        prompt: 'Keep searching',
        provider: 'groq',
        toolDefs: [sampleToolDef],
        toolRecords: [sampleToolRecord],
        beforeExternalAction,
      })
    ).rejects.toMatchObject({
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
      authorizationResult,
    });

    expect(beforeExternalAction).toHaveBeenLastCalledWith({
      kind: 'llm',
      phase: 'exhausted_iterations_synthesis',
      iteration: expect.any(Number),
    });
  });

  it('does not run fragment repair after authority is revoked', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('Let me try another search:'));
    const authorizationResult = { status: 'authorization_revoked', reasons: ['scope_changed'] };
    const beforeExternalAction = vi.fn(async (action) =>
      action.phase === 'fragment_repair' ? authorizationResult : null
    );

    await expect(
      runAgentWithTools({
        prompt: 'Produce the report',
        provider: 'groq',
        toolDefs: [sampleToolDef],
        toolRecords: [sampleToolRecord],
        beforeExternalAction,
      })
    ).rejects.toMatchObject({
      code: 'EXECUTION_AUTHORIZATION_REVOKED',
      authorizationResult,
    });

    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(1);
    expect(beforeExternalAction).toHaveBeenLastCalledWith({
      kind: 'llm',
      phase: 'fragment_repair',
      iteration: expect.any(Number),
    });
  });

  it('continues a capped tool-enabled final response on the pinned model', async () => {
    mockExecuteLlmV2
      .mockResolvedValueOnce({
        ...makeLlmTextResponse('# PRD: ScopeConfirm\n\nPart one'),
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        finishReason: 'length',
      })
      .mockResolvedValueOnce({
        ...makeLlmTextResponse('Part two\n\nEnd.'),
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        finishReason: 'stop',
      });

    const result = await runAgentWithTools({
      prompt: 'Produce the PRD',
      systemPrompt: 'Output the complete artifact.',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
      maxFinalTokens: 24000,
      toolDefs: [internalToolDef],
      toolRecords: [internalToolRecord],
    });

    expect(result.content).toContain('Part one\n\nPart two');
    expect(result.finishReason).toBe('stop');
    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(2);
    expect(mockExecuteLlmV2.mock.calls[0][0].maxTokens).toBe(24000);
    expect(mockExecuteLlmV2.mock.calls[1][0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
      maxTokens: 24000,
    });
    expect(mockExecuteLlmV2.mock.calls[1][0].tools).toBeUndefined();
  });

  it('fails closed when the tool-enabled continuation is also capped', async () => {
    mockExecuteLlmV2.mockResolvedValue({
      ...makeLlmTextResponse('partial'),
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      finishReason: 'length',
    });

    await expect(
      runAgentWithTools({
        prompt: 'Produce the PRD',
        systemPrompt: 'Output the complete artifact.',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
        toolDefs: [internalToolDef],
        toolRecords: [internalToolRecord],
      })
    ).rejects.toMatchObject({ code: 'LLM_OUTPUT_TRUNCATED' });
  });

  it('returns text response when LLM does not call tools', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('Here is your answer.'));

    const result = await runAgentWithTools({
      prompt: 'List my repos',
      systemPrompt: 'You are a developer.',
      provider: 'groq',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    expect(result.content).toBe('Here is your answer.');
    expect(result.toolLog).toHaveLength(0);
    expect(result.usage.total_tokens).toBe(150);
    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(1);

    // Should have passed tools in the LLM call
    const callArgs = mockExecuteLlmV2.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools.length).toBeGreaterThan(0);
  });

  it('pins every tool-loop turn and reports the provider that actually ran', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce({
      ...makeLlmTextResponse('Gemini completed the task.'),
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });

    const result = await runAgentWithTools({
      prompt: 'Complete the task',
      systemPrompt: 'You are an executor.',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
      userId: 'goal-owner',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    expect(mockExecuteLlmV2).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
        userId: 'goal-owner',
      })
    );
    expect(result).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash' });
  });

  it('executes tool calls and feeds results back to LLM', async () => {
    // First call: LLM returns a tool call
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmToolCallResponse([{ id: 'call_1', name: 'tool_github__list_repos', arguments: {} }])
    );

    // Mock the HTTP call for the tool
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify([{ name: 'repo1' }, { name: 'repo2' }]),
    });

    // Second call: LLM returns text
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmTextResponse('You have 2 repos: repo1 and repo2.')
    );

    const result = await runAgentWithTools({
      prompt: 'List my repos',
      systemPrompt: 'You are a developer.',
      provider: 'groq',
      userId: 'goal-owner',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    expect(result.content).toBe('You have 2 repos: repo1 and repo2.');
    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].name).toBe('tool_github__list_repos');
    expect(result.toolLog[0].success).toBe(true);
    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(2);
    for (const [options] of mockExecuteLlmV2.mock.calls) {
      expect(options.userId).toBe('goal-owner');
    }

    // Check that the HTTP call was made correctly
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      'https://api.github.com/user/repos',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_testtoken' }),
      }),
      expect.anything()
    );
  });

  it('handles internal tools without HTTP calls', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmToolCallResponse([
        {
          id: 'call_1',
          name: 'tool_doc_generator__generate',
          arguments: { title: 'Business Plan' },
        },
      ])
    );

    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmTextResponse('I generated a business plan for you.')
    );

    const result = await runAgentWithTools({
      prompt: 'Generate a business plan',
      systemPrompt: 'You are a CEO.',
      provider: 'anthropic',
      toolDefs: [internalToolDef],
      toolRecords: [internalToolRecord],
    });

    expect(result.content).toBe('I generated a business plan for you.');
    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].success).toBe(true);
    // No HTTP calls for internal tools
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('skips tools without credentials', async () => {
    const noKeyRecord = { ...sampleToolRecord, apiKey: '' };

    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('No tools available.'));

    const result = await runAgentWithTools({
      prompt: 'List repos',
      systemPrompt: 'You are a developer.',
      provider: 'groq',
      toolDefs: [sampleToolDef],
      toolRecords: [noKeyRecord],
    });

    expect(result.content).toBe('No tools available.');
    // Should NOT have passed tools since no credentials
    const callArgs = mockExecuteLlmV2.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it('accumulates usage across iterations', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmToolCallResponse([
        { id: 'call_1', name: 'tool_github__create_repo', arguments: { name: 'test' } },
      ])
    );

    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 1, name: 'test' }),
    });

    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('Repo created!'));

    const result = await runAgentWithTools({
      prompt: 'Create repo test',
      systemPrompt: 'Dev agent',
      provider: 'groq',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    // 2 LLM calls × 150 tokens each
    expect(result.usage.total_tokens).toBe(300);
    expect(result.estimatedCostUsd).toBe(0.002);
    expect(result.durationMs).toBe(800); // 300 + 500
  });

  it('handles tool execution errors gracefully', async () => {
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmToolCallResponse([{ id: 'call_1', name: 'tool_github__list_repos', arguments: {} }])
    );

    mockFetchWithRetry.mockRejectedValueOnce(new Error('Connection refused'));

    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('GitHub is unavailable right now.'));

    const result = await runAgentWithTools({
      prompt: 'List repos',
      systemPrompt: 'Dev agent',
      provider: 'groq',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    expect(result.content).toBe('GitHub is unavailable right now.');
    expect(result.toolLog[0].success).toBe(false);
    expect(result.toolLog[0].error).toBe('Connection refused');
  });

  // ── Composio (MCP) tool tests ────────────────────────────────

  it('routes Composio tools to executeComposioAction', async () => {
    const composioToolDef = {
      id: 'mcp-github',
      name: 'GitHub (MCP)',
      connectionType: 'composio',
      composioApp: 'github',
      actions: ['GITHUB_CREATE_ISSUE', 'GITHUB_LIST_REPOS'],
    };

    const composioToolRecord = {
      id: 'mcp-github',
      name: 'GitHub (MCP)',
      connectionType: 'composio',
    };

    // LLM calls a Composio tool
    mockExecuteLlmV2.mockResolvedValueOnce(
      makeLlmToolCallResponse([
        {
          id: 'call_1',
          name: 'mcp_github__GITHUB_CREATE_ISSUE',
          arguments: { input: { title: 'Bug', body: 'Fix it' } },
        },
      ])
    );

    mockExecuteComposioAction.mockResolvedValueOnce({
      success: true,
      result: '{"issue_id": 42}',
      durationMs: 200,
    });

    // LLM returns final text
    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('Created issue #42.'));

    const result = await runAgentWithTools({
      prompt: 'Create an issue about the bug',
      systemPrompt: 'Dev agent',
      provider: 'groq',
      toolDefs: [composioToolDef],
      toolRecords: [composioToolRecord],
      entityId: 'user-123',
    });

    expect(result.content).toBe('Created issue #42.');
    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].success).toBe(true);

    // Composio executor called with action name, args, and entityId
    expect(mockExecuteComposioAction).toHaveBeenCalledWith(
      'GITHUB_CREATE_ISSUE',
      { title: 'Bug', body: 'Fix it' },
      'user-123'
    );

    // No HTTP calls — Composio handles its own requests
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('includes Composio tools in LLM function defs without credentials', async () => {
    const composioToolDef = {
      id: 'mcp-discord',
      name: 'Discord (MCP)',
      connectionType: 'composio',
      actions: ['DISCORD_SEND_MESSAGE'],
    };

    const composioToolRecord = {
      id: 'mcp-discord',
      name: 'Discord (MCP)',
      connectionType: 'composio',
    };

    mockExecuteLlmV2.mockResolvedValueOnce(makeLlmTextResponse('Done.'));

    await runAgentWithTools({
      prompt: 'Send a message',
      systemPrompt: 'Agent',
      provider: 'groq',
      toolDefs: [composioToolDef],
      toolRecords: [composioToolRecord],
    });

    // Composio tools should be included even without apiKey
    const callArgs = mockExecuteLlmV2.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools.length).toBe(1);
    expect(callArgs.tools[0].function.name).toBe('mcp_discord__DISCORD_SEND_MESSAGE');
  });

  it('rejects an MCP action outside the task-approved action grant', async () => {
    const composioToolDef = {
      id: 'mcp-github',
      name: 'GitHub (MCP)',
      connectionType: 'composio',
      composioApp: 'github',
      actions: ['GITHUB_LIST_REPOS'],
    };
    const composioToolRecord = {
      id: 'mcp-github',
      name: 'GitHub (MCP)',
      connectionType: 'composio',
    };
    mockExecuteLlmV2
      .mockResolvedValueOnce(
        makeLlmToolCallResponse([
          {
            id: 'call_1',
            name: 'mcp_github__GITHUB_CREATE_ISSUE',
            arguments: { input: { title: 'Not approved' } },
          },
        ])
      )
      .mockResolvedValueOnce(makeLlmTextResponse('The action was not authorized.'));

    const result = await runAgentWithTools({
      prompt: 'Create an issue',
      systemPrompt: 'Dev agent',
      provider: 'groq',
      toolDefs: [composioToolDef],
      toolRecords: [composioToolRecord],
      entityId: 'user-123',
    });

    expect(mockExecuteComposioAction).not.toHaveBeenCalled();
    expect(result.toolLog[0]).toMatchObject({
      success: false,
      error: 'Action not authorized for mcp-github: GITHUB_CREATE_ISSUE',
    });
  });
});

// ── executeBrandfetch ─────────────────────────────────────────────
// Phase-0 Brand & Site Research depends on this — if the projection
// changes or auth shape silently breaks, the Designer goes back to
// hallucinating brand colors. These tests pin both behaviors.

import { executeBrandfetch } from './tool-runner.js';

describe('executeBrandfetch', () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    process.env.BRANDFETCH_API_KEY = 'bf_test_key';
  });

  it('rejects unknown endpoint without making a network call', async () => {
    const res = await executeBrandfetch(
      'not_a_real_endpoint',
      { domain: 'stripe.com' },
      Date.now()
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown Brandfetch endpoint/);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fails fast when BRANDFETCH_API_KEY is missing', async () => {
    delete process.env.BRANDFETCH_API_KEY;
    const res = await executeBrandfetch('lookup_brand', { domain: 'stripe.com' }, Date.now());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/BRANDFETCH_API_KEY not set/);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fails fast when domain is missing', async () => {
    const res = await executeBrandfetch('lookup_brand', {}, Date.now());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Missing domain/);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('projects the Brandfetch response to {name, logos, colors, fonts}', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Stripe',
        domain: 'stripe.com',
        description: 'Payments infra',
        logos: [
          {
            type: 'logo',
            formats: [{ src: 'https://cdn.brandfetch.io/stripe.svg', format: 'svg' }],
          },
          {
            type: 'icon',
            formats: [{ src: 'https://cdn.brandfetch.io/stripe-icon.svg', format: 'svg' }],
          },
        ],
        colors: [
          { hex: '#635BFF', type: 'primary', brightness: 100 },
          { hex: '#0A2540', type: 'dark', brightness: 30 },
        ],
        fonts: [{ name: 'Inter', type: 'sans-serif', origin: 'system' }],
        // Extra junk that should NOT make it into the projection
        social: { twitter: '@stripe' },
        rawHtml: '<html>...lots of bytes...</html>',
      }),
    });

    const res = await executeBrandfetch('lookup_brand', { domain: 'stripe.com' }, Date.now());
    expect(res.success).toBe(true);
    const parsed = JSON.parse(res.result);
    expect(parsed.name).toBe('Stripe');
    expect(parsed.domain).toBe('stripe.com');
    expect(parsed.logos).toHaveLength(2);
    expect(parsed.logos[0].src).toBe('https://cdn.brandfetch.io/stripe.svg');
    expect(parsed.colors).toEqual([
      { hex: '#635BFF', type: 'primary', brightness: 100 },
      { hex: '#0A2540', type: 'dark', brightness: 30 },
    ]);
    expect(parsed.fonts[0].name).toBe('Inter');
    // Extras stripped — confirms we project, not pass through
    expect(parsed.social).toBeUndefined();
    expect(parsed.rawHtml).toBeUndefined();
  });

  it('surfaces non-2xx responses as failures with the upstream body', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '{"error":"brand not found"}',
    });
    const res = await executeBrandfetch(
      'lookup_brand',
      { domain: 'nonexistent-brand-xyz.com' },
      Date.now()
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Brandfetch HTTP 404/);
    expect(res.error).toMatch(/brand not found/);
  });

  it('handles network errors without throwing', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await executeBrandfetch('lookup_brand', { domain: 'stripe.com' }, Date.now());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Brandfetch fetch failed.*ECONNREFUSED/);
  });

  it('truncates very large projections to keep tool output under 3kB', async () => {
    // 200 colors × ~30 bytes each = ~6kB raw JSON; projection should slice to 3000
    const manyColors = Array.from({ length: 200 }, (_, i) => ({
      hex: `#${i.toString(16).padStart(6, '0')}`,
      type: 'palette',
      brightness: i % 100,
    }));
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Big',
        domain: 'big.com',
        logos: [],
        colors: manyColors,
        fonts: [],
      }),
    });
    const res = await executeBrandfetch('lookup_brand', { domain: 'big.com' }, Date.now());
    expect(res.success).toBe(true);
    expect(res.result.length).toBeLessThanOrEqual(3000);
  });
});

// ── tool-bookmarks ─────────────────────────────────────────────────

function makeBookmarksAdmin({
  insertResult = {
    data: { id: 'bm1', title: 'T', url: 'https://x.com', tags: ['bookmark'] },
    error: null,
  },
  listResult = { data: [], error: null },
} = {}) {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => insertResult),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    // Thenable so `await q` in list_bookmarks resolves to listResult.
    then: (resolve) => resolve(listResult),
  };
  const client = { from: vi.fn(() => builder) };
  return { client, builder };
}

describe('executeBookmarksTool', () => {
  beforeEach(() => {
    mockBuildAdmin.mockReset();
  });

  it('requires a userId (entityId)', async () => {
    const res = await executeBookmarksTool(
      'save_bookmark',
      { url: 'https://x.com' },
      Date.now(),
      null
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/entityId/i);
  });

  it('rejects a non-http url on save', async () => {
    const { client } = makeBookmarksAdmin();
    mockBuildAdmin.mockReturnValue(client);
    const res = await executeBookmarksTool(
      'save_bookmark',
      { url: 'ftp://nope' },
      Date.now(),
      'u1'
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/valid http/i);
  });

  it('saves a bookmark as an agent-owned link under category bookmark', async () => {
    const { client, builder } = makeBookmarksAdmin();
    mockBuildAdmin.mockReturnValue(client);
    const res = await executeBookmarksTool(
      'save_bookmark',
      { url: 'https://arxiv.org/abs/1', title: 'Paper', collection: 'research' },
      Date.now(),
      'u1'
    );
    expect(res.success).toBe(true);
    const row = builder.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'u1',
      owner_type: 'agent',
      content_type: 'link',
      category: 'bookmark',
      url: 'https://arxiv.org/abs/1',
      title: 'Paper',
    });
    expect(row.tags).toEqual(['bookmark', 'research']);
  });

  it('lists bookmarks filtered by collection', async () => {
    const rows = [
      { id: 'bm1', title: 'Paper', url: 'https://arxiv.org/abs/1', tags: ['bookmark', 'research'] },
    ];
    const { client, builder } = makeBookmarksAdmin({ listResult: { data: rows, error: null } });
    mockBuildAdmin.mockReturnValue(client);
    const res = await executeBookmarksTool(
      'list_bookmarks',
      { collection: 'research' },
      Date.now(),
      'u1'
    );
    expect(res.success).toBe(true);
    expect(builder.contains).toHaveBeenCalledWith('tags', ['research']);
    expect(JSON.parse(res.result).bookmarks).toHaveLength(1);
  });
});

describe('Gemini thought_signature round-trip', () => {
  const SIG = { google: { thought_signature: 'ErEBCq4BARFNMg8P9EIEvBJ' } };

  /** The assistant message the loop feeds back on the follow-up turn. */
  const echoedToolCall = () => {
    const followUp = mockExecuteLlmV2.mock.calls[1][0];
    const assistant = followUp.messages.find((m) => m.role === 'assistant' && m.tool_calls);
    return assistant?.tool_calls?.[0];
  };

  beforeEach(() => {
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ repos: [] }),
    });
  });

  it('echoes the signature back, or Gemini 400s the follow-up turn', async () => {
    // Verified against the live API: omit this and the next request fails with
    // "Function call is missing a thought_signature in functionCall parts",
    // which broke every Gemini tool loop.
    mockExecuteLlmV2
      .mockResolvedValueOnce(
        makeLlmToolCallResponse([
          { id: 'call_1', name: 'tool_github__list_repos', arguments: {}, extraContent: SIG },
        ])
      )
      .mockResolvedValueOnce(makeLlmTextResponse('Done.'));

    await runAgentWithTools({
      prompt: 'List my repos',
      provider: 'gemini',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    expect(mockExecuteLlmV2).toHaveBeenCalledTimes(2);
    expect(echoedToolCall().extra_content).toEqual(SIG);
  });

  it('emits no extra_content for providers that never send one', async () => {
    // Sending a stray field to OpenAI/Groq/DeepSeek could be rejected — the
    // message must stay byte-identical to what it was before this fix.
    mockExecuteLlmV2
      .mockResolvedValueOnce(
        makeLlmToolCallResponse([{ id: 'call_1', name: 'tool_github__list_repos', arguments: {} }])
      )
      .mockResolvedValueOnce(makeLlmTextResponse('Done.'));

    await runAgentWithTools({
      prompt: 'List my repos',
      provider: 'groq',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    expect(echoedToolCall()).not.toHaveProperty('extra_content');
    expect(Object.keys(echoedToolCall()).sort()).toEqual(['function', 'id', 'type']);
  });

  it('leaves the anthropic tool_use branch untouched', async () => {
    mockExecuteLlmV2
      .mockResolvedValueOnce({
        ...makeLlmToolCallResponse([
          { id: 'call_1', name: 'tool_github__list_repos', arguments: {}, extraContent: SIG },
        ]),
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({ ...makeLlmTextResponse('Done.'), provider: 'anthropic' });

    await runAgentWithTools({
      prompt: 'List my repos',
      provider: 'anthropic',
      toolDefs: [sampleToolDef],
      toolRecords: [sampleToolRecord],
    });

    const followUp = mockExecuteLlmV2.mock.calls[1][0];
    const assistant = followUp.messages.find(
      (m) => m.role === 'assistant' && Array.isArray(m.content)
    );
    expect(assistant.content.some((c) => c.type === 'tool_use')).toBe(true);
    expect(JSON.stringify(assistant)).not.toContain('extra_content');
  });
});
