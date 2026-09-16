import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GoalLiveCards from './GoalLiveCards';

describe('GoalLiveCards customer intelligence research', () => {
  it('shows imported AxWise stage and item counts and opens research details', () => {
    const goal = {
      id: 'goal-bremen',
      title: 'Bremen commercial research',
      status: 'completed',
      budget_usd: 5,
      spent_usd: 0.5,
      data: {
        axwise_customer_intelligence: {
          status: 'completed',
          research_bundle: {
            run_id: 'run-bremen',
            bundle_version: 'axwise_research_bundle_v1',
            source_count: 12,
            persona_count: 4,
          },
          research_bundle_summary: {
            confidence: 0.84,
            interview_count: 3,
            stages: [
              { id: 'sources', name: 'Source discovery', status: 'completed' },
              { id: 'personas', name: 'Persona synthesis', status: 'completed' },
              { id: 'prd', name: 'Research PRD', status: 'running' },
            ],
          },
        },
      },
    };

    render(<GoalLiveCards goal={goal} researchBundleLoader={vi.fn(() => new Promise(() => {}))} />);

    const metric = (label) => screen.getByText(label).parentElement.parentElement;
    expect(within(metric('Research stages')).getByText('2/3')).toBeInTheDocument();
    expect(within(metric('Sources')).getByText('12')).toBeInTheDocument();
    expect(within(metric('Personas')).getByText('4')).toBeInTheDocument();
    expect(within(metric('Interviews')).getByText('3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Research details/i }));
    expect(screen.getByRole('tablist', { name: /Research detail sections/i })).toBeInTheDocument();
    expect(screen.getByText('Run: run-bremen')).toBeInTheDocument();
  });

  it('shows a bounded failed-research state and retries only the research stage', () => {
    const onRetryResearch = vi.fn();
    const goal = {
      id: 'goal-estonia',
      title: 'Estonia cat food launch',
      status: 'needs_human',
      budget_usd: 5,
      spent_usd: 0,
      feasibility_report: { recommendation: 'proceed' },
      tech_doc: { problem_statement: 'Launch in Estonia' },
      data: {
        axwise_customer_intelligence: {
          status: 'required_research_blocked',
          decision_id: 'decision-estonia',
          routing_mode: 'research_assisted',
          reason: 'provider.internal.exception=secret-value',
          current_stage: 'grounding_market',
          progress_percentage: 3,
          elapsed_ms: 485145,
          research_failure: {
            code: 'grounding_failed',
            stage: 'grounding_market',
            retryable: true,
          },
        },
      },
    };

    render(
      <GoalLiveCards
        goal={goal}
        onRetryResearch={onRetryResearch}
        researchBundleLoader={vi.fn(() => Promise.resolve(null))}
      />
    );

    expect(screen.getAllByText('Research blocked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('grounding market').length).toBeGreaterThan(0);
    expect(screen.getByText('3%')).toBeInTheDocument();
    expect(screen.getByText('8m')).toBeInTheDocument();
    expect(screen.getByText(/Routing accepted · research assisted/i)).toBeInTheDocument();
    expect(screen.getByText(/no customer persona.*was accepted/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret-value/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\[object Object\]|\bnull\b|\*\*|\\frac|\\sqrt/i)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry research' }));
    expect(onRetryResearch).toHaveBeenCalledWith(goal);
  });

  it.each([
    { research_failure: { code: 'research_cancelled', retryable: false } },
    { research_failure: { code: 'research_failed', retryable: true }, retry_count: 3 },
  ])('does not offer an unsafe research retry at cap or when non-retryable', (failure) => {
    render(
      <GoalLiveCards
        goal={{
          id: 'goal-estonia',
          status: 'needs_human',
          data: {
            axwise_customer_intelligence: {
              status: 'required_research_blocked',
              current_stage: 'grounding_market',
              ...failure,
            },
          },
        }}
        onRetryResearch={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Retry research' })).not.toBeInTheDocument();
  });

  it('does not claim routing was accepted when research failed before a decision', () => {
    render(
      <GoalLiveCards
        goal={{
          id: 'goal-estonia',
          status: 'needs_human',
          data: {
            axwise_customer_intelligence: {
              status: 'required_research_blocked',
              current_stage: 'customer_research',
              research_failure: {
                code: 'research_service_not_ready',
                retryable: false,
              },
            },
          },
        }}
      />
    );

    expect(screen.getByText(/Routing did not complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/Routing accepted/i)).not.toBeInTheDocument();
  });
});
