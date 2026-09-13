/**
 * Tests for consensus calculator.
 */
import { describe, expect, it } from 'vitest';
import { calculateConsensus, aggregateScores } from './consensus-calculator.js';

// ── calculateConsensus ───────────────────────────────────────────

describe('calculateConsensus', () => {
  const makeResponse = (approved, overallScore = 7, role = 'evaluator') => ({
    memberId: `m-${Math.random().toString(36).slice(2, 6)}`,
    approved,
    overallScore,
    role,
    weight: 1,
  });

  describe('quorum', () => {
    it('fails when quorum not met', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true)],
        rules: { consensus_type: 'majority', quorum: 3 },
      });
      expect(result.consensusReached).toBe(false);
      expect(result.approved).toBe(false);
    });

    it('passes when quorum met', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true), makeResponse(true), makeResponse(true)],
        rules: { consensus_type: 'majority', quorum: 2, approval_threshold: 0.5 },
      });
      expect(result.consensusReached).toBe(true);
      expect(result.approved).toBe(true);
    });
  });

  describe('unanimous', () => {
    it('approves when all members approve', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true), makeResponse(true)],
        rules: { consensus_type: 'unanimous', quorum: 2 },
      });
      expect(result.approved).toBe(true);
      expect(result.consensusReached).toBe(true);
    });

    it('rejects when any member rejects', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true), makeResponse(false)],
        rules: { consensus_type: 'unanimous', quorum: 2 },
      });
      expect(result.approved).toBe(false);
    });

    it('reports consensus reached when all reject', () => {
      const result = calculateConsensus({
        responses: [makeResponse(false), makeResponse(false)],
        rules: { consensus_type: 'unanimous', quorum: 2 },
      });
      expect(result.consensusReached).toBe(true);
      expect(result.approved).toBe(false);
    });
  });

  describe('majority', () => {
    it('approves when majority approves', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true), makeResponse(true), makeResponse(false)],
        rules: { consensus_type: 'majority', quorum: 2, approval_threshold: 0.5 },
      });
      expect(result.approved).toBe(true);
      expect(result.approvalRatio).toBeCloseTo(0.667, 2);
    });

    it('rejects when majority rejects', () => {
      const result = calculateConsensus({
        responses: [makeResponse(false), makeResponse(false), makeResponse(true)],
        rules: { consensus_type: 'majority', quorum: 2, approval_threshold: 0.5 },
      });
      expect(result.approved).toBe(false);
    });

    it('handles tie with chairman_decides strategy', () => {
      const result = calculateConsensus({
        responses: [
          makeResponse(true, 8, 'chairman'),
          makeResponse(false, 5, 'evaluator'),
        ],
        rules: { consensus_type: 'majority', quorum: 2, approval_threshold: 0.5, split_decision_strategy: 'chairman_decides' },
      });
      // 50/50 is a tie; chairman approves → approved
      expect(result.approved).toBe(true);
    });

    it('handles tie with reject strategy', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true), makeResponse(false)],
        rules: { consensus_type: 'majority', quorum: 2, approval_threshold: 0.5, split_decision_strategy: 'reject' },
      });
      expect(result.approved).toBe(false);
    });

    it('handles tie with escalate_to_human strategy', () => {
      const result = calculateConsensus({
        responses: [makeResponse(true), makeResponse(false)],
        rules: { consensus_type: 'majority', quorum: 2, approval_threshold: 0.5, split_decision_strategy: 'escalate_to_human' },
      });
      expect(result.approved).toBe(false);
      expect(result.details.requiresHumanReview).toBe(true);
    });
  });

  describe('weighted', () => {
    it('uses weights in calculation', () => {
      const responses = [
        { memberId: 'm1', approved: true, overallScore: 8, weight: 3 },
        { memberId: 'm2', approved: false, overallScore: 4, weight: 1 },
      ];
      const result = calculateConsensus({
        responses,
        rules: { consensus_type: 'weighted', quorum: 2, approval_threshold: 0.5 },
      });
      // Weight: 3/4 = 0.75 approved
      expect(result.approved).toBe(true);
      expect(result.approvalRatio).toBe(0.75);
    });

    it('rejects when weighted approval below threshold', () => {
      const responses = [
        { memberId: 'm1', approved: true, overallScore: 8, weight: 1 },
        { memberId: 'm2', approved: false, overallScore: 4, weight: 3 },
      ];
      const result = calculateConsensus({
        responses,
        rules: { consensus_type: 'weighted', quorum: 2, approval_threshold: 0.5 },
      });
      expect(result.approved).toBe(false);
      expect(result.approvalRatio).toBe(0.25);
    });
  });

  describe('custom', () => {
    it('uses average score against threshold', () => {
      const responses = [
        { memberId: 'm1', approved: true, overallScore: 8 },
        { memberId: 'm2', approved: true, overallScore: 6 },
      ];
      const result = calculateConsensus({
        responses,
        rules: { consensus_type: 'custom', quorum: 2, approval_threshold: 0.5 },
      });
      // Average = 7, normalized = 0.7, threshold 0.5 → approved
      expect(result.approved).toBe(true);
    });

    it('rejects when average score below threshold', () => {
      const responses = [
        { memberId: 'm1', approved: true, overallScore: 3 },
        { memberId: 'm2', approved: false, overallScore: 2 },
      ];
      const result = calculateConsensus({
        responses,
        rules: { consensus_type: 'custom', quorum: 2, approval_threshold: 0.5 },
      });
      // Average = 2.5, normalized = 0.25 → rejected
      expect(result.approved).toBe(false);
    });
  });

  it('defaults to majority when unknown type', () => {
    const result = calculateConsensus({
      responses: [makeResponse(true), makeResponse(true)],
      rules: { consensus_type: 'unknown_type', quorum: 1, approval_threshold: 0.5 },
    });
    expect(result.approved).toBe(true);
  });
});

// ── aggregateScores ──────────────────────────────────────────────

describe('aggregateScores', () => {
  it('averages scores across members', () => {
    const responses = [
      { scores: { quality: 8, completeness: 6 }, overallScore: 7 },
      { scores: { quality: 6, completeness: 8 }, overallScore: 7 },
    ];
    const result = aggregateScores(responses);
    expect(result.aggregatedScores.quality).toBe(7);
    expect(result.aggregatedScores.completeness).toBe(7);
    expect(result.overallScore).toBe(7);
  });

  it('handles missing criteria in some responses', () => {
    const responses = [
      { scores: { quality: 8, extra: 10 }, overallScore: 9 },
      { scores: { quality: 6 }, overallScore: 6 },
    ];
    const result = aggregateScores(responses);
    expect(result.aggregatedScores.quality).toBe(7);
    expect(result.aggregatedScores.extra).toBe(10); // Only one member scored it
    expect(result.overallScore).toBe(7.5);
  });

  it('returns zeros for empty input', () => {
    const result = aggregateScores([]);
    expect(result.aggregatedScores).toEqual({});
    expect(result.overallScore).toBe(0);
  });
});
