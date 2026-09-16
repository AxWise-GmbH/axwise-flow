/**
 * [module: frontend]
 *
 * The running goal's Actions menu, in the fixed top bar. It exists because the
 * thread's own header scrolls with the conversation, taking the only control
 * that can pause or cancel the goal with it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TopBarGoalActions from './TopBarGoalActions';
import { RunningGoalProvider, usePublishRunningGoal } from '../../context/RunningGoalContext';
import { getGoalSetup, setGoalSetupOrg, setGoalSetupTarget } from '../../hooks/useGoalSetup';
import { getOpenGoalId, setOpenGoalId } from '../../hooks/useOpenGoal';

vi.mock('../../services/goalService', () => ({
  cancelGoal: vi.fn(),
  pauseGoal: vi.fn(),
  resumeGoal: vi.fn(),
  toggleAutopilot: vi.fn(),
  toggleLoop: vi.fn(),
}));

const goal = {
  id: 'g1',
  title: 'Wedding invites',
  status: 'active',
  autopilot_enabled: true,
  loop_enabled: false,
};

function Publisher({ value, handlers }) {
  usePublishRunningGoal(value, handlers);
  return null;
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function setup({ value = goal, handlers = {}, initialEntries = ['/home'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider theme={createTheme()}>
        <RunningGoalProvider>
          <TopBarGoalActions />
          <Publisher value={value} handlers={handlers} />
          <LocationProbe />
        </RunningGoalProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('TopBarGoalActions', () => {
  // Most of the time nobody is watching a goal, and a permanent dead button in
  // the corner of every page would be worse than no button.
  it('shows nothing until a page publishes a goal', () => {
    setup({ value: null });
    expect(screen.queryByRole('button', { name: /Actions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /New/i })).toBeNull();
  });

  // The deliberate way out of a goal, labelled rather than a bare +. It hands
  // the surface back its empty composer; the run it leaves keeps going and
  // History reopens it.
  it('starts a new goal by handing the surface back', () => {
    const onLeave = vi.fn();
    setup({ handlers: { onLeave } });
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/job-pool?action=create');
  });

  it('clears the open goal and inherited setup before opening a clean composer', () => {
    setOpenGoalId('g1');
    setGoalSetupOrg('org-1');
    setGoalSetupTarget({ type: 'team', id: 'team-1', label: 'Old team' });

    setup({ handlers: {} });
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));

    expect(getOpenGoalId()).toBeNull();
    expect(getGoalSetup()).toEqual({ orgId: null, target: null });
    expect(screen.getByTestId('location')).toHaveTextContent('/job-pool?action=create');
  });

  it('offers the goal actions once one is published', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Actions/i }));
    expect(screen.getByRole('menuitem', { name: /Cancel Goal/i })).toBeInTheDocument();
    expect(screen.getByText('Adopt to New Business')).toBeInTheDocument();
  });

  // It opens the Simple menu: both of these are answered on screen in the
  // thread, and a menu offering a second route to them is a worse route.
  it('opens the Simple menu, without the view toggle or the lead chat', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Actions/i }));
    expect(screen.queryByText('Goal View')).toBeNull();
    expect(screen.queryByText('Talk with Team-Lead')).toBeNull();
  });

  it('hands the full goal view back to the page that published it', () => {
    const onOpenGoal = vi.fn();
    setup({ handlers: { onOpenGoal } });
    fireEvent.click(screen.getByRole('button', { name: /Actions/i }));
    fireEvent.click(screen.getByText('Adopt to New Business'));
    expect(onOpenGoal).toHaveBeenCalledWith('g1');
  });
});
