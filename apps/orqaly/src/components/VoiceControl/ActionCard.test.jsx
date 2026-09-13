import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActionCard, { buildArgPreview } from './ActionCard.jsx';

describe('ActionCard', () => {
  it('maps the tool to a friendly primary label', () => {
    render(
      <ActionCard
        proposal={{
          pendingCallId: 'p1',
          tool: 'goal.create',
          riskLevel: 'medium',
          summary: 'Create goal X',
        }}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Create Goal' })).toBeTruthy();
    expect(screen.getByText('Create goal X')).toBeTruthy();
  });

  it('confirms and shows Done on success', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ status: 'approved', blocks: [] });
    render(
      <ActionCard
        proposal={{ pendingCallId: 'p1', tool: 'task.create', riskLevel: 'medium' }}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows an error when the resolve fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ status: 'error', error: 'boom' });
    render(
      <ActionCard
        proposal={{ pendingCallId: 'p1', tool: 'task.create', riskLevel: 'medium' }}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
  });

  it('cancels locally without calling the backend', () => {
    const onConfirm = vi.fn();
    render(
      <ActionCard
        proposal={{ pendingCallId: 'p1', tool: 'goal.create', riskLevel: 'medium' }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('previews the goal it would create and marks the values it filled in', () => {
    render(
      <ActionCard
        proposal={{
          pendingCallId: 'p1',
          tool: 'goal.create',
          riskLevel: 'medium',
          summary: 'Create a new project goal in Orqaly',
          args: { title: 'New goal', budget_usd: 10, complexity: 'simple' },
          draftFields: ['title', 'budget_usd', 'complexity'],
        }}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('New goal')).toBeTruthy();
    expect(screen.getByText('$10')).toBeTruthy();
    expect(screen.getAllByText('draft')).toHaveLength(3);
  });

  it('shows a stated goal without any draft marker', () => {
    render(
      <ActionCard
        proposal={{
          pendingCallId: 'p1',
          tool: 'goal.create',
          riskLevel: 'medium',
          args: { title: 'Landing page', budget_usd: 25, complexity: 'complex' },
          draftFields: [],
        }}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Landing page')).toBeTruthy();
    expect(screen.queryByText('draft')).toBeNull();
  });

  it('renders nothing extra when a proposal carries no args', () => {
    render(
      <ActionCard
        proposal={{ pendingCallId: 'p1', tool: 'goal.create', riskLevel: 'medium' }}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByTestId('action-args')).toBeNull();
  });

  it('labels destructive tools distinctly', () => {
    render(
      <ActionCard
        proposal={{ pendingCallId: 'p1', tool: 'goal.cancel', riskLevel: 'high' }}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Cancel Goal' })).toBeTruthy();
  });
});

describe('buildArgPreview', () => {
  it('falls back to the first few args for tools without a field list', () => {
    const preview = buildArgPreview('pulse.create', {
      name: 'Daily digest',
      schedule: '0 9 * * *',
      channel: 'telegram',
      extra: 'dropped',
    });
    expect(preview.map((f) => f.key)).toEqual(['name', 'schedule', 'channel']);
  });

  it('hides scoping args the user never chose', () => {
    const preview = buildArgPreview('kb.create', { organization_id: 'org-1', title: 'Note' });
    expect(preview.map((f) => f.key)).toEqual(['title']);
  });

  it('truncates a long value', () => {
    const preview = buildArgPreview('note.create', { text: 'x'.repeat(80) });
    expect(preview[0].text.endsWith('…')).toBe(true);
    expect(preview[0].text.length).toBeLessThanOrEqual(41);
  });

  it('returns nothing when there are no args', () => {
    expect(buildArgPreview('goal.create', undefined)).toEqual([]);
  });
});
