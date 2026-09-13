import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SolutionAppAccess from './SolutionAppAccess.jsx';

const hash = 'a'.repeat(64);
const token = 'synthetic-one-time-secret-not-a-real-access-key';
const policy = {
  defaultExpiryDays: 30,
  maxExpiryDays: 90,
  maxActiveKeys: 5,
  requestsPerMinute: 60,
  requestsPerDay: 1000,
  maxConcurrentInvocations: 1,
};
const solution = {
  id: 'solution-one',
  name: 'Webhook',
  version: 3,
  rowVersion: 7,
  workflowHash: hash,
  status: 'active',
  testedAt: '2026-09-05T18:00:00Z',
  deployment: { workflowId: 'provider-workflow' },
};
const key = {
  id: 'key-one',
  label: 'Billing server',
  prefix: 'orqaly_app_00000001',
  status: 'active',
  workflowHash: hash,
  createdAt: '2026-09-05T18:00:00Z',
  expiresAt: '2026-10-05T18:00:00Z',
  lastUsedAt: null,
  revokedAt: null,
  rowVersion: 0,
};
function fixture(initialKeys = []) {
  let keys = initialKeys;
  const client = {
    solutionAppKeys: vi.fn(async () => ({ keys, policy })),
    createSolutionAppKey: vi.fn(async (_solution, command) => {
      const created = { ...key, label: command.label };
      keys = [created, ...keys];
      return { key: created, token };
    }),
    revokeSolutionAppKey: vi.fn(async (_id, selected) => {
      const revoked = { ...selected, status: 'revoked', rowVersion: selected.rowVersion + 1 };
      keys = keys.map((item) => (item.id === selected.id ? revoked : item));
      return { key: revoked };
    }),
    appInvocationEndpoint: vi.fn((id) => `https://api.example/invoke/v1/solutions/${id}`),
  };
  const onRefreshSolution = vi.fn();
  const props = { client, solution, example: { name: ' Ada ' }, onRefreshSolution };
  return {
    client,
    props,
    onRefreshSolution,
    setKeys: (next) => {
      keys = next;
    },
  };
}
async function createKey(label = 'Billing server') {
  await screen.findByText('No application keys yet.');
  fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
    target: { value: label },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create key for v3' }));
  return screen.findByRole('dialog', { name: 'Save your new app key' });
}
afterEach(() => vi.restoreAllMocks());

describe('Solution application access', () => {
  it('creates a named 30-day exact-release key and keeps the token out of persisted metadata and request examples', async () => {
    const h = fixture();
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const log = vi.spyOn(console, 'log');
    render(<SolutionAppAccess {...h.props} />);
    const dialog = await createKey();
    expect(h.client.createSolutionAppKey).toHaveBeenCalledWith(
      solution,
      { label: 'Billing server', expiresInDays: 30 },
      expect.any(String)
    );
    expect(within(dialog).getByRole('textbox', { name: 'New app access key' })).toHaveValue(token);
    expect(screen.getByLabelText('Server-side application request')).not.toHaveTextContent(token);
    expect(screen.getByLabelText('Server-side application request')).toHaveTextContent(
      '$ORQALY_APP_KEY'
    );
    expect(local).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'I saved it · hide key' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'New app access key' })).toBeNull()
    );
    expect(document.body).not.toHaveTextContent(token);
    expect(screen.getByRole('list', { name: 'Application access keys' })).toHaveTextContent(
      'Billing server'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh keys' }));
    await waitFor(() => expect(h.client.solutionAppKeys).toHaveBeenCalledTimes(2));
    expect(document.body).not.toHaveTextContent(token);
  });

  it('offers only 30 and 90 days and accepts the explicit 90-day choice', async () => {
    const h = fixture();
    render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('No application keys yet.');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Key expires after' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '30 days',
      '90 days',
    ]);
    fireEvent.click(screen.getByRole('option', { name: '90 days' }));
    await createKey();
    expect(h.client.createSolutionAppKey.mock.calls[0][1].expiresInDays).toBe(90);
  });

  it('does not lose a one-time key from an accidental Escape or backdrop click', async () => {
    const h = fixture();
    render(<SolutionAppAccess {...h.props} />);
    const dialog = await createKey();
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    fireEvent.click(document.querySelector('.MuiBackdrop-root'));
    expect(within(dialog).getByRole('textbox', { name: 'New app access key' })).toHaveValue(token);
  });

  it('clears a secret immediately when the Solution changes and never adopts the old metadata', async () => {
    const h = fixture();
    const view = render(<SolutionAppAccess {...h.props} />);
    await createKey();
    view.rerender(
      <SolutionAppAccess {...h.props} solution={{ ...solution, id: 'solution-two' }} />
    );
    expect(screen.queryByRole('dialog', { name: 'Save your new app key' })).toBeNull();
    expect(document.body).not.toHaveTextContent(token);
    await waitFor(() => expect(h.client.solutionAppKeys).toHaveBeenLastCalledWith('solution-two'));
  });

  it('clears the one-time secret on release change and on unmount/remount', async () => {
    const h = fixture();
    const view = render(<SolutionAppAccess {...h.props} />);
    await createKey();
    view.rerender(
      <SolutionAppAccess
        {...h.props}
        solution={{ ...solution, workflowHash: 'b'.repeat(64), version: 4 }}
      />
    );
    expect(document.body).not.toHaveTextContent(token);
    view.unmount();
    render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('Billing server');
    expect(screen.queryByRole('textbox', { name: 'New app access key' })).toBeNull();
  });

  it('ignores an old create response after navigation', async () => {
    const h = fixture();
    let resolve;
    h.client.createSolutionAppKey.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('No application keys yet.');
    fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
      target: { value: 'Billing server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create key for v3' }));
    view.rerender(
      <SolutionAppAccess {...h.props} solution={{ ...solution, id: 'solution-two' }} />
    );
    await act(async () => resolve({ key, token }));
    expect(document.body).not.toHaveTextContent(token);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('requires explicit named-key revocation and keeps other keys and production untouched', async () => {
    const h = fixture([key, { ...key, id: 'key-two', label: 'Metrics server' }]);
    render(<SolutionAppAccess {...h.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Billing server' }));
    let dialog = screen.getByRole('dialog', { name: 'Revoke Billing server?' });
    expect(h.client.revokeSolutionAppKey).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep key' }));
    expect(h.client.revokeSolutionAppKey).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Billing server' }));
    dialog = screen.getByRole('dialog', { name: 'Revoke Billing server?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke access' }));
    await waitFor(() =>
      expect(h.client.revokeSolutionAppKey).toHaveBeenCalledWith(solution.id, key)
    );
    expect(await screen.findByText('Revoked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke Metrics server' })).toBeInTheDocument();
    expect(h.client.createSolutionAppKey).not.toHaveBeenCalled();
  });

  it.each(['draft', 'ready', 'paused'])(
    'cannot create access while Solution is %s',
    async (status) => {
      const h = fixture([key]);
      render(<SolutionAppAccess {...h.props} solution={{ ...solution, status }} />);
      await screen.findByText('Billing server');
      fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
        target: { value: 'A new app' },
      });
      expect(screen.getByRole('button', { name: 'Create key for v3' })).toBeDisabled();
      expect(
        screen.getByText(/production calls are blocked while this Solution is inactive/)
      ).toBeInTheDocument();
      expect(h.client.createSolutionAppKey).not.toHaveBeenCalled();
    }
  );

  it('blocks creation at the key limit and allows explicit revocation instead', async () => {
    const h = fixture(
      Array.from({ length: 5 }, (_, index) => ({
        ...key,
        id: `key-${index}`,
        label: `App ${index}`,
        status: index === 0 ? 'release_changed' : 'active',
      }))
    );
    render(<SolutionAppAccess {...h.props} />);
    expect(await screen.findByText(/limit of 5 unrevoked, unexpired keys/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
      target: { value: 'More' },
    });
    expect(screen.getByRole('button', { name: 'Create key for v3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revoke App 0' })).toBeEnabled();
  });

  it('keeps the same idempotency key after an uncertain creation and requires refresh before retry', async () => {
    const h = fixture();
    h.client.createSolutionAppKey.mockRejectedValueOnce(
      new Error(`unsafe upstream detail ${token}`)
    );
    render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('No application keys yet.');
    fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
      target: { value: 'Billing server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create key for v3' }));
    expect(await screen.findByText(/Key creation could not be confirmed/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(token);
    expect(screen.getByRole('button', { name: 'Create key for v3' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh keys' })[0]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create key for v3' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create key for v3' }));
    await screen.findByRole('dialog', { name: 'Save your new app key' });
    expect(h.client.createSolutionAppKey.mock.calls[1][2]).toBe(
      h.client.createSolutionAppKey.mock.calls[0][2]
    );
  });

  it('never fabricates or re-reveals a secret when creation already completed', async () => {
    const h = fixture();
    h.client.createSolutionAppKey.mockRejectedValue({
      status: 409,
      code: 'APP_KEY_ALREADY_CREATED',
    });
    render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('No application keys yet.');
    fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
      target: { value: 'Billing server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create key for v3' }));
    expect(await screen.findByText(/That request already created a key/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.client.createSolutionAppKey).toHaveBeenCalledTimes(1);
  });

  it('shows safe stale-state feedback and preserves form input for explicit review', async () => {
    const h = fixture();
    h.client.createSolutionAppKey.mockRejectedValue({ status: 409, code: 'VERSION_CONFLICT' });
    render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('No application keys yet.');
    const form = screen.getByRole('form', { name: 'Create app access key' });
    fireEvent.change(screen.getByRole('textbox', { name: 'App key name' }), {
      target: { value: 'Billing server' },
    });
    fireEvent.submit(form);
    expect(await screen.findByText(/The Solution or key changed/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'App key name' })).toHaveValue('Billing server');
    expect(h.onRefreshSolution).toHaveBeenCalledTimes(1);
  });

  it('retains safe metadata but clears key authority controls when refresh fails', async () => {
    const h = fixture([key]);
    render(<SolutionAppAccess {...h.props} />);
    await screen.findByText('Billing server');
    h.client.solutionAppKeys.mockRejectedValueOnce(new Error(token));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh keys' }));
    expect(await screen.findByText(/The action could not be confirmed/)).toBeInTheDocument();
    expect(screen.getByText('Billing server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke Billing server' })).toBeDisabled();
    expect(document.body).not.toHaveTextContent(token);
  });
});
