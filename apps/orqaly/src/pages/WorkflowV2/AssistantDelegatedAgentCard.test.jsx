import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantDelegatedAgentCard } from './AssistantDelegatedAgentCard.jsx';

function delegatedAgent(overrides = {}) {
  return {
    type: 'delegated_agent',
    id: '10000000-0000-4000-8000-000000000001',
    runId: '20000000-0000-4000-8000-000000000001',
    threadId: '30000000-0000-4000-8000-000000000001',
    name: 'Messaging setup Agent',
    task: 'Compare messaging providers and prepare the implementation plan.',
    lifetime: 'temporary',
    status: 'awaiting_gate_1',
    executorPersona: {
      role: 'task_executor',
      version: 'axwise_executor_persona_v1',
    },
    memoryScope: {
      kind: 'thread_and_goal',
      label: 'This chat and Goal only',
    },
    runtime: {
      provider: 'orqaly_workflow_v2',
      label: 'Orqaly GCP + AxWise',
    },
    capabilities: {
      research: true,
      planning: true,
      artifactProduction: true,
      approvalGates: true,
      externalActions: false,
    },
    toolExecution: { status: 'not_configured', provider: null },
    ...overrides,
  };
}

describe('AssistantDelegatedAgentCard', () => {
  it('shows the persisted Agent identity, isolation and only the live Workflow status', () => {
    render(
      <AssistantDelegatedAgentCard
        part={delegatedAgent({ status: 'requested' })}
        liveStatus="awaiting_gate_1"
      />
    );

    expect(
      screen.getByRole('region', { name: 'Delegated Agent: Messaging setup Agent' })
    ).toBeInTheDocument();
    expect(screen.getByText('Temporary')).toBeInTheDocument();
    expect(screen.queryByText(delegatedAgent().task)).toBeNull();
    expect(screen.queryByText('Scope approval')).toBeNull();
    expect(screen.getByRole('link', { name: 'Messaging setup Agent' })).toHaveAttribute(
      'href',
      `/agent-hub/${delegatedAgent().id}`
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agent permissions & task context' }));
    expect(
      screen.getByText(/automatic cleanup when the task ends is not connected/u)
    ).toBeInTheDocument();
    expect(screen.queryByText('Workflow queued')).toBeNull();
    expect(screen.getByText('Memory: This chat and Goal only')).toBeInTheDocument();
    expect(screen.getByText('Orqanix cloud')).toBeInTheDocument();
    expect(screen.queryByText('Orqaly GCP + AxWise')).toBeNull();
    expect(
      screen.getByText(
        'Reasoning service · axwise_executor_persona_v1 · fixed profile contract bound to this Goal'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/External actions are not connected on this Agent yet\./u)
    ).toBeInTheDocument();
    expect(screen.queryByText(/n8n/iu)).toBeNull();
  });

  it('preserves an unfamiliar runtime label instead of claiming Orqanix owns it', () => {
    render(
      <AssistantDelegatedAgentCard
        part={delegatedAgent({ runtime: { provider: 'other_runtime', label: 'Custom runtime' } })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agent permissions & task context' }));
    expect(screen.getByText('Custom runtime')).toBeInTheDocument();
    expect(screen.queryByText('Orqanix cloud')).toBeNull();
  });

  it('distinguishes a persistent digital twin without overstating its tool access', () => {
    render(
      <AssistantDelegatedAgentCard
        part={delegatedAgent({
          lifetime: 'persistent',
        })}
        liveStatus="running"
      />
    );

    expect(screen.getByText('Reusable profile')).toBeInTheDocument();
    expect(screen.queryByText('Workflow running')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Agent permissions & task context' }));
    expect(screen.getByText('Memory: This chat and Goal only')).toBeInTheDocument();
    expect(
      screen.getByText('Reusable profile; long-term memory not connected.')
    ).toBeInTheDocument();
  });

  it('omits status until the live Goal projection arrives', () => {
    render(<AssistantDelegatedAgentCard part={delegatedAgent({ status: 'failed' })} />);

    expect(screen.queryByText('Failed')).toBeNull();
    expect(screen.queryByText('Scope approval')).toBeNull();
  });

  it('marks legacy Agent metadata as unverified instead of claiming runtime binding', () => {
    render(
      <AssistantDelegatedAgentCard
        part={delegatedAgent({
          executorPersona: {
            role: 'task_executor',
            version: 'axwise_executor_persona_v1',
            provider: 'axwise',
            status: 'legacy_unverified',
          },
        })}
      />
    );
    expect(
      screen.getByText('Legacy Agent · runtime binding was not recorded or verified.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agent permissions & task context' }));
    expect(
      screen.getByText(/legacy metadata; runtime binding was not recorded or verified/u)
    ).toBeInTheDocument();
    expect(screen.queryByText(/fixed profile contract bound to this Goal/u)).toBeNull();
  });

  it('uses the same avatar as the matching directory profile without replacing the saved execution identity', () => {
    const part = delegatedAgent();
    const { rerender } = render(
      <AssistantDelegatedAgentCard
        part={part}
        agent={{
          id: part.id,
          name: 'New profile name',
          avatar: { kind: 'emoji', value: '🦊', color: '#6750A4' },
        }}
      />
    );
    expect(screen.getByLabelText('Messaging setup Agent avatar')).toHaveTextContent('🦊');
    expect(screen.queryByText('New profile name')).toBeNull();
    rerender(
      <AssistantDelegatedAgentCard
        part={part}
        agent={{ id: 'different-agent', avatar: { kind: 'emoji', value: '🦊', color: '#6750A4' } }}
      />
    );
    expect(screen.queryByText('🦊')).toBeNull();
  });
});
