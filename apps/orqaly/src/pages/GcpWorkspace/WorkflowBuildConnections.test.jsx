import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowBuildConnections from './WorkflowBuildConnections.jsx';

const requirement = {
  id: 'receiver',
  nodeIds: ['Call receiver'],
  service: 'Customer receiver',
  credentialType: 'httpHeaderAuth',
  status: 'missing',
  reason: 'Authenticate only to your selected receiver.',
  scopeSummary: 'Selected preview receiver only',
  canConnect: true,
  fields: [
    { name: 'name', label: 'Header name', type: 'text', required: true },
    { name: 'value', label: 'API key', type: 'secret', required: true },
  ],
};
const build = {
  id: 'build-one',
  rowVersion: 4,
  workflowHash: 'hash-v2',
  connectionRequirements: [requirement],
};
function fixture(overrides = {}) {
  const current = { ...build, ...overrides };
  const client = {
    solutionBuildRequest: vi.fn().mockResolvedValue({ buildRequest: current }),
    createSolutionBuildConnection: vi
      .fn()
      .mockResolvedValue({ buildRequest: { ...current, rowVersion: 5 } }),
  };
  const onSaved = vi.fn();
  const onRefresh = vi.fn();
  const onBusyChange = vi.fn();
  const view = render(
    <WorkflowBuildConnections
      client={client}
      build={current}
      onSaved={onSaved}
      onRefresh={onRefresh}
      onBusyChange={onBusyChange}
    />
  );
  return { client, onSaved, onRefresh, onBusyChange, ...view };
}
function fill() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect Customer receiver securely' }));
  fireEvent.change(screen.getByLabelText(/Header name/), { target: { value: 'X-Api-Key' } });
  fireEvent.change(screen.getByLabelText(/API key/), {
    target: { value: 'synthetic-test-credential' },
  });
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function submitConnection() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('button', { name: 'Save secure connection' }).closest('form'));
}

describe('secure workflow connection requirements', () => {
  it('reports boolean-only ownership through both scope confirmation and secure setup, without duplicate submits', async () => {
    const f = fixture();
    const scope = deferred();
    const save = deferred();
    f.client.solutionBuildRequest.mockReturnValue(scope.promise);
    f.client.createSolutionBuildConnection.mockReturnValue(save.promise);
    fill();
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    submitConnection();
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    expect(f.client.createSolutionBuildConnection).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('button', { name: 'Checking connection…' }).closest('form'));
    expect(f.client.solutionBuildRequest).toHaveBeenCalledTimes(1);
    await act(async () => scope.resolve({ buildRequest: build }));
    expect(f.client.createSolutionBuildConnection).toHaveBeenCalledTimes(1);
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Cancel and clear' })).toBeDisabled();
    await act(async () => save.resolve({ buildRequest: { ...build, rowVersion: 5 } }));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(
      f.onBusyChange.mock.calls.every((args) => args.length === 1 && typeof args[0] === 'boolean')
    ).toBe(true);
  });

  it('releases ownership after unconfirmed setup, and reacquires it only while refreshing saved status', async () => {
    const f = fixture();
    f.client.createSolutionBuildConnection.mockRejectedValue(new Error('private detail'));
    fill();
    submitConnection();
    await screen.findByText(/Entered credentials were cleared/);
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    const refresh = deferred();
    f.client.solutionBuildRequest.mockReturnValue(refresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh connection status' }));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => refresh.reject(new Error('private refresh detail')));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/No new connection request has been made/)).toBeInTheDocument();
    expect(f.client.createSolutionBuildConnection).toHaveBeenCalledTimes(1);
  });

  it('cleans up ownership on unmount and ignores a late secure setup result', async () => {
    const f = fixture();
    const save = deferred();
    f.client.createSolutionBuildConnection.mockReturnValue(save.promise);
    fill();
    submitConnection();
    await waitFor(() => expect(f.client.createSolutionBuildConnection).toHaveBeenCalledTimes(1));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    f.unmount();
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    f.onBusyChange.mockClear();
    await act(async () => save.resolve({ buildRequest: build }));
    expect(f.onSaved).not.toHaveBeenCalled();
    expect(f.onBusyChange).not.toHaveBeenCalled();
  });

  it('gives a replacement callback the current busy state and cleans up through the current owner', async () => {
    const f = fixture();
    const scope = deferred();
    f.client.solutionBuildRequest.mockReturnValue(scope.promise);
    fill();
    submitConnection();
    const nextOwner = vi.fn();
    f.rerender(
      <WorkflowBuildConnections
        client={f.client}
        build={build}
        onSaved={f.onSaved}
        onRefresh={f.onRefresh}
        onBusyChange={nextOwner}
      />
    );
    expect(nextOwner).toHaveBeenLastCalledWith(true);
    f.onBusyChange.mockClear();
    f.unmount();
    expect(nextOwner).toHaveBeenLastCalledWith(false);
    await act(async () => scope.resolve({ buildRequest: build }));
    expect(f.client.createSolutionBuildConnection).not.toHaveBeenCalled();
    expect(f.onBusyChange).not.toHaveBeenCalled();
  });

  it('clears secret fields when navigating to another build', () => {
    const f = fixture();
    fill();
    f.rerender(
      <WorkflowBuildConnections
        client={f.client}
        build={{ ...build, id: 'build-two' }}
        onSaved={f.onSaved}
        onRefresh={f.onRefresh}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Customer receiver securely' }));
    expect(screen.getByLabelText(/API key/)).toHaveValue('');
  });
  it('uses a separate secret form, explicit account confirmation and exact current requirement/version', async () => {
    const f = fixture();
    fill();
    expect(screen.getByLabelText(/API key/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save secure connection' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save secure connection' }).closest('form')
    );
    await waitFor(() =>
      expect(f.client.createSolutionBuildConnection).toHaveBeenCalledWith(
        'build-one',
        {
          expectedVersion: 4,
          requirementId: 'receiver',
          credentials: { name: 'X-Api-Key', value: 'synthetic-test-credential' },
        },
        expect.any(String)
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(f.onSaved).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('synthetic-test-credential');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(
      'synthetic-test-credential'
    );
    expect(screen.queryByText(/Action succeeded/)).toBeNull();
  });

  it('clears credentials on cancel and reports failure without leaking an upstream error', async () => {
    const f = fixture();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and clear' }));
    fill();
    f.client.createSolutionBuildConnection.mockRejectedValue(
      new Error('private credential backend detail')
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save secure connection' }).closest('form')
    );
    expect(await screen.findByText(/Entered credentials were cleared/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toContain('private credential');
    expect(
      screen.getByRole('button', { name: 'Connect Customer receiver securely' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh connection status' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Connect Customer receiver securely' })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect Customer receiver securely' }));
    expect(screen.getByLabelText(/API key/)).toHaveValue('');
  });

  it('does not submit credentials if the draft or server permission changed', async () => {
    const f = fixture();
    fill();
    f.client.solutionBuildRequest.mockResolvedValue({ buildRequest: { ...build, rowVersion: 5 } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save secure connection' }).closest('form')
    );
    await screen.findByText(/Entered credentials were cleared/);
    expect(f.client.createSolutionBuildConnection).not.toHaveBeenCalled();
  });

  it.each([
    { ...requirement, canConnect: false },
    { ...requirement, credentialType: 'unreviewedCredential' },
    { ...requirement, credentialType: 'toString', fields: [] },
    {
      ...requirement,
      fields: [{ name: 'arbitrarySecret', label: 'Password', type: 'secret', required: true }],
    },
  ])('never enables a model-proposed or unsupported credential form', (item) => {
    fixture({ connectionRequirements: [item] });
    expect(screen.queryByRole('button', { name: /Connect .* securely/ })).toBeNull();
    expect(screen.getByText(/Secure setup is not available/)).toBeInTheDocument();
  });
});
