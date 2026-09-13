import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const acceptGoalCustomerScope = vi.fn();
const reviseGoalCustomerScope = vi.fn();
vi.mock('../../services/goalService', () => ({
  acceptGoalCustomerScope: (...args) => acceptGoalCustomerScope(...args),
  reviseGoalCustomerScope: (...args) => reviseGoalCustomerScope(...args),
}));

import AxwiseScopeConfirmationPanel, {
  axwiseScopeAcceptancePayload,
  axwiseScopeChatIntent,
  axwiseScopeForGoal,
} from './AxwiseScopeConfirmationPanel';

function goal() {
  return {
    id: 'goal-scope',
    title: 'Reduce missed appointments',
    description: 'Help clinics reduce no-shows.',
    status: 'awaiting_po_input',
    data: {
      axwise_customer_intelligence: {
        status: 'human_clarification',
        decision_id: 'decision-scope',
        clarification_scope: {
          scope_hash: 'a'.repeat(64),
          business_idea: 'reduce missed appointments',
          target_customer: 'Clinic operations managers',
          problem: 'unused appointment capacity',
          desired_outcome: 'Reduce no-shows by 20%',
          constraints: ['Protect patient privacy'],
          evidence: [],
          summary:
            'So you want to reduce missed appointments for clinic operations managers who face unused appointment capacity.',
          trust: { status: 'declared_inferred_unverified', verified: false },
        },
      },
    },
  };
}

describe('AxwiseScopeConfirmationPanel', () => {
  beforeEach(() => {
    acceptGoalCustomerScope.mockReset();
    acceptGoalCustomerScope.mockResolvedValue({ status: 'researching_customer' });
    reviseGoalCustomerScope.mockReset();
    reviseGoalCustomerScope.mockResolvedValue({ status: 'analyzing' });
  });

  it('shows one unverified scope card with no three-question form by default', () => {
    render(<AxwiseScopeConfirmationPanel goal={goal()} />);

    expect(screen.getByText('Proposed scope')).toBeInTheDocument();
    expect(screen.getByText('Declared / inferred / unverified')).toBeInTheDocument();
    expect(screen.getByText(/No external domain facts are verified/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Proceed' })).toBeEnabled();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByText(/PO needs your input/i)).not.toBeInTheDocument();
  });

  it('submits optional corrections through the authenticated, hash-bound goal service', async () => {
    const onAnswered = vi.fn();
    render(<AxwiseScopeConfirmationPanel goal={goal()} onAnswered={onAnswered} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit scope' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Who it is for' }), {
      target: { value: 'Dental clinic owners' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Intended outcome' }), {
      target: { value: 'Reduce no-shows by 25%' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Extra context (optional)' }), {
      target: { value: 'Start in Berlin.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild scope' }));

    await waitFor(() =>
      expect(reviseGoalCustomerScope).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'goal-scope',
          decision_id: 'decision-scope',
          scope_hash: 'a'.repeat(64),
          feedback: expect.stringContaining(
            'Primary customer or stakeholder: Dental clinic owners'
          ),
        })
      )
    );
    expect(reviseGoalCustomerScope.mock.calls[0][0].feedback).toContain(
      'Desired outcome: Reduce no-shows by 25%'
    );
    expect(reviseGoalCustomerScope.mock.calls[0][0].feedback).toContain(
      'Additional context: Start in Berlin.'
    );
    expect(acceptGoalCustomerScope).not.toHaveBeenCalled();
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('keeps a service failure visible and does not report success', async () => {
    const onAnswered = vi.fn();
    acceptGoalCustomerScope.mockRejectedValue(new Error('The customer scope changed. Refresh.'));
    render(<AxwiseScopeConfirmationPanel goal={goal()} onAnswered={onAnswered} />);

    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The customer scope changed. Refresh.'
    );
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it('resets optional edits when a newer decision or scope replaces the card', () => {
    const firstGoal = goal();
    const { rerender } = render(<AxwiseScopeConfirmationPanel goal={firstGoal} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit scope' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Who it is for' }), {
      target: { value: 'A stale local correction' },
    });

    const nextGoal = goal();
    nextGoal.data.axwise_customer_intelligence.decision_id = 'decision-scope-next';
    nextGoal.data.axwise_customer_intelligence.clarification_scope = {
      ...nextGoal.data.axwise_customer_intelligence.clarification_scope,
      scope_hash: 'b'.repeat(64),
      target_customer: 'Hospital scheduling directors',
    };
    rerender(<AxwiseScopeConfirmationPanel goal={nextGoal} />);

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Edit scope' }));
    expect(screen.getByRole('textbox', { name: 'Who it is for' })).toHaveValue(
      'Hospital scheduling directors'
    );
  });

  it('rehydrates the live legacy scope from its exact saved answers', () => {
    const legacy = goal();
    delete legacy.data.axwise_customer_intelligence.clarification_scope;
    legacy.data.po_answers = [
      { question: 'Who?', answer: 'Clinic owners' },
      { question: 'Outcome?', answer: 'Reduce no-shows' },
      { question: 'Facts?', answer: 'Use appointment data only' },
    ];

    expect(axwiseScopeForGoal(legacy)).toMatchObject({
      target_customer: 'Clinic owners',
      desired_outcome: 'Reduce no-shows',
      optional_details: 'Use appointment data only',
      trust: { verified: false },
    });
  });

  it('classifies proceed, details and questions without a model call', () => {
    expect(axwiseScopeChatIntent('Proceed with our assumptions')).toBe('proceed');
    expect(axwiseScopeChatIntent('Proceed with those assumptions')).toBe('proceed');
    expect(axwiseScopeChatIntent('Yes, proceed')).toBe('proceed');
    expect(axwiseScopeChatIntent('Sounds good')).toBe('proceed');
    expect(axwiseScopeChatIntent('Also start with Berlin clinics')).toBe('details');
    expect(axwiseScopeChatIntent('Proceed with enterprise customers')).toBe('details');
    expect(axwiseScopeChatIntent('Why is this unverified?')).toBe('question');
    expect(axwiseScopeChatIntent('Yes, what happens next?')).toBe('question');
    expect(axwiseScopeChatIntent('Yes, but change the customer')).toBe('details');
    expect(axwiseScopeChatIntent('Okay, actually start in Munich')).toBe('details');
    expect(axwiseScopeChatIntent('Could you focus this on the pilot?')).toBe('details');
    expect(axwiseScopeChatIntent('Can we focus this on the pilot?')).toBe('details');
    expect(axwiseScopeChatIntent('But can we focus this on the pilot?')).toBe('details');
    expect(axwiseScopeChatIntent('Can you explain why this is the scope?')).toBe('question');
    expect(axwiseScopeChatIntent('Is this correct?')).toBe('question');
    expect(axwiseScopeChatIntent('What is wrong here?')).toBe('question');
    expect(axwiseScopeChatIntent('But why?')).toBe('question');
    expect(axwiseScopeChatIntent('Yes', { materialQuestionActive: true })).toBe('details');
    expect(axwiseScopeChatIntent('Proceed', { materialQuestionActive: true })).toBe('details');
    expect(axwiseScopeChatIntent('Would Germany work?', { materialQuestionActive: true })).toBe(
      'details'
    );
    expect(
      axwiseScopeChatIntent('Why do you need this answer?', { materialQuestionActive: true })
    ).toBe('question');
    expect(
      axwiseScopeChatIntent('Could you clarify the question?', { materialQuestionActive: true })
    ).toBe('question');
  });

  it('uses one hash-bound acceptance payload for both the card and chat', () => {
    expect(
      axwiseScopeAcceptancePayload(goal(), { optionalDetails: 'Start in Berlin.' })
    ).toMatchObject({
      id: 'goal-scope',
      decision_id: 'decision-scope',
      scope_hash: 'a'.repeat(64),
      scope: {
        target_customer: 'Clinic operations managers',
        optional_details: 'Start in Berlin.',
      },
    });
  });
});
