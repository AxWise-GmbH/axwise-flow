import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', async () => {
  const actual = await vi.importActual('../_helpers.js');
  return {
    ...actual,
    enqueueGoalAction: vi.fn(async () => {}),
    loadGoal: vi.fn(),
    logGoalEvent: vi.fn(async () => {}),
    updateGoal: vi.fn(async () => {}),
    updateGoalIfStatus: vi.fn(async () => true),
    updateGoalIfExecutionAuthorized: vi.fn(async () => true),
    pickTestModel: vi.fn(() => ({ provider: 'gemini', model: 'gemini-3.8-flash' })),
  };
});

vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handle as handleBrandSeed } from './brand-seed.js';
import { enqueueGoalAction, loadGoal, updateGoal } from '../_helpers.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';

const preApprovalGoal = {
  id: 'goal-landing',
  user_id: 'user-1',
  status: 'planning',
  title: 'Build an ecommerce landing page',
  description: 'Show our animal-food catalogue.',
  data: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('post-approval system enrichment boundary', () => {
  it('defers a legacy pre-approval job without an LLM call or persistent lookup', async () => {
    loadGoal.mockResolvedValue(structuredClone(preApprovalGoal));
    const admin = { from: vi.fn() };

    const result = await handleBrandSeed(admin, { goalId: preApprovalGoal.id }, {});

    expect(result.status).toBe('deferred_until_approval');
    expect(executeLlmTracked).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'team-formation', preApprovalGoal.id);
  });

  it('returns a stale queued enrichment to gate 2 without external work', async () => {
    loadGoal.mockResolvedValue({
      ...structuredClone(preApprovalGoal),
      data: {
        goal_approvals: {
          execution: {
            version: 'orqaly_goal_approval_v1',
            kind: 'execution',
            status: 'pending',
            snapshot_hash: 'pending-hash',
          },
        },
      },
    });
    const admin = { from: vi.fn() };

    const result = await handleBrandSeed(admin, { goalId: preApprovalGoal.id }, {});

    expect(result.status).toBe('authorization_required');
    expect(executeLlmTracked).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'client-approval', preApprovalGoal.id);
  });

  it.each(['paused', 'cancelled'])('does not revive or chain a %s goal', async (status) => {
    loadGoal.mockResolvedValue({
      ...structuredClone(preApprovalGoal),
      status,
      data: {
        goal_approvals: {
          execution: {
            version: 'orqaly_goal_approval_v1',
            kind: 'execution',
            status: 'approved',
            snapshot_hash: 'old-hash',
          },
        },
      },
    });
    const admin = { from: vi.fn() };

    const result = await handleBrandSeed(admin, { goalId: preApprovalGoal.id }, {});

    expect(result.status).toBe('authorization_required');
    expect(executeLlmTracked).not.toHaveBeenCalled();
    expect(updateGoal).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });
});
