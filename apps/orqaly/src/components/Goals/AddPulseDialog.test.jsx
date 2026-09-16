/**
 * [module: frontend]
 * Tests for AddPulseDialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import AddPulseDialog from './AddPulseDialog';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, children, title, actions }) =>
    open ? (
      <div data-testid="form-dialog">
        <h2>{title}</h2>
        {children}
        <div>{actions}</div>
      </div>
    ) : null,
  FORM_FIELD_SX: {},
}));

vi.mock('../Pulse/PulseScheduleFields', () => ({
  default: () => <div data-testid="schedule-fields">Schedule</div>,
}));

vi.mock('../../services/pulseScheduleService', () => ({
  createGoalPulseSchedule: vi.fn(),
  firePulseNow: vi.fn(),
}));

vi.mock('../../services/conciliumService', () => ({
  getAllConcilium: vi.fn(),
}));

import { createGoalPulseSchedule, firePulseNow } from '../../services/pulseScheduleService';
import { getAllConcilium } from '../../services/conciliumService';

const goal = { id: 'g1', title: 'Ship feature', concilium_id: 'c1', agent_team_id: 't1' };

function renderDialog(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <AddPulseDialog open onClose={vi.fn()} goal={goal} onSuccess={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

describe('AddPulseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllConcilium.mockResolvedValue([{ id: 'c1', name: 'Main Board' }]);
    createGoalPulseSchedule.mockResolvedValue({ id: 'pulse-1' });
    firePulseNow.mockResolvedValue({ goalIds: ['g2'], status: 'done' });
  });

  it('renders same team and consilium options', async () => {
    renderDialog();
    expect(screen.getByText('Same team')).toBeInTheDocument();
    expect(screen.getByText(/Consilium picks agents/i)).toBeInTheDocument();
    expect(screen.getByTestId('schedule-fields')).toBeInTheDocument();
  });

  it('creates pulse schedule and fires immediately with same_team by default', async () => {
    renderDialog();
    fireEvent.click(screen.getByText('Start Pulse'));
    await waitFor(() => {
      expect(createGoalPulseSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          goal,
          mode: 'same_team',
          scheduleKind: 'once',
        })
      );
      expect(firePulseNow).toHaveBeenCalledWith('pulse-1');
    });
  });

  it('creates consilium pulse with board id', async () => {
    renderDialog();
    await waitFor(() => expect(getAllConcilium).toHaveBeenCalled());
    fireEvent.click(screen.getByDisplayValue('consilium'));
    fireEvent.click(screen.getByText('Start Pulse'));
    await waitFor(() => {
      expect(createGoalPulseSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          goal,
          mode: 'consilium',
          conciliumId: 'c1',
        })
      );
    });
  });
});
