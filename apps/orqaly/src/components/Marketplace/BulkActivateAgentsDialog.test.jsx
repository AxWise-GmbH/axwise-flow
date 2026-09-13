import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ calls: [], result: null, shouldReject: false }));
vi.mock('../../services/agentImportMaterializer', () => ({
  materializeImportedAgents: (agents, opts) => {
    h.calls.push({ agents, opts });
    if (h.shouldReject) return Promise.reject(new Error('boom'));
    return Promise.resolve(
      h.result || {
        createdCount: agents.length,
        skippedCount: 0,
        photosGenerated: 0,
        photoFailures: 0,
      }
    );
  },
}));

const BulkActivateAgentsDialog = (await import('./BulkActivateAgentsDialog')).default;

const agents = [
  { role: 'Backend Architect', name: 'Backend Architect' },
  { role: 'Frontend Developer', name: 'Frontend Developer' },
];

beforeEach(() => {
  h.calls = [];
  h.result = null;
  h.shouldReject = false;
});

describe('BulkActivateAgentsDialog', () => {
  it('shows the selected count in the title', () => {
    render(<BulkActivateAgentsDialog open agents={agents} onClose={vi.fn()} />);
    expect(screen.getByText('Activate 2 agents')).toBeInTheDocument();
  });

  it('activates with the default provider/model, photos off, and reports the summary', async () => {
    const onComplete = vi.fn();
    render(
      <BulkActivateAgentsDialog open agents={agents} onClose={vi.fn()} onComplete={onComplete} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activate 2' }));

    await waitFor(() => expect(screen.getByText(/2 activated/)).toBeInTheDocument());

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].agents).toBe(agents);
    expect(h.calls[0].opts).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      generatePhotos: false,
    });
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ createdCount: 2, skippedCount: 0 })
    );
  });

  it('reports skipped agents and photo failures in the summary', async () => {
    h.result = { createdCount: 1, skippedCount: 1, photosGenerated: 0, photoFailures: 1 };
    render(<BulkActivateAgentsDialog open agents={agents} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Activate 2' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          '1 activated, 1 skipped (already exist), 0 photos generated, 1 photo failures.'
        )
      ).toBeInTheDocument()
    );
    expect(h.calls[0].opts.generatePhotos).toBe(true);
  });

  it('shows a cost warning once photo generation is enabled', () => {
    render(<BulkActivateAgentsDialog open agents={agents} onClose={vi.fn()} />);
    expect(screen.queryByText(/paid AI image generation call/)).toBeNull();

    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/paid AI image generation call/)).toBeInTheDocument();
  });

  it('surfaces an error without calling onComplete', async () => {
    h.shouldReject = true;
    const onComplete = vi.fn();
    render(
      <BulkActivateAgentsDialog open agents={agents} onClose={vi.fn()} onComplete={onComplete} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activate 2' }));

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    expect(onComplete).not.toHaveBeenCalled();
  });
});
