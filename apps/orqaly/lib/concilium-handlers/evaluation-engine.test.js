/**
 * Tests for evaluation engine v2.
 * Uses mocks for LLM calls and Supabase to test the orchestration logic.
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

vi.mock('./llm-executor-v2.js', () => ({
  executeLlmV2: vi.fn(),
  parseLlmJson: vi.fn((text) => {
    if (!text || typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }),
}));

vi.mock('./security-scanner.js', () => ({
  detectCollusion: vi.fn(() => ({ detected: false, pairs: [] })),
}));

import { executeLlmV2 } from './llm-executor-v2.js';
import { runEvaluation } from './evaluation-engine.js';

// ── Mock admin client ────────────────────────────────────────────

function mockAdmin({
  board = {
    id: 'b1',
    user_id: 'u1',
    name: 'Test Board',
    purpose: 'Testing',
    security_level: 'standard',
    status: 'active',
  },
  criteria = [{ user_id: 'u1', name: 'Quality', weight: 0.5, rubric: 'Score quality' }],
  consensusRules = {
    user_id: 'u1',
    consensus_type: 'majority',
    quorum: 2,
    approval_threshold: 0.5,
    split_decision_strategy: 'chairman_decides',
  },
  insertError = null,
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'concilium') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({ data: board, error: null })),
          })),
        };
      }
      if (table === 'concilium_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
          })),
        };
      }
      if (table === 'concilium_criteria') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            order: vi.fn(async () => ({ data: criteria, error: null })),
          })),
        };
      }
      if (table === 'concilium_consensus_rules') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            maybeSingle: vi.fn(async () => ({ data: consensusRules, error: null })),
          })),
        };
      }
      if (table === 'concilium_evaluations') {
        return {
          insert: vi.fn(async () => ({ error: insertError })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            return this;
          }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      };
    }),
  };
}

// Patch the admin.from('concilium_members') to properly chain
function createFullMockAdmin(opts = {}) {
  const admin = mockAdmin(opts);
  const members = opts.members || [
    {
      id: 'm1',
      user_id: 'u1',
      name: 'Member1',
      role: 'evaluator',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      resume: '',
      skills: [],
      temperature: 0.2,
      max_tokens: 1500,
    },
    {
      id: 'm2',
      user_id: 'u1',
      name: 'Member2',
      role: 'evaluator',
      provider: 'openai',
      model: 'gpt-4o-mini',
      resume: '',
      skills: [],
      temperature: 0.2,
      max_tokens: 1500,
    },
  ];

  admin.from = vi.fn((table) => {
    if (table === 'concilium') {
      const boardData =
        'board' in opts
          ? opts.board
          : {
              id: 'b1',
              user_id: 'u1',
              name: 'Test Board',
              purpose: 'Testing',
              security_level: 'standard',
              status: 'active',
            };
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            return this;
          }),
          maybeSingle: vi.fn(async () => ({
            data: boardData,
            error: null,
          })),
        })),
      };
    }
    if (table === 'concilium_members') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            // Return an object that supports further .eq() chains and terminal await
            const self = {
              eq: vi.fn(() => self),
              then: (resolve) => resolve({ data: members, error: null }),
            };
            return self;
          }),
        })),
      };
    }
    if (table === 'concilium_criteria') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            return this;
          }),
          order: vi.fn(async () => ({
            data: opts.criteria || [
              { user_id: 'u1', name: 'Quality', weight: 0.5, rubric: 'Score quality' },
            ],
            error: null,
          })),
        })),
      };
    }
    if (table === 'concilium_consensus_rules') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function () {
            return this;
          }),
          maybeSingle: vi.fn(async () => ({
            data: opts.consensusRules || {
              user_id: 'u1',
              consensus_type: 'majority',
              quorum: 2,
              approval_threshold: 0.5,
              split_decision_strategy: 'chairman_decides',
            },
            error: null,
          })),
        })),
      };
    }
    if (table === 'concilium_evaluations') {
      return { insert: vi.fn(async () => ({ error: null })) };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(function () {
          return this;
        }),
      })),
      insert: vi.fn(async () => ({ error: null })),
    };
  });

  return admin;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock: both members return approval
  executeLlmV2.mockResolvedValue({
    content: JSON.stringify({
      scores: { quality: 8 },
      overall_score: 8,
      feedback: 'Good work',
      approved: true,
      summary: 'Approved',
    }),
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: 'test-model',
    provider: 'groq',
    durationMs: 500,
    estimatedCostUsd: 0.001,
  });
});

afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('runEvaluation', () => {
  it('runs multi-member evaluation and returns consensus', async () => {
    const admin = createFullMockAdmin();
    const result = await runEvaluation(admin, {
      conciliumId: 'b1',
      jobDescription: 'Test job',
      agentOutput: 'Hello world',
      userId: 'u1',
    });

    expect(result.type).toBe('concilium-evaluate');
    expect(result.conciliumName).toBe('Test Board');
    expect(result.consensus.approved).toBe(true);
    expect(result.consensus.type).toBe('majority');
    expect(result.memberResponses).toHaveLength(2);
    expect(result.risk.level).toBe('LOW');
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('pins every linked-goal board member to the goal executor', async () => {
    const admin = createFullMockAdmin();

    await runEvaluation(admin, {
      conciliumId: 'b1',
      agentOutput: 'Hello world',
      userId: 'u1',
      llm: {
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
      },
    });

    expect(executeLlmV2).toHaveBeenCalledTimes(2);
    for (const [options] of executeLlmV2.mock.calls) {
      expect(options).toMatchObject({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        pinnedProvider: true,
        jsonMode: true,
        userId: 'u1',
      });
    }
  });

  it('handles member failures gracefully', async () => {
    executeLlmV2
      .mockResolvedValueOnce({
        content: JSON.stringify({
          scores: { quality: 8 },
          overall_score: 8,
          approved: true,
          feedback: 'ok',
          summary: 'ok',
        }),
        usage: { total_tokens: 100 },
        model: 'test',
        provider: 'groq',
        durationMs: 500,
        estimatedCostUsd: 0.001,
      })
      .mockRejectedValueOnce(new Error('API timeout'));

    const admin = createFullMockAdmin();
    const result = await runEvaluation(admin, {
      conciliumId: 'b1',
      agentOutput: 'test',
      userId: 'u1',
    });

    expect(result.memberResponses).toHaveLength(1);
    expect(result.failedMembers).toHaveLength(1);
    expect(result.failedMembers[0].error).toContain('timeout');
  });

  it('throws when board not found', async () => {
    const admin = createFullMockAdmin({ board: null });
    await expect(
      runEvaluation(admin, { conciliumId: 'missing', agentOutput: 'test', userId: 'u1' })
    ).rejects.toThrow('Board not found');
  });

  it('throws when no active members', async () => {
    const admin = createFullMockAdmin({ members: [] });
    await expect(
      runEvaluation(admin, { conciliumId: 'b1', agentOutput: 'test', userId: 'u1' })
    ).rejects.toThrow('No active members');
  });

  it('stores evaluation in database', async () => {
    const admin = createFullMockAdmin();
    const insertSpy = vi.fn(async () => ({ error: null }));
    const originalFrom = admin.from;
    admin.from = vi.fn((table) => {
      if (table === 'concilium_evaluations') {
        return { insert: insertSpy };
      }
      return originalFrom(table);
    });

    await runEvaluation(admin, {
      conciliumId: 'b1',
      agentOutput: 'test',
      userId: 'u1',
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertArg = insertSpy.mock.calls[0][0];
    expect(insertArg.concilium_id).toBe('b1');
    expect(insertArg.user_id).toBe('u1');
    expect(insertArg.member_responses).toHaveLength(2);
    expect(insertArg.decision_level).toBeDefined();
  });

  it('fails closed when the board is deactivated after admission but before member LLMs', async () => {
    const admin = createFullMockAdmin();
    const originalFrom = admin.from;
    const insertSpy = vi.fn(async () => ({ error: null }));
    let boardReads = 0;
    admin.from = vi.fn((table) => {
      if (table === 'concilium') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () {
              return this;
            }),
            maybeSingle: vi.fn(async () => {
              boardReads += 1;
              return {
                data: {
                  id: 'b1',
                  user_id: 'u1',
                  name: 'Test Board',
                  purpose: 'Testing',
                  security_level: 'standard',
                  status: boardReads === 1 ? 'active' : 'inactive',
                },
                error: null,
              };
            }),
          })),
        };
      }
      if (table === 'concilium_evaluations') return { insert: insertSpy };
      return originalFrom(table);
    });

    await expect(
      runEvaluation(admin, { conciliumId: 'b1', agentOutput: 'test', userId: 'u1' })
    ).rejects.toThrow('Concilium board is not active');

    expect(executeLlmV2).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('fails closed when the expected owner is missing', async () => {
    const admin = createFullMockAdmin({
      board: {
        id: 'b1',
        name: 'Test Board',
        purpose: 'Testing',
        security_level: 'standard',
        user_id: 'owner-1',
      },
    });
    await expect(runEvaluation(admin, { conciliumId: 'b1', agentOutput: 'test' })).rejects.toThrow(
      'expected user owner'
    );
    expect(executeLlmV2).not.toHaveBeenCalled();
  });

  it('rejects a victim board before loading members or invoking an LLM', async () => {
    const admin = createFullMockAdmin({
      board: {
        id: 'b1',
        name: 'Victim Board',
        purpose: 'Private',
        security_level: 'strict',
        user_id: 'victim-user',
      },
    });

    await expect(
      runEvaluation(admin, {
        conciliumId: 'b1',
        agentOutput: 'attacker output',
        userId: 'attacker-user',
      })
    ).rejects.toThrow('Board not found for expected owner');

    expect(executeLlmV2).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('quarantines mismatched member, criterion, and consensus rows from the prompt', async () => {
    const admin = createFullMockAdmin({
      members: [
        {
          id: 'owned-member',
          user_id: 'u1',
          name: 'Owned Member',
          role: 'evaluator',
          provider: 'groq',
          model: 'test-model',
          skills: [],
        },
        {
          id: 'victim-member',
          user_id: 'victim-user',
          name: 'VICTIM_MEMBER_POISON',
          role: 'evaluator',
          provider: 'groq',
          model: 'test-model',
          resume: 'VICTIM_RESUME_POISON',
          skills: [],
        },
      ],
      criteria: [
        { user_id: 'u1', name: 'Owned criterion', weight: 1, rubric: 'Owned rubric' },
        {
          user_id: 'victim-user',
          name: 'VICTIM_CRITERION_POISON',
          weight: 1,
          rubric: 'VICTIM_RUBRIC_POISON',
        },
      ],
      consensusRules: {
        user_id: 'victim-user',
        consensus_type: 'unanimous',
        quorum: 99,
        approval_threshold: 1,
        split_decision_strategy: 'reject',
      },
    });

    const result = await runEvaluation(admin, {
      conciliumId: 'b1',
      agentOutput: 'owned output',
      userId: 'u1',
    });

    expect(result.memberResponses.map(({ memberId }) => memberId)).toEqual(['owned-member']);
    expect(result.consensus.type).toBe('majority');
    expect(executeLlmV2).toHaveBeenCalledTimes(1);
    const llmBoundary = JSON.stringify(executeLlmV2.mock.calls[0][0]);
    expect(llmBoundary).toContain('Owned criterion');
    expect(llmBoundary).not.toMatch(/VICTIM_(?:MEMBER|RESUME|CRITERION|RUBRIC)_POISON/);
  });
});
