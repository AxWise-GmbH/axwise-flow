import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SolutionNativeWorkspace from './SolutionNativeWorkspace.jsx';

vi.mock('./NativeN8nCanvas.jsx', () => ({
  default: function NativeFixture({
    solutionId,
    revisionId,
    dependencyId,
    mode,
    onSessionStateChange,
  }) {
    useEffect(() => {
      onSessionStateChange?.('ready');
    }, [onSessionStateChange]);
    return (
      <div
        data-testid="native-canvas"
        data-solution={solutionId}
        data-revision={revisionId || 'current'}
        data-dependency={dependencyId || 'main'}
        data-mode={mode}
        onClick={() => onSessionStateChange?.('expired')}
      />
    );
  },
}));

const solutionId = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const revisionId = 'df3c0831-537a-4a17-bf86-089d8059b746';
const spec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'customer', transform: 'trim' }],
};
const solution = {
  id: solutionId,
  version: 1,
  rowVersion: 4,
  spec,
  deployment: { workflowId: 'original-n8n-workflow' },
};
const candidate = (overrides = {}) => ({
  id: revisionId,
  solutionId,
  version: 2,
  baseVersion: 1,
  rowVersion: 3,
  workflowHash: 'a'.repeat(64),
  status: 'draft',
  spec,
  testedAt: null,
  ...overrides,
});
const response = (revisions) => ({ revisions, activeRevisionId: null });
function renderWorkspace(revisions = [], overrides = {}, props = {}, clientOverrides = {}) {
  const client = {
    solutionRevisions: vi.fn().mockResolvedValue(response(revisions)),
    createSolutionDraft: vi.fn(),
    reviewSolutionRevision: vi.fn().mockResolvedValue({}),
    decideSolutionRevision: vi.fn().mockResolvedValue({}),
    testSolutionRevision: vi.fn(),
    forkSolutionRevision: vi.fn(),
    ...clientOverrides,
  };
  const onChange = vi.fn().mockResolvedValue(undefined);
  const component = (extra = props) => (
    <SolutionNativeWorkspace
      client={client}
      solution={{ ...solution, ...overrides }}
      onChange={onChange}
      {...extra}
    />
  );
  const view = render(component());
  return {
    client,
    onChange,
    unmount: view.unmount,
    rerenderProps: (extra) => view.rerender(component(extra)),
  };
}
const selectCandidate = async (version = 2) => {
  const button = await screen.findByRole('button', { name: new RegExp(`^v${version} ·`) });
  await act(async () => fireEvent.click(button));
};

describe('native solution revision controls', () => {
  it('holds the same candidate and host ownership during handler confirmation and its pending request', async () => {
    const native = candidate({
      bundleHash: 'b'.repeat(64),
      spec: {
        kind: 'n8n_workflow_v2',
        connections: [],
        acceptanceCases: [],
        ownedDependencies: [
          {
            id: 'alert-handler',
            workflow: { name: 'Failure handler' },
            spec: { connections: [] },
          },
        ],
      },
    });
    let settle;
    const onBusyChange = vi.fn();
    const f = renderWorkspace(
      [native],
      {},
      { onBusyChange },
      {
        solutionFailureProbes: vi.fn().mockResolvedValue({ allowed: true, probes: [] }),
        testSolutionFailureHandler: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              settle = resolve;
            })
        ),
      }
    );
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Error-handler check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Test error handler' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    for (const name of ['Current v1', 'Edit in n8n', 'Review changes', 'View Failure handler']) {
      expect(screen.getByRole('button', { name, exact: true })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name, exact: true }));
    }
    expect(f.client.testSolutionFailureHandler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Run isolated handler test' }));
    expect(f.client.testSolutionFailureHandler).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    const frame = screen.getByTestId('native-canvas');
    expect(frame).toHaveAttribute('data-revision', revisionId);
    expect(frame).toHaveAttribute('data-dependency', 'main');
    f.rerenderProps({ onBusyChange, refreshKey: 1, requestedRevisionId: null });
    expect(screen.getByTestId('native-canvas')).toBe(frame);
    expect(f.client.reviewSolutionRevision).not.toHaveBeenCalled();
    expect(f.client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(f.client.testSolutionRevision).not.toHaveBeenCalled();
    await act(async () =>
      settle({
        probe: {
          id: 'synthetic-handler-probe',
          revisionId,
          sourceRowVersion: native.rowVersion,
          workflowHash: native.workflowHash,
          bundleHash: native.bundleHash,
          coverage: 'handler_with_synthetic_failure',
          status: 'succeeded',
          cleanupState: 'removed',
        },
      })
    );
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
    expect(f.client.testSolutionFailureHandler).toHaveBeenCalledTimes(1);
  });
  it('releases handler confirmation ownership on cancellation without invoking either workflow', async () => {
    const native = candidate({
      bundleHash: 'b'.repeat(64),
      spec: {
        kind: 'n8n_workflow_v2',
        connections: [],
        acceptanceCases: [],
        ownedDependencies: [
          { id: 'handler', workflow: { name: 'Handler' }, spec: { connections: [] } },
        ],
      },
    });
    const onBusyChange = vi.fn();
    const f = renderWorkspace(
      [native],
      {},
      { onBusyChange },
      {
        solutionFailureProbes: vi.fn().mockResolvedValue({ allowed: true, probes: [] }),
        testSolutionFailureHandler: vi.fn(),
      }
    );
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Error-handler check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Test error handler' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Edit in n8n' })).toBeEnabled();
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', revisionId);
    expect(f.client.testSolutionFailureHandler).not.toHaveBeenCalled();
    expect(f.client.testSolutionRevision).not.toHaveBeenCalled();
  });
  it('views an exact linked handler in the same canvas without creating, editing or executing it', async () => {
    const native = candidate({
      spec: {
        kind: 'n8n_workflow_v2',
        connections: [],
        acceptanceCases: [],
        ownedDependencies: [
          {
            id: 'alert-handler',
            workflow: { name: 'Notify on failure' },
            spec: { connections: [] },
          },
        ],
      },
      bundleHash: 'b'.repeat(64),
    });
    const f = renderWorkspace([native]);
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'View Notify on failure' }));
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-dependency', 'alert-handler');
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', revisionId);
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-mode', 'view');
    expect(screen.getByText(/Viewing does not run or test this handler/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in n8n' }));
    const editor = screen.getByTestId('native-canvas');
    expect(editor).toHaveAttribute('data-dependency', 'main');
    expect(editor).toHaveAttribute('data-mode', 'edit');
    expect(screen.getByRole('button', { name: 'View Notify on failure' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'View Notify on failure' }));
    expect(screen.getByTestId('native-canvas')).toBe(editor);
    expect(f.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(f.client.testSolutionRevision).not.toHaveBeenCalled();
    expect(f.client.decideSolutionRevision).not.toHaveBeenCalled();
  });
  it('requires real-effects consent for a child-only connection and displays its actual destination', async () => {
    const native = candidate({
      status: 'ready',
      bundleHash: 'b'.repeat(64),
      spec: {
        kind: 'n8n_workflow_v2',
        connections: [],
        acceptanceCases: [{ id: 'one', input: { ok: true } }],
        ownedDependencies: [
          {
            id: 'alert-handler',
            workflow: {
              name: 'Failure handler',
              nodes: [
                {
                  id: 'send',
                  type: 'CUSTOM.boundedHttp',
                  parameters: { url: 'https://receiver.example.org/alerts' },
                },
              ],
            },
            spec: { connections: [{ id: 'notify' }] },
          },
        ],
      },
    });
    const f = renderWorkspace([native]);
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Test all agreed cases' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('https://receiver.example.org/alerts');
    expect(screen.getByRole('dialog')).toHaveTextContent('not a simulation');
    expect(f.client.testSolutionRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(f.client.testSolutionRevision).not.toHaveBeenCalled();
  });
  it('keeps setup in the current panel and locks native/lifecycle scope while its secret form is open', async () => {
    const native = candidate({
      spec: { kind: 'n8n_workflow_v2', connections: [{ id: 'notify' }], acceptanceCases: [] },
    });
    const descriptor = {
      id: 'notify',
      service: 'Customer receiver',
      credentialType: 'orqalyBoundedHttp',
      fields: [
        { name: 'name', label: 'Header name', type: 'text', required: true },
        { name: 'value', label: 'API key', type: 'secret', required: true },
      ],
      nodeIds: ['send'],
      status: 'missing',
      canConnect: true,
      scopeHash: 'd'.repeat(64),
      scope: { targets: [{ method: 'POST', destination: 'https://receiver.example.org' }] },
    };
    const setup = {
      revision: native,
      connectionRequirements: [descriptor],
      setup: { ready: false, reason: 'Connect the receiver before reviewing.' },
    };
    const onBusyChange = vi.fn();
    const onCandidateChange = vi.fn();
    const f = renderWorkspace(
      [native],
      {},
      { onBusyChange, onCandidateChange },
      {
        solutionRevisionSetup: vi.fn().mockResolvedValue(setup),
        createSolutionRevisionConnection: vi.fn(),
      }
    );
    await selectCandidate();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up required connections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up Customer receiver securely' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Current v1', hidden: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit in n8n', hidden: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/API key/), {
      target: { value: 'synthetic-secret-only' },
    });
    expect(JSON.stringify(onCandidateChange.mock.calls)).not.toContain('synthetic-secret-only');
    expect(onCandidateChange.mock.calls.at(-1)[0].onOpenConnections).toEqual(expect.any(Function));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Cancel and clear' }))
    );
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(f.client.createSolutionRevisionConnection).not.toHaveBeenCalled();
    expect(f.client.reviewSolutionRevision).not.toHaveBeenCalled();
    expect(f.client.decideSolutionRevision).not.toHaveBeenCalled();
  });
  it('pins a linked workflow bundle when testing and never shows a receipt from another child version', async () => {
    const bundleHash = 'e'.repeat(64);
    const ready = candidate({ status: 'ready', bundleHash });
    const { client, rerenderProps } = renderWorkspace([ready]);
    client.solutionRevisions.mockResolvedValue({
      ...response([ready]),
      invocations: [
        {
          id: 'other-bundle',
          revisionId,
          workflowHash: ready.workflowHash,
          status: 'succeeded',
          executionId: 'old-child',
          evidence: { bundleHash: 'f'.repeat(64) },
          output: { value: 'OTHER CHILD RESULT' },
        },
      ],
    });
    rerenderProps({ refreshKey: 1, requestedRevisionId: revisionId });
    await screen.findByText(/Changes include the main workflow and its linked error handler/);
    expect(screen.queryByText(/OTHER CHILD RESULT/)).not.toBeInTheDocument();
    client.testSolutionRevision.mockResolvedValue({
      invocation: {
        id: 'bundle-test',
        revisionId,
        workflowHash: ready.workflowHash,
        evidence: { bundleHash },
        status: 'succeeded',
        executionId: 'new-child',
        output: { customer: 'Bundle result' },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    await waitFor(() =>
      expect(client.testSolutionRevision).toHaveBeenCalledWith(
        solutionId,
        revisionId,
        expect.any(Object),
        expect.any(String),
        { bundleHash }
      )
    );
    expect(await screen.findByText(/Bundle result/)).toBeInTheDocument();
  });
  it('restores only exact candidate receipts and reports metadata without copying outputs to chat context', async () => {
    const onCandidateChange = vi.fn();
    const ready = candidate({ status: 'ready' });
    const receipt = {
      id: 'candidate-receipt',
      solutionId,
      revisionId,
      workflowHash: ready.workflowHash,
      status: 'failed',
      executionId: 'candidate-24',
      output: { candidateOnly: 'Recorded candidate value' },
      createdAt: '2026-09-07T12:00:00Z',
    };
    const { client, rerenderProps } = renderWorkspace([ready], {}, { onCandidateChange });
    client.solutionRevisions.mockResolvedValue({
      ...response([ready]),
      invocations: [
        receipt,
        { ...receipt, id: 'live', revisionId: null, output: { value: 'OLD LIVE VALUE' } },
        {
          ...receipt,
          id: 'wrong-hash',
          workflowHash: 'b'.repeat(64),
          output: { value: 'STALE CANDIDATE' },
        },
        {
          ...receipt,
          id: 'wrong-revision',
          revisionId: 'other',
          output: { value: 'OTHER CANDIDATE' },
        },
      ],
    });
    rerenderProps({ onCandidateChange, refreshKey: 1, requestedRevisionId: revisionId });
    expect(await screen.findByText(/Recorded candidate value/)).toBeInTheDocument();
    expect(
      screen.queryByText(/OLD LIVE VALUE|STALE CANDIDATE|OTHER CANDIDATE/)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Test failed/)).toBeInTheDocument();
    await waitFor(() =>
      expect(onCandidateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          revisionId,
          workflowHash: ready.workflowHash,
          receipt: expect.objectContaining({ id: receipt.id, status: 'failed' }),
        })
      )
    );
    expect(JSON.stringify(onCandidateChange.mock.calls)).not.toContain('Recorded candidate value');
    expect(client.testSolutionRevision).not.toHaveBeenCalled();
  });

  it('holds host busy ownership until refreshed state settles and clears it on unmount', async () => {
    const onBusyChange = vi.fn();
    const onCandidateChange = vi.fn();
    const { client, onChange, unmount } = renderWorkspace(
      [candidate({ status: 'approved' })],
      {},
      { onBusyChange, onCandidateChange }
    );
    let finishRequest;
    let finishRefresh;
    client.decideSolutionRevision.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        })
    );
    onChange.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        })
    );
    await selectCandidate();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Deploy approved version' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Current v1' })).toBeDisabled();
    await act(async () => finishRequest({}));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(onCandidateChange).toHaveBeenLastCalledWith(null);
    await act(async () => finishRefresh());
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('forks the exact frozen candidate only after confirmation and opens its new draft in the same canvas', async () => {
    const frozen = candidate({ status: 'ready', forkEligibility: { allowed: true } });
    const next = candidate({
      id: 'b22dbb32-36de-4cac-803c-d3d83a4bfc80',
      version: 3,
      rowVersion: 0,
      workflowHash: 'c'.repeat(64),
    });
    const onSelectedRevision = vi.fn();
    const { client } = renderWorkspace([frozen], {}, { onSelectedRevision });
    client.forkSolutionRevision.mockImplementation(async () => {
      client.solutionRevisions.mockResolvedValue(response([frozen, next]));
      return { ...response([frozen, next]), revision: next };
    });
    await selectCandidate();
    expect(screen.getByRole('button', { name: 'Edit live v1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fix this version' }));
    expect(client.forkSolutionRevision).not.toHaveBeenCalled();
    expect(screen.getByText(/does not run or resend anything/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create repair draft' }));
    await waitFor(() =>
      expect(client.forkSolutionRevision).toHaveBeenCalledWith(
        solutionId,
        revisionId,
        { expectedVersion: frozen.rowVersion, workflowHash: frozen.workflowHash },
        expect.any(String)
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', next.id)
    );
    expect(screen.getAllByTestId('native-canvas')).toHaveLength(1);
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-solution', solutionId);
    expect(onSelectedRevision).toHaveBeenLastCalledWith(next.id);
    expect(screen.getByText(/Live v1 unchanged/)).toBeInTheDocument();
    expect(client.testSolutionRevision).not.toHaveBeenCalled();
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(client.createSolutionDraft).not.toHaveBeenCalled();
  });

  it('reuses the exact fork idempotency key after an uncertain response', async () => {
    const frozen = candidate({ status: 'rejected', forkEligibility: { allowed: true } });
    const { client } = renderWorkspace([frozen]);
    client.forkSolutionRevision.mockRejectedValue(new Error('Response could not be confirmed'));
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Fix this version' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create repair draft' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create repair draft' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create repair draft' }));
    await waitFor(() => expect(client.forkSolutionRevision).toHaveBeenCalledTimes(2));
    expect(client.forkSolutionRevision.mock.calls[1]).toEqual(
      client.forkSolutionRevision.mock.calls[0]
    );
    expect(client.testSolutionRevision).not.toHaveBeenCalled();
  });

  it.each(['uncertain', 'existing-draft', 'server-blocked'])(
    'does not fork when %s protects a candidate',
    async (reason) => {
      const frozen = candidate({
        status: 'ready',
        testedAt: '2026-09-07T12:00:00Z',
        forkEligibility:
          reason === 'server-blocked'
            ? { allowed: false, reason: 'Verify the pending runtime change.' }
            : { allowed: true },
      });
      const revisions = [
        frozen,
        ...(reason === 'existing-draft' ? [candidate({ id: 'new-draft', version: 3 })] : []),
      ];
      const { client, rerenderProps } = renderWorkspace(revisions);
      if (reason === 'uncertain') {
        client.solutionRevisions.mockResolvedValue({
          ...response(revisions),
          invocations: [
            {
              id: 'unknown',
              revisionId,
              workflowHash: frozen.workflowHash,
              status: 'outcome_unknown',
            },
          ],
        });
        rerenderProps({ requestedRevisionId: revisionId, refreshKey: 1 });
        await screen.findByText(/Result needs verification/);
        expect(screen.getByRole('button', { name: 'Activate v2' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Test v2 in n8n' })).toBeDisabled();
      } else await selectCandidate();
      const fix = screen.getByRole('button', { name: 'Fix this version' });
      expect(fix).toBeDisabled();
      fireEvent.click(fix);
      expect(client.forkSolutionRevision).not.toHaveBeenCalled();
    }
  );

  it('rejects a response for another exact candidate without displaying its output', async () => {
    const { client } = renderWorkspace([candidate({ status: 'ready' })]);
    client.testSolutionRevision.mockResolvedValue({
      invocation: {
        revisionId,
        workflowHash: 'b'.repeat(64),
        status: 'succeeded',
        executionId: 'foreign',
        output: { value: 'FOREIGN OUTPUT' },
      },
    });
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    expect(await screen.findByText(/result belongs to a different candidate/)).toBeInTheDocument();
    expect(screen.queryByText(/FOREIGN OUTPUT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Test passed/)).not.toBeInTheDocument();
  });
  it('keeps native edit ownership and blocks review when the editor session expires', async () => {
    const onEditingChange = vi.fn();
    const { client } = renderWorkspace([candidate()], {}, { onEditingChange });
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in n8n' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review saved changes' })).toBeEnabled()
    );
    fireEvent.click(screen.getByTestId('native-canvas'));
    expect(screen.getByRole('button', { name: 'Review saved changes' })).toBeDisabled();
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    expect(client.reviewSolutionRevision).not.toHaveBeenCalled();
  });
  it('waits for the exact saved revision and released conversation ownership before switching the one canvas', async () => {
    const { client, rerenderProps } = renderWorkspace([], {}, { requestedRevisionId: null });
    await waitFor(() => expect(client.solutionRevisions).toHaveBeenCalledTimes(1));
    const original = screen.getByTestId('native-canvas');
    let resolveRevisionRead;
    client.solutionRevisions.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRevisionRead = resolve;
        })
    );
    rerenderProps({ requestedRevisionId: revisionId, refreshKey: 1, externalBusy: true });
    expect(screen.getByTestId('native-canvas')).toBe(original);
    expect(client.solutionRevisions).toHaveBeenCalledTimes(1);
    rerenderProps({ requestedRevisionId: revisionId, refreshKey: 1, externalBusy: false });
    await waitFor(() => expect(client.solutionRevisions).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', 'current');
    expect(
      screen.getByText('Viewing workflow v1. Open a draft to make changes.')
    ).toBeInTheDocument();
    await act(async () => resolveRevisionRead(response([candidate()])));
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', revisionId)
    );
    expect(screen.getAllByTestId('native-canvas')).toHaveLength(1);
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-solution', solutionId);
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-mode', 'view');
    expect(client.createSolutionDraft).not.toHaveBeenCalled();
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(client.testSolutionRevision).not.toHaveBeenCalled();
  });

  it('preserves the same unsaved native editor when selection or draft refresh is requested', async () => {
    const draft = candidate();
    const { client, rerenderProps } = renderWorkspace([draft]);
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in n8n' }));
    const editor = screen.getByTestId('native-canvas');
    expect(editor).toHaveAttribute('data-mode', 'edit');
    const readsBefore = client.solutionRevisions.mock.calls.length;
    for (const name of ['Current v1', 'v2 · Draft', 'Continue editing draft', 'Reject draft']) {
      const button = screen.getByRole('button', { name, exact: true });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    rerenderProps({ requestedRevisionId: null, refreshKey: 1 });
    expect(screen.getByTestId('native-canvas')).toBe(editor);
    expect(editor).toHaveAttribute('data-revision', revisionId);
    expect(client.solutionRevisions).toHaveBeenCalledTimes(readsBefore);
    expect(client.createSolutionDraft).not.toHaveBeenCalled();
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Review saved changes' }));
    await waitFor(() =>
      expect(client.reviewSolutionRevision).toHaveBeenCalledWith(solutionId, draft)
    );
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', 'current')
    );
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-mode', 'view');
  });

  it('keeps a late test receipt with its own candidate and clears it before switching views', async () => {
    const tested = candidate({ status: 'ready' });
    const { client, rerenderProps } = renderWorkspace([tested]);
    let completeTest;
    client.testSolutionRevision.mockImplementation(
      () => new Promise((resolve) => (completeTest = resolve))
    );
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    await waitFor(() => expect(client.testSolutionRevision).toHaveBeenCalledTimes(1));
    const current = screen.getByRole('button', { name: 'Current v1', exact: true });
    expect(current).toBeDisabled();
    fireEvent.click(current);
    rerenderProps({ requestedRevisionId: null, refreshKey: 1 });
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', revisionId);
    await act(async () => {
      completeTest({
        invocation: {
          status: 'succeeded',
          executionId: 'late-candidate-only',
          workflowHash: tested.workflowHash,
          output: { customer: 'Candidate result' },
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', 'current')
    );
    expect(screen.queryByText(/late-candidate-only/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Candidate result/)).not.toBeInTheDocument();
  });

  it('blocks revision switches and lifecycle actions while a conversation owns the draft', async () => {
    const reviewed = candidate({ status: 'reviewed', review: { valid: true, summary: 'Ready' } });
    const { client, rerenderProps } = renderWorkspace([reviewed]);
    await selectCandidate();
    rerenderProps({ externalBusy: true });
    for (const name of [
      'Current v1',
      'v2 · Ready for approval',
      'Continue editing draft',
      'Edit in n8n',
      'Review changes',
      'Approve v2',
      'Reject draft',
    ]) {
      const button = screen.getByRole('button', { name, exact: true });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(client.createSolutionDraft).not.toHaveBeenCalled();
    expect(client.reviewSolutionRevision).not.toHaveBeenCalled();
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', revisionId);
  });

  it('requires explicit real-effect confirmation and binds approval to the displayed revision hash', async () => {
    const native = candidate({
      status: 'ready',
      spec: {
        kind: 'n8n_workflow_v2',
        inputSchema: { type: 'object' },
        connections: [{ id: 'receiver' }],
        acceptanceCases: [{ id: 'one', input: { event: 'ready' } }],
      },
      workflow: {
        nodes: [
          {
            id: 'deliver',
            type: 'CUSTOM.boundedHttp',
            parameters: { url: 'https://receiver.example/events', method: 'POST' },
          },
        ],
      },
    });
    const { client } = renderWorkspace([native]);
    client.testSolutionRevision.mockResolvedValue({
      invocation: {
        status: 'succeeded',
        executionId: '99',
        output: { delivery: 'accepted' },
        workflowHash: native.workflowHash,
      },
    });
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'POST https://receiver.example/events'
    );
    expect(client.testSolutionRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(client.testSolutionRevision).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve and send test' }));
    await waitFor(() =>
      expect(client.testSolutionRevision).toHaveBeenCalledWith(
        solutionId,
        revisionId,
        { event: 'ready' },
        expect.any(String),
        { allowExternalEffects: true, workflowHash: native.workflowHash }
      )
    );
  });
  it('runs each frozen native revision case and never activates automatically', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      inputSchema: { type: 'object' },
      connections: [],
      acceptanceCases: [
        { id: 'one', input: { values: [1] } },
        { id: 'empty', input: { values: [] } },
      ],
    };
    const native = candidate({ status: 'ready', spec: nativeSpec });
    const { client } = renderWorkspace([native]);
    let completed = 0;
    client.testSolutionRevision.mockImplementation(async () => {
      completed += 1;
      if (completed === 2)
        client.solutionRevisions.mockResolvedValue(
          response([{ ...native, testedAt: '2026-09-05T20:00:00Z', rowVersion: 5 }])
        );
      return {
        invocation: {
          workflowHash: native.workflowHash,
          status: 'succeeded',
          executionId: String(completed),
          output: {},
        },
      };
    });
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Test all agreed cases' }));
    expect(await screen.findByText('2 of 2 cases passed')).toBeInTheDocument();
    expect(client.testSolutionRevision.mock.calls.map((call) => call[2])).toEqual([
      { values: [1] },
      { values: [] },
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate v2' })).toBeEnabled());
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();
  });

  it('does not send another revision case after a definite failed test', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      inputSchema: { type: 'object' },
      connections: [],
      acceptanceCases: [
        { id: 'one', input: { value: 1 } },
        { id: 'two', input: { value: 2 } },
      ],
    };
    const native = candidate({ status: 'ready', spec: nativeSpec });
    const { client } = renderWorkspace([native]);
    client.testSolutionRevision.mockResolvedValue({
      invocation: { workflowHash: native.workflowHash, status: 'failed', executionId: '1' },
    });
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Test all agreed cases' }));
    expect(await screen.findByText(/Remaining cases were not sent/)).toBeInTheDocument();
    expect(client.testSolutionRevision).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Activate v2' })).toBeDisabled();
  });
  it('uses the selected V2 revision acceptance input rather than the active V1 mappings', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      inputSchema: { type: 'object' },
      acceptanceCases: [{ id: 'nested', input: { groups: [{ items: [1, 2] }] } }],
    };
    const { client } = renderWorkspace([candidate({ status: 'ready', spec: nativeSpec })]);
    await selectCandidate();
    expect(screen.getByRole('textbox', { name: 'Test input for v2' })).toHaveValue(
      JSON.stringify({ groups: [{ items: [1, 2] }] }, null, 2)
    );
    client.testSolutionRevision.mockResolvedValue({
      invocation: {
        revisionId,
        workflowHash: 'a'.repeat(64),
        status: 'succeeded',
        executionId: '72',
        output: { count: 2 },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    await waitFor(() =>
      expect(client.testSolutionRevision).toHaveBeenCalledWith(
        solutionId,
        revisionId,
        { groups: [{ items: [1, 2] }] },
        expect.any(String)
      )
    );
    expect(await screen.findByText('Test passed · n8n execution 72')).toBeInTheDocument();
  });
  it('does not let an undeployed first version open an unsupported editor draft', async () => {
    const { client } = renderWorkspace([], { deployment: null });
    const edit = screen.getByRole('button', { name: 'Edit workflow' });
    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    await waitFor(() => expect(client.solutionRevisions).toHaveBeenCalled());
    expect(client.createSolutionDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-mode', 'view');
  });

  it('opens the revision returned by the draft API and binds the native editor to it', async () => {
    const { client, onChange } = renderWorkspace();
    const created = candidate({ id: '74b8aaca-0859-4b55-bc38-3a45d11633d3', version: 4 });
    const previous = candidate({ status: 'superseded' });
    await waitFor(() => expect(client.solutionRevisions).toHaveBeenCalledTimes(1));
    client.createSolutionDraft.mockResolvedValue({
      ...response([previous, created]),
      revision: created,
    });
    client.solutionRevisions.mockResolvedValue(response([previous, created]));
    fireEvent.click(screen.getByRole('button', { name: 'Edit workflow' }));
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', created.id)
    );
    expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-mode', 'edit');
    expect(client.createSolutionDraft).toHaveBeenCalledWith(solution);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  it('reviews the latest saved native revision rather than the stale row in the page', async () => {
    const initial = candidate({
      status: 'reviewed',
      review: { valid: true, summary: 'Previous review' },
    });
    const latestSaved = candidate({ rowVersion: 8, workflowHash: 'b'.repeat(64) });
    const latestReviewed = {
      ...latestSaved,
      status: 'reviewed',
      rowVersion: 9,
      review: { valid: true, summary: 'Current review' },
    };
    const { client, onChange } = renderWorkspace([initial]);
    await selectCandidate();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in n8n' }));
    client.solutionRevisions
      .mockResolvedValueOnce(response([latestSaved]))
      .mockResolvedValue(response([latestReviewed]));
    fireEvent.click(screen.getByRole('button', { name: 'Review saved changes' }));
    await waitFor(() =>
      expect(client.reviewSolutionRevision).toHaveBeenCalledWith(solutionId, latestSaved)
    );
    expect(client.reviewSolutionRevision.mock.calls[0][1].rowVersion).toBe(8);
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-mode', 'view')
    );
    expect(await screen.findByText('Current review')).toBeInTheDocument();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  it('disables a previously valid approval while the native editor can still change that draft', async () => {
    const { client } = renderWorkspace([
      candidate({ status: 'reviewed', review: { valid: true, summary: 'Validated' } }),
    ]);
    await selectCandidate();
    expect(screen.getByRole('button', { name: 'Approve v2' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in n8n' }));
    const approve = screen.getByRole('button', { name: 'Approve v2' });
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();
  });

  it('keeps an invalid deterministic review unapprovable and exposes the reason', async () => {
    const { client } = renderWorkspace([
      candidate({
        review: {
          valid: false,
          summary: 'Changes need correction',
          issues: [{ code: 'UNSUPPORTED_GRAPH', message: 'Keep the supported connection path.' }],
        },
      }),
    ]);
    await selectCandidate();
    expect(screen.getByRole('button', { name: 'Approve v2' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Keep the supported connection path.');
    expect(client.decideSolutionRevision).not.toHaveBeenCalled();
  });

  it('requires server-confirmed test evidence before activating the exact tested revision', async () => {
    const untested = candidate({ status: 'ready', deployment: { workflowId: 'n8n-revision' } });
    const tested = { ...untested, testedAt: '2026-09-05T10:45:00.000Z', rowVersion: 4 };
    const { client } = renderWorkspace([untested]);
    await selectCandidate();
    expect(screen.getByRole('button', { name: 'Activate v2' })).toBeDisabled();
    client.testSolutionRevision.mockResolvedValue({
      invocation: {
        revisionId,
        workflowHash: 'a'.repeat(64),
        status: 'succeeded',
        executionId: '42',
        output: { customer: 'Bob' },
      },
    });
    client.solutionRevisions.mockResolvedValue(response([tested]));
    fireEvent.change(screen.getByRole('textbox', { name: 'Test input for v2' }), {
      target: { value: '{"name":" Bob "}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    expect(await screen.findByText('Test passed · n8n execution 42')).toBeInTheDocument();
    expect(client.testSolutionRevision).toHaveBeenCalledWith(
      solutionId,
      revisionId,
      { name: ' Bob ' },
      expect.any(String)
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate v2' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Activate v2' }));
    await waitFor(() =>
      expect(client.decideSolutionRevision).toHaveBeenCalledWith(solutionId, tested, 'activate')
    );
    await waitFor(() =>
      expect(screen.getByTestId('native-canvas')).toHaveAttribute('data-revision', 'current')
    );
  });

  it('does not unlock activation from a successful response without persisted testedAt', async () => {
    const { client } = renderWorkspace([
      candidate({ status: 'ready', deployment: { workflowId: 'n8n-revision' } }),
    ]);
    await selectCandidate();
    client.testSolutionRevision.mockResolvedValue({
      invocation: {
        revisionId,
        workflowHash: 'a'.repeat(64),
        status: 'succeeded',
        executionId: '42',
        output: { customer: 'Alice' },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
    expect(await screen.findByText('Test passed · n8n execution 42')).toBeInTheDocument();
    await waitFor(() => expect(client.solutionRevisions).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Activate v2' })).toBeDisabled();
  });

  it.each(['unknown', 'rejected'])(
    'never reports a test success for an %s execution result',
    async (outcome) => {
      const { client, onChange } = renderWorkspace([
        candidate({ status: 'ready', deployment: { workflowId: 'n8n-revision' } }),
      ]);
      await selectCandidate();
      if (outcome === 'unknown')
        client.testSolutionRevision.mockResolvedValue({
          invocation: {
            revisionId,
            workflowHash: 'a'.repeat(64),
            status: 'outcome_unknown',
            output: null,
          },
        });
      else
        client.testSolutionRevision.mockRejectedValue(
          new Error('The provider response could not be verified.')
        );
      fireEvent.click(screen.getByRole('button', { name: 'Test v2 in n8n' }));
      expect(
        await screen.findByText(
          outcome === 'unknown' ? /Outcome unknown/ : /provider response could not be verified/
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/Test passed/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Activate v2' })).toBeDisabled();
      expect(client.decideSolutionRevision).not.toHaveBeenCalled();
      if (outcome === 'rejected') expect(onChange).not.toHaveBeenCalled();
    }
  );

  it('presents uncertain deployment as verification rather than activation', async () => {
    const { client } = renderWorkspace([
      candidate({ status: 'deployment_unknown', lastError: 'DEPLOYMENT_REQUIRES_VERIFICATION' }),
    ]);
    await selectCandidate();
    expect(screen.queryByRole('button', { name: 'Activate v2' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify deployment' }));
    await waitFor(() =>
      expect(client.decideSolutionRevision).toHaveBeenCalledWith(
        solutionId,
        expect.objectContaining({ status: 'deployment_unknown' }),
        'deploy'
      )
    );
  });
});
