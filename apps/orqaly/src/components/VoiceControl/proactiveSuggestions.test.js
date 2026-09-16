import { describe, it, expect } from 'vitest';
import { buildSuggestions } from './proactiveSuggestions.js';

describe('buildSuggestions', () => {
  it('returns nothing when signals are clean', () => {
    expect(buildSuggestions({ homeSummary: {}, activityFeed: [] })).toEqual([]);
    expect(buildSuggestions({})).toEqual([]);
  });

  it('surfaces overdue tasks with view/reschedule/assign actions', () => {
    const out = buildSuggestions({ homeSummary: { tasksOverdue: 6 } });
    const s = out.find((x) => x.id === 'overdue-tasks');
    expect(s).toBeTruthy();
    expect(s.title).toContain('6');
    expect(s.actions.map((a) => a.label)).toEqual(['View', 'Reschedule', 'Assign']);
  });

  it('flags a workflow failing 3+ times from the activity feed', () => {
    const feed = [{ severity: 'error' }, { severity: 'error' }, { title: 'workflow failed' }];
    const out = buildSuggestions({ homeSummary: {}, activityFeed: feed });
    expect(out.some((x) => x.id === 'failed-workflows')).toBe(true);
  });

  it('does not flag failures below the threshold', () => {
    const out = buildSuggestions({ homeSummary: {}, activityFeed: [{ severity: 'error' }] });
    expect(out.some((x) => x.id === 'failed-workflows')).toBe(false);
  });

  it('surfaces pending approvals and ownerless goals', () => {
    const out = buildSuggestions({ homeSummary: { pendingApprovals: 2, goalsWithoutOwner: 1 } });
    expect(out.some((x) => x.id === 'pending-approvals')).toBe(true);
    expect(out.some((x) => x.id === 'ownerless-goals')).toBe(true);
  });
});
