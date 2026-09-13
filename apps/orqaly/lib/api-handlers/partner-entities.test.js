/**
 * partner-entities endpoint contract tests. Mocks at the boundary (auth,
 * rate-limit, supabase admin client). Exercises routing, entity CRUD,
 * server-side metric aggregation, and the transform (field-carry) logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseAdminClient: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 59, limit: 60, reset: 0 })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => () => undefined }),
}));

vi.mock('../../api/_lib/auth.js', () => ({
  verifySupabaseToken: mocks.verifySupabaseToken,
  getBearerToken: mocks.getBearerToken,
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, code, msg) => res.status(code).json({ error: msg }),
  handleApiError: (res, err) => res.status(500).json({ error: err.message }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: mocks.checkRateLimit,
  applyRateLimitHeaders: mocks.applyRateLimitHeaders,
  getRateLimitIdentifier: mocks.getRateLimitIdentifier,
}));
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: mocks.createLogger }));

const { default: handler } = await import('./partner-entities.js');

/**
 * Per-table fake. `tables` maps table name → { rows, single, maybeSingle }.
 * Every builder method returns the builder; awaiting the builder resolves to
 * { data: rows }. Terminal single/maybeSingle resolve their own configured row.
 * insert/update/upsert calls are recorded on the returned builder.
 */
function makeAdmin(tables = {}) {
  const builders = {};
  function builderFor(name) {
    const cfg = tables[name] || {};
    const b = {
      _name: name,
      insert: vi.fn(() => b),
      update: vi.fn(() => b),
      upsert: vi.fn(() => b),
      delete: vi.fn(() => b),
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      maybeSingle: vi.fn(async () => ({ data: cfg.maybeSingle ?? null, error: null })),
      single: vi.fn(async () => ({ data: cfg.single ?? { id: 'new' }, error: null })),
      then: (resolve) => Promise.resolve({ data: cfg.rows ?? [], error: null }).then(resolve),
    };
    builders[name] = b;
    return b;
  }
  return {
    client: { from: vi.fn((name) => builders[name] || builderFor(name)) },
    builders,
    builderFor,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.getBearerToken.mockReturnValue('token');
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 59, limit: 60, reset: 0 });
});

describe('partner-entities handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'types-list' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('types-list seeds defaults when the user has none', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const admin = makeAdmin({ partner_entity_types: { rows: [] } });
    // Pre-create the builder so we can assert on upsert after the call.
    const typeBuilder = admin.builderFor('partner_entity_types');
    mocks.buildSupabaseAdminClient.mockReturnValue(admin.client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'types-list' } }, res);
    expect(res.statusCode).toBe(200);
    // Seeded 4 system types, each carrying user_id.
    const seeded = typeBuilder.upsert.mock.calls[0][0];
    expect(Array.isArray(seeded)).toBe(true);
    expect(seeded).toHaveLength(4);
    expect(seeded.every((t) => t.user_id === 'u1')).toBe(true);
    expect(seeded.map((t) => t.type_key)).toEqual(['partner', 'supplier', 'warehouse', 'crm']);
  });

  it('create validates and inserts a user-scoped entity', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const admin = makeAdmin({ partner_entities: { single: { id: 'e1' } } });
    const eb = admin.builderFor('partner_entities');
    mocks.buildSupabaseAdminClient.mockReturnValue(admin.client);
    const res = makeRes();
    await handler({
      method: 'POST', headers: {}, query: { op: 'create' },
      body: { entity_type_key: 'partner', name: 'AceMedia', data: { revenue: 100 } },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(eb.insert.mock.calls[0][0]).toMatchObject({ user_id: 'u1', entity_type_key: 'partner', name: 'AceMedia' });
  });

  it('create rejects a missing name', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(makeAdmin().client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'create' }, body: { entity_type_key: 'partner' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('list computes count/sum/avg metrics over the rows', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const admin = makeAdmin({
      partner_entity_types: {
        rows: [{ id: 't1' }], // ensureDefaultTypes sees types exist → no seeding
        maybeSingle: { metrics: [
          { key: 'count', label: 'Partners', agg: 'count' },
          { key: 'revenue', label: 'Revenue', agg: 'sum', field: 'revenue', format: 'currency' },
          { key: 'rs', label: 'Avg RS', agg: 'avg', field: 'revshare', format: 'percent' },
        ] },
      },
      partner_entities: {
        rows: [
          { id: 'a', name: 'A', data: { revenue: 100, revshare: 40 } },
          { id: 'b', name: 'B', data: { revenue: 300, revshare: 20 } },
        ],
      },
    });
    admin.builderFor('partner_entity_types');
    admin.builderFor('partner_entities');
    mocks.buildSupabaseAdminClient.mockReturnValue(admin.client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list', type_key: 'partner' } }, res);
    expect(res.statusCode).toBe(200);
    const byKey = Object.fromEntries(res.body.metrics.map((m) => [m.key, m.value]));
    expect(byKey.count).toBe(2);
    expect(byKey.revenue).toBe(400);
    expect(byKey.rs).toBe(30);
    expect(res.body.total).toBe(2);
  });

  it('transform carries only fields that exist on the target type', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const admin = makeAdmin({
      partner_entities: {
        maybeSingle: { id: 'src1', name: 'AceMedia', entity_type_key: 'partner', tags: ['vip'], data: { revenue: 100, geo: 'BR', revshare: 40 } },
        single: { id: 'new1' },
      },
      partner_entity_types: {
        maybeSingle: { fields: [{ key: 'country' }, { key: 'revenue' }] },
      },
    });
    const eb = admin.builderFor('partner_entities');
    admin.builderFor('partner_entity_types');
    mocks.buildSupabaseAdminClient.mockReturnValue(admin.client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'transform' }, body: { id: 'src1', target_type_key: 'supplier' } }, res);
    expect(res.statusCode).toBe(201);
    const inserted = eb.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({ user_id: 'u1', entity_type_key: 'supplier', source_entity_id: 'src1' });
    // revenue exists on target; geo/revshare do not → dropped. country absent in source → absent.
    expect(inserted.data).toEqual({ revenue: 100 });
  });

  it('rejects an invalid op', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(makeAdmin().client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'nope' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
