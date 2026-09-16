import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NativeN8nCanvas from './NativeN8nCanvas.jsx';

const solutionId = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const apiOrigin = 'https://api.orqaly.example';
const acceptedLaunch = {
  launchUrl: `${apiOrigin}/native-n8n/launch`,
  token: 'short-lived-editor-launch-token',
  expiresAt: '2026-09-05T11:00:30.000Z',
};
let submit;
beforeEach(() => {
  submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function renderCanvas(launch = acceptedLaunch, props = {}) {
  const client = {
    solutionEndpoint: vi
      .fn()
      .mockReturnValue(`${apiOrigin}/v2/solutions/${solutionId}/invocations`),
    nativeSolutionSession: vi.fn().mockResolvedValue(launch),
  };
  const result = render(<NativeN8nCanvas client={client} solutionId={solutionId} {...props} />);
  return { ...result, client };
}
const message = (source, origin, data) => {
  fireEvent(window, new MessageEvent('message', { source, origin, data }));
};

describe('native n8n iframe session boundary', () => {
  it('binds a read-only child to the same Solution revision and remounts when selecting the main workflow', async () => {
    const revisionId = 'df3c0831-537a-4a17-bf86-089d8059b746';
    const { client, rerender } = renderCanvas(acceptedLaunch, {
      revisionId,
      dependencyId: 'alert-handler',
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(client.nativeSolutionSession).toHaveBeenLastCalledWith(solutionId, {
      revisionId,
      dependencyId: 'alert-handler',
      mode: 'view',
    });
    const childFrame = screen.getByTitle('Native n8n workflow viewer');
    rerender(<NativeN8nCanvas client={client} solutionId={solutionId} revisionId={revisionId} />);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(client.nativeSolutionSession).toHaveBeenLastCalledWith(solutionId, {
      revisionId,
      mode: 'view',
    });
    expect(screen.getByTitle('Native n8n workflow viewer')).not.toBe(childFrame);
  });
  it('does not issue an editable child session', async () => {
    const { client } = renderCanvas(acceptedLaunch, {
      mode: 'edit',
      dependencyId: 'alert-handler',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('only be viewed');
    expect(client.nativeSolutionSession).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('preserves an expired edit iframe until explicitly reconnecting to the saved same-scope draft', async () => {
    vi.useFakeTimers();
    const onSessionStateChange = vi.fn();
    let view;
    const revisionId = 'df3c0831-537a-4a17-bf86-089d8059b746';
    await act(async () => {
      view = renderCanvas(acceptedLaunch, { mode: 'edit', revisionId, onSessionStateChange });
    });
    expect(onSessionStateChange).toHaveBeenLastCalledWith('connecting');
    const frame = screen.getByTitle('Native n8n draft editor');
    const oldWindow = frame.contentWindow;
    message(oldWindow, apiOrigin, { command: 'n8nReady' });
    expect(onSessionStateChange).toHaveBeenLastCalledWith('ready');
    // expiresAt describes the30-second launch token, not the600-second session.
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(569_000));
    expect(screen.getByRole('alert')).toHaveTextContent('expired');
    expect(screen.getByRole('alert')).toHaveTextContent('Copy any unsaved work');
    expect(screen.getByTitle('Native n8n draft editor')).toBe(frame);
    expect(onSessionStateChange).toHaveBeenLastCalledWith('expired');
    expect(view.container.querySelector('input[name="token"]')).toBeNull();
    expect(view.client.nativeSolutionSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect', exact: true }));
    expect(screen.getByRole('dialog')).toHaveTextContent('unsaved text will be lost');
    expect(view.client.nativeSolutionSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep this editor open' }));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTitle('Native n8n draft editor')).toBe(frame);
    act(() => vi.advanceTimersByTime(600_000));
    expect(view.client.nativeSolutionSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect', exact: true }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect to saved draft' }));
    });
    expect(view.client.nativeSolutionSession).toHaveBeenCalledTimes(2);
    expect(view.client.nativeSolutionSession).toHaveBeenLastCalledWith(solutionId, {
      revisionId,
      mode: 'edit',
    });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(onSessionStateChange).toHaveBeenLastCalledWith('connecting');
    const nextFrame = screen.getByTitle('Native n8n draft editor');
    expect(nextFrame).not.toBe(frame);
    message(oldWindow, apiOrigin, { command: 'n8nReady' });
    expect(onSessionStateChange).toHaveBeenLastCalledWith('connecting');
    message(nextFrame.contentWindow, apiOrigin, { command: 'n8nReady' });
    expect(onSessionStateChange).toHaveBeenLastCalledWith('ready');
  });

  it('reconnects an expired read-only viewer immediately, without creating or editing a workflow', async () => {
    vi.useFakeTimers();
    let view;
    await act(async () => {
      view = renderCanvas();
    });
    const frame = screen.getByTitle('Native n8n workflow viewer');
    message(frame.contentWindow, apiOrigin, { command: 'n8nReady' });
    act(() => vi.advanceTimersByTime(600_000));
    expect(screen.getByRole('alert')).toHaveTextContent('viewer session has expired');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect', exact: true }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.client.nativeSolutionSession).toHaveBeenCalledTimes(2);
    expect(view.client.nativeSolutionSession).toHaveBeenLastCalledWith(solutionId, {
      revisionId: null,
      mode: 'view',
    });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(screen.getByTitle('Native n8n workflow viewer')).not.toBe(frame);
  });

  it('preserves a concrete connection error instead of replacing it with later timeouts', async () => {
    vi.useFakeTimers();
    await act(async () => {
      renderCanvas();
    });
    expect(submit).toHaveBeenCalledTimes(1);
    const frame = screen.getByTitle('Native n8n workflow viewer');
    message(frame.contentWindow, apiOrigin, { command: 'orqaly:n8n:error' });
    expect(screen.getByRole('alert')).toHaveTextContent('could not open');
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(screen.getByRole('alert')).toHaveTextContent('could not open');
    expect(screen.getByRole('alert')).not.toHaveTextContent('expired');
    expect(screen.getByRole('alert')).not.toHaveTextContent('not finished');
  });

  it('allows the observed 42-second cold start while waiting for genuine native readiness', async () => {
    vi.useFakeTimers();
    await act(async () => {
      renderCanvas();
    });
    expect(screen.getByRole('status')).toHaveTextContent('up to a minute to wake up');
    act(() => vi.advanceTimersByTime(42_000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const frame = screen.getByTitle('Native n8n workflow viewer');
    message(frame.contentWindow, apiOrigin, { command: 'n8nReady' });
    act(() => vi.advanceTimersByTime(90_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens predeployment authoring through its own authenticated build-request scope', async () => {
    const buildRequestId = 'b9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
    const client = {
      nativeBuildRequestSession: vi.fn().mockResolvedValue(acceptedLaunch),
      buildRequestEndpoint: vi
        .fn()
        .mockReturnValue(`${apiOrigin}/v2/solution-build-requests/${buildRequestId}`),
      nativeSolutionSession: vi.fn(),
    };
    render(<NativeN8nCanvas client={client} buildRequestId={buildRequestId} mode="edit" />);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(client.nativeBuildRequestSession).toHaveBeenCalledWith(buildRequestId, { mode: 'edit' });
    expect(client.nativeSolutionSession).not.toHaveBeenCalled();
    expect(screen.getByTitle('Native n8n draft editor')).toBeInTheDocument();
  });

  it('rejects mixed Solution/build authoring targets before requesting credentials', async () => {
    const client = { nativeBuildRequestSession: vi.fn(), nativeSolutionSession: vi.fn() };
    render(
      <NativeN8nCanvas client={client} solutionId={solutionId} buildRequestId="other-target" />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'exactly one workflow authoring target'
    );
    expect(client.nativeBuildRequestSession).not.toHaveBeenCalled();
    expect(client.nativeSolutionSession).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('posts the launch token only to the expected API form endpoint, without putting it in an iframe URL', async () => {
    const { container, client } = renderCanvas();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const form = container.querySelector('form');
    const frame = screen.getByTitle('Native n8n workflow viewer');
    expect(form.method).toBe('post');
    expect(form.action).toBe(acceptedLaunch.launchUrl);
    expect(form.target).toBe(frame.name);
    expect(form.querySelector('input[name="token"]').value).toBe(acceptedLaunch.token);
    expect(frame.src).not.toContain(acceptedLaunch.token);
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-top-navigation|allow-popups/);
    expect(client.nativeSolutionSession).toHaveBeenCalledWith(solutionId, {
      revisionId: null,
      mode: 'view',
    });
  });

  it.each([
    'https://other.example/native-n8n/launch',
    'http://api.orqaly.example/native-n8n/launch',
    `${apiOrigin}/native-n8n/somewhere-else`,
    `${apiOrigin}/native-n8n/launch?destination=https://other.example`,
    `${apiOrigin}/native-n8n/launch#token`,
  ])(
    'rejects the untrusted launch destination %s before submitting any token',
    async (launchUrl) => {
      renderCanvas({ ...acceptedLaunch, launchUrl });
      expect(await screen.findByRole('alert')).toHaveTextContent('unexpected connection address');
      expect(submit).not.toHaveBeenCalled();
      expect(screen.queryByTitle('Native n8n workflow viewer')).not.toBeInTheDocument();
    }
  );

  it('waits for readiness from the exact iframe window and API origin', async () => {
    renderCanvas();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const frame = screen.getByTitle('Native n8n workflow viewer');
    fireEvent.load(frame);
    expect(screen.getByRole('status')).toBeInTheDocument();
    message(frame.contentWindow, 'https://other.example', { command: 'n8nReady' });
    message(window, apiOrigin, { command: 'n8nReady' });
    message(frame.contentWindow, apiOrigin, '{invalid JSON');
    message(frame.contentWindow, apiOrigin, { command: 'unexpected-ready-command' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    message(frame.contentWindow, apiOrigin, JSON.stringify({ command: 'n8nReady' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores forged errors and reconnects after an error from its own frame', async () => {
    const { client } = renderCanvas();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const originalFrame = screen.getByTitle('Native n8n workflow viewer');
    const staleWindow = originalFrame.contentWindow;
    message(window, apiOrigin, { command: 'orqaly:n8n:error' });
    message(staleWindow, 'https://other.example', { command: 'orqaly:n8n:error' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    message(staleWindow, apiOrigin, {
      command: 'orqaly:n8n:error',
      message: 'do not reflect arbitrary embedded text',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('could not open');
    expect(screen.getByRole('alert')).not.toHaveTextContent('do not reflect');
    expect(screen.queryByTitle('Native n8n workflow viewer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(client.nativeSolutionSession).toHaveBeenCalledTimes(2);
    message(staleWindow, apiOrigin, { command: 'n8nReady' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    const newFrame = screen.getByTitle('Native n8n workflow viewer');
    message(newFrame.contentWindow, apiOrigin, { command: 'n8nReady' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
