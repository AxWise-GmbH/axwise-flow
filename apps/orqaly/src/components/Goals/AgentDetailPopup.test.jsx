import { render, screen } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material';
import { describe, expect, it } from 'vitest';
import { AgentDetailPopup } from './GoalLiveCards';

describe('goal agent detail popup', () => {
  it('shows the authorized rich AxWise persona without object coercion or model policy in boundaries', () => {
    const agentId = 'agent-finance';
    const taskId = 'task-pricing';
    const snapshotHash = 'snapshot-1';
    const goal = {
      id: 'goal-estonia',
      title: 'Estonia cat food launch',
      tasks: [
        {
          id: taskId,
          goal_id: 'goal-estonia',
          title: 'Create localized price architecture',
          agent_id: agentId,
          assigned_to: 'Finance Pricing Specialist',
          data: {
            llmProvider: 'gemini',
            llmModel: 'gemini-3.8-flash',
            axwise_execution_context: {
              authorization_snapshot_hash: snapshotHash,
              authorization_task_id: taskId,
              authorization_agent_id: agentId,
              authorization_granted_tool_ids: [],
              customer_persona: {
                name: '**Kadri Tamm**, retail category manager',
                confidence: 0.86,
                decision_role: 'economic_buyer',
                selection_eligibility: 'eligible_primary',
                profile: {
                  problem: 'Needs a defensible Estonia launch margin.',
                  desired_outcome: 'Approve a traceable retail price architecture.',
                  demographics: {
                    market: { country: 'Estonia', city: 'Tallinn' },
                    company: { segment: 'specialty pet retail' },
                  },
                  pains: [{ need: 'defensible shelf margin' }],
                },
              },
              execution_persona: {
                role: 'Finance Pricing Specialist',
                mission: '**Build** an Estonia-specific price, tax, and margin model.',
                relevant_experience: 'Synthetic competency model, not a real credential claim.',
                domain_knowledge: ['Estonian retail pricing', '[object Object]'],
                capabilities: [{ capability: 'price architecture', market: 'Estonia' }],
                methods: ['Stress-test distributor and retailer margins.'],
                output_contract: {
                  expected_outputs: [
                    {
                      artifact: 'Margin model',
                      acceptance: String.raw`ROI = \frac{revenue}{cost}`,
                    },
                  ],
                },
                boundaries: [
                  'Label unobserved willingness-to-pay as a hypothesis.',
                  'Strict model routing: Gemini 3.6 Flash only.',
                ],
              },
              assignment: { agent_id: agentId, agent_name: 'Finance Pricing Specialist' },
            },
          },
        },
      ],
      data: {
        goal_approvals: {
          execution: {
            status: 'approved',
            snapshot_hash: snapshotHash,
            snapshot: {
              authorization_manifest: {
                tasks: [
                  {
                    task_id: taskId,
                    agent_id: agentId,
                    research_contract: null,
                    required_tool_ids: [],
                    granted_tool_ids: [],
                  },
                ],
              },
            },
          },
        },
        execution_authorization: { status: 'approved', snapshot_hash: snapshotHash },
      },
    };

    render(
      <ThemeProvider theme={createTheme()}>
        <AgentDetailPopup
          agentDetail={{ id: agentId, name: 'Finance Pricing Specialist' }}
          agentData={{ id: agentId, name: 'Finance Pricing Specialist', capabilities: [] }}
          agentLoading={false}
          theme={createTheme()}
          goal={goal}
          onClose={() => {}}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText(/Mission: Build an Estonia-specific price, tax, and margin model\./i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Estonia cat food launch')).toHaveLength(2);
    expect(
      screen.getByText(/Customer role: economic buyer · eligible primary/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Problem scope: Needs a defensible Estonia launch margin/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Desired outcome: Approve a traceable retail price architecture/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Domain knowledge: Estonian retail pricing/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Success: artifact: Margin model · acceptance: ROI = revenue \/ cost/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/country: Estonia.*city: Tallinn/i)).toBeInTheDocument();
    expect(
      screen.getByText(/capability: price architecture.*market: Estonia/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/i)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/\*\*|\\(?:frac|sqrt|sum)|\bnull\b/i);
    expect(screen.queryByText(/Strict model routing/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Label unobserved willingness-to-pay/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime configuration — not part of persona/i)).toBeInTheDocument();
    expect(screen.getByText(/gemini · gemini-3.8-flash/i)).toBeInTheDocument();
  });
});
