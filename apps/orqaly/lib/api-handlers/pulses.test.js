/**
 * [module: api-gateway]
 * Tests for pulses fire-now handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 29 })),
  getRateLimitIdentifier: vi.fn(() => 'user-1'),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../pulses/tick.js', () => ({
  fireOne: vi.fn(),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { fireOne } from '../pulses/tick.js';
import pulses from './pulses.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    end() { return this; },
  };
  return res;
}

describe('pulses fire-now', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildSupabaseAdminClient.mockReturnValue({
      from(table) {
        if (table !== 'agent_pulses') throw new Error(`unexpected table ${table}`);
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      single: async () => ({
                        data: { id: 'pulse-1', user_id: 'user-1', action: 'run-instruction', metadata: {} },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    });
    fireOne.mockResolvedValue({
      status: 'done',
      outcome: { status: 'done', goalIds: ['goal-9'], count: 1 },
    });
  });

  it('returns goalIds when pulse fires successfully', async () => {
    const req = { method: 'POST', query: { op: 'fire-now' }, body: { pulseId: 'pulse-1' }, headers: {} };
    const res = mockRes();
    await pulses(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.goalIds).toEqual(['goal-9']);
    expect(fireOne).toHaveBeenCalled();
  });

  it('rejects missing pulseId', async () => {
    const req = { method: 'POST', query: { op: 'fire-now' }, body: {}, headers: {} };
    const res = mockRes();
    await pulses(req, res);
    expect(res.statusCode).toBe(400);
  });
});
