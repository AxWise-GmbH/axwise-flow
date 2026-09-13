/**
 * Tests for the agent factory's AxWise seam.
 *
 * agent.generate is the one fail-closed integration point: when AxWise is
 * enabled but cannot rule, a new agent is routed to manual approval rather than
 * auto-accepted. The cases that matter are the ones that look alike from the
 * outside - "AxWise is off" and "AxWise is broken" are both degraded, but only
 * the second may penalise the request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res, err) => {
    res._status = 500;
    res._body = { error: String(err?.message || err) };
    return res;
  }),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('./agent-config-validator.js', () => ({
  validateAgentConfig: vi.fn(async () => ({ valid: true, errors: [], warnings: [] })),
  screenSystemPrompt: vi.fn(() => ({ decision: 'allowed' })),
}));

vi.mock('../integrations/axwise/index.js', () => ({
  withAxwiseTracked: vi.fn(),
  buildAgentGenerateContext: vi.fn((x) => x),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { withAxwiseTracked } from '../integrations/axwise/index.js';
import handler from './agent-factory.js';

function makeRes() {
  return {
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
}

function makeReq(body = {}) {
  return { method: 'POST', headers: {}, query: {}, body };
}

/** Minimal admin double: the factory only inserts an agent and upserts limits. */
let inserted;
function mockAdmin() {
  inserted = null;
  buildSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(function () {
        return this;
      }),
      eq: vi.fn(function () {
        return this;
      }),
      in: vi.fn(async () => ({ data: [], error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(function () {
        return this;
      }),
      upsert: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn(function (row) {
        inserted = row;
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'agent-1', ...row }, error: null })),
          })),
        };
      }),
    })),
  });
}

/** The shape withAxwise returns when AxWise is switched off (env or kill switch). */
const OFF = {
  degraded: true,
  disabled: true,
  applicableConditions: [],
  processedOutputs: {},
  meta: { degraded: true, reason: 'disabled' },
};

/** The shape withAxwise returns when AxWise is on but unreachable (fail-closed). */
const OUTAGE = {
  degraded: true,
  applicableConditions: [{ category: 'system_degradation', decision: 'blocked', reason: 'timeout' }],
  processedOutputs: {
    security: { scopeDecision: 'denied', requiresApproval: true, blockReason: 'unavailable' },
  },
  meta: { degraded: true },
};

const CONFIG = { name: 'A', system_prompt: 'do a thing' };

describe('agent-factory AxWise seam', () => {
  beforeEach(() => {
    mockAdmin();
    vi.stubEnv('AXWISE_ENFORCE', 'authoritative');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // The regression this suite exists for. `disabled` is degraded, so a bare
  // `if (ax.degraded)` check sends every agent to approval the moment a user
  // turns AxWise off - the exact opposite of "off = pre-integration behavior".
  it('AxWise off does not force approval, even under authoritative enforce', async () => {
    withAxwiseTracked.mockResolvedValue(OFF);
    const res = makeRes();
    await handler(makeReq(CONFIG), res);

    expect(res._status).toBe(201);
    expect(res._body.requires_approval).toBe(false);
    expect(inserted.status).toBe('accepted');
    expect(inserted.tracking_token).toBeTruthy();
  });

  it('AxWise off yields the same outcome as AxWise never being enabled', async () => {
    withAxwiseTracked.mockResolvedValue(OFF);
    const offRes = makeRes();
    await handler(makeReq(CONFIG), offRes);
    const offStatus = inserted.status;

    vi.stubEnv('AXWISE_ENFORCE', 'shadow');
    mockAdmin();
    const shadowRes = makeRes();
    await handler(makeReq(CONFIG), shadowRes);

    expect(offStatus).toBe(inserted.status);
    expect(offRes._body.requires_approval).toBe(shadowRes._body.requires_approval);
  });

  it('a genuine AxWise outage still forces approval (fail-closed)', async () => {
    withAxwiseTracked.mockResolvedValue(OUTAGE);
    const res = makeRes();
    await handler(makeReq(CONFIG), res);

    expect(res._status).toBe(201);
    expect(res._body.requires_approval).toBe(true);
    expect(inserted.status).toBe('pending');
    expect(inserted.tracking_token).toBeNull();
  });

  it('an authoritative deny blocks with 403', async () => {
    withAxwiseTracked.mockResolvedValue({
      degraded: false,
      applicableConditions: [],
      processedOutputs: {
        security: { scopeDecision: 'denied', blockReason: 'tool scope too broad' },
      },
      meta: {},
    });
    const res = makeRes();
    await handler(makeReq(CONFIG), res);

    expect(res._status).toBe(403);
    expect(res._body.reason).toBe('tool scope too broad');
  });

  it('shadow mode never blocks on a deny', async () => {
    vi.stubEnv('AXWISE_ENFORCE', 'shadow');
    withAxwiseTracked.mockResolvedValue({
      degraded: false,
      applicableConditions: [],
      processedOutputs: { security: { scopeDecision: 'denied' } },
      meta: {},
    });
    const res = makeRes();
    await handler(makeReq(CONFIG), res);

    expect(res._status).toBe(201);
    expect(res._body.requires_approval).toBe(false);
  });

  it('merges the AxWise prompt fragment only when authoritative and healthy', async () => {
    withAxwiseTracked.mockResolvedValue({
      degraded: false,
      applicableConditions: [],
      processedOutputs: { systemPromptFragment: 'Be concise.' },
      meta: {},
    });
    const res = makeRes();
    await handler(makeReq(CONFIG), res);

    expect(res._status).toBe(201);
    // The fragment is prepended to the stored agent's prompt via config.
    expect(withAxwiseTracked).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ system_prompt: 'do a thing' }) }),
      expect.any(Function),
      expect.objectContaining({ posture: 'closed' })
    );
  });
});
