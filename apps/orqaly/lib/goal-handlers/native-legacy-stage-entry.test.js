import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueGoalAction = vi.fn();
const resolveNativeRecoveryDispatch = vi.fn();
const transitionNativeRecoveryToCanonicalStage = vi.fn();

vi.mock('./_helpers.js', () => ({
  enqueueGoalAction: (...args) => enqueueGoalAction(...args),
}));

vi.mock('./native-legacy-dispatch.js', () => ({
  resolveNativeRecoveryDispatch: (...args) => resolveNativeRecoveryDispatch(...args),
  transitionNativeRecoveryToCanonicalStage: (...args) =>
    transitionNativeRecoveryToCanonicalStage(...args),
}));

import { guardNativeLegacyStageEntry } from './native-legacy-stage-entry.js';

describe('native legacy-stage entry guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves genuine legacy rows on their existing handler', async () => {
    resolveNativeRecoveryDispatch.mockReturnValue({ handled: false });

    await expect(
      guardNativeLegacyStageEntry({}, { id: 'legacy-1' }, 'feasibility-analysis')
    ).resolves.toBeNull();
    expect(transitionNativeRecoveryToCanonicalStage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('fails closed before raw work when native authority is damaged', async () => {
    resolveNativeRecoveryDispatch.mockReturnValue({
      handled: true,
      safe: false,
      action: null,
      status: null,
      reasons: ['native_scope_contract_invalid'],
    });

    await expect(
      guardNativeLegacyStageEntry({}, { id: 'native-1' }, 'po-analysis')
    ).resolves.toMatchObject({
      status: 'native_authority_blocked',
      reasons: ['native_scope_contract_invalid'],
    });
    expect(transitionNativeRecoveryToCanonicalStage).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('blocks a historical legacy child whose parent entered native scope', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: { id: 'native-parent', data: { scope_admission: { native_scope: true } } },
        error: null,
      }),
    };
    const admin = { from: () => query };
    const child = {
      id: 'legacy-child',
      user_id: 'user-1',
      parent_goal_id: 'native-parent',
      data: {},
    };

    await expect(
      guardNativeLegacyStageEntry(admin, child, 'feasibility-analysis')
    ).resolves.toMatchObject({
      status: 'native_authority_blocked',
      reasons: ['native_continuation_requires_scope_confirmation'],
    });
    expect(resolveNativeRecoveryDispatch).not.toHaveBeenCalled();
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('does not enqueue when the exact native transition loses its CAS', async () => {
    const recovery = {
      handled: true,
      safe: true,
      action: 'pm-planning',
      status: 'planning',
    };
    resolveNativeRecoveryDispatch.mockReturnValue(recovery);
    transitionNativeRecoveryToCanonicalStage.mockResolvedValue(false);

    await expect(
      guardNativeLegacyStageEntry({}, { id: 'native-1' }, 'po-analysis-continue')
    ).resolves.toMatchObject({ status: 'state_changed' });
    expect(enqueueGoalAction).not.toHaveBeenCalled();
  });

  it('redirects a pending research revision with its exact continuation token', async () => {
    const admin = {};
    const goal = {
      id: 'native-revision',
      data: {
        scope_revision: {
          status: 'pending_rebuild',
          revision_token: 'revision-current',
        },
      },
    };
    const recovery = {
      handled: true,
      safe: true,
      action: 'customer-intelligence',
      status: 'researching_customer',
    };
    resolveNativeRecoveryDispatch.mockReturnValue(recovery);
    transitionNativeRecoveryToCanonicalStage.mockResolvedValue(true);

    await expect(guardNativeLegacyStageEntry(admin, goal, 'po-analysis')).resolves.toMatchObject({
      status: 'native_stage_redirected',
      redirectedAction: 'customer-intelligence',
    });
    expect(enqueueGoalAction).toHaveBeenCalledWith(admin, 'customer-intelligence', goal.id, {
      scope_revision_token: 'revision-current',
    });
  });
});
