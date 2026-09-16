import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
  executeLlmV2Tracked: vi.fn(),
  queryAgentGraph: vi.fn(),
  searchAgentMemory: vi.fn(),
  formatMemoryForPrompt: vi.fn(),
  withAxwiseTracked: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: () => 'token',
  verifySupabaseToken: mocks.verifySupabaseToken,
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  applyRateLimitHeaders: vi.fn(),
  checkRateLimit: () => ({ allowed: true }),
  getRateLimitIdentifier: () => 'user-1',
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../_shared/kb-scope.js', () => ({
  resolveAgentKbScope: vi.fn(async () => ({ organization_id: null, concilium_id: null })),
}));
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: mocks.executeLlmV2Tracked,
}));
vi.mock('../_shared/llm-defaults.js', () => ({
  defaultProvider: () => 'test-provider',
  defaultModel: () => 'test-model',
}));
vi.mock('../workflow-engine/memory-manager.js', () => ({
  searchAgentMemory: mocks.searchAgentMemory,
  formatMemoryForPrompt: mocks.formatMemoryForPrompt,
  UNTRUSTED_REFERENCE_SYSTEM_RULE: 'TRUSTED MEMORY BOUNDARY RULE',
}));
vi.mock('../_shared/agent-memory.js', () => ({
  isAgentMemoryEnabled: () => true,
  agentMemoryOwnerId: (agent) =>
    String(agent?.metadata?.agent_id || '').startsWith('predefined:')
      ? agent.metadata.agent_id
      : agent?.id,
}));
vi.mock('../_shared/graphify-agent.js', () => ({ queryAgentGraph: mocks.queryAgentGraph }));
vi.mock('../agent-handlers/load-active-skills.js', () => ({
  loadActiveSkills: vi.fn(async () => ''),
}));
vi.mock('../agent-handlers/load-connected-libraries.js', () => ({
  loadConnectedLibraries: vi.fn(async () => ''),
}));
vi.mock('../security/content-guard.js', () => ({
  guardUserContent: (message) => ({ action: 'allow', cleaned: message }),
  blockedResponse: vi.fn(),
}));
vi.mock('../security/audit-security-event.js', () => ({
  auditSecurityEvent: vi.fn(async () => {}),
}));
vi.mock('../integrations/axwise/index.js', () => ({
  buildCopilotContext: (context) => context,
  withAxwiseTracked: mocks.withAxwiseTracked,
}));

import handler from './agent-chat.js';

const OWN_THREAD = '11111111-1111-4111-8111-111111111111';
const FOREIGN_THREAD = '22222222-2222-4222-8222-222222222222';

function matches(row, state) {
  for (const [field, value] of Object.entries(state.eq)) {
    if (row[field] !== value) return false;
  }
  for (const [field, values] of Object.entries(state.in)) {
    if (!values.includes(row[field])) return false;
  }
  return true;
}

function createAdmin(seed = {}) {
  const rows = structuredClone(seed);
  const reads = [];
  const inserts = [];

  const admin = {
    rows,
    reads,
    inserts,
    from: vi.fn((table) => {
      rows[table] ||= [];
      const state = { eq: {}, in: {}, order: null, limit: null };

      const run = () => {
        let data = rows[table].filter((row) => matches(row, state));
        if (state.order) {
          const { field, ascending } = state.order;
          data = [...data].sort((a, b) => {
            const result = String(a[field] || '').localeCompare(String(b[field] || ''));
            return ascending ? result : -result;
          });
        }
        if (Number.isInteger(state.limit)) data = data.slice(0, state.limit);
        reads.push({ table, eq: { ...state.eq }, in: structuredClone(state.in) });
        return data;
      };

      const query = {
        select: () => query,
        eq: (field, value) => {
          state.eq[field] = value;
          return query;
        },
        in: (field, values) => {
          state.in[field] = values;
          return query;
        },
        order: (field, options = {}) => {
          state.order = { field, ascending: options.ascending !== false };
          return query;
        },
        limit: (limit) => {
          state.limit = limit;
          return query;
        },
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        insert: async (payload) => {
          const list = (Array.isArray(payload) ? payload : [payload]).map((row, index) => ({
            id: row.id || `${table}-insert-${inserts.length + index + 1}`,
            ...row,
          }));
          rows[table].push(...list);
          inserts.push(...list.map((row) => ({ table, row })));
          return { data: list, error: null };
        },
        then: (resolve, reject) =>
          Promise.resolve({ data: run(), error: null }).then(resolve, reject),
      };
      return query;
    }),
  };

  return admin;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    chunks: [],
    headers: {},
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
      return this;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end() {
      return this;
    },
  };
}

function getRequest(agentId) {
  return {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
    query: { agent_id: agentId },
  };
}

function postRequest(agentId, body = {}) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    query: {},
    body: { agent_id: agentId, message: 'Hello agent', ...body },
  };
}

function doneEvent(res) {
  const raw = res.chunks.find((chunk) => chunk.startsWith('event: done'));
  return raw ? JSON.parse(raw.split('\ndata: ')[1]) : null;
}

describe('agent chat tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1', email: 'owner@example.test' });
    mocks.executeLlmV2Tracked.mockResolvedValue({
      content: 'Owned response',
      estimatedCostUsd: 0,
      model: 'test-model',
      provider: 'test-provider',
    });
    mocks.queryAgentGraph.mockResolvedValue('OWN GRAPH');
    mocks.searchAgentMemory.mockResolvedValue([]);
    mocks.formatMemoryForPrompt.mockImplementation((_memory, graph) =>
      graph ? `<untrusted_reference_context>\n[GRAPH] ${graph}\n</untrusted_reference_context>` : ''
    );
    mocks.withAxwiseTracked.mockResolvedValue({
      degraded: false,
      skipped: false,
      processedOutputs: {},
    });
  });

  it('rejects a cross-tenant agent before profile, graph, history, or LLM reads', async () => {
    const admin = createAdmin({
      agents: [{ id: 'agent-foreign', user_id: 'user-2', name: 'Victim agent', metadata: {} }],
      agent_profiles: [
        {
          id: 'profile-foreign',
          agent_id: 'agent-foreign',
          user_id: 'user-2',
          backstory: 'VICTIM PROFILE SECRET',
        },
      ],
      communication_logs: [
        {
          id: 'foreign-message',
          user_id: 'user-2',
          thread_id: FOREIGN_THREAD,
          context_type: 'agent-chat',
          context_id: 'agent-foreign',
          sender_type: 'agent',
          sender_id: 'agent-foreign',
          content: 'VICTIM HISTORY SECRET',
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(postRequest('agent-foreign'), res);

    expect(res.statusCode).toBe(404);
    expect(admin.reads).toContainEqual({
      table: 'agents',
      eq: { id: 'agent-foreign', user_id: 'user-1' },
      in: {},
    });
    expect(admin.reads.some(({ table }) => table === 'agent_profiles')).toBe(false);
    expect(admin.reads.some(({ table }) => table === 'communication_logs')).toBe(false);
    expect(admin.inserts).toHaveLength(0);
    expect(mocks.queryAgentGraph).not.toHaveBeenCalled();
    expect(mocks.executeLlmV2Tracked).not.toHaveBeenCalled();
  });

  it('returns only threads anchored by the authenticated user for an owned agent', async () => {
    const admin = createAdmin({
      agents: [{ id: 'agent-own', user_id: 'user-1', name: 'Owned agent', metadata: {} }],
      communication_logs: [
        {
          id: 'own-user',
          user_id: 'user-1',
          thread_id: OWN_THREAD,
          sender_type: 'user',
          sender_id: 'user-1',
          sender_name: 'Owner',
          content: 'Owned question',
          context_type: 'agent-chat',
          context_id: 'agent-own',
          created_at: '2026-08-24T10:00:00.000Z',
        },
        {
          id: 'own-agent',
          user_id: 'user-1',
          thread_id: OWN_THREAD,
          sender_type: 'agent',
          sender_id: 'agent-own',
          sender_name: 'Owned agent',
          content: 'Owned answer',
          context_type: 'agent-chat',
          context_id: 'agent-own',
          created_at: '2026-08-24T10:01:00.000Z',
        },
        {
          id: 'foreign-user',
          user_id: 'user-2',
          thread_id: FOREIGN_THREAD,
          sender_type: 'user',
          sender_id: 'user-2',
          sender_name: 'Attacker',
          content: 'Historical unauthorized question',
          context_type: 'agent-chat',
          context_id: 'agent-own',
          created_at: '2026-08-24T11:00:00.000Z',
        },
        {
          id: 'foreign-agent-reply',
          user_id: 'user-2',
          thread_id: FOREIGN_THREAD,
          sender_type: 'agent',
          sender_id: 'agent-own',
          sender_name: 'Owned agent',
          content: 'OLD FOREIGN AGENT REPLY',
          context_type: 'agent-chat',
          context_id: 'agent-own',
          created_at: '2026-08-24T11:01:00.000Z',
        },
        {
          id: 'foreign-in-owned-thread',
          user_id: 'user-2',
          thread_id: OWN_THREAD,
          sender_type: 'user',
          sender_id: 'user-2',
          sender_name: 'Attacker',
          content: 'FOREIGN INJECTION',
          context_type: 'agent-chat',
          context_id: 'agent-own',
          created_at: '2026-08-24T10:02:00.000Z',
        },
        {
          id: 'legacy-null-owner',
          user_id: null,
          thread_id: OWN_THREAD,
          sender_type: 'agent',
          sender_id: 'agent-own',
          sender_name: 'Owned agent',
          content: 'LEGACY AMBIGUOUS HISTORY',
          context_type: 'agent-chat',
          context_id: 'agent-own',
          created_at: '2026-08-24T10:03:00.000Z',
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(getRequest('agent-own'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.map(({ content }) => content)).toEqual(['Owned question', 'Owned answer']);
    expect(JSON.stringify(res.body)).not.toContain('OLD FOREIGN');
    expect(JSON.stringify(res.body)).not.toContain('FOREIGN INJECTION');
    expect(JSON.stringify(res.body)).not.toContain('LEGACY AMBIGUOUS');
  });

  it('scopes the profile and graph to the caller while preserving same-tenant chat', async () => {
    const admin = createAdmin({
      agents: [
        {
          id: 'agent-own',
          user_id: 'user-1',
          name: 'Owned agent',
          metadata: { agent_id: 'canonical-agent-own' },
        },
      ],
      agent_profiles: [
        {
          id: 'profile-victim',
          agent_id: 'agent-own',
          user_id: 'user-2',
          display_name: 'Victim profile',
          backstory: 'VICTIM PROFILE SECRET',
        },
        {
          id: 'profile-own',
          agent_id: 'agent-own',
          user_id: 'user-1',
          display_name: 'Owned profile',
          backstory: 'OWN PROFILE',
        },
      ],
      communication_logs: [],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(postRequest('agent-own'), res);

    const llmCall = mocks.executeLlmV2Tracked.mock.calls[0][0];
    const systemPrompt = llmCall.messages[0].content;
    const referenceMessage = llmCall.messages.find(
      ({ role, content }) => role === 'user' && content.includes('OWN GRAPH')
    );
    expect(systemPrompt).toContain('Owned profile');
    expect(systemPrompt).toContain('OWN PROFILE');
    expect(systemPrompt).not.toContain('OWN GRAPH');
    expect(systemPrompt).toContain('TRUSTED MEMORY BOUNDARY RULE');
    expect(referenceMessage?.content).toContain('<untrusted_reference_context>');
    expect(referenceMessage?.content).toContain('Hello agent');
    expect(systemPrompt).not.toContain('VICTIM PROFILE');
    expect(mocks.searchAgentMemory).toHaveBeenCalledWith(
      'Hello agent',
      'user-1',
      'agent',
      'agent-own',
      { limit: 3, threshold: 0.3 }
    );
    expect(mocks.queryAgentGraph).toHaveBeenCalledWith('agent-own', 'Hello agent', admin, {
      userId: 'user-1',
    });
    expect(admin.reads).toContainEqual({
      table: 'agent_profiles',
      eq: { agent_id: 'agent-own', user_id: 'user-1' },
      in: {},
    });
    const written = admin.inserts.filter(({ table }) => table === 'communication_logs');
    expect(written).toHaveLength(2);
    expect(written.every(({ row }) => row.metadata.user_id === 'user-1')).toBe(true);
    expect(doneEvent(res)?.agent_name).toBe('Owned profile');
  });

  it('replaces a foreign existing thread id instead of appending to it', async () => {
    const admin = createAdmin({
      agents: [{ id: 'agent-own', user_id: 'user-1', name: 'Owned agent', metadata: {} }],
      agent_profiles: [],
      communication_logs: [
        {
          id: 'foreign-user',
          user_id: 'user-2',
          thread_id: FOREIGN_THREAD,
          sender_type: 'user',
          sender_id: 'user-2',
          context_type: 'agent-chat',
          context_id: 'agent-own',
        },
        {
          id: 'foreign-agent-reply',
          user_id: 'user-2',
          thread_id: FOREIGN_THREAD,
          sender_type: 'agent',
          sender_id: 'agent-own',
          context_type: 'agent-chat',
          context_id: 'agent-own',
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(postRequest('agent-own', { thread_id: FOREIGN_THREAD }), res);

    const returnedThread = doneEvent(res)?.thread_id;
    expect(returnedThread).toMatch(/^[0-9a-f-]{36}$/i);
    expect(returnedThread).not.toBe(FOREIGN_THREAD);
    const written = admin.inserts.filter(({ table }) => table === 'communication_logs');
    expect(written).toHaveLength(2);
    expect(written.every(({ row }) => row.thread_id === returnedThread)).toBe(true);
  });

  it('reuses an existing thread anchored by the same user and agent', async () => {
    const admin = createAdmin({
      agents: [{ id: 'agent-own', user_id: 'user-1', name: 'Owned agent', metadata: {} }],
      agent_profiles: [],
      communication_logs: [
        {
          id: 'own-user',
          user_id: 'user-1',
          thread_id: OWN_THREAD,
          sender_type: 'user',
          sender_id: 'user-1',
          context_type: 'agent-chat',
          context_id: 'agent-own',
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(postRequest('agent-own', { thread_id: OWN_THREAD }), res);

    expect(doneEvent(res)?.thread_id).toBe(OWN_THREAD);
    const written = admin.inserts.filter(({ table }) => table === 'communication_logs');
    expect(written).toHaveLength(2);
    expect(written.every(({ row }) => row.thread_id === OWN_THREAD)).toBe(true);
  });
});
