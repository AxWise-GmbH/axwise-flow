import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowsWorkspace } from './WorkflowsPage.jsx';

const solution = {
  id: 'saved-1',
  buildRequestId: 'build-1',
  name: 'Order normalization',
  status: 'active',
};
const clientFixture = () => ({
  solutions: vi.fn().mockResolvedValue({ solutions: [solution] }),
  solutionBuildRequests: vi.fn().mockResolvedValue({
    buildRequests: [
      { id: 'build-1', solutionId: 'saved-1', name: 'Duplicate draft', status: 'completed' },
      {
        id: 'build-2',
        name: 'Contact routing',
        status: 'needs_input',
        questions: [{ id: 'target', prompt: 'Where should contacts be routed?' }],
      },
    ],
  }),
});
const tree = (client) => (
  <MemoryRouter>
    <WorkflowsWorkspace client={client} />
  </MemoryRouter>
);
describe('all-workflows destination', () => {
  it('shows saved workflows and pending drafts separately without duplication', async () => {
    const client = clientFixture();
    render(tree(client));
    await screen.findByText('Order normalization');
    await screen.findByText('Contact routing');
    expect(screen.queryByText('Duplicate draft')).toBeNull();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Saved workflows' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In preparation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workspace/solutions/saved-1'
    );
    expect(screen.getByRole('link', { name: 'Answer & continue' })).toHaveAttribute(
      'href',
      '/workspace/builds/build-2'
    );
    expect(screen.getByRole('link', { name: 'Start in chat' })).toHaveAttribute(
      'href',
      '/assistant'
    );
    expect(client.solutions).toHaveBeenCalledWith();
    expect(client.solutionBuildRequests).toHaveBeenCalledWith({
      runId: undefined,
      agentId: undefined,
    });
  });
  it('keeps an already handed-off build discoverable if the Solution list is unavailable', async () => {
    const client = clientFixture();
    client.solutions.mockRejectedValue(new Error('Offline'));
    render(tree(client));
    await screen.findByRole('alert');
    expect(await screen.findByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workspace/solutions/saved-1'
    );
    expect(screen.queryByText('Your first workflow starts with a task')).toBeNull();
    expect(screen.queryByText('Ready to run')).toBeNull();
  });
  it('shows an empty state only after both lists are confirmed empty', async () => {
    const client = clientFixture();
    client.solutions.mockResolvedValue({ solutions: [] });
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    render(tree(client));
    expect(await screen.findByText('Your first workflow starts with a task')).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
  });
  it('keeps last confirmed work on refresh failure and supports reconnect', async () => {
    const client = clientFixture();
    client.solutionBuildRequests.mockRejectedValueOnce(new Error('Offline'));
    render(tree(client));
    await screen.findByText('Order normalization');
    await screen.findByRole('alert');
    client.solutions.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(client.solutions).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Order normalization')).toBeInTheDocument();
    await screen.findByText('Contact routing');
    expect(screen.queryByText('Duplicate draft')).toBeNull();
  });
  it('isolates account transitions and rejects late previous-account list responses', async () => {
    const first = clientFixture();
    const second = clientFixture();
    let resolve;
    first.solutions.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    second.solutions.mockResolvedValue({ solutions: [] });
    second.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    const view = render(tree(first));
    await screen.findByText('Contact routing');
    view.rerender(tree(second));
    expect(screen.queryByText('Contact routing')).toBeNull();
    await act(async () => {
      resolve({ solutions: [solution] });
    });
    expect(screen.queryByText('Order normalization')).toBeNull();
    await screen.findByText('Your first workflow starts with a task');
  });
});
