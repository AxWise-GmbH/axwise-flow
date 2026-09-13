import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {},
  hasSupabase: () => false,
}));

vi.mock('../../services/budgetRequestService', () => ({
  reviewBudgetRequest: vi.fn(),
  listBudgetRequests: vi.fn(),
}));

import {
  getGoalQualityReviewNotice,
  getOsjaReviewDisplayState,
  getOsjaReviewItemDisplayState,
  getSafeHttpsUrl,
  normalizeOsjaReviewItem,
  formatStructuredValue,
  formatTechDoc,
} from '../../utils/goalTruthFormatters';

describe('goal truth formatters', () => {
  it('renders historical Osja aliases instead of an empty accordion', () => {
    expect(
      normalizeOsjaReviewItem({
        explanation: 'The risk evidence needs stronger sourcing.',
        weaknesses: ['No source links'],
      })
    ).toEqual(
      expect.objectContaining({
        reasoning: 'The risk evidence needs stronger sourcing.',
        what_to_change: ['No source links'],
      })
    );
  });

  it('fails an incomplete Osja aggregate closed instead of showing a grade', () => {
    expect(
      getOsjaReviewDisplayState({
        status: 'review_incomplete',
        overall_grade: 99,
        review_count: 2,
        validated_review_count: 1,
        invalid_review_count: 1,
        reviews: [
          { verdict: 'keep', score: 99, review_validated: true },
          { verdict: null, score: 0, review_validated: false },
        ],
      })
    ).toEqual(
      expect.objectContaining({
        incomplete: true,
        attemptedCount: 2,
        validatedCount: 1,
        invalidCount: 1,
        overallGrade: null,
      })
    );
  });

  it('never presents an invalid Osja item as an upgrade or approved result', () => {
    expect(
      getOsjaReviewItemDisplayState(
        { verdict: 'upgrade', score: 98, review_validated: false },
        { reportIncomplete: true }
      )
    ).toEqual({ valid: false, verdict: null, score: null });

    expect(
      getOsjaReviewItemDisplayState(
        { verdict: 'keep', score: 98, review_validated: true },
        { reportIncomplete: true }
      )
    ).toEqual({ valid: true, verdict: 'keep', score: 98 });
  });

  it('surfaces the review_incomplete goal state with explicit copy', () => {
    expect(getGoalQualityReviewNotice({ status: 'review_incomplete' })).toEqual(
      expect.objectContaining({
        label: 'Quality review: incomplete',
        color: 'error',
      })
    );
    expect(
      getGoalQualityReviewNotice({
        status: 'accepted',
        overall_grade: 95,
        review_count: 1,
        validated_review_count: 1,
        invalid_review_count: 0,
      })
    ).toBeNull();
    expect(getGoalQualityReviewNotice(null)).toBeNull();
  });

  it('treats schema-v2 quality state without validation accounting as incomplete', () => {
    const historicalInvalidState = {
      status: 'needs_revision',
      schema_version: 2,
      review_count: 5,
      overall_grade: 97,
    };
    expect(getOsjaReviewDisplayState(historicalInvalidState)).toEqual(
      expect.objectContaining({ incomplete: true, overallGrade: null })
    );
    expect(getGoalQualityReviewNotice(historicalInvalidState)).toEqual(
      expect.objectContaining({ label: 'Quality review: incomplete' })
    );
  });

  it('only permits valid HTTPS alternative links', () => {
    expect(getSafeHttpsUrl('https://example.com/tool')).toBe('https://example.com/tool');
    expect(getSafeHttpsUrl('http://example.com/tool')).toBeNull();
    expect(getSafeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeHttpsUrl('not a URL')).toBeNull();
  });

  it('formats structured acceptance criteria without object coercion', () => {
    const criterion = {
      phase: 4,
      test: 'Risk matrix includes explicit mitigations',
      type: 'llm_judge',
    };
    expect(formatStructuredValue(criterion)).toBe(
      '[Phase 4] Risk matrix includes explicit mitigations (llm judge)'
    );
    const rendered = formatTechDoc({ acceptance_tests: [criterion] });
    expect(rendered).toContain('Risk matrix includes explicit mitigations');
    expect(rendered).not.toContain('[object Object]');
  });
});
