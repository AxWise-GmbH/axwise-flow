import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const mocks = vi.hoisted(() => ({
  fetchArenaRates: vi.fn(async () => []),
  saveArenaRates: vi.fn(async () => []),
  fetchArenaPeople: vi.fn(async () => []),
  fetchArenaDepartments: vi.fn(async () => ({ configured: [] })),
}));
vi.mock('../../../../services/arenaService', () => mocks);

import RatesCard from './RatesCard';

const theme = createTheme();

function setup() {
  const onComplete = vi.fn(async () => {});
  render(
    <ThemeProvider theme={theme}>
      <RatesCard onComplete={onComplete} embedded />
    </ThemeProvider>
  );
  return { onComplete };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchArenaRates.mockResolvedValue([]);
  mocks.fetchArenaPeople.mockResolvedValue([
    { name: 'Marta K.', role: 'Lawyer', is_active: true },
    { name: 'Ilona R.', role: 'SMM Manager', is_active: true },
  ]);
  mocks.fetchArenaDepartments.mockResolvedValue({
    configured: [
      { department: 'legal', enabled: true },
      { department: 'custom:growth-pod', enabled: true, label: 'Growth Pod' },
      { department: 'marketing', enabled: false },
    ],
  });
});

describe('RatesCard easy start', () => {
  it('opens with a row per person and per department, ready for numbers', async () => {
    setup();
    await waitFor(() => expect(mocks.fetchArenaPeople).toHaveBeenCalled());
    // two people + two enabled departments (the disabled one is left out)
    await waitFor(() => expect(screen.getByLabelText('Rate 4 who')).toBeInTheDocument());
    expect(screen.queryByLabelText('Rate 5 who')).not.toBeInTheDocument();
  });

  it('names the company own department by its label, not its id', async () => {
    setup();
    await waitFor(() => expect(mocks.fetchArenaDepartments).toHaveBeenCalled());
    expect(await screen.findByText('Growth Pod')).toBeInTheDocument();
    expect(screen.queryByText('custom:growth-pod')).not.toBeInTheDocument();
  });

  it('saves only the rows that were given a number', async () => {
    const { onComplete } = setup();
    await waitFor(() => expect(mocks.fetchArenaPeople).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Rate 1 per hour'), { target: { value: '140' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rates' }));
    await waitFor(() => expect(mocks.saveArenaRates).toHaveBeenCalled());
    const saved = mocks.saveArenaRates.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ scope: 'person', key: 'Marta K.', hourly_rate: 140 });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('cannot save when nothing has a number yet', async () => {
    setup();
    await waitFor(() => expect(mocks.fetchArenaPeople).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Save rates' })).toBeDisabled();
  });

  it('refuses a negative rate and says so', async () => {
    setup();
    await waitFor(() => expect(mocks.fetchArenaPeople).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Rate 1 per hour'), { target: { value: '-5' } });
    expect(await screen.findByText(/cannot be negative/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save rates' })).toBeDisabled();
  });

  it('shows what was already saved instead of seeding again', async () => {
    mocks.fetchArenaRates.mockResolvedValue([
      { scope: 'role', key: 'Lawyer', currency: 'USD', hourly_rate: 120, per_job_cost: null },
    ]);
    setup();
    await waitFor(() => expect(mocks.fetchArenaRates).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Rate 1 who')).toHaveValue('Lawyer'));
    expect(screen.queryByLabelText('Rate 2 who')).not.toBeInTheDocument();
  });
});
