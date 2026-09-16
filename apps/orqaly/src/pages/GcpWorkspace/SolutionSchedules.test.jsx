import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SolutionSchedules from './SolutionSchedules.jsx';

const solution = { id: 'scheduled-solution', workflowHash: 'a'.repeat(64), status: 'active' };
const example = { customer: { name: 'Ada' } };
const clientFor = (result = { enabled: true, schedules: [], ticks: [] }) => ({
  solutionSchedules: vi.fn(async () => result),
  createSolutionSchedule: vi.fn(async () => ({})),
  pauseSolutionSchedule: vi.fn(async () => ({})),
});
describe('Solution schedule controls', () => {
  it('explains an unsupported runtime without offering creation and keeps pause available', async () => {
    const reason =
      'Automatic runs are not enabled for this Solution’s isolated runtime. Manual and application-key runs are unchanged.';
    const client = clientFor({
      enabled: false,
      disabledReason: reason,
      schedules: [
        {
          id: 'old',
          label: 'Existing schedule',
          status: 'active',
          nextRunAt: '2026-09-07T07:00:00Z',
        },
      ],
      ticks: [],
    });
    render(<SolutionSchedules client={client} solution={solution} example={example} />);
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve & start schedule' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause schedule' }));
    await waitFor(() =>
      expect(client.pauseSolutionSchedule).toHaveBeenCalledWith(solution.id, 'old')
    );
    expect(client.createSolutionSchedule).not.toHaveBeenCalled();
  });
  it('truthfully explains a schedule stopped after runtime permission is removed', async () => {
    const client = clientFor({
      enabled: false,
      schedules: [
        {
          id: 'old',
          label: 'Old schedule',
          status: 'needs_attention',
          lastError: 'SCHEDULE_ENVIRONMENT_UNAVAILABLE',
        },
      ],
      ticks: [],
    });
    render(<SolutionSchedules client={client} solution={solution} example={example} />);
    expect(
      await screen.findByText(/scheduled execution is no longer enabled.*No new run was sent/)
    ).toBeInTheDocument();
    expect(client.createSolutionSchedule).not.toHaveBeenCalled();
  });
  it('shows explicit recurring consent and sends the active version and nested input', async () => {
    const client = clientFor();
    render(<SolutionSchedules client={client} solution={solution} example={example} />);
    const start = await screen.findByRole('button', { name: 'Approve & start schedule' });
    expect(screen.getByText(/Starting authorizes repeated real runs/)).toBeTruthy();
    fireEvent.click(start);
    await waitFor(() => expect(client.createSolutionSchedule).toHaveBeenCalledTimes(1));
    expect(client.createSolutionSchedule.mock.calls[0].slice(0, 2)).toEqual([
      solution.id,
      {
        label: 'Every 60 minutes',
        workflowHash: solution.workflowHash,
        input: example,
        timing: { kind: 'interval', minutes: 60 },
      },
    ]);
  });
  it('does not schedule a paused solution', async () => {
    const client = clientFor();
    render(
      <SolutionSchedules
        client={client}
        solution={{ ...solution, status: 'paused' }}
        example={example}
      />
    );
    expect((await screen.findByRole('button', { name: 'Approve & start schedule' })).disabled).toBe(
      true
    );
    expect(client.createSolutionSchedule).not.toHaveBeenCalled();
  });
  it('uses the same idempotency key after an uncertain create response', async () => {
    const client = clientFor();
    client.createSolutionSchedule.mockRejectedValueOnce(new Error('Connection lost'));
    render(<SolutionSchedules client={client} solution={solution} example={example} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve & start schedule' }));
    await screen.findByText('Connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Approve & start schedule' }));
    await waitFor(() => expect(client.createSolutionSchedule).toHaveBeenCalledTimes(2));
    expect(client.createSolutionSchedule.mock.calls[0][2]).toBe(
      client.createSolutionSchedule.mock.calls[1][2]
    );
  });
  it('allows pause and does not claim to stop already dispatched work', async () => {
    const client = clientFor({
      enabled: true,
      schedules: [
        { id: 'daily', label: 'Daily report', status: 'active', nextRunAt: '2026-09-07T07:00:00Z' },
      ],
      ticks: [],
    });
    render(<SolutionSchedules client={client} solution={solution} example={example} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause schedule' }));
    await waitFor(() =>
      expect(client.pauseSolutionSchedule).toHaveBeenCalledWith(solution.id, 'daily')
    );
  });
});
