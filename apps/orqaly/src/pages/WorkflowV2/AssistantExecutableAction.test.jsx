import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantExecutableAction from './AssistantExecutableAction.jsx';
import { ExecutableActionAggregateSchema as serverSchema } from '../../../shared/workflow-v2/executable-actions.js';
import { ExecutableActionAggregateSchema as browserSchema } from '../../workflow-v2/executable-action-validation.js';

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_RUN_ID = '10000000-0000-4000-8000-000000000002';
const ACTION_ID = '20000000-0000-4000-8000-000000000001';

function action(status = 'proposed', overrides = {}) {
  return {
    id: ACTION_ID,
    runId: RUN_ID,
    status,
    rowVersion: 3,
    agent: { id: '30000000-0000-4000-8000-000000000001', name: 'B2B Operations Agent' },
    approval: {
      status: status === 'proposed' ? 'pending' : status === 'rejected' ? 'rejected' : 'approved',
      bindingHash: 'a'.repeat(64),
      // Ordinary proposals stay valid independently of the calendar date; the
      // explicit expiry test below still supplies its own past deadline.
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      presentation: {
        title: 'Create one Orqaly operational record',
        summary: 'Writes one tenant-scoped record and returns immutable evidence.',
        operation: { key: 'operational_record_create_v1', provider: 'orqaly_internal' },
        target: { type: 'operational_record_store', reference: `workflow:${RUN_ID}` },
        parameters: {
          title: 'Completed Goal execution record',
          details: 'Registers the approved action without contacting an SMS provider.',
        },
        sideEffects: ['One operational record will be created in this user and Goal scope.'],
      },
    },
    execution:
      status === 'proposed' || status === 'rejected'
        ? null
        : {
            executor: 'self_hosted_n8n',
            workflowId: '40000000-0000-4000-8000-000000000001',
            workflowVersion: '1.0',
            startedAt: '2026-09-04T20:00:00.000Z',
            ...(status === 'queued' ? {} : { executionReference: 'n8n-execution-42' }),
            ...(status === 'succeeded' ? { terminalAt: '2026-09-04T20:00:02.000Z' } : {}),
          },
    receipt:
      status === 'succeeded'
        ? {
            status: 'succeeded',
            receiptHash: 'b'.repeat(64),
            signatureKeyId: 'gateway-preview-2026-09',
            signature: 'signed-receipt-value',
            observedAt: '2026-09-04T20:00:02.000Z',
            externalReferences: [
              { type: 'operational-record', value: 'record-42' },
              { type: 'n8n', value: 'n8n-execution-42' },
            ],
            output: {
              recordId: '60000000-0000-4000-8000-000000000006',
              createdAt: '2026-09-04T20:00:02.000Z',
              canonicalInputHash: 'c'.repeat(64),
              receiptHash: 'b'.repeat(64),
              signatureKeyId: 'gateway-preview-2026-09',
              signatureVerified: true,
              idempotencyState: 'created',
            },
            result: { summary: 'Operational record record-42 was created and verified.' },
          }
        : null,
    error: null,
    createdAt: '2026-09-04T19:59:00.000Z',
    updatedAt: '2026-09-04T20:00:02.000Z',
    ...overrides,
  };
}

const aggregate = (value) => ({
  version: 'orqaly_executable_action_aggregate_v1',
  action: value,
});

function clientFor(initialAction = null) {
  return {
    readExecutableAction: vi.fn().mockResolvedValue(aggregate(initialAction)),
    proposeExecutableAction: vi.fn().mockResolvedValue(aggregate(action())),
    decideExecutableAction: vi.fn().mockResolvedValue(aggregate(action('succeeded'))),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

it('keeps the lightweight browser guard aligned with displayed server contracts', () => {
  const valid = [
    aggregate(null),
    aggregate(action('outcome_unknown', { recovery: 'confirmed_not_applied' })),
    ...['proposed', 'running', 'succeeded', 'failed', 'rejected', 'outcome_unknown'].map((status) =>
      aggregate(action(status))
    ),
  ];
  for (const value of valid) {
    expect(browserSchema.parse(value)).toEqual(serverSchema.parse(value));
  }
  const corruptions = [
    (v) => {
      v.action.receipt.output.signatureVerified = false;
    },
    (v) => {
      v.action.receipt.output.receiptHash = 'f'.repeat(64);
    },
    (v) => {
      v.action.receipt.output = null;
    },
    (v) => {
      v.action.approval.presentation.operation.key = 'send_sms';
    },
    (v) => {
      v.action.agent.id = 'wrong';
    },
    (v) => {
      v.action.rowVersion = -1;
    },
    (v) => {
      v.action.extraAuthority = true;
    },
  ];
  for (const corrupt of corruptions) {
    const value = aggregate(action('succeeded'));
    corrupt(value);
    expect(() => serverSchema.parse(value)).toThrow();
    expect(() => browserSchema.parse(value)).toThrow();
  }
});

describe('AssistantExecutableAction', () => {
  it('prepares a fixed internal action without claiming the artifact task will run', async () => {
    const client = clientFor();
    render(
      <AssistantExecutableAction
        client={client}
        runId={RUN_ID}
        label="SMS provider checklist"
        enabled
      />
    );

    expect(await screen.findByText('Test the internal execution path')).toBeTruthy();
    expect(screen.getByText(/does not perform the task in the artifact/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare exact action' }));

    await waitFor(() =>
      expect(client.proposeExecutableAction).toHaveBeenCalledWith(
        RUN_ID,
        expect.objectContaining({
          version: 'orqaly_executable_action_proposal_v1',
          idempotencyKey: expect.stringMatching(
            new RegExp(`^${RUN_ID}:operational_record_create_v1:proposal:`)
          ),
          operation: 'operational_record_create_v1',
          input: {
            title: 'Completed Goal execution record',
            details: `Registered from Orqaly Goal ${RUN_ID} as an approved tenant-scoped action through private n8n.`,
          },
        })
      )
    );
    expect(await screen.findByText('Create one Orqaly operational record')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve and run' })).toBeEnabled();
  });

  it('approves only the current row version and renders the signed successful receipt', async () => {
    const client = clientFor(action());
    render(
      <AssistantExecutableAction
        client={client}
        runId={RUN_ID}
        label="SMS provider checklist"
        enabled
      />
    );

    const approve = await screen.findByRole('button', { name: 'Approve and run' });
    expect(screen.getByText('Diagnostic action through self-hosted n8n')).toBeTruthy();
    expect(screen.getByText('Acting as B2B Operations Agent for this Goal only')).toBeTruthy();
    expect(
      screen.getByText('B2B Operations Agent · 30000000-0000-4000-8000-000000000001')
    ).toBeTruthy();
    fireEvent.click(approve);

    await waitFor(() =>
      expect(client.decideExecutableAction).toHaveBeenCalledWith(
        ACTION_ID,
        {
          version: 'orqaly_executable_action_decision_v1',
          idempotencyKey: `${RUN_ID}:operational_record_create_v1:approve:${ACTION_ID}`,
          decision: 'approve',
          reason: 'Approved in Orqaly Assistant after exact action review.',
        },
        3
      )
    );
    expect(await screen.findByText('Execution completed and verified')).toBeTruthy();
    expect(screen.getByText('Operational record record-42 was created and verified.')).toBeTruthy();
    expect(screen.getByText('60000000-0000-4000-8000-000000000006')).toBeTruthy();
    expect(screen.getByText('New record created')).toBeTruthy();
    expect(screen.getByText('Gateway signature verified')).toBeTruthy();
    expect(screen.getByTestId('executable-action-receipt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve and run' })).toBeNull();
  });

  it('keeps rejection visibly terminal and states that nothing ran', async () => {
    const client = clientFor(action());
    client.decideExecutableAction.mockResolvedValue(aggregate(action('rejected')));
    render(<AssistantExecutableAction client={client} runId={RUN_ID} label="Proof" enabled />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(
      await screen.findByText('You rejected this exact action. Nothing was executed.')
    ).toBeTruthy();
    expect(client.decideExecutableAction).toHaveBeenCalledWith(
      ACTION_ID,
      expect.objectContaining({ decision: 'reject' }),
      3
    );
    expect(screen.getByText('Private n8n').closest('[data-active]')).toHaveAttribute(
      'data-active',
      'false'
    );
    expect(screen.queryByRole('button', { name: 'Approve and run' })).toBeNull();
  });

  it('replaces an expired unapproved action with a fresh per-click proposal identity', async () => {
    const expiredApproval = {
      ...action().approval,
      expiresAt: '2020-01-01T00:00:00.000Z',
    };
    const client = clientFor(action('proposed', { approval: expiredApproval }));
    client.proposeExecutableAction
      .mockResolvedValueOnce(
        aggregate(
          action('proposed', {
            id: '20000000-0000-4000-8000-000000000002',
            rowVersion: 0,
            approval: expiredApproval,
          })
        )
      )
      .mockResolvedValueOnce(
        aggregate(
          action('proposed', {
            id: '20000000-0000-4000-8000-000000000003',
            rowVersion: 0,
            approval: expiredApproval,
          })
        )
      );
    render(<AssistantExecutableAction client={client} runId={RUN_ID} enabled />);

    expect(await screen.findByText(/expired safely/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve and run' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare new exact action' }));
    await waitFor(() => expect(client.proposeExecutableAction).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare new exact action' }));
    await waitFor(() => expect(client.proposeExecutableAction).toHaveBeenCalledTimes(2));

    const firstKey = client.proposeExecutableAction.mock.calls[0][1].idempotencyKey;
    const secondKey = client.proposeExecutableAction.mock.calls[1][1].idempotencyKey;
    expect(firstKey).not.toBe(secondKey);
  });

  it('renders a failed signed receipt as failure evidence, never as success', async () => {
    const succeeded = action('succeeded');
    const failed = action('failed', {
      receipt: {
        ...succeeded.receipt,
        status: 'failed',
        output: null,
        result: { summary: 'The operational record was not created.' },
      },
      error: { code: 'gateway_failed', message: 'The internal write was rejected.' },
    });
    const client = clientFor(failed);
    render(<AssistantExecutableAction client={client} runId={RUN_ID} enabled />);

    expect(await screen.findByText('Execution failure recorded and verified')).toBeTruthy();
    expect(screen.getByText('The operational record was not created.')).toBeTruthy();
    expect(screen.queryByText('Execution completed and verified')).toBeNull();
  });

  it('does not expose a non-http receipt URL as a clickable result', async () => {
    const succeeded = action('succeeded');
    const client = clientFor(
      action('succeeded', {
        receipt: {
          ...succeeded.receipt,
          result: {
            ...succeeded.receipt.result,
            url: 'javascript:alert(1)',
          },
        },
      })
    );
    render(<AssistantExecutableAction client={client} runId={RUN_ID} enabled />);

    expect(await screen.findByText('Execution completed and verified')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open created result' })).toBeNull();
  });

  it('polls an active n8n execution until the receipt becomes terminal', async () => {
    vi.useFakeTimers();
    const client = clientFor(action('queued'));
    client.readExecutableAction
      .mockResolvedValueOnce(aggregate(action('queued')))
      .mockResolvedValueOnce(aggregate(action('running', { rowVersion: 4 })))
      .mockResolvedValueOnce(aggregate(action('succeeded', { rowVersion: 5 })));
    render(
      <AssistantExecutableAction
        client={client}
        runId={RUN_ID}
        label="Proof"
        enabled
        pollIntervalMs={500}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Queued')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByText('Running in n8n')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByText('Execution completed and verified')).toBeTruthy();
    expect(client.readExecutableAction).toHaveBeenCalledTimes(3);
  });

  it('shows persisted n8n progress while the approval request is still awaiting its receipt', async () => {
    const client = clientFor(action());
    let finish;
    client.decideExecutableAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    render(<AssistantExecutableAction client={client} runId={RUN_ID} enabled />);
    const button = await screen.findByRole('button', { name: 'Approve and run' });
    client.readExecutableAction.mockResolvedValue(aggregate(action('running', { rowVersion: 4 })));
    fireEvent.click(button);
    expect(await screen.findByText('Running in n8n')).toBeTruthy();
    await act(async () => finish(aggregate(action('succeeded', { rowVersion: 5 }))));
    expect(await screen.findByText('Execution completed and verified')).toBeTruthy();
  });

  it('fails closed on an unknown outcome and never offers a blind retry', async () => {
    const unknown = action('outcome_unknown', {
      rowVersion: 7,
      receipt: null,
      error: { code: 'dispatch_outcome_unknown', message: 'Provider result was ambiguous.' },
    });
    const client = clientFor(unknown);
    render(<AssistantExecutableAction client={client} runId={RUN_ID} label="Proof" enabled />);

    expect(await screen.findByText(/Do not run it again/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /run/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('accepts a newer verified reconciliation without issuing another action', async () => {
    const client = clientFor(action('outcome_unknown', { rowVersion: 2 }));
    const view = render(
      <AssistantExecutableAction client={client} runId={RUN_ID} enabled pollIntervalMs={500} />
    );
    expect(await screen.findByText(/Do not run it again/)).toBeTruthy();
    client.readExecutableAction.mockResolvedValue(
      aggregate(
        action('succeeded', {
          rowVersion: 3,
          error: { code: 'n8n_http_error', message: 'Original response lost' },
        })
      )
    );
    view.rerender(
      <AssistantExecutableAction client={client} runId={RUN_ID} enabled pollIntervalMs={1000} />
    );
    expect(await screen.findByText('Execution completed and verified')).toBeTruthy();
    expect(screen.getByText(/Recovered from the saved, verified Gateway receipt/)).toBeTruthy();
    expect(client.proposeExecutableAction).not.toHaveBeenCalled();
    expect(client.decideExecutableAction).not.toHaveBeenCalled();
  });

  it('does not hide a failed proposal behind a background snapshot refresh', async () => {
    const client = clientFor(action('outcome_unknown', { recovery: 'confirmed_not_applied' }));
    client.proposeExecutableAction.mockRejectedValue(new Error('Proposal failed'));
    render(<AssistantExecutableAction client={client} runId={RUN_ID} enabled />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare new exact action' }));
    expect(await screen.findByText('Proposal failed')).toBeTruthy();
  });

  it('requires a fresh approval after a server-verified unused expired grant', async () => {
    const client = clientFor(action('outcome_unknown', { recovery: 'confirmed_not_applied' }));
    render(<AssistantExecutableAction client={client} runId={RUN_ID} enabled />);
    expect(await screen.findByText(/Recovery verified/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare new exact action' }));
    await waitFor(() => expect(client.proposeExecutableAction).toHaveBeenCalledTimes(1));
    expect(client.decideExecutableAction).not.toHaveBeenCalled();
  });

  it('ignores a stale response after the visible Goal changes', async () => {
    let releaseFirst;
    const first = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const client = clientFor();
    client.readExecutableAction.mockImplementation((runId) =>
      runId === RUN_ID ? first : Promise.resolve(aggregate(null))
    );
    const view = render(
      <AssistantExecutableAction client={client} runId={RUN_ID} label="First" enabled />
    );
    view.rerender(
      <AssistantExecutableAction client={client} runId={SECOND_RUN_ID} label="Second" enabled />
    );
    expect(await screen.findByText('Test the internal execution path')).toBeTruthy();

    await act(async () => {
      releaseFirst(aggregate(action('succeeded')));
      await first;
    });
    expect(screen.queryByText('Execution completed and verified')).toBeNull();
  });
});
