import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/goalService', () => ({
  approveGoal: vi.fn(),
  requestGoalChanges: vi.fn(),
  cancelGoal: vi.fn(),
}));

import GoalProposalDialog from './GoalProposalDialog';

describe('GoalProposalDialog AxWise provenance', () => {
  it('separates a non-applied AxWise recommendation from local task assignments', () => {
    const goal = {
      id: 'goal-1',
      title: 'Commercial launch in Bremen',
      proposal: {
        assignments: [
          {
            task_id: 'task-1',
            step_id: 'phase-1-job-1',
            task: 'Prepare the market brief',
            agent_name: 'Marketing Strategist',
          },
        ],
      },
      data: {
        axwise_orchestration: {
          decision_id: 'decision-shadow-1',
          status: 'escalated',
          enforcement: 'shadow',
          applied: false,
          feasible: false,
          assignments: {},
          rejections: [{ code: 'invalid_plan', reason: 'required plan node omitted' }],
        },
        goal_approvals: {
          execution: {
            snapshot: {
              authorization_manifest: { valid: true, tasks: [] },
            },
          },
        },
      },
    };

    render(<GoalProposalDialog open onClose={() => {}} goal={goal} />);

    expect(screen.getByText('AxWise recommendation')).toBeInTheDocument();
    expect(screen.getByText('Not executable')).toBeInTheDocument();
    expect(screen.getByText('Not applied')).toBeInTheDocument();
    expect(screen.getByText(/assignments below come from Orqaly/i)).toBeInTheDocument();
    expect(screen.getByText('Orqaly authorized task assignments')).toBeInTheDocument();
    expect(screen.getByText('Local authorization manifest')).toBeInTheDocument();
  });

  it('blocks approval when the execution authorization manifest is invalid', () => {
    const goal = {
      id: 'goal-invalid',
      title: 'Bremen commercial launch',
      proposal: {
        assignments: [
          {
            task_id: 'task-1',
            task: 'Latvian Noodle Market Positioning',
            agent_name: 'Market Research Analyst',
          },
        ],
      },
      data: {
        execution_authorization: {
          manifest: {
            valid: false,
            issues: [
              {
                code: 'task_agent_role_mismatch',
                task_id: 'task-1',
                required_role: 'Brand & UX Designer',
              },
            ],
          },
        },
      },
    };

    render(<GoalProposalDialog open onClose={() => {}} goal={goal} />);

    // The gate stays closed...
    expect(screen.getByRole('button', { name: 'Approve & Start' })).toBeDisabled();
    // ...but the user is told what is wrong and what to do, not given a code.
    expect(screen.getByText(/Execution cannot start yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/needs a Brand & UX Designer, but it is assigned to Market Research Analyst/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Rebuild the team/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('task_agent_role_mismatch');
    // A structural failure offers the remedy as an action.
    expect(screen.getByRole('button', { name: 'Rebuild team' })).toBeEnabled();
  });

  it('does not offer a team rebuild for a tool-grant problem', () => {
    const goal = {
      id: 'goal-tools',
      title: 'Bremen commercial launch',
      data: {
        execution_authorization: {
          manifest: {
            valid: false,
            issues: [{ code: 'task_tool_not_granted', task_id: 'task-1', tool_id: 'github' }],
          },
        },
      },
    };

    render(<GoalProposalDialog open onClose={() => {}} goal={goal} />);

    expect(screen.queryByRole('button', { name: 'Rebuild team' })).not.toBeInTheDocument();
    expect(screen.getByText(/Agent Hub/)).toBeInTheDocument();
  });
});
