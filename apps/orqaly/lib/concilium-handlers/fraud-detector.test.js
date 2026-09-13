/**
 * Tests for concilium fraud detector.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

import { analyzeRequest } from './fraud-detector.js';

// ── Helpers ───────────────────────────────────────────────────────

function mockAdmin({
  securityEventCount = 0,
  evaluationData = [],
  fraudEventData = [],
  insertError = null,
  updateError = null,
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'concilium_security_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
            gte: vi.fn(async () => ({ count: securityEventCount, error: null })),
          })),
        };
      }
      if (table === 'concilium_evaluations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
            order: vi.fn(function () { return this; }),
            limit: vi.fn(async () => ({ data: evaluationData, error: null })),
          })),
        };
      }
      if (table === 'concilium_fraud_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
            or: vi.fn(function () { return this; }),
            gte: vi.fn(function () { return this; }),
            order: vi.fn(function () { return this; }),
            limit: vi.fn(async () => ({ data: fraudEventData, error: null })),
          })),
          insert: vi.fn(async () => ({ error: insertError })),
        };
      }
      if (table === 'concilium_rate_limits') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          gte: vi.fn(async () => ({ count: 0, error: null })),
        })),
        insert: vi.fn(async () => ({ error: insertError })),
      };
    }),
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('analyzeRequest', () => {
  it('returns clean when no fraud indicators detected', async () => {
    const admin = mockAdmin({ securityEventCount: 0 });
    const result = await analyzeRequest(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
      boardId: 'board-1',
    });

    expect(result.clean).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(result.quarantined).toBe(false);
  });

  it('detects rapid-fire pattern', async () => {
    const admin = mockAdmin({ securityEventCount: 15 });
    const result = await analyzeRequest(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
      boardId: 'board-1',
    });

    expect(result.clean).toBe(false);
    expect(result.events.some((e) => e.event_type === 'rapid_fire_requests')).toBe(true);
  });

  it('detects cost anomaly', async () => {
    const evaluations = Array(5).fill({ estimated_cost_usd: 0.001 });
    const admin = mockAdmin({ evaluationData: evaluations });

    const result = await analyzeRequest(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
      boardId: 'board-1',
      requestCostUsd: 0.05, // 50x the average of 0.001
    });

    expect(result.clean).toBe(false);
    expect(result.events.some((e) => e.event_type === 'cost_anomaly')).toBe(true);
  });

  it('detects repeated failures', async () => {
    const fraudEvents = Array(4).fill({ event_type: 'repeated_failures' });
    const admin = mockAdmin({ fraudEventData: fraudEvents });

    const result = await analyzeRequest(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
      boardId: 'board-1',
      requestFailed: true,
    });

    expect(result.clean).toBe(false);
    expect(result.events.some((e) => e.event_type === 'repeated_failures')).toBe(true);
  });

  it('skips cost anomaly check when requestCostUsd is not provided', async () => {
    const admin = mockAdmin({ securityEventCount: 0 });
    const result = await analyzeRequest(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
      boardId: 'board-1',
    });

    expect(result.clean).toBe(true);
  });

  it('skips failure check when requestFailed is false', async () => {
    const admin = mockAdmin({ securityEventCount: 0 });
    const result = await analyzeRequest(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
      boardId: 'board-1',
      requestFailed: false,
    });

    expect(result.clean).toBe(true);
  });
});
