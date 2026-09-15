import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantOperationStatus } from './AssistantOperationStatus.jsx';

describe('AssistantOperationStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps Retry disabled until the provider retry time', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-01T10:00:00.000Z');
    render(
      <AssistantOperationStatus
        part={{
          type: 'operation_status',
          status: 'failed',
          retryMode: 'new_attempt',
          retryAt: '2026-09-01T10:00:01.000Z',
        }}
        busy={false}
        onRetry={vi.fn()}
        retryAvailable
      />
    );

    expect(screen.getByRole('button', { name: 'Retry' }).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1025));
    expect(screen.getByRole('button', { name: 'Retry' }).disabled).toBe(false);
  });

  it('keeps a failed attempt prominent and preserves the Retry action', () => {
    const onRetry = vi.fn();
    render(
      <AssistantOperationStatus
        part={{ type: 'operation_status', status: 'failed', retryMode: 'new_attempt' }}
        route="AXWISE_ONE_SHOT"
        busy={false}
        onRetry={onRetry}
        retryAvailable
      />
    );

    const activity = screen.getByRole('region', { name: 'Research activity' });
    expect(within(activity).getByRole('status')).toHaveTextContent(
      'Orqanix could not complete this attempt.'
    );
    fireEvent.click(within(activity).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows sanitized Research activity instead of exposing private model reasoning', () => {
    render(
      <AssistantOperationStatus
        part={{
          type: 'operation_status',
          status: 'running',
          retryAfterSeconds: 2,
        }}
        route="AXWISE_ONE_SHOT"
        events={[
          {
            id: '50000000-0000-4000-8000-000000000011',
            sequence: 1,
            turnId: '20000000-0000-4000-8000-000000000001',
            type: 'progress',
            payload: { eventType: 'accepted', status: 'accepted' },
          },
          {
            id: '50000000-0000-4000-8000-000000000012',
            sequence: 2,
            turnId: '20000000-0000-4000-8000-000000000001',
            type: 'progress',
            payload: {
              eventType: 'heartbeat',
              status: 'running',
              privatePrompt: 'must never be rendered',
            },
          },
        ]}
        busy={false}
        onRetry={vi.fn()}
        retryAvailable={false}
      />
    );

    expect(screen.getByRole('region', { name: 'Research activity' })).toBeInTheDocument();
    expect(screen.getByText('Researching your request')).toBeInTheDocument();
    expect(
      screen.getByText('Verified execution activity—not private model reasoning.')
    ).toBeInTheDocument();
    expect(screen.getByText('The reasoning service accepted your request')).toBeInTheDocument();
    expect(screen.getByText('The reasoning service is still working')).toBeInTheDocument();
    expect(screen.queryByText('must never be rendered')).not.toBeInTheDocument();
  });

  it('summarizes completed Research in a quiet collapsed lifecycle row', () => {
    render(
      <AssistantOperationStatus
        part={{ type: 'operation_status', status: 'completed', retryMode: 'none' }}
        route="AXWISE_ONE_SHOT"
        busy={false}
        onRetry={vi.fn()}
        retryAvailable={false}
      />
    );

    const activity = screen.getByRole('region', { name: 'Research activity' });
    expect(activity.querySelector('.MuiPaper-root')).toBeNull();
    expect(within(activity).getByRole('status')).toHaveTextContent('Research completed · 3 steps');

    const disclosure = within(activity).getByRole('button', {
      name: 'View activity · 3 steps',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(activity).queryByText('Verified execution activity—not private model reasoning.')
    ).not.toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(within(activity).getByRole('button', { name: 'Hide activity' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(
      within(activity).getByText('Verified execution activity—not private model reasoning.')
    ).toBeInTheDocument();
  });

  it('labels completed conversational work as a response', () => {
    render(
      <AssistantOperationStatus
        part={{ type: 'operation_status', status: 'completed', retryMode: 'none' }}
        route="DIRECT_ANSWER"
        busy={false}
        onRetry={vi.fn()}
        retryAvailable={false}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Response completed · 3 steps');
  });

  it('uses route-aware stopped copy for conversational turns', () => {
    render(
      <AssistantOperationStatus
        part={{ type: 'operation_status', status: 'cancelled', retryMode: 'none' }}
        route="DIRECT_ANSWER"
        busy={false}
        onRetry={vi.fn()}
        retryAvailable={false}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Response stopped. · 3 steps');
    expect(screen.getByRole('status')).not.toHaveTextContent('Research stopped.');
  });
});
