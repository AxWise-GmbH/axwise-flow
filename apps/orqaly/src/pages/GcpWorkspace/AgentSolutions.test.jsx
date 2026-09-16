import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AgentSolutions } from './AgentSolutions.jsx';

const solution = {
  id: 'saved-1',
  buildRequestId: 'build-1',
  name: 'Saved order workflow',
  status: 'active',
};
const build = {
  id: 'build-1',
  name: 'Duplicate order draft',
  solutionId: solution.id,
  status: 'completed',
};
const clientFixture = () => ({
  agentSolutions: vi.fn().mockResolvedValue({ solutions: [solution] }),
  solutionBuildRequests: vi.fn().mockResolvedValue({ buildRequests: [build] }),
});
const tree = (client, id = 'agent-1') => (
  <MemoryRouter>
    <AgentSolutions agent={{ id }} client={client} />
  </MemoryRouter>
);
describe('Agent workflow discovery', () => {
  it('shows one saved workflow, not separate build and Solution cards', async () => {
    const client = clientFixture();
    render(tree(client));
    await screen.findByText('Saved order workflow');
    await waitFor(() => expect(screen.queryByText('Duplicate order draft')).toBeNull());
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(client.agentSolutions).toHaveBeenCalledWith('agent-1');
    expect(client.solutionBuildRequests).toHaveBeenCalledWith({
      agentId: 'agent-1',
      runId: undefined,
    });
    expect(screen.getByRole('link', { name: 'View all workflows' })).toHaveAttribute(
      'href',
      '/workspace/workflows'
    );
  });
  it('does not mistake a failed list read for no workflows', async () => {
    const client = clientFixture();
    client.agentSolutions.mockRejectedValue(new Error('Offline'));
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    render(tree(client));
    await screen.findByRole('alert');
    expect(screen.queryByText(/No workflows yet/u)).toBeNull();
  });
  it('hides previous Agent records immediately and ignores their late response', async () => {
    const client = clientFixture();
    let resolve;
    client.agentSolutions
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      )
      .mockResolvedValue({ solutions: [] });
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    const view = render(tree(client));
    view.rerender(tree(client, 'agent-2'));
    await act(async () => {
      resolve({ solutions: [solution] });
    });
    expect(screen.queryByText('Saved order workflow')).toBeNull();
    expect(await screen.findByText(/No workflows yet/u)).toBeInTheDocument();
  });
  it('drops confirmed cards immediately when the client identity changes', async () => {
    const first = clientFixture();
    const second = clientFixture();
    second.agentSolutions.mockResolvedValue({ solutions: [] });
    second.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    const view = render(tree(first));
    await screen.findByText('Saved order workflow');
    view.rerender(tree(second));
    expect(screen.queryByText('Saved order workflow')).toBeNull();
    await screen.findByText(/No workflows yet/u);
  });
});
