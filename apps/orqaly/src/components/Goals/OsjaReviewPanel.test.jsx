import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const { rerunGoalQualityReview } = vi.hoisted(() => ({
  rerunGoalQualityReview: vi.fn(),
}));

vi.mock('../../services/goalService', () => ({ rerunGoalQualityReview }));

vi.mock('../../lib/supabase', () => {
  const report = {
    schema_version: 2,
    status: 'review_incomplete',
    overall_grade: null,
    review_count: 1,
    validated_review_count: 0,
    invalid_review_count: 1,
    upgrade_count: 1,
    keep_count: 4,
    reviews: [
      {
        deliverable_id: 'task-1',
        deliverable_title: 'Bremen commercial plan',
        score: 98,
        verdict: 'upgrade',
        review_validated: false,
        reasoning: 'The model response did not match the required review schema.',
        alternative_mcps: [
          { name: 'Safe tool', tier: 'free', url: 'https://example.com/tool' },
          { name: 'Unsafe tool', tier: 'free', url: 'javascript:alert(1)' },
        ],
      },
    ],
  };

  function queryFor(table) {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({
        data:
          table === 'knowledge_documents'
            ? [
                {
                  id: 'review-1',
                  content: JSON.stringify(report),
                  created_at: '2026-08-12T00:00:00.000Z',
                },
              ]
            : [],
      }),
      maybeSingle: async () => ({ data: { data: { deliverables: [] } } }),
    };
    return query;
  }

  return {
    hasSupabase: () => true,
    supabase: { from: (table) => queryFor(table) },
  };
});

import OsjaReviewPanel from './OsjaReviewPanel';

describe('OsjaReviewPanel', () => {
  it('renders invalid review output as incomplete and suppresses trusted verdict copy', async () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <OsjaReviewPanel goalId="goal-1" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Osja Review — Review incomplete')).toBeInTheDocument();
    expect(screen.getByText('Validated 0 of 1 attempted deliverable reviews.')).toBeInTheDocument();
    expect(screen.getAllByText('Review incomplete').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('Library-grade')).not.toBeInTheDocument();
    expect(screen.queryByText(/to upgrade/)).not.toBeInTheDocument();
    expect(screen.queryByText(/approved/)).not.toBeInTheDocument();
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Bremen commercial plan Review incomplete/ })
    );
    expect(screen.getByRole('link', { name: /Safe tool/ })).toHaveAttribute(
      'href',
      'https://example.com/tool'
    );
    expect(screen.queryByRole('link', { name: /Unsafe tool/ })).not.toBeInTheDocument();
  });

  it('queues an owner-authenticated full retry from an incomplete review', async () => {
    rerunGoalQualityReview.mockReturnValue(new Promise(() => {}));
    render(
      <ThemeProvider theme={createTheme()}>
        <OsjaReviewPanel goalId="goal-1" />
      </ThemeProvider>
    );

    const retryButton = await screen.findByRole('button', { name: 'Retry review' });
    fireEvent.click(retryButton);

    expect(rerunGoalQualityReview).toHaveBeenCalledOnce();
    expect(rerunGoalQualityReview).toHaveBeenCalledWith('goal-1');
    expect(screen.getByRole('button', { name: 'Review running…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Queueing a fresh task-scoped quality review…'
    );
  });
});
