/**
 * Tests for the process-maps handler and the underlying spec integrity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'ip'),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

import handler from './process-maps.js';
import { PROCESS_MAPS, PROCESS_MAP_IDS, METRIC_KEYS } from './process-maps-spec.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader: vi.fn(),
  };
}

// Chainable, thenable query mock: every builder method returns itself; awaiting
// it resolves to { count, data, error }. user_roles.maybeSingle() returns role.
function makeAdmin({ role = 'role-super-admin', count = 3, rows = [{ estimated_cost_usd: 0.25 }] } = {}) {
  const from = vi.fn((table) => {
    const q = {};
    ['select', 'not', 'eq', 'gte', 'lte', 'in', 'order', 'limit'].forEach((m) => {
      q[m] = vi.fn(() => q);
    });
    q.maybeSingle = vi.fn(async () => ({
      data: table === 'user_roles' ? { role_id: role } : null,
      error: null,
    }));
    q.then = (resolve) => resolve({ count, data: rows, error: null });
    return q;
  });
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildSupabaseAdminClient.mockReturnValue(makeAdmin());
});
afterEach(() => vi.restoreAllMocks());

describe('process-maps handler', () => {
  it('rejects non-GET', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-super-admin users', async () => {
    buildSupabaseAdminClient.mockReturnValue(makeAdmin({ role: 'role-viewer' }));
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(429);
  });

  it('returns the three process maps with live metrics attached', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.maps).toHaveLength(3);
    expect(res.body.maps.map((m) => m.id).sort()).toEqual(['goal', 'loop', 'pulse']);
    // metrics resolved and attached onto steps that declare metricKeys
    const goal = res.body.maps.find((m) => m.id === 'goal');
    const stepWithMetrics = goal.steps.find((s) => (s.metricKeys || []).length > 0);
    expect(stepWithMetrics.metrics.length).toBeGreaterThan(0);
    expect(stepWithMetrics.metrics[0]).toHaveProperty('value');
    expect(res.body.generatedAt).toBeTruthy();
  });
});

describe('process-maps spec integrity', () => {
  it('exposes exactly goal/loop/pulse', () => {
    expect(PROCESS_MAP_IDS.sort()).toEqual(['goal', 'loop', 'pulse']);
  });

  it('every step has an id, label, kind, file and a narrative', () => {
    for (const map of Object.values(PROCESS_MAPS)) {
      expect(map.steps.length).toBeGreaterThan(0);
      for (const step of map.steps) {
        expect(step.id).toBeTruthy();
        expect(step.label).toBeTruthy();
        expect(step.kind).toBeTruthy();
        expect(step.file).toBeTruthy();
        expect(step.narrative).toBeTruthy();
      }
    }
  });

  it('all metricKeys reference known METRIC_KEYS', () => {
    const known = new Set(METRIC_KEYS);
    for (const map of Object.values(PROCESS_MAPS)) {
      for (const step of map.steps) {
        for (const key of step.metricKeys || []) {
          expect(known.has(key)).toBe(true);
        }
      }
    }
  });

  it('pages reference frontend-* entity ids and tables are non-empty strings', () => {
    for (const map of Object.values(PROCESS_MAPS)) {
      for (const step of map.steps) {
        for (const page of step.pages || []) {
          expect(page.startsWith('frontend-')).toBe(true);
        }
        for (const table of step.tables || []) {
          expect(typeof table).toBe('string');
          expect(table.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('edges connect real step ids within each map', () => {
    for (const map of Object.values(PROCESS_MAPS)) {
      const ids = new Set(map.steps.map((s) => s.id));
      for (const edge of map.edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
      }
    }
  });
});
