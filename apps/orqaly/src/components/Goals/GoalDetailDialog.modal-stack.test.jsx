import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/goalService', () => ({
  acceptGoalCustomerScope: vi.fn(async () => ({})),
  approveGoal: vi.fn(async () => ({})),
  approveGoalContext: vi.fn(async () => ({})),
  cancelGoal: vi.fn(async () => ({})),
  getGoal: vi.fn(),
  getGoalMessages: vi.fn(async () => []),
  getGoalResearchBundle: vi.fn(() => new Promise(() => {})),
  healGoal: vi.fn(async () => ({})),
  pauseGoal: vi.fn(async () => ({})),
  provideTools: vi.fn(async () => ({})),
  rebuildGoalTeam: vi.fn(async () => ({})),
  requestGoalContextEvidence: vi.fn(async () => ({})),
  requestGoalChanges: vi.fn(async () => ({})),
  resolveGoal: vi.fn(async () => ({})),
  retryGoal: vi.fn(async () => ({})),
  retryGoalPickup: vi.fn(async () => ({})),
  resumeGoal: vi.fn(async () => ({})),
  reviseGoalContext: vi.fn(async () => ({})),
  submitGoalPoAnswers: vi.fn(async () => ({ status: 'analyzing' })),
  toggleAutopilot: vi.fn(async () => ({})),
  toggleLoop: vi.fn(async () => ({})),
}));

vi.mock('../../hooks/useSimpleMode', () => ({ useSimpleMode: () => ({ simpleMode: false }) }));
vi.mock('../../services/agentProfileService', () => ({ listProfiles: vi.fn(async () => []) }));
vi.mock('../../lib/supabase', () => ({ hasSupabase: () => false, supabase: {} }));
vi.mock('../../hooks/useAxwiseGoalScope', () => ({
  clearAxwiseGoalScope: vi.fn(),
  setAxwiseGoalScope: vi.fn(),
}));

vi.mock('./GoalLiveCards', () => ({ default: () => null }));
vi.mock('./GoalNowExecuting', () => ({ default: () => null }));
vi.mock('./HealingTimeline', () => ({ default: () => null }));
vi.mock('./GoalAgentDetailHost', () => ({ default: () => null }));
vi.mock('./GoalActionsMenu', () => ({ default: () => null }));

import GoalDetailDialog, {
  ExpertPoQuestionsPanel,
  projectGoalDetailTasks,
} from './GoalDetailDialog';
import { getGoal, resolveGoal, submitGoalPoAnswers } from '../../services/goalService';

const awaitingContextGoal = {
  id: 'goal-context-review',
  title: 'Customer research awaiting review',
  status: 'awaiting_context_approval',
  budget_usd: 10,
  spent_usd: 1,
  iteration: 1,
  max_iterations: 3,
  data: {
    axwise_customer_intelligence: {
      routing_mode: 'human_controlled',
      persona_resolution: {
        customer_persona: {
          profile: {
            role: 'Operations manager',
            problem: 'Unverified demand',
            desired_outcome: 'A grounded launch plan',
          },
          trust: { status: 'researched_unverified', verified: false },
          evidence: [],
        },
        ideal_agent_persona: { role: 'Commercial researcher' },
      },
    },
  },
  logs: [],
  plan: { phases: [] },
};

function renderGoalDetail(props = {}) {
  const onClose = props.onClose || vi.fn();
  const result = render(
    <MemoryRouter>
      <GoalDetailDialog open={props.open ?? true} onClose={onClose} goalId="goal-context-review" />
    </MemoryRouter>
  );
  return { ...result, onClose };
}

describe('GoalDetailDialog approval modal ownership', () => {
  it('keeps genuine Expert PO questions on the PRD continuation panel', async () => {
    getGoal.mockResolvedValue({
      ...structuredClone(awaitingContextGoal),
      status: 'awaiting_po_input',
      data: {
        po_questions: ['Which launch constraint is mandatory?'],
        po_answers: null,
      },
    });

    renderGoalDetail();

    expect(await screen.findByText('PO needs your input')).toBeInTheDocument();
    expect(screen.getByText('1. Which launch constraint is mandatory?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Answers & Generate PRD' })).toBeDisabled();
    expect(screen.queryByText('Confirm the working scope')).not.toBeInTheDocument();
  });

  it('submits the exact Expert PO question snapshot through the owner-checked goals API', async () => {
    submitGoalPoAnswers.mockClear();
    getGoal.mockResolvedValue({
      ...structuredClone(awaitingContextGoal),
      status: 'awaiting_po_input',
      data: {
        po_questions: ['Which launch constraint is mandatory?'],
        po_answers: null,
      },
    });

    renderGoalDetail();

    fireEvent.change(await screen.findByPlaceholderText('Your answer...'), {
      target: { value: '  Launch must stay under €10,000.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answers & Generate PRD' }));

    await waitFor(() =>
      expect(submitGoalPoAnswers).toHaveBeenCalledWith('goal-context-review', [
        {
          question: 'Which launch constraint is mandatory?',
          answer: 'Launch must stay under €10,000.',
        },
      ])
    );
    await waitFor(() => expect(getGoal.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('clears typed answers when live polling replaces the Expert PO question snapshot', async () => {
    submitGoalPoAnswers.mockClear();
    const firstGoal = {
      ...structuredClone(awaitingContextGoal),
      status: 'awaiting_po_input',
      data: { po_questions: ['Which customer segment is primary?'] },
    };
    const { rerender } = render(<ExpertPoQuestionsPanel goal={firstGoal} />);

    fireEvent.change(screen.getByPlaceholderText('Your answer...'), {
      target: { value: 'Independent clinics' },
    });
    expect(screen.getByPlaceholderText('Your answer...')).toHaveValue('Independent clinics');

    rerender(
      <ExpertPoQuestionsPanel
        goal={{
          ...firstGoal,
          data: { po_questions: ['Which launch region is primary?'] },
        }}
      />
    );

    await waitFor(() => expect(screen.getByPlaceholderText('Your answer...')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Submit Answers & Generate PRD' })).toBeDisabled();
    expect(submitGoalPoAnswers).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Your answer...'), {
      target: { value: 'Berlin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answers & Generate PRD' }));

    await waitFor(() =>
      expect(submitGoalPoAnswers).toHaveBeenCalledWith('goal-context-review', [
        { question: 'Which launch region is primary?', answer: 'Berlin' },
      ])
    );
  });

  it('exposes stale Preview pickup recovery for an existing goal', async () => {
    getGoal.mockResolvedValue({
      ...structuredClone(awaitingContextGoal),
      status: 'feasibility',
      worker_pickup: {
        status: 'queued',
        worker_scope: 'preview',
        capability: 'server-signed-preview-pickup',
        queued_at: '2026-08-20T10:00:00.000Z',
        updated_at: '2026-08-20T10:00:00.000Z',
        retry_available_at: '2026-08-20T10:01:30.000Z',
      },
    });

    renderGoalDetail();

    expect(await screen.findByRole('button', { name: 'Retry pickup' })).toBeEnabled();
  });

  it('exposes signed stale-running Preview recovery without a worker id', async () => {
    getGoal.mockResolvedValue({
      ...structuredClone(awaitingContextGoal),
      status: 'feasibility',
      worker_pickup: {
        status: 'running',
        worker_scope: 'preview',
        capability: 'server-signed-running-lease',
        updated_at: '2026-08-20T10:00:00.000Z',
        retry_available_at: '2026-08-20T10:05:00.000Z',
      },
    });

    renderGoalDetail();

    expect(await screen.findByRole('button', { name: 'Recover worker' })).toBeEnabled();
  });

  it('gives a missing Gemini key one direct link and a stage-preserving retry', async () => {
    getGoal.mockResolvedValue({
      ...structuredClone(awaitingContextGoal),
      status: 'needs_human',
      data: {
        failure_code: 'llm_api_key_required',
        failure_reason: 'Connect a Gemini API key in Settings → API Keys, then retry this goal.',
        failure_stage: 'feasibility-analysis',
        recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
      },
    });

    renderGoalDetail();

    const openKeys = await screen.findByRole('link', { name: 'Open API Keys' });
    expect(openKeys).toHaveAttribute('href', '/settings/keys');
    expect(openKeys).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('button', { name: 'Resolve & resume' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry with this key' }));

    await waitFor(() =>
      expect(resolveGoal).toHaveBeenCalledWith('goal-context-review', {
        type: 'retry_from_stage',
        data: { stage: 'feasibility-analysis', phaseIndex: undefined },
      })
    );
  });

  it('projects direct task reads through the full no-AxWise retry boundary', () => {
    const goal = {
      data: {
        retry_count: 2,
        goal_task_attempt: { version: 1, retry_count: 2 },
        axwise_orchestration: { decision_id: null, retry_count: 2 },
      },
    };
    const tasks = [
      { id: 'old', status: 'planned', data: { goal_retry_count: 1 } },
      { id: 'current', status: 'planned', data: { goal_retry_count: 2 } },
    ];

    expect(projectGoalDetailTasks(goal, tasks).map((task) => task.id)).toEqual(['current']);
  });

  it('dismisses Gate 1 without closing the task dialog underneath', async () => {
    getGoal.mockResolvedValue(structuredClone(awaitingContextGoal));
    const { onClose } = renderGoalDetail();

    await screen.findByText('Confirm the proposed scope');
    const stackedDialogs = screen.getAllByRole('dialog', { hidden: true });
    expect(stackedDialogs).toHaveLength(2);

    const contextDialog = stackedDialogs.at(-1);
    fireEvent.click(within(contextDialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1));
    expect(screen.getByText('Customer research awaiting review')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not leave a Gate 1 dialog orphaned when the task closes externally', async () => {
    getGoal.mockResolvedValue(structuredClone(awaitingContextGoal));
    const onClose = vi.fn();
    const { rerender } = renderGoalDetail({ onClose });

    await screen.findByText('Confirm the proposed scope');
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);

    rerender(
      <MemoryRouter>
        <GoalDetailDialog open={false} onClose={onClose} goalId="goal-context-review" />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryAllByRole('dialog', { hidden: true })).toHaveLength(0));
  });

  it('reopens Gate 1 when the same task is closed and opened again', async () => {
    getGoal.mockResolvedValue(structuredClone(awaitingContextGoal));
    const onClose = vi.fn();
    const { rerender } = renderGoalDetail({ onClose });

    await screen.findByText('Confirm the proposed scope');
    const contextDialog = screen.getAllByRole('dialog', { hidden: true }).at(-1);
    fireEvent.click(within(contextDialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1));

    rerender(
      <MemoryRouter>
        <GoalDetailDialog open={false} onClose={onClose} goalId="goal-context-review" />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryAllByRole('dialog', { hidden: true })).toHaveLength(0));

    rerender(
      <MemoryRouter>
        <GoalDetailDialog open onClose={onClose} goalId="goal-context-review" />
      </MemoryRouter>
    );
    await screen.findByText('Confirm the proposed scope');
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
  });

  it('gives Gate 2 independent close ownership too', async () => {
    getGoal.mockResolvedValue({
      ...structuredClone(awaitingContextGoal),
      status: 'awaiting_approval',
    });
    const { onClose } = renderGoalDetail();

    await screen.findByText('Proposal Review');
    const proposalDialog = screen.getAllByRole('dialog', { hidden: true }).at(-1);
    fireEvent.click(within(proposalDialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1));
    expect(screen.getByText('Customer research awaiting review')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
