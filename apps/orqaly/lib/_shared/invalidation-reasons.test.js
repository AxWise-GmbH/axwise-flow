import { describe, it, expect } from 'vitest';
import {
  INVALIDATION_ACTIONS,
  describeInvalidationReason,
  describeInvalidationReasons,
  invalidationReasonSentence,
  isKnownInvalidationReason,
} from './invalidation-reasons.js';

describe('invalidation reasons', () => {
  it('never returns a raw code as the headline', () => {
    // The thread printed "plan_replaced_by_iteration" verbatim under
    // "Execution approval invalidated", which tells the reader nothing.
    const described = describeInvalidationReason('plan_replaced_by_iteration');
    expect(described.headline).not.toMatch(/_/);
    expect(described.headline).toMatch(/plan changed/i);
    expect(described.remedy).toBeTruthy();
  });

  it('gives every known reason something the user can do', () => {
    const codes = [
      'proposal_changed_before_approval',
      'context_changed_before_approval',
      'execution_approval_stale',
      'authorization_manifest_invalid',
      'goal_not_active',
    ];
    for (const code of codes) {
      const described = describeInvalidationReason(code);
      expect(isKnownInvalidationReason(code)).toBe(true);
      expect(described.action).toBeTruthy();
      expect(described.remedy).toMatch(/\w/);
    }
  });

  it('degrades an unrecognised code to readable English rather than leaking it', () => {
    const described = describeInvalidationReason('some_future_server_code');
    expect(described.headline).toBe('Some future server code.');
    expect(described.action).toBe(INVALIDATION_ACTIONS.REVIEW_PROPOSAL);
  });

  it('dedupes and picks the first actionable reason', () => {
    const { items, action } = describeInvalidationReasons([
      'system_enrichment_forbidden_by_no_tools_policy',
      'execution_approval_stale',
      'execution_approval_stale',
    ]);
    expect(items).toHaveLength(2);
    expect(action).toBe(INVALIDATION_ACTIONS.REVIEW_PROPOSAL);
  });

  it('marks a self-recovering reason transient so the thread does not alarm', () => {
    expect(describeInvalidationReason('plan_replaced_by_iteration').transient).toBe(true);
    expect(describeInvalidationReason('execution_approval_stale').transient).toBe(false);
  });

  it('summarises a list into one sentence with the count of the rest', () => {
    const sentence = invalidationReasonSentence(['context_approval_stale', 'goal_not_active']);
    expect(sentence).toMatch(/brief no longer matches/i);
    expect(sentence).toMatch(/And 1 more\./);
  });

  it('handles empty and malformed input', () => {
    expect(describeInvalidationReasons(null).items).toEqual([]);
    expect(invalidationReasonSentence([])).toBe('The approval no longer applies.');
    expect(describeInvalidationReason('').headline).toBe('The approval no longer applies.');
  });
});
