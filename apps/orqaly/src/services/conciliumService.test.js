/**
 * Tests for conciliumService.js — v2 board seeding and CRUD operations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUser = { id: 'user-123' };

vi.mock('./conciliumBackend', () => ({
  loadConcilium: vi.fn(),
  createConcilium: vi.fn().mockResolvedValue(undefined),
  updateConciliumById: vi.fn().mockResolvedValue(undefined),
  deleteConciliumById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./conciliumMembersBackend', () => ({
  createMember: vi.fn().mockResolvedValue({ id: 'mem-1' }),
}));

vi.mock('./conciliumCriteriaBackend', () => ({
  createCriterion: vi.fn().mockResolvedValue({ id: 'crit-1' }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }) },
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  hasSupabase: vi.fn().mockReturnValue(true),
}));

vi.mock('./agentJobService', () => ({
  triggerConciliumEvaluation: vi.fn().mockResolvedValue({ status: 'done' }),
  getConciliumEvaluations: vi.fn().mockResolvedValue([]),
}));

import * as conciliumBackend from './conciliumBackend';
import * as conciliumMembersBackend from './conciliumMembersBackend';
import * as conciliumCriteriaBackend from './conciliumCriteriaBackend';
import { supabase } from '../lib/supabase';
import {
  getAllConcilium,
  createConcilium,
  getConciliumById,
  updateConcilium,
  deleteConcilium,
  buildConcilium,
  CONCILIUM_STATUSES_LIST,
  SECURITY_LEVELS_LIST,
  LLM_OPTIONS_LIST,
} from './conciliumService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Exports ──────────────────────────────────────────────────────────────────

describe('exports', () => {
  it('exports status list', () => {
    expect(CONCILIUM_STATUSES_LIST).toEqual(['active', 'paused', 'disbanded']);
  });
  it('exports security levels', () => {
    expect(SECURITY_LEVELS_LIST).toEqual(['minimal', 'standard', 'strict', 'paranoid']);
  });
  it('exports LLM options with DeepSeek and GLM', () => {
    expect(LLM_OPTIONS_LIST.some((l) => l.provider === 'DeepSeek')).toBe(true);
    expect(LLM_OPTIONS_LIST.some((l) => l.provider === 'GLM')).toBe(true);
  });
});

// ── buildConcilium ───────────────────────────────────────────────────────────

describe('buildConcilium', () => {
  it('creates board with v2 fields', () => {
    const c = buildConcilium({ name: 'Test', securityLevel: 'strict', approvalThreshold: 0.8 });
    expect(c.name).toBe('Test');
    expect(c.securityLevel).toBe('strict');
    expect(c.approvalThreshold).toBe(0.8);
    expect(c.id).toMatch(/^conc-/);
  });

  it('defaults securityLevel to standard', () => {
    const c = buildConcilium({ name: 'X' });
    expect(c.securityLevel).toBe('standard');
  });

  it('defaults autoQuarantineOnViolation to false', () => {
    const c = buildConcilium({ name: 'X' });
    expect(c.autoQuarantineOnViolation).toBe(false);
  });
});

// ── getAllConcilium — v2 seed ─────────────────────────────────────────────────

describe('getAllConcilium — v2 seed', () => {
  it('seeds v2 board with members, criteria, consensus rules when empty', async () => {
    conciliumBackend.loadConcilium.mockResolvedValue([]);

    const result = await getAllConcilium();

    // Board created
    expect(conciliumBackend.createConcilium).toHaveBeenCalledTimes(1);
    const board = conciliumBackend.createConcilium.mock.calls[0][0];
    expect(board.name).toBe('Orqaly Evaluation Board');
    expect(board.securityLevel).toBe('strict');
    expect(board.approvalThreshold).toBe(0.65);
    expect(board.autoQuarantineOnViolation).toBe(true);

    // 3 members created
    expect(conciliumMembersBackend.createMember).toHaveBeenCalledTimes(3);
    const memberNames = conciliumMembersBackend.createMember.mock.calls.map((c) => c[0].name);
    expect(memberNames).toEqual(['Director', 'Analyst', 'Sentinel']);

    // Director is chairman
    const director = conciliumMembersBackend.createMember.mock.calls[0][0];
    expect(director.role).toBe('chairman');
    expect(director.provider).toBe('openai');
    expect(director.model).toBe('gpt-4o');

    // Analyst is evaluator with anthropic
    const analyst = conciliumMembersBackend.createMember.mock.calls[1][0];
    expect(analyst.role).toBe('evaluator');
    expect(analyst.provider).toBe('anthropic');

    // Sentinel is auditor with groq
    const sentinel = conciliumMembersBackend.createMember.mock.calls[2][0];
    expect(sentinel.role).toBe('auditor');
    expect(sentinel.provider).toBe('groq');

    // 6 criteria created
    expect(conciliumCriteriaBackend.createCriterion).toHaveBeenCalledTimes(6);
    const criteriaNames = conciliumCriteriaBackend.createCriterion.mock.calls.map((c) => c[0].name);
    expect(criteriaNames).toEqual([
      'Accuracy',
      'Completeness',
      'Quality',
      'Actionability',
      'Relevance',
      'Formatting',
    ]);

    // Weights sum to 1.0
    const weights = conciliumCriteriaBackend.createCriterion.mock.calls.map((c) => c[0].weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);

    // Consensus rules upserted
    expect(supabase.from).toHaveBeenCalledWith('concilium_consensus_rules');

    // Rate limits upserted (board + user)
    const rateLimitCalls = supabase.from.mock.calls.filter((c) => c[0] === 'concilium_rate_limits');
    expect(rateLimitCalls.length).toBe(2);

    // Returns the board
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Orqaly Evaluation Board');
  });

  it('does not seed when boards already exist', async () => {
    conciliumBackend.loadConcilium.mockResolvedValue([{ id: 'existing', name: 'Old Board' }]);

    const result = await getAllConcilium();

    expect(conciliumBackend.createConcilium).not.toHaveBeenCalled();
    expect(conciliumMembersBackend.createMember).not.toHaveBeenCalled();
    expect(conciliumCriteriaBackend.createCriterion).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Old Board');
  });

  it('still returns board if v2 seed partially fails', async () => {
    conciliumBackend.loadConcilium.mockResolvedValue([]);
    conciliumMembersBackend.createMember.mockRejectedValue(new Error('DB down'));

    const result = await getAllConcilium();

    // Board was created before members failed
    expect(conciliumBackend.createConcilium).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });
});

// ── CRUD operations ──────────────────────────────────────────────────────────

describe('createConcilium', () => {
  it('creates and returns board', async () => {
    const result = await createConcilium({ name: 'New Board', purpose: 'Test' });
    expect(result.name).toBe('New Board');
    expect(conciliumBackend.createConcilium).toHaveBeenCalledTimes(1);
  });

  it('persists consensus rules when provided', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    supabase.from.mockReturnValue({ upsert });
    await createConcilium({
      name: 'B',
      consensusType: 'unanimous',
      quorum: 3,
      splitDecisionStrategy: 'reject',
    });
    expect(supabase.from).toHaveBeenCalledWith('concilium_consensus_rules');
    const row = upsert.mock.calls[0][0];
    expect(row.consensus_type).toBe('unanimous');
    expect(row.quorum).toBe(3);
    expect(row.split_decision_strategy).toBe('reject');
  });

  it('does not persist consensus rules when fields are absent', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    supabase.from.mockReturnValue({ upsert });
    await createConcilium({ name: 'B' });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('updateConcilium', () => {
  it('returns null for non-existent board', async () => {
    conciliumBackend.loadConcilium.mockResolvedValue([]);
    const result = await updateConcilium('no-id', { name: 'X' });
    expect(result).toBeNull();
  });

  it('updates and returns board with changelog', async () => {
    conciliumBackend.loadConcilium.mockResolvedValue([
      {
        id: 'b1',
        name: 'Old',
        purpose: '',
        status: 'active',
        llms: [],
        changeLog: [],
        securityLevel: 'standard',
      },
    ]);
    const result = await updateConcilium('b1', { name: 'New' }, 'Admin');
    expect(result.name).toBe('New');
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0].details).toContain('name:');
  });
});

describe('deleteConcilium', () => {
  it('delegates to backend', async () => {
    await deleteConcilium('b1');
    expect(conciliumBackend.deleteConciliumById).toHaveBeenCalledWith('b1', null);
  });
});
