import { describe, expect, it } from 'vitest';
import { GOAL_POLLING_STATUSES, hasPollableGoal } from './goalPolling';

describe('Job Pool goal polling', () => {
  it.each(GOAL_POLLING_STATUSES)('keeps polling while a goal is %s', (status) => {
    expect(hasPollableGoal([{ id: 'goal-1', status }])).toBe(true);
  });

  it.each(['completed', 'failed', 'cancelled', 'paused', 'needs_human'])(
    'does not poll a settled or manually stopped %s goal',
    (status) => {
      expect(hasPollableGoal([{ id: 'goal-1', status }])).toBe(false);
    }
  );

  it('returns true when at least one goal can still advance', () => {
    expect(
      hasPollableGoal([
        { id: 'goal-1', status: 'completed' },
        { id: 'goal-2', status: 'awaiting_context_approval' },
      ])
    ).toBe(true);
  });

  it('handles absent or malformed goal collections safely', () => {
    expect(hasPollableGoal()).toBe(false);
    expect(hasPollableGoal([null, {}])).toBe(false);
  });
});
