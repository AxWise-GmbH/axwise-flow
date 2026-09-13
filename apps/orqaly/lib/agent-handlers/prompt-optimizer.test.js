import { describe, expect, it } from 'vitest';
import { filterCurrentPerformanceTasks } from './prompt-optimizer.js';

describe('filterCurrentPerformanceTasks', () => {
  it('excludes retired and superseded-attempt observations from optimizer samples', () => {
    const goals = [
      {
        id: 'goal-1',
        data: { axwise_orchestration: { decision_id: 'decision-current' } },
      },
      {
        id: 'goal-native',
        data: {
          axwise_customer_intelligence: {
            scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: 'native-scope' },
          },
        },
      },
    ];
    const tasks = [
      {
        id: 'old-failed',
        goal_id: 'goal-1',
        status: 'failed',
        data: { axwise_decision_id: 'decision-old' },
      },
      {
        id: 'current-done',
        goal_id: 'goal-1',
        status: 'done',
        data: { axwise_decision_id: 'decision-current' },
      },
      {
        id: 'native-done',
        goal_id: 'goal-native',
        status: 'done',
        data: {},
      },
      { id: 'manual-cancelled', status: 'Cancelled', data: {} },
      { id: 'manual-done', status: 'done', data: {} },
    ];

    expect(filterCurrentPerformanceTasks(tasks, goals).map((task) => task.id)).toEqual([
      'current-done',
      'manual-done',
    ]);
  });
});
