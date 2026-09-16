import { describe, expect, it, vi } from 'vitest';
import { handleDuplicate } from './goals.js';
import { acceptedNativeGoalFixture } from '../_shared/native-goal-authority.test-fixture.js';

function adminFor(source) {
  const insert = vi.fn();
  return {
    from(table) {
      if (table !== 'goals') throw new Error(`Unexpected table ${table}`);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single: vi.fn(async () => ({ data: source, error: null })),
        insert,
      };
    },
    __debug: { insert },
  };
}

describe('native duplicate boundary', () => {
  it('does not copy a native source into a markerless feasibility row', async () => {
    const source = acceptedNativeGoalFixture({
      id: 'native-source',
      user_id: 'user-1',
      status: 'completed',
      title: 'RAW_NATIVE_DUPLICATE_POISON',
      description: 'RAW_NATIVE_DUPLICATE_DESCRIPTION_POISON',
    });
    const admin = adminFor(source);

    const result = await handleDuplicate(admin, { id: 'user-1' }, { goalId: source.id });

    expect(result).toMatchObject({ status: 409 });
    expect(result.error).toContain('new Smart Request');
    expect(admin.__debug.insert).not.toHaveBeenCalled();
  });
});
