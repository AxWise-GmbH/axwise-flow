import { describe, expect, it } from 'vitest';
import { currentGoalDocuments, goalDocumentAttemptMetadata } from './goal-document-attempt.js';

const CURRENT_GOAL = {
  data: {
    axwise_orchestration: { decision_id: 'decision-new' },
    execution_authorization: {
      status: 'approved',
      snapshot_hash: 'snapshot-new',
      manifest: { valid: true },
    },
    goal_approvals: {
      execution: { status: 'approved', snapshot_hash: 'snapshot-new' },
    },
  },
};

describe('goal document attempt boundary', () => {
  it('shows only the current duplicate phase output and preserves foundational documents', () => {
    const documents = [
      {
        id: 'proposal',
        category: 'proposal',
        metadata: { goal_id: 'goal-1' },
      },
      {
        id: 'plan',
        category: 'goal-plan',
        metadata: { goal_id: 'goal-1' },
      },
      {
        id: 'old-output',
        category: 'goal-output',
        metadata: { goal_id: 'goal-1', phase_index: 0, axwise_decision_id: 'decision-old' },
      },
      {
        id: 'legacy-output',
        category: 'goal-output',
        metadata: { goal_id: 'goal-1', phase_index: 0 },
      },
      {
        id: 'new-output',
        category: 'goal-output',
        metadata: { goal_id: 'goal-1', phase_index: 0, axwise_decision_id: 'decision-new' },
      },
    ];

    expect(currentGoalDocuments(CURRENT_GOAL, documents).map((document) => document.id)).toEqual([
      'proposal',
      'plan',
      'new-output',
    ]);
  });

  it('retains untagged attempt-scoped documents for wholly legacy data', () => {
    const documents = [
      { id: 'legacy-output', category: 'goal-output', metadata: { goal_id: 'goal-1' } },
      { id: 'analysis', category: 'goal-feasibility', metadata: { goal_id: 'goal-1' } },
    ];

    expect(currentGoalDocuments({ ...CURRENT_GOAL, status: 'completed' }, documents)).toEqual(
      documents
    );
  });

  it('hides ambiguous legacy execution outputs immediately on a live replanned goal', () => {
    const documents = [
      { id: 'legacy-output', category: 'goal-output', metadata: { goal_id: 'goal-1' } },
      { id: 'proposal', category: 'proposal', metadata: { goal_id: 'goal-1' } },
    ];

    expect(
      currentGoalDocuments({ ...CURRENT_GOAL, status: 'active' }, documents).map(
        (document) => document.id
      )
    ).toEqual(['proposal']);
  });

  it('stamps both the current AxWise decision and approved authorization hash', () => {
    expect(goalDocumentAttemptMetadata(CURRENT_GOAL)).toEqual({
      axwise_decision_id: 'decision-new',
      execution_authorization_snapshot_hash: 'snapshot-new',
    });
  });
});
