import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../goal-handlers/loop-continuation.js', () => ({
  createContinuationGoal: vi.fn(),
}));
vi.mock('../notifications/dispatch.js', () => ({
  notifyUser: vi.fn(async () => ({ delivered: true })),
}));

import { createContinuationGoal } from '../goal-handlers/loop-continuation.js';
import { notifyUser } from '../notifications/dispatch.js';
import { maybeAutoPivot } from './anomaly.js';
import { acceptedNativeGoalFixture } from '../_shared/native-goal-authority.test-fixture.js';

function adminFor(parent) {
  const logs = [];
  return {
    from(table) {
      if (table === 'goals') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: vi.fn(async () => ({ data: parent, error: null })),
        };
      }
      if (table === 'goal_log') {
        return {
          insert: vi.fn(async (row) => {
            logs.push(row);
            return { error: null };
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    __debug: { logs },
  };
}

describe('native KPI pivot boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a visible stop and never creates a legacy optimization child', async () => {
    const parent = acceptedNativeGoalFixture({
      id: 'native-parent',
      user_id: 'user-1',
      status: 'completed',
      title: 'RAW_NATIVE_KPI_TITLE_POISON',
      description: 'RAW_NATIVE_KPI_DESCRIPTION_POISON',
      loop_paused: false,
    });
    const admin = adminFor(parent);
    const anomaly = {
      breach_pct: -40,
      kpi: {
        goal_id: parent.id,
        user_id: parent.user_id,
        key: 'conversion',
        label: 'Conversion rate',
        current: 3,
        target: 5,
      },
    };

    await expect(maybeAutoPivot(admin, anomaly)).resolves.toBeNull();

    expect(createContinuationGoal).not.toHaveBeenCalled();
    expect(admin.__debug.logs).toEqual([
      expect.objectContaining({
        goal_id: parent.id,
        event_type: 'native_kpi_pivot_blocked',
      }),
    ]);
    expect(notifyUser).toHaveBeenCalledWith(
      admin,
      parent.user_id,
      expect.objectContaining({
        payload: expect.objectContaining({ reason: 'native_scope_confirmation_required' }),
      })
    );
  });
});
