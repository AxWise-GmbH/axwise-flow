import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const mocks = vi.hoisted(() => ({
  fetchArenaDepartments: vi.fn(async () => ({ configured: [] })),
  saveArenaDepartments: vi.fn(async () => []),
}));
vi.mock('../../../../services/arenaService', () => mocks);

import DepartmentsCard from './DepartmentsCard';

const theme = createTheme();

function setup() {
  const onComplete = vi.fn(async () => {});
  render(
    <ThemeProvider theme={theme}>
      <DepartmentsCard onComplete={onComplete} embedded />
    </ThemeProvider>
  );
  return { onComplete };
}

const savedFor = (id) =>
  mocks.saveArenaDepartments.mock.calls[0][0].find((d) => d.department === id);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchArenaDepartments.mockResolvedValue({ configured: [] });
});

describe('DepartmentsCard', () => {
  it('offers the six built-in departments', async () => {
    setup();
    expect(await screen.findByLabelText('Legal')).toBeInTheDocument();
    expect(screen.getByLabelText('Accountants')).toBeInTheDocument();
  });

  it('cannot save until at least one department is on', async () => {
    setup();
    await screen.findByLabelText('Legal');
    expect(screen.getByRole('button', { name: 'Save departments' })).toBeDisabled();
  });

  it('adds a department in the company own words, with what they do', async () => {
    setup();
    await screen.findByLabelText('Legal');
    fireEvent.change(screen.getByLabelText('Custom department name'), {
      target: { value: 'Growth Pod' },
    });
    fireEvent.change(screen.getByLabelText('Custom department description'), {
      target: { value: 'Runs experiments' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Growth Pod')).toBeInTheDocument();
    expect(screen.getByText('Runs experiments')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save departments' }));
    await waitFor(() => expect(mocks.saveArenaDepartments).toHaveBeenCalled());
    expect(savedFor('custom:growth-pod')).toMatchObject({
      enabled: true,
      label: 'Growth Pod',
      description: 'Runs experiments',
    });
  });

  it('adds a custom department on Enter, and it counts as enabled', async () => {
    setup();
    await screen.findByLabelText('Legal');
    const name = screen.getByLabelText('Custom department name');
    fireEvent.change(name, { target: { value: 'Night Shift' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(screen.getByText('Night Shift')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save departments' })).toBeEnabled();
  });

  it('will not add a nameless department', async () => {
    setup();
    await screen.findByLabelText('Legal');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('removing a custom department saves it switched off, so it stops scoring', async () => {
    mocks.fetchArenaDepartments.mockResolvedValue({
      configured: [
        {
          department: 'custom:growth-pod',
          enabled: true,
          stakes: 'low',
          label: 'Growth Pod',
          description: 'x',
        },
        { department: 'legal', enabled: true, stakes: 'high' },
      ],
    });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Growth Pod' }));
    expect(screen.queryByText('Growth Pod')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save departments' }));
    await waitFor(() => expect(mocks.saveArenaDepartments).toHaveBeenCalled());
    expect(savedFor('custom:growth-pod').enabled).toBe(false);
  });

  it('reloads a custom department the company saved earlier', async () => {
    mocks.fetchArenaDepartments.mockResolvedValue({
      configured: [
        {
          department: 'custom:growth-pod',
          enabled: true,
          stakes: 'low',
          label: 'Growth Pod',
          description: 'Runs experiments',
          monthly_volume: 12,
        },
      ],
    });
    setup();
    expect(await screen.findByText('Growth Pod')).toBeInTheDocument();
    expect(screen.getByLabelText('Growth Pod')).toBeChecked();
  });
});
