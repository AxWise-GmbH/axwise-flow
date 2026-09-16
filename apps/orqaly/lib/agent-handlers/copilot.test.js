/**
 * [module: agent-core]
 * Tests for the Platform Copilot agentic loop handler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, msg) => res.status(code).json({ error: msg })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'user-1'),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    startTimer: () => () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({ buildSupabaseAdminClient: vi.fn() }));
vi.mock('../concilium-handlers/llm-executor-v2.js', () => ({
  parseLlmJson: (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  },
}));
vi.mock('../usage-handlers/tracked-llm.js', () => ({ executeLlmV2Tracked: vi.fn() }));
vi.mock('../security/content-guard.js', () => ({
  guardUserContent: (msg) => ({ action: 'allow', cleaned: msg }),
  blockedResponse: vi.fn((res) => res.status(400).json({ blocked: true })),
}));
vi.mock('../security/audit-security-event.js', () => ({ auditSecurityEvent: vi.fn() }));
vi.mock('../api-handlers/assistant-chat.js', () => {
  const READS = [
    'insights.overview',
    'goal.list',
    'pulse.list',
    'task.overdue',
    'goal.get',
    'chat.searchHistory',
  ];
  return {
    buildCopilotSystemPrompt: vi.fn(() => 'SYS'),
    isReadTool: (t) => READS.includes(t),
    getRiskLevel: (t) => (t === 'goal.cancel' ? 'high' : READS.includes(t) ? 'safe' : 'medium'),
  };
});
vi.mock('../communicator-handlers/assistant-bridge.js', () => ({
  executeToolCall: vi.fn(),
  checkDailySpendCap: vi.fn(async () => ({ over: false, cap: 5, spent: 0 })),
}));
vi.mock('../communicator-handlers/chat-blocks-extractor.js', () => ({
  extractBlocks: vi.fn(() => []),
}));
vi.mock('../communicator-handlers/resolve-pending.js', () => ({ resolvePendingToolCall: vi.fn() }));
vi.mock('../integrations/axwise/index.js', () => ({
  buildCopilotContext: vi.fn((args) => ({
    integrationPoint: 'copilot.chat',
    requestId: args.requestId,
    tenant: args.tenant,
    payload: { message: args.message },
  })),
  withAxwiseTracked: vi.fn(async (_context, fallback) => ({
    ...fallback(),
    skipped: true,
  })),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { executeToolCall, checkDailySpendCap } from '../communicator-handlers/assistant-bridge.js';
import { resolvePendingToolCall } from '../communicator-handlers/resolve-pending.js';
import { buildCopilotSystemPrompt } from '../api-handlers/assistant-chat.js';
import copilot, { resolveCopilotOrgId } from './copilot.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(d) {
      this.body = d;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

function makeAdmin() {
  const insertCalls = [];
  return {
    _insertCalls: insertCalls,
    from() {
      return {
        insert(row) {
          insertCalls.push(row);
          return {
            select() {
              return { maybeSingle: async () => ({ data: { id: 'pending-1' } }) };
            },
            then(resolve) {
              return resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

function llmReply(obj, extra = {}) {
  return {
    content: JSON.stringify(obj),
    usage: {},
    estimatedCostUsd: 0.001,
    model: 'glm-5.1',
    provider: 'glm',
    ...extra,
  };
}

describe('resolveCopilotOrgId', () => {
  it('keeps a valid organization id', () => {
    expect(resolveCopilotOrgId('org-123', 'user-1')).toBe('org-123');
  });

  it('uses the authenticated user id when organization context is unavailable', () => {
    expect(resolveCopilotOrgId(undefined, 'user-1')).toBe('user-1');
    expect(resolveCopilotOrgId(null, 'user-1')).toBe('user-1');
    expect(resolveCopilotOrgId('invalid org id', 'user-1')).toBe('user-1');
  });
});

describe('copilot loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildSupabaseAdminClient.mockReturnValue(makeAdmin());
    checkDailySpendCap.mockResolvedValue({ over: false, cap: 5, spent: 0 });
    executeToolCall.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads then answers, feeding tool results back to the model', async () => {
    executeLlmV2Tracked
      .mockResolvedValueOnce(
        llmReply({ action: 'read', calls: [{ tool: 'insights.overview', args: {} }] })
      )
      .mockResolvedValueOnce(
        llmReply({ action: 'answer', message: 'All good', proposedActions: [] })
      );
    executeToolCall.mockResolvedValue({ insights: { tasks: { dueSoon: 3 } } });

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'how are things?' },
    };
    const res = mockRes();
    await copilot(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('All good');
    expect(executeToolCall).toHaveBeenCalledWith(expect.anything(), 'user-1', 'insights.overview', {
      organization_id: 'user-1',
    });
    const secondCallMessages = executeLlmV2Tracked.mock.calls[1][0].messages;
    expect(JSON.stringify(secondCallMessages)).toContain('TOOL RESULTS');
  });

  it('queues Copilot grounding durably instead of starting a fire-and-forget request', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    const admin = makeAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'Ground this answer', proposedActions: [] })
    );

    await copilot(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'Give me a verified answer' },
      },
      mockRes()
    );

    expect(admin._insertCalls).toContainEqual(
      expect.objectContaining({
        status: 'queued',
        payload: expect.objectContaining({
          type: 'axwise-ground',
          _userId: 'user-1',
          draftAnswer: 'Ground this answer',
        }),
      })
    );
  });

  it('forwards the selected provider/model to buildCopilotSystemPrompt', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'ok', proposedActions: [] })
    );

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: {
        action: 'copilot',
        message: 'which model are you?',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
      },
    };
    await copilot(req, mockRes());

    expect(buildCopilotSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-2.5-pro' })
    );
  });

  it('completes a provider-only request with that provider compatible default', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'ok', proposedActions: [] })
    );

    await copilot(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hi', provider: 'openai' },
      },
      mockRes()
    );

    expect(executeLlmV2Tracked.mock.calls[0][0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(buildCopilotSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', model: 'gpt-4o-mini' })
    );
  });

  it('infers the provider for a model-only request', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'ok', proposedActions: [] })
    );

    await copilot(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hi', model: 'claude-haiku-4-5' },
      },
      mockRes()
    );

    expect(executeLlmV2Tracked.mock.calls[0][0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    });
  });

  it('never auto-executes a mutation the model puts in a read turn', async () => {
    executeLlmV2Tracked
      .mockResolvedValueOnce(
        llmReply({ action: 'read', calls: [{ tool: 'goal.cancel', args: { id: 'g1' } }] })
      )
      .mockResolvedValueOnce(llmReply({ action: 'answer', message: 'ok', proposedActions: [] }));

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'cancel goal g1' },
    };
    const res = mockRes();
    await copilot(req, res);

    expect(executeToolCall).not.toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'goal.cancel',
      expect.anything()
    );
    const secondCallMessages = executeLlmV2Tracked.mock.calls[1][0].messages;
    expect(JSON.stringify(secondCallMessages)).toContain('NOT run');
  });

  it('passes the prior conversation to the model as real message turns', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'your first message was "hey"', proposedActions: [] })
    );
    const history = [
      { role: 'user', content: 'hey' },
      { role: 'assistant', content: 'hi there!' },
      { role: 'user', content: 'do we have open tasks?' },
    ];
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'what was my first message?', history },
    };
    await copilot(req, mockRes());

    const messages = executeLlmV2Tracked.mock.calls[0][0].messages;
    // system, then the three prior turns as real {role, content}, then the new user message.
    expect(messages).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'hey' },
        { role: 'assistant', content: 'hi there!' },
        { role: 'user', content: 'do we have open tasks?' },
      ])
    );
    // The real first message reaches the model (previously it was capped out).
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: 'hey' });
    // No omission note for a short thread.
    expect(JSON.stringify(messages)).not.toContain('were omitted');
  });

  it('adds an omitted-history note when the thread exceeds the window', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'ok', proposedActions: [] })
    );
    const history = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}`,
    }));
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'recap', history },
    };
    await copilot(req, mockRes());
    const messages = executeLlmV2Tracked.mock.calls[0][0].messages;
    expect(JSON.stringify(messages)).toContain('were omitted');
  });

  it('excludes the current conversation when the model searches past chats', async () => {
    executeLlmV2Tracked
      .mockResolvedValueOnce(
        llmReply({
          action: 'read',
          calls: [{ tool: 'chat.searchHistory', args: { query: 'budget' } }],
        })
      )
      .mockResolvedValueOnce(
        llmReply({ action: 'answer', message: 'found it', proposedActions: [] })
      );
    executeToolCall.mockResolvedValue({ matches: [], count: 0 });

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: {
        action: 'copilot',
        message: 'search my old chats for budget',
        conversationId: 'conv-current',
      },
    };
    await copilot(req, mockRes());

    expect(executeToolCall).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'chat.searchHistory',
      expect.objectContaining({ query: 'budget', excludeConversationId: 'conv-current' })
    );
  });

  it('surfaces mutations as persisted proposedActions with a pendingCallId', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({
        action: 'answer',
        message: 'Created',
        proposedActions: [{ tool: 'goal.create', args: { title: 'X' }, summary: 'Create goal X' }],
      })
    );

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'create a goal X' },
    };
    const res = mockRes();
    await copilot(req, res);

    expect(res.body.proposedActions).toHaveLength(1);
    expect(res.body.proposedActions[0]).toMatchObject({
      tool: 'goal.create',
      riskLevel: 'medium',
      pendingCallId: 'pending-1',
    });
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('completes an empty goal.create proposal and flags what it filled in as a draft', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({
        action: 'answer',
        message: 'What is the project name?',
        proposedActions: [
          { tool: 'goal.create', args: {}, summary: 'Create a new project goal in Orqaly' },
        ],
      })
    );
    const admin = makeAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await copilot(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hey, lets build a project - help me' },
      },
      res
    );

    const proposal = res.body.proposedActions[0];
    expect(proposal.args).toMatchObject({
      title: 'New goal',
      budget_usd: 10,
      complexity: 'simple',
    });
    expect(proposal.draftFields).toEqual(['title', 'budget_usd', 'complexity']);
    // The same completed args are what an approval will run.
    expect(admin._insertCalls).toContainEqual(
      expect.objectContaining({ tool: 'goal.create', args: proposal.args })
    );
  });

  it('leaves a stated goal.create proposal alone and marks nothing as a draft', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({
        action: 'answer',
        message: 'Ready when you are',
        proposedActions: [
          {
            tool: 'goal.create',
            args: {
              title: 'Landing page',
              description: 'Ship it',
              budget_usd: 25,
              complexity: 'simple',
            },
            summary: 'Create the landing page goal',
          },
        ],
      })
    );

    const res = mockRes();
    await copilot(
      {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'build me a landing page, budget $25' },
      },
      res
    );

    const proposal = res.body.proposedActions[0];
    expect(proposal.args).toMatchObject({ title: 'Landing page', budget_usd: 25 });
    expect(proposal.draftFields).toEqual([]);
  });

  it('defaults to gemini/gemini-3.8-flash when no provider is configured', async () => {
    executeLlmV2Tracked.mockResolvedValueOnce(
      llmReply({ action: 'answer', message: 'hi', proposedActions: [] })
    );
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'hi' },
    };
    const res = mockRes();
    await copilot(req, res);
    expect(executeLlmV2Tracked.mock.calls[0][0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('returns a graceful message (not a 500) when the model call throws', async () => {
    executeLlmV2Tracked.mockRejectedValueOnce(new Error('AbortError: reaching model failed'));
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'hi' },
    };
    const res = mockRes();
    await copilot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('hit an error reaching the model');
  });

  it('surfaces the underlying reason off-Vercel so the failure is diagnosable', async () => {
    // A missing key, a 401, a timeout and a bad model name all used to look
    // identical from the UI; the cause reached only the server log.
    const savedVercel = process.env.VERCEL;
    delete process.env.VERCEL;
    try {
      executeLlmV2Tracked.mockRejectedValueOnce(new Error('NO_API_KEY: gemini has no key'));
      const req = {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hi' },
      };
      const res = mockRes();
      await copilot(req, res);
      expect(res.body.message).toContain('NO_API_KEY');
      expect(res.body.llmError).toContain('NO_API_KEY');
    } finally {
      if (savedVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = savedVercel;
    }
  });

  it('keeps the generic message in production (no provider internals leaked)', async () => {
    const savedVercel = process.env.VERCEL;
    process.env.VERCEL = '1';
    try {
      executeLlmV2Tracked.mockRejectedValueOnce(new Error('NO_API_KEY: gemini has no key'));
      const req = {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hi' },
      };
      const res = mockRes();
      await copilot(req, res);
      expect(res.body.message).toBe('I hit an error reaching the model. Please try again.');
      expect(res.body.message).not.toContain('NO_API_KEY');
    } finally {
      if (savedVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = savedVercel;
    }
  });

  it('honours LLM_DEFAULT_PROVIDER/MODEL when the request specifies none', async () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.5-flash';
    try {
      executeLlmV2Tracked.mockResolvedValueOnce(
        llmReply({ action: 'answer', message: 'hi', proposedActions: [] })
      );
      const req = {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hi' },
      };
      const res = mockRes();
      await copilot(req, res);
      expect(executeLlmV2Tracked.mock.calls[0][0]).toMatchObject({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
      });
    } finally {
      delete process.env.LLM_DEFAULT_PROVIDER;
      delete process.env.LLM_DEFAULT_MODEL;
    }
  });

  it('lets an explicit request provider win over the env default', async () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.5-flash';
    try {
      executeLlmV2Tracked.mockResolvedValueOnce(
        llmReply({ action: 'answer', message: 'hi', proposedActions: [] })
      );
      const req = {
        method: 'POST',
        headers: {},
        query: {},
        body: { action: 'copilot', message: 'hi', provider: 'openai', model: 'gpt-4o-mini' },
      };
      const res = mockRes();
      await copilot(req, res);
      expect(executeLlmV2Tracked.mock.calls[0][0]).toMatchObject({
        provider: 'openai',
        model: 'gpt-4o-mini',
      });
    } finally {
      delete process.env.LLM_DEFAULT_PROVIDER;
      delete process.env.LLM_DEFAULT_MODEL;
    }
  });

  it('re-asks once when the model returns unparseable JSON, then answers (never leaks raw JSON)', async () => {
    // Raw content with a literal newline inside a string value — invalid JSON,
    // so the (plain-JSON.parse) mock returns null and the fallback engages.
    executeLlmV2Tracked
      .mockResolvedValueOnce({
        content: '{"action":"answer","message":"line1\nline2"}',
        usage: {},
        estimatedCostUsd: 0.001,
        model: 'gemini-3-pro-preview',
        provider: 'gemini',
      })
      .mockResolvedValueOnce(
        llmReply({ action: 'answer', message: 'Here is your real answer', proposedActions: [] })
      );

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'how many agents do we have' },
    };
    const res = mockRes();
    await copilot(req, res);

    expect(res.body.message).toBe('Here is your real answer');
    expect(executeLlmV2Tracked).toHaveBeenCalledTimes(2); // it re-asked
    expect(JSON.stringify(executeLlmV2Tracked.mock.calls[1][0].messages)).toContain(
      'not valid JSON'
    );
    expect(res.body.message).not.toContain('"action"'); // protocol JSON never surfaced
  });

  it('never surfaces raw protocol JSON — falls back gracefully when every turn is unparseable', async () => {
    executeLlmV2Tracked.mockResolvedValue({
      content: '{"action":"read","calls":[{"tool":"goal.list","args":{}}],"thought":"x\ny"}',
      usage: {},
      estimatedCostUsd: 0.001,
      model: 'gemini-3-pro-preview',
      provider: 'gemini',
    });

    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'what is the last failed goal' },
    };
    const res = mockRes();
    await copilot(req, res);

    expect(res.body.message).toContain('trouble formatting');
    expect(res.body.message).not.toContain('"action"');
    expect(res.body.message).not.toContain('goal.list');
  });

  it('short-circuits when the daily spend cap is exceeded', async () => {
    checkDailySpendCap.mockResolvedValue({ over: true, cap: 5, spent: 6 });
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'copilot', message: 'hi' },
    };
    const res = mockRes();
    await copilot(req, res);
    expect(res.body.capExceeded).toBe(true);
    expect(executeLlmV2Tracked).not.toHaveBeenCalled();
  });

  it('routes resolve-action to the resolver', async () => {
    resolvePendingToolCall.mockResolvedValue({
      status: 'approved',
      tool: 'goal.create',
      result: {},
      blocks: [],
    });
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'resolve-action', pendingCallId: 'p1', decision: 'approve' },
    };
    const res = mockRes();
    await copilot(req, res);
    expect(res.body.status).toBe('approved');
    expect(resolvePendingToolCall).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'p1',
      'approve'
    );
  });

  it('rejects an invalid resolve decision', async () => {
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: { action: 'resolve-action', pendingCallId: 'p1', decision: 'maybe' },
    };
    const res = mockRes();
    await copilot(req, res);
    expect(res.statusCode).toBe(400);
  });
});
