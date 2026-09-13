import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowBuildEntry } from './WorkflowBuildEntry.jsx';

const runId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const build = {
  id: 'new-build',
  runId,
  agentId: 'agent-123',
  rowVersion: 0,
  name: 'Order webhook',
  status: 'preparing',
  instruction: 'Build the requested webhook.',
};
function clientFixture() {
  return {
    solutionBuildRequests: vi.fn().mockResolvedValue({ buildRequests: [] }),
    createSolutionBuildRequest: vi.fn().mockResolvedValue({ buildRequest: build }),
  };
}
function tree(client, extra = {}) {
  return (
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <div>Current task chat</div>
              <WorkflowBuildEntry
                client={client}
                runId={runId}
                agentId="agent-123"
                taskLabel="Investigate a webhook"
                {...extra}
              />
            </>
          }
        />
        <Route path="/workspace/builds/:id" element={<div>Saved build workspace</div>} />
      </Routes>
    </MemoryRouter>
  );
}
function openComposer() {
  fireEvent.click(screen.getByRole('button', { name: 'Turn into workflow' }));
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Build draft' }));
}

describe('workflow draft preparation inside an existing task', () => {
  it('opens the host panel only after the build acknowledgement is verified', async () => {
    const client = clientFixture(),
      onOpenBuild = vi.fn();
    client.createSolutionBuildRequest.mockResolvedValueOnce({
      buildRequest: { ...build, runId: 'wrong-run' },
    });
    render(tree(client, { onOpenBuild }));
    openComposer();
    submit();
    await screen.findByText(/server did not confirm a saved workflow/);
    expect(onOpenBuild).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(onOpenBuild).toHaveBeenCalledExactlyOnceWith(build.id));
    expect(screen.getByText('Current task chat')).toBeInTheDocument();
  });
  it('prefills the editable task without automatically creating or authorizing work', async () => {
    const client = clientFixture();
    render(tree(client));
    openComposer();
    expect(screen.getByRole('textbox', { name: 'What should this workflow do?' })).toHaveValue(
      'Investigate a webhook'
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(client.createSolutionBuildRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('form')).toHaveTextContent(
      'Building a draft does not deploy it or authorize live actions.'
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Map order_id to reference without changing its value.  ' },
    });
    submit();
    expect(
      await screen.findByRole('article', { name: 'Workflow: Order webhook' })
    ).toBeInTheDocument();
    expect(screen.getByText('Current task chat')).toBeInTheDocument();
    expect(screen.queryByText('Saved build workspace')).toBeNull();
    expect(screen.getByRole('link', { name: 'View draft' })).toHaveAttribute(
      'href',
      '/workspace/builds/new-build'
    );
    expect(client.createSolutionBuildRequest).toHaveBeenCalledWith(
      {
        runId,
        agentId: 'agent-123',
        instruction: 'Map order_id to reference without changing its value.',
      },
      expect.any(String)
    );
  });

  it('reuses the idempotency key after an uncertain response but not for a changed request', async () => {
    const client = clientFixture();
    client.createSolutionBuildRequest
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockRejectedValueOnce(new Error('Still interrupted'));
    render(tree(client));
    openComposer();
    submit();
    expect(await screen.findByText('Connection interrupted')).toBeInTheDocument();
    submit();
    expect(await screen.findByText('Still interrupted')).toBeInTheDocument();
    expect(client.createSolutionBuildRequest.mock.calls[0]).toEqual(
      client.createSolutionBuildRequest.mock.calls[1]
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'A different explicit request' },
    });
    submit();
    await screen.findByRole('article');
    expect(client.createSolutionBuildRequest.mock.calls[2][1]).not.toBe(
      client.createSolutionBuildRequest.mock.calls[0][1]
    );
  });

  it('does not turn an incomplete or mismatched acknowledgement into a progress card', async () => {
    const client = clientFixture();
    client.createSolutionBuildRequest.mockResolvedValueOnce({
      buildRequest: { id: 'other-build', runId: 'other-run', rowVersion: 0 },
    });
    render(tree(client));
    openComposer();
    submit();
    expect(await screen.findByText(/server did not confirm/u)).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
    submit();
    await screen.findByRole('article');
    expect(client.createSolutionBuildRequest.mock.calls[0]).toEqual(
      client.createSolutionBuildRequest.mock.calls[1]
    );
  });

  it('resets the draft and ignores late creation when changing task scope', async () => {
    const client = clientFixture();
    let resolve;
    client.createSolutionBuildRequest.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(tree(client));
    openComposer();
    submit();
    view.rerender(
      tree(client, { runId: 'next-run', taskLabel: 'Another task', agentId: 'next-agent' })
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    await act(async () => {
      resolve({ buildRequest: build });
    });
    expect(screen.queryByRole('article')).toBeNull();
    openComposer();
    expect(screen.getByRole('textbox')).toHaveValue('Another task');
    expect(screen.getByRole('button', { name: 'Build draft' })).toBeEnabled();
  });

  it('drops saved cards and the request when the authenticated client changes', async () => {
    const first = clientFixture();
    const second = clientFixture();
    const view = render(tree(first));
    openComposer();
    submit();
    await screen.findByRole('article');
    view.rerender(tree(second));
    expect(screen.queryByRole('article')).toBeNull();
    openComposer();
    submit();
    await screen.findByRole('article');
    expect(first.createSolutionBuildRequest.mock.calls[0][1]).not.toBe(
      second.createSolutionBuildRequest.mock.calls[0][1]
    );
  });

  it('merges confirmed creation with polling and follows handoff without duplicating it', async () => {
    const client = clientFixture();
    client.solutionBuildRequests.mockResolvedValue({
      buildRequests: [{ ...build, rowVersion: 3, status: 'completed', solutionId: build.id }],
    });
    render(tree(client));
    await screen.findByRole('article');
    fireEvent.click(screen.getByRole('button', { name: 'Prepare another workflow' }));
    submit();
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workspace/solutions/new-build'
    );
    expect(screen.queryByText('Ready to run')).toBeNull();
  });

  it('does not duplicate cards when its Agent already owns the workflow list', async () => {
    const client = clientFixture();
    render(tree(client, { showBuilds: false }));
    openComposer();
    submit();
    expect(await screen.findByText(/Draft request saved with this Agent/u)).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('link', { name: 'View draft' })).toHaveAttribute(
      'href',
      '/workspace/builds/new-build'
    );
    expect(client.solutionBuildRequests).not.toHaveBeenCalled();
  });

  it('blocks secret-looking and empty instructions without sending them', async () => {
    const client = clientFixture();
    render(tree(client));
    openComposer();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Build draft' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'password=do-not-submit-this-secret' },
    });
    expect(screen.getByRole('button', { name: 'Build draft' })).toBeDisabled();
    expect(client.createSolutionBuildRequest).not.toHaveBeenCalled();
    await act(async () => {});
  });
});
