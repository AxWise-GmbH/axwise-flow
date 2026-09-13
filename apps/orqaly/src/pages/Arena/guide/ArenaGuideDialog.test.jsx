import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const progressMock = vi.fn(async () => ({ done: { departments: true }, composioConfigured: true }));
vi.mock('../../../services/arenaService', () => ({
  fetchArenaGuideProgress: (...a) => progressMock(...a),
}));

// The six real cards pull services on mount; stub them so the dialog test is
// about the shell (header, no toggle, step routing), not the cards.
vi.mock('./guideSteps', () => {
  const Stub = ({ label }) => <div data-testid={`card-${label}`} />;
  return {
    ARENA_GUIDE_STEPS: [
      {
        key: 'departments',
        label: 'Departments',
        short: 'Depts',
        icon: null,
        Card: () => <Stub label="departments" />,
        required: true,
        desc: 'd',
      },
      {
        key: 'rates',
        label: 'Rates',
        short: 'Rates',
        icon: null,
        Card: () => <Stub label="rates" />,
        required: false,
        desc: 'r',
      },
    ],
  };
});

import ArenaGuideDialog from './ArenaGuideDialog';

const theme = createTheme();

function setup(props = {}) {
  const onClose = vi.fn();
  const onFinished = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <ArenaGuideDialog open onClose={onClose} onFinished={onFinished} {...props} />
    </ThemeProvider>
  );
  return { onClose, onFinished };
}

beforeEach(() => vi.clearAllMocks());

describe('ArenaGuideDialog', () => {
  it('shows the Arena header and no Steps/Chat toggle', async () => {
    setup();
    expect(await screen.findByText('Set up Arena')).toBeInTheDocument();
    expect(screen.getByText(/Connect your company/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Steps' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
  });

  it('opens at the step a caller names', async () => {
    setup({ initialStep: 'rates' });
    expect(await screen.findByTestId('card-rates')).toBeInTheDocument();
  });

  it('derives step completion from the server, storing nothing', async () => {
    setup();
    await screen.findByTestId('card-departments');
    expect(progressMock).toHaveBeenCalled();
  });

  it('closes from the header', async () => {
    const { onClose } = setup();
    await screen.findByText('Set up Arena');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onFinished and closes from the last step', async () => {
    const { onClose, onFinished } = setup({ initialStep: 'rates' });
    await screen.findByTestId('card-rates');
    fireEvent.click(screen.getByRole('button', { name: /Open the Arena/ }));
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
