import { describe, it, expect } from 'vitest';
import {
  ACTION_HANDLERS,
  GOAL_ACTION_STATUSES,
  availableGoalActions,
  goalActionAvailable,
  isKnownGoalAction,
} from './goalActions';

/**
 * These mirror the guards in lib/api-handlers/goals.js. If a guard there moves
 * and this does not, the thread starts offering controls the server refuses -
 * which is the failure this table exists to prevent.
 */
describe('goal action preconditions', () => {
  it('mirrors the server allow-lists', () => {
    expect(GOAL_ACTION_STATUSES.resolve).toEqual([
      'needs_human',
      'failed',
      'paused',
      'awaiting_approval',
      'awaiting_tools',
    ]);
    expect(GOAL_ACTION_STATUSES.approval).toEqual(['awaiting_approval']);
    expect(GOAL_ACTION_STATUSES.contextApproval).toEqual(['awaiting_context_approval']);
    expect(GOAL_ACTION_STATUSES.retry).toEqual(['failed', 'cancelled']);
    expect(GOAL_ACTION_STATUSES.tools).toEqual(['awaiting_tools']);
  });

  it('refuses a retry on a goal that is not failed or cancelled', () => {
    // handleRetry: "Goal is needs_human, not failed or cancelled - cannot retry"
    expect(goalActionAvailable('retry_goal', { status: 'needs_human' })).toBe(false);
    expect(goalActionAvailable('retry_goal', { status: 'failed' })).toBe(true);
    expect(goalActionAvailable('retry_goal', { status: 'cancelled' })).toBe(true);
  });

  it('refuses approve and request-changes away from the approval gate', () => {
    expect(goalActionAvailable('approve_goal', { status: 'needs_human' })).toBe(false);
    expect(goalActionAvailable('request_changes', { status: 'failed' })).toBe(false);
    expect(goalActionAvailable('approve_goal', { status: 'awaiting_approval' })).toBe(true);
  });

  it('offers the context controls only while the brief is awaiting review', () => {
    expect(goalActionAvailable('approve_context', { status: 'awaiting_context_approval' })).toBe(
      true
    );
    expect(goalActionAvailable('revise_context', { status: 'awaiting_context_approval' })).toBe(
      true
    );
    expect(goalActionAvailable('approve_context', { status: 'awaiting_approval' })).toBe(false);
  });

  it('refuses every resolve variant on a running goal', () => {
    expect(goalActionAvailable('resolve_increase_budget', { status: 'active' })).toBe(false);
    expect(goalActionAvailable('resolve_retry_stage', { status: 'needs_human' })).toBe(true);
  });

  it('refuses the credential unblock unless the goal is waiting on tools', () => {
    expect(goalActionAvailable('unblock_credentials', { status: 'needs_human' })).toBe(false);
    expect(goalActionAvailable('unblock_credentials', { status: 'awaiting_tools' })).toBe(true);
  });

  it('always allows the actions the server does not gate on status', () => {
    for (const type of ['heal_goal', 'pause_goal', 'resume_goal', 'cancel_goal']) {
      expect(goalActionAvailable(type, { status: 'active' })).toBe(true);
    }
  });

  it('rejects an unknown action rather than letting it through', () => {
    expect(isKnownGoalAction('not_a_real_action')).toBe(false);
    expect(goalActionAvailable('not_a_real_action', { status: 'failed' })).toBe(false);
  });

  it('never offers direct reassignment for a native materialized goal', () => {
    const nativeGoal = {
      status: 'active',
      data: {
        scope_admission: { native_scope: true },
      },
    };
    expect(goalActionAvailable('reassign_task', nativeGoal)).toBe(false);
    expect(
      availableGoalActions([{ type: 'reassign_task' }, { type: 'pause_goal' }], nativeGoal).map(
        (action) => action.type
      )
    ).toEqual(['pause_goal']);
  });

  it('filters a mixed list down to what will work', () => {
    const offered = availableGoalActions(
      [
        { type: 'heal_goal' },
        { type: 'retry_goal' },
        { type: 'request_changes' },
        { type: 'resolve_retry_stage' },
      ],
      { status: 'needs_human' }
    );
    expect(offered.map((a) => a.type)).toEqual(['heal_goal', 'resolve_retry_stage']);
  });

  it('handles a missing goal and a missing list', () => {
    expect(availableGoalActions(null, { status: 'failed' })).toEqual([]);
    expect(goalActionAvailable('retry_goal', undefined)).toBe(false);
  });

  it('gives every registered action a handler', () => {
    for (const [type, handler] of Object.entries(ACTION_HANDLERS)) {
      expect(typeof handler, `${type} has no handler`).toBe('function');
    }
  });
});
