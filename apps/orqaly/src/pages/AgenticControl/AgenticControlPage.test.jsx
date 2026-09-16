import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import AgenticControlPage from './AgenticControlPage';
import {
  APPROVAL_ID,
  admissionFixture,
  agentsFixture,
  approvalsFixture,
  runFixture,
  RUN_ID,
} from '../../test/fixtures/agenticControlFixtures';

const theme = createTheme();

function createClient(overrides = {}) {
  return {
    admitTask: vi.fn(async () => admissionFixture),
    listAgents: vi.fn(async () => agentsFixture),
    getRun: vi.fn(async () => runFixture),
    listApprovals: vi.fn(async () => approvalsFixture),
    decideApproval: vi.fn(async (approvalId, decision) => ({
      version: 'orqaly_approval_decision_result_v1',
      approvalId,
      status: decision.decision === 'approve' ? 'approved' : 'rejected',
      runId: RUN_ID,
      runVersion: 3,
      runState: decision.decision === 'approve' ? 'queued' : 'planning',
      replayed: false,
    })),
    ...overrides,
  };
}

function renderPage(client) {
  return render(
    <ThemeProvider theme={theme}>
      <AgenticControlPage client={client} />
    </ThemeProvider>
  );
}

describe('AgenticControlPage', () => {
  it('renders only data exposed by the current Agent and run-detail routes', async () => {
    const client = createClient();
    renderPage(client);

    expect(
      await screen.findByText('Market Research Agent (AI)', {}, { timeout: 4000 })
    ).toBeInTheDocument();
    expect(screen.getByText('research-options')).toBeInTheDocument();
    expect(screen.getByText('Run: awaiting plan approval')).toBeInTheDocument();
    expect(screen.getByText(/does not expose Agent-team membership details/i)).toBeInTheDocument();
    expect(screen.getByText(/does not expose memory scopes/i)).toBeInTheDocument();
    expect(screen.getByText(/does not expose the run event timeline/i)).toBeInTheDocument();
    expect(await screen.findByText('Approve this Agent plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve bound plan' })).toBeEnabled();
    expect(screen.getByText('Canonical parameters (secrets redacted)')).toBeInTheDocument();
    expect(screen.getByText('Executor persona version')).toBeInTheDocument();
    expect(screen.getByText('Delegated authority')).toBeInTheDocument();
    expect(screen.getByText('Execution descriptor')).toBeInTheDocument();
    expect(screen.getByText('Executor binding')).toBeInTheDocument();
    expect(screen.getByText('External targets')).toBeInTheDocument();
    expect(screen.getByText('External preconditions')).toBeInTheDocument();
    expect(screen.getByText('Connection reference and requested scopes')).toBeInTheDocument();
    expect(screen.getByText('Provider operation')).toBeInTheDocument();
    expect(screen.getByText('Idempotency binding')).toBeInTheDocument();
    expect(screen.getByText('Data egress')).toBeInTheDocument();
    expect(screen.getByText('250 minor units (EUR)')).toBeInTheDocument();
    expect(screen.getAllByText(/crm\.record_update/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/connection\/crm-primary/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/credentialOwnerPrincipalId|raw-token-value/)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/control endpoints are not exposed yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause Agent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(client.getRun).toHaveBeenCalledWith(RUN_ID);
    expect(screen.queryByText(/twilio|github|n8n/i)).not.toBeInTheDocument();
  });

  it('submits an exact versioned approval decision and refreshes authoritative state', async () => {
    const client = createClient();
    renderPage(client);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve bound plan' }));

    await waitFor(() => expect(client.decideApproval).toHaveBeenCalledTimes(1));
    expect(client.decideApproval).toHaveBeenCalledWith(
      APPROVAL_ID,
      expect.objectContaining({
        version: 'orqaly_approval_decision_request_v1',
        decision: 'approve',
        idempotencyKey: expect.stringMatching(/^agentic-control:approve:/),
      }),
      1
    );
    await waitFor(() => expect(client.getRun).toHaveBeenCalledTimes(2));
    expect(client.listApprovals).toHaveBeenCalledWith({ limit: 50, status: 'pending' });
  });

  it.each([
    ['expired', 'This approval expired. Refresh or request a new bound plan before execution.'],
    ['run_not_awaiting_approval', 'The run is no longer waiting for this approval.'],
  ])('preserves authoritative %s controls and disables both decisions', async (reason, message) => {
    const response = structuredClone(approvalsFixture);
    response.approvals[0].controls.approval = {
      approve: false,
      reject: false,
      reason,
    };
    const decideApproval = vi.fn();
    renderPage(
      createClient({
        listApprovals: vi.fn(async () => response),
        decideApproval,
      })
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve bound plan' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(approve).toBeDisabled();
    expect(reject).toBeDisabled();
    fireEvent.click(approve);
    fireEvent.click(reject);
    expect(decideApproval).not.toHaveBeenCalled();
  });

  it('fails closed when exact consent presentation fields are missing', async () => {
    const response = structuredClone(approvalsFixture);
    response.approvals[0].presentation = {
      version: 'unknown_presentation',
      title: 'Leaked title',
      rawToken: 'sk-live-raw-token-value',
    };
    renderPage(createClient({ listApprovals: vi.fn(async () => response) }));

    expect(
      await screen.findByText(
        'Exact consent details are unavailable, so this approval cannot be decided.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve bound plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.queryByText('Leaked title')).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-live-raw-token-value/)).not.toBeInTheDocument();
  });

  it('submits the exact v1 admission request selected by the customer', async () => {
    const client = createClient({
      listAgents: vi.fn(async () => ({ version: 'orqaly_agent_list_v1', agents: [] })),
    });
    renderPage(client);
    await screen.findByText('No materialized Agents yet');

    fireEvent.change(screen.getByLabelText('What should the Agent handle?'), {
      target: { value: 'Prepare a cited market brief.' },
    });
    fireEvent.mouseDown(screen.getByLabelText('Primary operation'));
    fireEvent.click(await screen.findByRole('option', { name: 'Read from a connected system' }));
    fireEvent.change(screen.getByLabelText('Capability key (optional)'), {
      target: { value: 'records_read_v1' },
    });
    fireEvent.change(screen.getByLabelText('Connection key (optional)'), {
      target: { value: 'customer_records' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check task' }));

    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Executable capability')).toBeInTheDocument();
    expect(screen.getByText('Runtime disabled')).toBeInTheDocument();
    expect(screen.getByText('Not dispatchable')).toBeInTheDocument();
    expect(client.admitTask).toHaveBeenCalledWith({
      version: 'orqaly_task_admission_request_v1',
      task: { title: 'Prepare a cited market brief.', description: '' },
      requestedSteps: [
        {
          stepKind: 'connector_read',
          descriptorKey: 'records_read_v1',
          connectionKey: 'customer_records',
        },
      ],
    });
  });

  it('shows an honest empty state without creating demo data or requesting a run list', async () => {
    const client = createClient({
      listAgents: vi.fn(async () => ({ version: 'orqaly_agent_list_v1', agents: [] })),
    });
    renderPage(client);

    expect(await screen.findByText('No materialized Agents yet')).toBeInTheDocument();
    expect(client.getRun).not.toHaveBeenCalled();
    expect(screen.getByText(/admission only checks capability/i)).toBeInTheDocument();
  });

  it('shows configuration failures and retries the real Agent-list route', async () => {
    const listAgents = vi
      .fn()
      .mockRejectedValueOnce(new Error('GCP control plane is not configured.'))
      .mockResolvedValueOnce({ version: 'orqaly_agent_list_v1', agents: [] });
    renderPage(createClient({ listAgents }));

    expect(await screen.findByText('GCP control plane is not configured.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No materialized Agents yet')).toBeInTheDocument();
    expect(listAgents).toHaveBeenCalledTimes(2);
  });

  it('treats a mismatched response contract as an error instead of an empty result', async () => {
    renderPage(createClient({ listAgents: vi.fn(async () => ({ runs: [] })) }));

    expect(
      await screen.findByText('The control plane returned an invalid Agent-list response.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No materialized Agents yet')).not.toBeInTheDocument();
  });

  it('fails closed when the approval list has the wrong response contract', async () => {
    renderPage(createClient({ listApprovals: vi.fn(async () => ({ approvals: [] })) }));

    expect(
      await screen.findByText('The control plane returned an invalid approval-list response.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve bound plan' })).not.toBeInTheDocument();
  });

  it('keeps Agent identity visible when originating run detail fails', async () => {
    const getRun = vi.fn().mockRejectedValue(new Error('Run version conflict.'));
    renderPage(createClient({ getRun }));

    expect(await screen.findByText('Run version conflict.')).toBeInTheDocument();
    expect(screen.getByText('Market Research Agent (AI)')).toBeInTheDocument();
    expect(screen.getByText('Run details unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getRun).toHaveBeenCalledTimes(2));
  });
});
