/**
 * Tests for evaluate-v2 handler.
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

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock('./rate-limit-check.js', () => ({
  checkConciliumRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('./security-scanner.js', () => ({
  scanInput: vi.fn(async () => ({ safe: true, threats: [] })),
  detectCollusion: vi.fn(() => ({ detected: false, pairs: [] })),
}));

vi.mock('./fraud-detector.js', () => ({
  analyzeRequest: vi.fn(async () => ({ clean: true, events: [] })),
}));

vi.mock('./cost-tracker.js', () => ({
  recordUsage: vi.fn(async () => ({ updated: true, overBudget: false })),
}));

vi.mock('./evaluation-engine.js', () => ({
  loadOwnedConciliumBoard: vi.fn(async (_admin, conciliumId, userId) => ({
    id: conciliumId,
    user_id: userId,
  })),
  runEvaluation: vi.fn(async () => ({
    type: 'concilium-evaluate',
    conciliumId: 'b1',
    conciliumName: 'Test Board',
    evaluation: { approved: true, overall_score: 8 },
    consensus: { approved: true, type: 'majority', approvalRatio: 1 },
    risk: { level: 'LOW', humanReviewRequired: false },
    collusion: { detected: false },
    memberResponses: [],
    failedMembers: [],
    usage: { totalTokens: 300, totalCostUsd: 0.002, memberCount: 2 },
    durationMs: 1000,
    estimatedCostUsd: 0.002,
  })),
}));

import { checkConciliumRateLimit } from './rate-limit-check.js';
import { scanInput } from './security-scanner.js';
import { recordUsage } from './cost-tracker.js';
import { loadOwnedConciliumBoard, runEvaluation } from './evaluation-engine.js';
import { hasV2Members, handleConciliumEvaluateV2 } from './evaluate-v2.js';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('hasV2Members', () => {
  it('returns true when members exist', async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            return this;
          }),
        })),
      })),
    };
    // Mock the chain to return count > 0
    admin.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          const self = {
            eq: vi.fn(() => self),
            then: (resolve) => resolve({ count: 3, error: null }),
          };
          return self;
        }),
      })),
    });
    const result = await hasV2Members(admin, 'b1', 'u1');
    expect(result).toBe(true);
  });

  it('returns false when no members', async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            const self = {
              eq: vi.fn(() => self),
              then: (resolve) => resolve({ count: 0, error: null }),
            };
            return self;
          }),
        })),
      })),
    };
    const result = await hasV2Members(admin, 'b1', 'u1');
    expect(result).toBe(false);
  });

  it('fails closed without an expected owner', async () => {
    await expect(hasV2Members({}, 'b1')).rejects.toThrow('expected user owner');
  });
});

describe('handleConciliumEvaluateV2', () => {
  it('runs full evaluation pipeline', async () => {
    const result = await handleConciliumEvaluateV2({
      conciliumId: 'b1',
      agentOutput: 'Test output',
      _userId: 'u1',
    });

    expect(result.type).toBe('concilium-evaluate');
    expect(loadOwnedConciliumBoard).toHaveBeenCalledWith({}, 'b1', 'u1');
    expect(checkConciliumRateLimit).toHaveBeenCalled();
    expect(scanInput).toHaveBeenCalled();
    expect(runEvaluation).toHaveBeenCalled();
    expect(recordUsage).toHaveBeenCalled();
  });

  it('throws when rate limited', async () => {
    checkConciliumRateLimit.mockResolvedValueOnce({ allowed: false, reason: 'Hourly limit' });

    await expect(
      handleConciliumEvaluateV2({ conciliumId: 'b1', agentOutput: 'test', _userId: 'u1' })
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('throws when security scan fails', async () => {
    scanInput.mockResolvedValueOnce({
      safe: false,
      threats: [{ type: 'jailbreak_attempt' }],
    });

    await expect(
      handleConciliumEvaluateV2({ conciliumId: 'b1', agentOutput: 'test', _userId: 'u1' })
    ).rejects.toThrow('Security scan failed');
  });

  it('throws when conciliumId is missing', async () => {
    await expect(handleConciliumEvaluateV2({ agentOutput: 'test', _userId: 'u1' })).rejects.toThrow(
      'Missing conciliumId'
    );
  });

  it('throws when agentOutput is missing', async () => {
    await expect(handleConciliumEvaluateV2({ conciliumId: 'b1', _userId: 'u1' })).rejects.toThrow(
      'Missing agentOutput'
    );
  });

  it('tracks user-level costs when userId provided', async () => {
    await handleConciliumEvaluateV2({
      conciliumId: 'b1',
      agentOutput: 'test',
      _userId: 'u1',
    });

    // Board + user level = 2 calls
    expect(recordUsage).toHaveBeenCalledTimes(2);
  });

  it('rejects a victim board before rate limits, scans, or LLM work', async () => {
    loadOwnedConciliumBoard.mockRejectedValueOnce(
      new Error('Board not found for expected owner: victim-board')
    );

    await expect(
      handleConciliumEvaluateV2({
        conciliumId: 'victim-board',
        agentOutput: 'attacker output',
        _userId: 'attacker-user',
      })
    ).rejects.toThrow('Board not found for expected owner');

    expect(checkConciliumRateLimit).not.toHaveBeenCalled();
    expect(scanInput).not.toHaveBeenCalled();
    expect(runEvaluation).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
