import { describe, it, expect } from 'vitest';
import {
  AUTO_APPROVAL_KINDS,
  MAX_AUTO_APPROVALS,
  autoApprovalAllowed,
  autoApprovalCount,
  autoApprovalMarker,
  goalRunsUnattended,
  normalizeGoalHitlMode,
  withAutoApprovalCount,
} from './hitl-policy.js';

describe('goalRunsUnattended', () => {
  it('matches only the exact unattended string', () => {
    expect(goalRunsUnattended({ hitl_mode: 'unattended' })).toBe(true);
    expect(goalRunsUnattended({ hitl_mode: 'checkpoints' })).toBe(false);
    // A goal row predating migration 205 has no column value at all. It must
    // read as checkpoints so existing pipelines keep waiting for a human.
    expect(goalRunsUnattended({})).toBe(false);
    expect(goalRunsUnattended(null)).toBe(false);
    expect(goalRunsUnattended(undefined)).toBe(false);
    expect(goalRunsUnattended({ hitl_mode: 'Unattended' })).toBe(false);
    expect(goalRunsUnattended({ hitl_mode: true })).toBe(false);
  });
});

describe('normalizeGoalHitlMode', () => {
  it('defaults everything that is not exactly unattended to checkpoints', () => {
    expect(normalizeGoalHitlMode('unattended')).toBe('unattended');
    expect(normalizeGoalHitlMode('checkpoints')).toBe('checkpoints');
    expect(normalizeGoalHitlMode('nonsense')).toBe('checkpoints');
    expect(normalizeGoalHitlMode(undefined)).toBe('checkpoints');
    expect(normalizeGoalHitlMode(null)).toBe('checkpoints');
    expect(normalizeGoalHitlMode(true)).toBe('checkpoints');
  });
});

describe('autoApprovalCount', () => {
  it('reads zero for missing, malformed or negative counters', () => {
    expect(autoApprovalCount({}, 'context')).toBe(0);
    expect(autoApprovalCount({ data: {} }, 'context')).toBe(0);
    expect(autoApprovalCount({ data: { hitl_auto_approvals: {} } }, 'context')).toBe(0);
    expect(autoApprovalCount({ data: { hitl_auto_approvals: { context: 'x' } } }, 'context')).toBe(
      0
    );
    expect(autoApprovalCount({ data: { hitl_auto_approvals: { context: -4 } } }, 'context')).toBe(
      0
    );
    expect(autoApprovalCount({ data: { hitl_auto_approvals: { context: 2 } } }, 'context')).toBe(2);
  });
});

describe('autoApprovalAllowed', () => {
  const unattended = (count) => ({
    hitl_mode: 'unattended',
    data: { hitl_auto_approvals: { context: count } },
  });

  it('never allows an auto approval on a checkpoints goal', () => {
    expect(autoApprovalAllowed({ hitl_mode: 'checkpoints' }, 'context')).toBe(false);
    expect(autoApprovalAllowed({}, 'context')).toBe(false);
  });

  it('allows up to the cap, then stops', () => {
    for (let n = 0; n < MAX_AUTO_APPROVALS; n += 1) {
      expect(autoApprovalAllowed(unattended(n), 'context')).toBe(true);
    }
    expect(autoApprovalAllowed(unattended(MAX_AUTO_APPROVALS), 'context')).toBe(false);
    expect(autoApprovalAllowed(unattended(MAX_AUTO_APPROVALS + 1), 'context')).toBe(false);
  });

  it('counts each gate independently', () => {
    const goal = {
      hitl_mode: 'unattended',
      data: { hitl_auto_approvals: { context: MAX_AUTO_APPROVALS } },
    };
    expect(autoApprovalAllowed(goal, 'context')).toBe(false);
    expect(autoApprovalAllowed(goal, 'execution')).toBe(true);
  });
});

describe('withAutoApprovalCount', () => {
  it('increments without mutating the input', () => {
    const data = { hitl_auto_approvals: { context: 1 }, other: 'kept' };
    const next = withAutoApprovalCount(data, 'context');
    expect(next.hitl_auto_approvals.context).toBe(2);
    expect(next.other).toBe('kept');
    expect(data.hitl_auto_approvals.context).toBe(1);
    expect(next).not.toBe(data);
    expect(next.hitl_auto_approvals).not.toBe(data.hitl_auto_approvals);
  });

  it('seeds a counter that does not exist yet and preserves the sibling gate', () => {
    const next = withAutoApprovalCount({ hitl_auto_approvals: { execution: 2 } }, 'context');
    expect(next.hitl_auto_approvals).toEqual({ execution: 2, context: 1 });
  });

  it('tolerates an absent data blob', () => {
    expect(withAutoApprovalCount(undefined, 'execution').hitl_auto_approvals).toEqual({
      execution: 1,
    });
  });

  it('repairs a malformed counter rather than producing NaN', () => {
    const next = withAutoApprovalCount({ hitl_auto_approvals: { context: 'oops' } }, 'context');
    expect(next.hitl_auto_approvals.context).toBe(1);
  });
});

describe('autoApprovalMarker', () => {
  it('stamps the policy so goal_log shows the delegation', () => {
    expect(autoApprovalMarker('abc')).toEqual({ policy: 'hitl_unattended', snapshot_hash: 'abc' });
    expect(autoApprovalMarker()).toEqual({ policy: 'hitl_unattended', snapshot_hash: null });
  });
});

describe('AUTO_APPROVAL_KINDS', () => {
  it('covers exactly the two gates that pause for a human', () => {
    expect(AUTO_APPROVAL_KINDS).toEqual(['context', 'execution']);
  });
});
