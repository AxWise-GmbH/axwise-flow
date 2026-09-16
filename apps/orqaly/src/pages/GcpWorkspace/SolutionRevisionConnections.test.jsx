import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SolutionRevisionConnections from './SolutionRevisionConnections.jsx';

const solutionId = 'solution-one';
const revision = {
  id: 'revision-one',
  solutionId,
  rowVersion: 4,
  version: 2,
  status: 'draft',
  workflowHash: 'a'.repeat(64),
  bundleHash: 'b'.repeat(64),
};
const requirement = {
  id: 'notify',
  service: 'Alert receiver',
  credentialType: 'orqalyBoundedHttp',
  nodeIds: ['deliver'],
  dependencyId: 'alert-handler',
  status: 'missing',
  canConnect: true,
  canRevoke: false,
  inherited: false,
  connectionId: null,
  reason: 'Connect your chosen receiver.',
  scopeHash: 'c'.repeat(64),
  scope: {
    targets: [
      { nodeId: 'deliver', method: 'POST', destination: 'https://receiver.example.org/alerts' },
    ],
  },
  fields: [
    { name: 'name', label: 'Header name', type: 'text', required: true },
    { name: 'value', label: 'API key', type: 'secret', required: true },
  ],
};
const snapshot = (item = requirement, value = revision) => ({
  revision: value,
  connectionRequirements: [item],
  setup: { ready: item.status === 'saved', reason: 'Set up this exact destination.' },
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(item = requirement, props = {}) {
  const client = {
    solutionRevisionSetup: vi.fn().mockResolvedValue(snapshot(item)),
    createSolutionRevisionConnection: vi
      .fn()
      .mockResolvedValue(snapshot({ ...item, status: 'saved' }, { ...revision, rowVersion: 5 })),
    revokeSolutionRevisionConnection: vi
      .fn()
      .mockResolvedValue(snapshot({ ...item, status: 'revoked' }, { ...revision, rowVersion: 5 })),
  };
  const onSaved = vi.fn().mockResolvedValue(undefined);
  const onBusyChange = vi.fn();
  const onSetupChange = vi.fn();
  const all = { client, solutionId, revision, onSaved, onBusyChange, onSetupChange, ...props };
  const view = render(<SolutionRevisionConnections {...all} />);
  return {
    ...view,
    ...all,
    rerenderProps: (next) => view.rerender(<SolutionRevisionConnections {...all} {...next} />),
  };
}
async function fill() {
  fireEvent.click(await screen.findByRole('button', { name: 'Set up Alert receiver securely' }));
  fireEvent.change(screen.getByLabelText(/Header name/), { target: { value: 'X-Task-Key' } });
  fireEvent.change(screen.getByLabelText(/API key/), {
    target: { value: 'synthetic-private-value' },
  });
}
function submit() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('button', { name: 'Save secure connection' }).closest('form'));
}

describe('secure revision-owned connections', () => {
  it('shows the exact child destination and requires acknowledgement before a secret-only scoped request', async () => {
    const f = fixture();
    await fill();
    expect(
      within(screen.getByRole('dialog')).getByText(/POST.*receiver.example.org\/alerts/)
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText(/Linked error workflow/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/API key/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save secure connection' })).toBeDisabled();
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    submit();
    await waitFor(() => expect(f.client.createSolutionRevisionConnection).toHaveBeenCalledTimes(1));
    expect(f.client.createSolutionRevisionConnection).toHaveBeenCalledWith(
      solutionId,
      revision.id,
      {
        expectedVersion: 4,
        workflowHash: revision.workflowHash,
        bundleHash: revision.bundleHash,
        requirementId: 'notify',
        confirmedScopeHash: requirement.scopeHash,
        acknowledge: true,
        credentials: { name: 'X-Task-Key', value: 'synthetic-private-value' },
      },
      expect.any(String)
    );
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledWith());
    expect(JSON.stringify(f.onSetupChange.mock.calls)).not.toContain('synthetic-private-value');
    expect(f.onBusyChange.mock.calls.every(([value]) => typeof value === 'boolean')).toBe(true);
    expect(f.client.revokeSolutionRevisionConnection).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('clears secret fields immediately, holds ownership through scope/write/refresh and blocks duplicate submission', async () => {
    const f = fixture();
    await fill();
    const scope = deferred();
    const write = deferred();
    const refreshed = deferred();
    f.client.solutionRevisionSetup.mockReturnValue(scope.promise);
    f.client.createSolutionRevisionConnection.mockReturnValue(write.promise);
    f.onSaved.mockReturnValue(refreshed.promise);
    submit();
    expect(screen.getByLabelText(/API key/)).toHaveValue('');
    fireEvent.submit(screen.getByRole('button', { name: 'Confirming setup…' }).closest('form'));
    expect(f.client.solutionRevisionSetup).toHaveBeenCalledTimes(2);
    expect(f.client.createSolutionRevisionConnection).not.toHaveBeenCalled();
    await act(async () => scope.resolve(snapshot()));
    expect(f.client.createSolutionRevisionConnection).toHaveBeenCalledTimes(1);
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => write.resolve(snapshot(requirement, { ...revision, rowVersion: 5 })));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => refreshed.resolve());
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it.each([
    ['version', snapshot(requirement, { ...revision, rowVersion: 5 })],
    ['main hash', snapshot(requirement, { ...revision, workflowHash: 'f'.repeat(64) })],
    ['bundle hash', snapshot(requirement, { ...revision, bundleHash: 'f'.repeat(64) })],
    ['scope', snapshot({ ...requirement, scopeHash: 'f'.repeat(64) })],
    ['capability', snapshot({ ...requirement, canConnect: false })],
  ])('does not save when the %s changed while the form was open', async (_kind, current) => {
    const f = fixture();
    await fill();
    f.client.solutionRevisionSetup.mockResolvedValue(current);
    submit();
    await screen.findByText(/Entered credentials were cleared/);
    expect(f.client.createSolutionRevisionConnection).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(f.onSaved).not.toHaveBeenCalled();
  });
  it('never displays provider error bodies or retries an ambiguous save automatically', async () => {
    const f = fixture();
    await fill();
    f.client.createSolutionRevisionConnection.mockRejectedValue(
      new Error('synthetic-private-value')
    );
    submit();
    await screen.findByText(/Entered credentials were cleared/);
    expect(screen.queryByText('synthetic-private-value')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up Alert receiver securely' })).toBeDisabled();
    expect(f.client.createSolutionRevisionConnection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh connection status' }));
    await waitFor(() => expect(f.client.solutionRevisionSetup).toHaveBeenCalledTimes(3));
    expect(f.client.createSolutionRevisionConnection).toHaveBeenCalledTimes(1);
  });
  it('distinguishes saved from verified and does not offer revocation of inherited credentials', async () => {
    fixture({
      ...requirement,
      status: 'saved',
      inherited: true,
      canConnect: false,
      canRevoke: true,
      connectionId: 'existing',
    });
    expect(await screen.findByText(/Saved — not tested/)).toBeInTheDocument();
    expect(screen.getByText(/Inherited connection: read-only here/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set up/ })).not.toBeInTheDocument();
  });
  it('revokes only the exact owned connection after confirmation, without credential values', async () => {
    const item = {
      ...requirement,
      status: 'saved',
      canConnect: false,
      canRevoke: true,
      connectionId: 'owned-draft-credential',
    };
    const f = fixture(item);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Alert receiver connection' })
    );
    expect(f.client.revokeSolutionRevisionConnection).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm revocation' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm revocation' }).closest('form'));
    await waitFor(() =>
      expect(f.client.revokeSolutionRevisionConnection).toHaveBeenCalledWith(
        solutionId,
        revision.id,
        {
          expectedVersion: 4,
          workflowHash: revision.workflowHash,
          bundleHash: revision.bundleHash,
          confirmedScopeHash: requirement.scopeHash,
          acknowledge: true,
          connectionId: 'owned-draft-credential',
        },
        expect.any(String)
      )
    );
    expect(f.client.createSolutionRevisionConnection).not.toHaveBeenCalled();
  });
  it('fails closed for unknown fields, missing scope pins or disabled capabilities', async () => {
    const f = fixture({
      ...requirement,
      fields: [{ name: 'url', type: 'secret', required: true, label: 'Secret URL' }],
    });
    await screen.findByText(/Connect your chosen receiver/);
    expect(screen.queryByRole('button', { name: /Set up/ })).not.toBeInTheDocument();
    f.client.solutionRevisionSetup.mockResolvedValue(
      snapshot({ ...requirement, scopeHash: undefined }, { ...revision, rowVersion: 5 })
    );
    f.rerenderProps({ revision: { ...revision, rowVersion: 5 } });
    await screen.findByText(/Connect your chosen receiver/);
    expect(screen.queryByRole('button', { name: /Set up/ })).not.toBeInTheDocument();
  });
  it('clears entered values on revision switches and ignores an unmounted preflight', async () => {
    const f = fixture();
    await fill();
    const scope = deferred();
    f.client.solutionRevisionSetup.mockReturnValue(scope.promise);
    submit();
    f.unmount();
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    await act(async () => scope.resolve(snapshot()));
    expect(f.client.createSolutionRevisionConnection).not.toHaveBeenCalled();
    expect(f.onSaved).not.toHaveBeenCalled();
  });
  it('clears values when cancelled and does not restore them if the form is reopened', async () => {
    const f = fixture();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and clear' }));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Set up Alert receiver securely' }));
    expect(screen.getByLabelText(/API key/)).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
