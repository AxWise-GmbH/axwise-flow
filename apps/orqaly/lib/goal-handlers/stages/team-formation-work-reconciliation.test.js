import { describe, expect, it, vi } from 'vitest';
import { retireSupersededGoalWork } from './team-formation.js';

function updateQuery(result) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

describe('team formation work reconciliation', () => {
  it('retires only unfinished tasks and active jobs from prior attempts', async () => {
    const taskQuery = updateQuery({ error: null });
    const jobQuery = updateQuery({ error: null });
    const admin = {
      from: vi.fn((table) => ({
        update: vi.fn(() => (table === 'team_tasks' ? taskQuery : jobQuery)),
      })),
    };

    await retireSupersededGoalWork(admin, 'goal-1');

    expect(taskQuery.eq).toHaveBeenCalledWith('goal_id', 'goal-1');
    expect(taskQuery.in).toHaveBeenCalledWith('status', [
      'planned',
      'todo',
      'in_progress',
      'inProgress',
    ]);
    expect(jobQuery.eq).toHaveBeenCalledWith('goal_id', 'goal-1');
    expect(jobQuery.in).toHaveBeenCalledWith('status', ['active', 'queued']);
  });

  it('fails closed when prior tasks cannot be retired', async () => {
    const taskQuery = updateQuery({ error: { message: 'database unavailable' } });
    const jobQuery = updateQuery({ error: null });
    const admin = {
      from: vi.fn((table) => ({
        update: vi.fn(() => (table === 'team_tasks' ? taskQuery : jobQuery)),
      })),
    };

    await expect(retireSupersededGoalWork(admin, 'goal-1')).rejects.toThrow(
      'Unable to retire superseded goal tasks'
    );
  });
});
