/**
 * Tests for risk assessor.
 */
import { describe, expect, it } from 'vitest';
import { assessRisk } from './risk-assessor.js';

describe('assessRisk', () => {
  it('returns CRITICAL when collusion detected', () => {
    const result = assessRisk({ collusionDetected: true });
    expect(result.level).toBe('CRITICAL');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('returns HIGH for paranoid security level', () => {
    const result = assessRisk({
      overallScore: 9,
      approved: true,
      consensusReached: true,
      boardConfig: { security_level: 'paranoid' },
    });
    expect(result.level).toBe('HIGH');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('returns HIGH when consensus not reached (standard security)', () => {
    const result = assessRisk({
      consensusReached: false,
      boardConfig: { security_level: 'standard' },
    });
    expect(result.level).toBe('HIGH');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('returns HIGH when consensus not reached but minimal security skips review', () => {
    const result = assessRisk({
      consensusReached: false,
      boardConfig: { security_level: 'minimal' },
    });
    expect(result.level).toBe('HIGH');
    expect(result.humanReviewRequired).toBe(false);
  });

  it('returns HIGH for contradictory result (low score but approved)', () => {
    const result = assessRisk({
      overallScore: 2,
      approved: true,
      consensusReached: true,
    });
    expect(result.level).toBe('HIGH');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('returns HIGH for single member in strict mode', () => {
    const result = assessRisk({
      overallScore: 8,
      approved: true,
      consensusReached: true,
      memberCount: 1,
      boardConfig: { security_level: 'strict' },
    });
    expect(result.level).toBe('HIGH');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('returns MEDIUM for narrow approval margin', () => {
    const result = assessRisk({
      overallScore: 6,
      approvalRatio: 0.55,
      approved: true,
      consensusReached: true,
    });
    expect(result.level).toBe('MEDIUM');
  });

  it('returns MEDIUM for below-average score', () => {
    const result = assessRisk({
      overallScore: 4,
      approved: false,
      consensusReached: true,
    });
    expect(result.level).toBe('MEDIUM');
  });

  it('returns LOW for good results', () => {
    const result = assessRisk({
      overallScore: 8,
      approvalRatio: 0.9,
      approved: true,
      consensusReached: true,
      memberCount: 3,
      boardConfig: { security_level: 'standard' },
    });
    expect(result.level).toBe('LOW');
    expect(result.humanReviewRequired).toBe(false);
  });

  it('returns LOW with defaults when no options provided', () => {
    const result = assessRisk({
      overallScore: 7,
      consensusReached: true,
      approved: true,
      approvalRatio: 1,
    });
    expect(result.level).toBe('LOW');
  });
});
