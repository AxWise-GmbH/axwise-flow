/**
 * Tests for GET /api/health
 *
 * Covers: healthy, degraded, unhealthy, localStorage-only mode,
 *         42P01 "table not found" treated as reachable, method guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted — must appear before the imports that use the mocked modules.
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => null),
  verifySupabaseToken: vi.fn(async () => null),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
  buildSupabaseUserClient: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res, _err, _ctx) => {
    res._status = 500;
    res._body = { error: 'internal' };
    return res;
  }),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import handler from './health.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
    },
  };
  return res;
}

function makeReq(method = 'GET', query = {}) {
  return { method, headers: {}, query, url: '/api/health' };
}

/** Return a mock admin client whose .from().select().limit() resolves with `selectError`. */
function mockAdmin(selectError = null) {
  buildSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(async () => ({ error: selectError })),
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
    })),
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  describe('healthy', () => {
    it('returns 200 with status=healthy when Supabase is reachable and env is complete', async () => {
      process.env.SUPABASE_URL = 'https://demo.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-xyz';
      mockAdmin(null); // no error = DB ok

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('healthy');
      expect(res._body.checks.database).toBe('ok');
      expect(res._body.checks.env).toBe('ok');
      expect(res._body.checks.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(res._body.timestamp).toBeTruthy();
      expect(new Date(res._body.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('returns 200 with status=healthy in localStorage-only mode (no Supabase configured)', async () => {
      // No env vars, no admin client
      buildSupabaseAdminClient.mockReturnValue(null);

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('healthy');
      expect(res._body.checks.database).toBe('not configured');
      expect(res._body.checks.env).toBe('ok');
    });

    it('treats 42P01 (table does not exist) as a reachable DB', async () => {
      process.env.SUPABASE_URL = 'https://demo.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-xyz';
      mockAdmin({ message: 'relation "partners" does not exist', code: '42P01' });

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('healthy');
      expect(res._body.checks.database).toBe('ok');
    });
  });

  describe('degraded', () => {
    it('returns 503 with status=degraded when Supabase is configured but DB probe fails', async () => {
      process.env.SUPABASE_URL = 'https://demo.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-xyz';
      mockAdmin({ message: 'connection refused', code: 'ECONNREFUSED' });

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(503);
      expect(res._body.status).toBe('degraded');
      expect(res._body.checks.database).toMatch(/^error:/);
      expect(res._body.checks.env).toBe('ok');
    });

    it('returns 503 with status=degraded when the DB client throws', async () => {
      process.env.SUPABASE_URL = 'https://demo.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-xyz';
      buildSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn(async () => {
              throw new Error('fetch failed');
            }),
          })),
        })),
      });

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(503);
      expect(res._body.status).toBe('degraded');
      expect(res._body.checks.database).toMatch(/^error:/);
    });
  });

  describe('unhealthy', () => {
    it('returns 503 with status=unhealthy when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://demo.supabase.co';
      // No SUPABASE_SERVICE_ROLE_KEY
      buildSupabaseAdminClient.mockReturnValue(null);

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(503);
      expect(res._body.status).toBe('unhealthy');
      expect(res._body.checks.env).toBe('missing: SUPABASE_SERVICE_ROLE_KEY');
    });
  });

  describe('production mode', () => {
    it('redacts internal error details in production', async () => {
      process.env.VERCEL_ENV = 'production';
      process.env.SUPABASE_URL = 'https://demo.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-xyz';
      mockAdmin({ message: 'pg connection string: postgres://user:secret@host', code: 'ERR' });

      const res = makeRes();
      await handler(makeReq(), res);

      expect(res._status).toBe(503);
      // Must NOT contain the raw error string with connection details
      expect(res._body.checks.database).not.toContain('postgres://');
      expect(res._body.checks.database).not.toContain('secret');
      expect(res._body.checks.database).toBe('error: connection failed');
    });
  });

  describe('request guards', () => {
    it('returns 405 for POST requests', async () => {
      const res = makeRes();
      await handler(makeReq('POST'), res);
      expect(res._status).toBe(405);
    });

    it('returns 200 for OPTIONS preflight', async () => {
      const res = makeRes();
      await handler(makeReq('OPTIONS'), res);
      expect(res._status).toBe(200);
    });

    it('sets Cache-Control: no-store', async () => {
      buildSupabaseAdminClient.mockReturnValue(null);
      const res = makeRes();
      await handler(makeReq(), res);
      expect(res._headers['Cache-Control']).toBe('no-store');
    });
  });
});
