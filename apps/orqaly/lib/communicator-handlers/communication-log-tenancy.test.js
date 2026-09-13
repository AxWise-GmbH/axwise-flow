import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: () => 'token',
  verifySupabaseToken: mocks.verifySupabaseToken,
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res, error) => res.status(500).json({ error: error.message }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: () => ({ allowed: true }),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: () => 'user-1',
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('./assistant-bridge.js', () => ({
  processAssistantMessage: vi.fn(),
}));

import agentRoomHandler from './agent-room.js';
import controllerHandler from './controller.js';

function createAdmin(seed = {}) {
  const rows = structuredClone(seed);
  const filters = [];
  const inserts = [];

  return {
    filters,
    inserts,
    from: vi.fn((table) => {
      rows[table] ||= [];
      const state = { eq: {}, order: null, limit: null };
      const run = () => {
        let data = rows[table].filter((row) =>
          Object.entries(state.eq).every(([field, value]) => row[field] === value)
        );
        if (state.order) {
          const { field, ascending } = state.order;
          data = [...data].sort((a, b) => {
            const order = String(a[field] || '').localeCompare(String(b[field] || ''));
            return ascending ? order : -order;
          });
        }
        if (Number.isInteger(state.limit)) data = data.slice(0, state.limit);
        return data;
      };
      const query = {
        select: () => query,
        eq: (field, value) => {
          state.eq[field] = value;
          filters.push([table, field, value]);
          return query;
        },
        order: (field, options = {}) => {
          state.order = { field, ascending: options.ascending !== false };
          return query;
        },
        limit: (value) => {
          state.limit = value;
          return query;
        },
        gte: () => query,
        lte: () => query,
        ilike: () => query,
        insert: (row) => {
          inserts.push({ table, row });
          rows[table].push(row);
          return Promise.resolve({ data: row, error: null });
        },
        then: (resolve, reject) =>
          Promise.resolve({ data: run(), error: null }).then(resolve, reject),
      };
      return query;
    }),
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe('communication log admin tenant boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
  });

  it('scopes controller /logs and stamps its service-role command write', async () => {
    const admin = createAdmin({
      communication_logs: [
        {
          id: 'own-log',
          user_id: 'user-1',
          sender_name: 'Owned agent',
          content: 'OWN LOG',
          context_type: 'build',
          created_at: '2026-08-24T10:00:00.000Z',
        },
        {
          id: 'victim-log',
          user_id: 'user-2',
          sender_name: 'Victim agent',
          content: 'VICTIM LOG',
          context_type: 'build',
          created_at: '2026-08-24T11:00:00.000Z',
        },
      ],
      command_history: [],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await controllerHandler(
      { method: 'POST', headers: {}, query: { op: 'execute' }, body: { input: '/logs 10' } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.output).toContain('OWN LOG');
    expect(res.body.output).not.toContain('VICTIM LOG');
    expect(admin.filters).toContainEqual(['communication_logs', 'user_id', 'user-1']);
    const write = admin.inserts.find(({ table }) => table === 'communication_logs').row;
    expect(write).toMatchObject({
      user_id: 'user-1',
      sender_type: 'user',
      sender_id: 'user-1',
    });
  });

  it('scopes agent activity to the authenticated tenant', async () => {
    const admin = createAdmin({
      communication_logs: [
        {
          id: 'own-agent-log',
          user_id: 'user-1',
          sender_type: 'agent',
          content: 'OWN AGENT ACTIVITY',
          created_at: '2026-08-24T10:00:00.000Z',
        },
        {
          id: 'victim-agent-log',
          user_id: 'user-2',
          sender_type: 'agent',
          content: 'VICTIM AGENT ACTIVITY',
          created_at: '2026-08-24T11:00:00.000Z',
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await agentRoomHandler({ method: 'GET', headers: {}, query: { op: 'agent-activity' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.logs.map(({ content }) => content)).toEqual(['OWN AGENT ACTIVITY']);
    expect(admin.filters).toContainEqual(['communication_logs', 'user_id', 'user-1']);
  });
});
