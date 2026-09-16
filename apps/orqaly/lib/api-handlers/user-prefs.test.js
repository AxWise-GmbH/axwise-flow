/**
 * Tests for the user-prefs handler.
 * Covers the uiMode field added by migration 149 (simple|advanced).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => () => {}),
  }),
}));

const mockUser = { id: 'user-1', email: 't@example.com' };

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => mockUser),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'id'),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

let storedRow = {
  default_llm_preset: null,
  workspace_logo_url: null,
  setup_completed_at: null,
  ui_mode: null,
  hidden_pages: [],
};

function buildMockUserClient() {
  function chain() {
    const state = { updatePatch: null };
    const self = {
      from: () => self,
      select: () => self,
      eq: () => self,
      update: (patch) => {
        state.updatePatch = patch;
        Object.assign(storedRow, patch);
        return self;
      },
      maybeSingle: async () => ({ data: { ...storedRow }, error: null }),
    };
    return self;
  }
  return { from: () => chain() };
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: () => buildMockUserClient(),
}));

const handlerModule = await import('./user-prefs.js');
const handler = handlerModule.default;

// Real (unmocked) kill-switch resolver: these tests assert the handler actually
// evicts the cache the AxWise seams read, not that it called a spy.
const { isAxwiseUserDisabled, clearAxwiseUserFlagCache } = await import(
  '../integrations/axwise/user-flag.js'
);

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
}

beforeEach(() => {
  storedRow = {
    default_llm_preset: null,
    workspace_logo_url: null,
    setup_completed_at: null,
    ui_mode: null,
    hidden_pages: [],
  };
});

describe('user-prefs handler - uiMode', () => {
  it('GET returns uiMode in the response payload', async () => {
    storedRow.ui_mode = 'simple';
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.uiMode).toBe('simple');
  });

  it('GET returns uiMode=simple when column is unset (card view default)', async () => {
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.uiMode).toBe('simple');
  });

  it('PUT accepts uiMode=simple', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { uiMode: 'simple' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.uiMode).toBe('simple');
    expect(storedRow.ui_mode).toBe('simple');
  });

  it('PUT accepts uiMode=advanced', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { uiMode: 'advanced' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.uiMode).toBe('advanced');
    expect(storedRow.ui_mode).toBe('advanced');
  });

  it('PUT accepts uiMode=null to clear the preference', async () => {
    storedRow.ui_mode = 'simple';
    const res = mockRes();
    await handler({ method: 'PUT', body: { uiMode: null }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(storedRow.ui_mode).toBeNull();
  });

  it('PUT rejects invalid uiMode with 400', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { uiMode: 'expert' }, query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/uiMode/);
  });

  it('PUT rejects empty patch with 400 when no fields supplied', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns 401 when no authenticated user', async () => {
    const auth = await import('../../api/_lib/auth.js');
    auth.verifySupabaseToken.mockResolvedValueOnce(null);
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('user-prefs handler - hiddenPages', () => {
  it('GET returns hiddenPages from the stored column', async () => {
    storedRow.hidden_pages = ['/campaigns', '/data'];
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hiddenPages).toEqual(['/campaigns', '/data']);
  });

  it('GET returns an empty array when the column is unset', async () => {
    storedRow.hidden_pages = null;
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hiddenPages).toEqual([]);
  });

  it('PUT persists a valid array of route strings', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { hiddenPages: ['/campaigns', '/data'] }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hiddenPages).toEqual(['/campaigns', '/data']);
    expect(storedRow.hidden_pages).toEqual(['/campaigns', '/data']);
  });

  it('PUT accepts an empty array to clear all hidden pages', async () => {
    storedRow.hidden_pages = ['/campaigns'];
    const res = mockRes();
    await handler({ method: 'PUT', body: { hiddenPages: [] }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(storedRow.hidden_pages).toEqual([]);
  });

  it('PUT rejects a non-array hiddenPages with 400', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { hiddenPages: '/campaigns' }, query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/hiddenPages/);
  });

  it('PUT rejects entries that are not route strings with 400', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { hiddenPages: ['campaigns', 123] }, query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/hiddenPages/);
  });
});

describe('user-prefs handler - axwise flag', () => {
  const originalEnable = process.env.AXWISE_ENABLE;
  const originalEnforce = process.env.AXWISE_ENFORCE;

  beforeEach(() => {
    // Reset env to a known disabled state before each test.
    delete process.env.AXWISE_ENABLE;
    delete process.env.AXWISE_ENFORCE;
  });

  afterEach(() => {
    // Restore original env state so we don't pollute other tests.
    if (originalEnable === undefined) {
      delete process.env.AXWISE_ENABLE;
    } else {
      process.env.AXWISE_ENABLE = originalEnable;
    }
    if (originalEnforce === undefined) {
      delete process.env.AXWISE_ENFORCE;
    } else {
      process.env.AXWISE_ENFORCE = originalEnforce;
    }
  });

  it('GET returns axwise.enabled=true when AXWISE_ENABLE="true"', async () => {
    process.env.AXWISE_ENABLE = 'true';
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.axwise).toBeDefined();
    expect(res.body.axwise.serverEnabled).toBe(true);
  });

  it('GET returns axwise.enabled=false when AXWISE_ENABLE is unset', async () => {
    delete process.env.AXWISE_ENABLE;
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.axwise.serverEnabled).toBe(false);
  });

  it('GET returns axwise.enforce="shadow" by default when AXWISE_ENFORCE is unset', async () => {
    process.env.AXWISE_ENABLE = 'true';
    delete process.env.AXWISE_ENFORCE;
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.axwise.enforce).toBe('shadow');
  });

  it('GET returns axwise.enforce="authoritative" when AXWISE_ENFORCE is set', async () => {
    process.env.AXWISE_ENABLE = 'true';
    process.env.AXWISE_ENFORCE = 'authoritative';
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.axwise.enforce).toBe('authoritative');
  });

  it('PUT also returns the axwise flag in the response', async () => {
    process.env.AXWISE_ENABLE = 'true';
    process.env.AXWISE_ENFORCE = 'shadow';
    const res = mockRes();
    await handler({ method: 'PUT', body: { uiMode: 'simple' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.axwise).toBeDefined();
    expect(res.body.axwise.serverEnabled).toBe(true);
    expect(res.body.axwise.enforce).toBe('shadow');
  });

  it('GET returns axwise.userEnabled=true by default (column unset)', async () => {
    process.env.AXWISE_ENABLE = 'true';
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.body.axwise.userEnabled).toBe(true);
  });

  it('GET returns axwise.userEnabled=false when the user turned AxWise off', async () => {
    process.env.AXWISE_ENABLE = 'true';
    storedRow.axwise_enabled = false;
    const res = mockRes();
    await handler({ method: 'GET', body: {}, query: {} }, res);
    expect(res.body.axwise.serverEnabled).toBe(true);
    expect(res.body.axwise.userEnabled).toBe(false);
  });

  it('PUT axwiseEnabled=false writes the column and reflects userEnabled=false', async () => {
    process.env.AXWISE_ENABLE = 'true';
    const res = mockRes();
    await handler({ method: 'PUT', body: { axwiseEnabled: false }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(storedRow.axwise_enabled).toBe(false);
    expect(res.body.axwise.userEnabled).toBe(false);
  });

  it('PUT rejects a non-boolean axwiseEnabled with 400', async () => {
    const res = mockRes();
    await handler({ method: 'PUT', body: { axwiseEnabled: 'nope' }, query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/axwiseEnabled/);
  });

  // The backend caches the kill switch per serverless instance. Without an
  // eviction on write, the user flips the toggle and the very instance that
  // served the write keeps calling AxWise until the TTL lapses.
  it('PUT axwiseEnabled evicts the cached kill switch for that user', async () => {
    clearAxwiseUserFlagCache();
    let column = false;
    const flagAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { axwise_enabled: column }, error: null }),
          }),
        }),
      }),
    };
    // Prime: the backend has "user turned AxWise off" cached.
    expect(await isAxwiseUserDisabled(flagAdmin, mockUser.id)).toBe(true);

    column = true; // what the handler's write does to the row
    const res = mockRes();
    await handler({ method: 'PUT', body: { axwiseEnabled: true }, query: {} }, res);
    expect(res.statusCode).toBe(200);

    expect(await isAxwiseUserDisabled(flagAdmin, mockUser.id)).toBe(false);
  });

  it('PUT of an unrelated pref leaves the kill-switch cache intact', async () => {
    clearAxwiseUserFlagCache();
    let reads = 0;
    const flagAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              reads += 1;
              return { data: { axwise_enabled: false }, error: null };
            },
          }),
        }),
      }),
    };
    await isAxwiseUserDisabled(flagAdmin, mockUser.id);
    const res = mockRes();
    await handler({ method: 'PUT', body: { uiMode: 'simple' }, query: {} }, res);
    await isAxwiseUserDisabled(flagAdmin, mockUser.id);
    expect(reads).toBe(1);
  });
});
