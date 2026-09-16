import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentProfileDialog } from './AgentProfileDialog.jsx';
import { AgentRuntimeArchitecture } from './AgentRuntimeArchitecture.jsx';

describe('Agent runtime architecture', () => {
  const lockedRuntime = {
    version: 'orqaly_agent_runtime_status_v1',
    configured: true,
    status: 'identity_ready_execution_locked',
    controlPlane: { service: 'orqaly-agentic-control-plane', status: 'ready' },
    execution: {
      enabled: false,
      connected: false,
      status: 'release_gated',
      provider: 'n8n',
      mode: 'self_hosted',
    },
  };

  it('renders all eight steps as one accessible, fail-closed ordered flow', () => {
    render(
      <AgentRuntimeArchitecture
        runtime={lockedRuntime}
        agent={{ name: 'Mara Ops', profileVersion: 2 }}
        latestRun={{ id: 'run-1', state: 'awaiting_approval' }}
      />
    );

    const flow = screen.getByRole('list', { name: 'Agent execution readiness flow' });
    expect(within(flow).getAllByRole('listitem')).toHaveLength(8);
    expect(
      within(flow)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual([
      expect.stringContaining('Orqanix chat'),
      expect.stringContaining('Agent profile'),
      expect.stringContaining('Reasoning service'),
      expect.stringContaining('Orqanix Goal workflow'),
      expect.stringContaining('Exact action approval'),
      expect.stringContaining('Private self-hosted n8n'),
      expect.stringContaining('Tool Gateway'),
      expect.stringContaining('Approved service'),
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      /Agent control plane: ready.*External execution: locked/iu
    );
    expect(screen.getByRole('region', { name: 'Private self-hosted n8n' })).toHaveTextContent(
      /release gated.*treated as locked/iu
    );
    expect(within(flow).getByRole('button', { name: /Reasoning service/u })).toHaveTextContent(
      'Not verified'
    );
    expect(
      within(flow).getByRole('button', { name: /Private self-hosted n8n/u })
    ).not.toHaveTextContent('Live');

    fireEvent.click(within(flow).getByRole('button', { name: /Reasoning service/u }));

    expect(screen.getByRole('region', { name: 'Reasoning service' })).toHaveTextContent(
      /does not claim that reasoning execution is live/iu
    );
    expect(within(flow).getByRole('button', { name: /Reasoning service/u })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(flow).getByRole('button', { name: /Private self-hosted n8n/u })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('keeps execution locked on errors and exposes a runtime-only retry', () => {
    const onRetry = vi.fn();
    render(
      <AgentRuntimeArchitecture
        runtime={lockedRuntime}
        error={new Error('Readiness endpoint unavailable.')}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /External execution is treated as locked.*Readiness endpoint unavailable/iu
    );
    expect(
      within(screen.getByRole('list', { name: 'Agent execution readiness flow' })).getByRole(
        'button',
        { name: /Private self-hosted n8n/u }
      )
    ).toHaveTextContent('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry runtime check' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('Agent profile editor', () => {
  it('requires a name and role and emits the versioned profile contract', () => {
    const onSave = vi.fn();
    render(<AgentProfileDialog open onClose={vi.fn()} onSave={onSave} />);

    const createButton = screen.getByRole('button', { name: 'Create Agent' });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: /Name/u }), {
      target: { value: '  Mara Ops  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Role/u }), {
      target: { value: '  Operations lead  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'What this Agent is for' }), {
      target: { value: '  Own recurring operational tasks.  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Working instructions' }), {
      target: { value: '  Stop before every external effect.  ' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Emoji' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Emoji' }), {
      target: { value: '🦉' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use #3559E0' }));
    fireEvent.click(createButton);

    expect(onSave).toHaveBeenCalledWith({
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Mara Ops',
      roleLabel: 'Operations lead',
      description: 'Own recurring operational tasks.',
      instructions: 'Stop before every external effect.',
      avatar: { kind: 'emoji', value: '🦉', color: '#3559E0' },
    });
  });

  it('loads an existing Agent profile and labels the edit as a new version', () => {
    render(
      <AgentProfileDialog
        open
        agent={{
          name: 'Research Fox',
          role: 'Evidence researcher',
          description: 'Finds primary evidence.',
          instructions: 'Cite every material claim.',
          avatar: { kind: 'emoji', value: '🦊️', color: '#B45F06' },
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit Agent profile' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Name/u })).toHaveValue('Research Fox');
    expect(within(dialog).getByRole('textbox', { name: /Role/u })).toHaveValue(
      'Evidence researcher'
    );
    expect(within(dialog).getByRole('button', { name: 'Save new version' })).toBeEnabled();
  });
});
