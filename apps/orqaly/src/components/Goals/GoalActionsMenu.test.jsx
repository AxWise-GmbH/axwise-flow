/**
 * [module: frontend]
 * Tests for GoalActionsMenu section layout and toggle labels.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import GoalActionsMenu from './GoalActionsMenu';

const baseGoal = {
  id: 'g1',
  title: 'Test goal',
  status: 'active',
  autopilot_enabled: true,
  loop_enabled: false,
  workflow_id: null,
};

function renderMenu(props = {}) {
  const onClose = vi.fn();
  const onAction = vi.fn();
  const onOpenDialog = vi.fn();
  render(
    <ThemeProvider theme={createTheme()}>
      <GoalActionsMenu
        anchorEl={document.body}
        open
        onClose={onClose}
        goal={baseGoal}
        onAction={onAction}
        onOpenDialog={onOpenDialog}
        {...props}
      />
    </ThemeProvider>
  );
  return { onClose, onAction, onOpenDialog };
}

describe('GoalActionsMenu', () => {
  it('renders Organizations Control and Goal Settings section headers', () => {
    renderMenu();
    expect(screen.getByText('Organizations Control')).toBeInTheDocument();
    expect(screen.getByText('Goal Settings')).toBeInTheDocument();
  });

  it('lists org actions in order under Organizations Control', () => {
    renderMenu();
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    const orgIdx = items.indexOf('Adopt to New Business');
    const implementIdx = items.indexOf('Implement in Existing');
    const loopIdx = items.indexOf('Loop this request ON');
    const pulseIdx = items.indexOf('Add Pulse');
    const workflowIdx = items.findIndex((t) => t?.includes('Workflow'));
    expect(orgIdx).toBeGreaterThan(-1);
    expect(implementIdx).toBeGreaterThan(orgIdx);
    expect(loopIdx).toBeGreaterThan(implementIdx);
    expect(pulseIdx).toBeGreaterThan(loopIdx);
    expect(workflowIdx).toBeGreaterThan(pulseIdx);
  });

  it('shows Loop ON when loop is disabled and OFF when enabled', () => {
    renderMenu();
    expect(screen.getByText('Loop this request ON')).toBeInTheDocument();

    render(
      <ThemeProvider theme={createTheme()}>
        <GoalActionsMenu
          anchorEl={document.body}
          open
          onClose={vi.fn()}
          goal={{ ...baseGoal, loop_enabled: true }}
          onAction={vi.fn()}
          onOpenDialog={vi.fn()}
        />
      </ThemeProvider>
    );
    expect(screen.getByText('Loop this request OFF')).toBeInTheDocument();
  });

  it('shows Review continuation when continuation_goal_id is set', () => {
    renderMenu({
      goal: { ...baseGoal, continuation_goal_id: 'child-1' },
      onOpenContinuation: vi.fn(),
    });
    expect(screen.getByText('Review continuation →')).toBeInTheDocument();
  });

  it('renders Talk with Team-Lead as a glowing button at the bottom of the menu', () => {
    renderMenu();
    const btn = screen.getByRole('button', { name: /Talk with Team-Lead/i });
    expect(btn).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(items.some((t) => t?.includes('Talk with Team-Lead'))).toBe(false);
  });

  it('calls onOpenDialog for leadChat when glowing button is clicked', () => {
    const { onClose, onOpenDialog } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Talk with Team-Lead/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenDialog).toHaveBeenCalledWith('leadChat');
  });

  it('calls onOpenDialog for adopt action', () => {
    const { onClose, onOpenDialog } = renderMenu();
    fireEvent.click(screen.getByText('Adopt to New Business'));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenDialog).toHaveBeenCalledWith('adopt');
  });

  it('shows the Goal View Short/Full toggle (both modes) and toggles full view', () => {
    const onToggleFullView = vi.fn();
    renderMenu({ fullView: false, onToggleFullView });
    expect(screen.getByText('Goal View')).toBeInTheDocument();
    expect(screen.getByText('Short')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Full'));
    expect(onToggleFullView).toHaveBeenCalled();
  });

  // The Simple goal thread answers both of these on screen: the run header has
  // its own Thread/Dashboard switch, and the composer under the thread sends
  // straight to the team lead. Offering them again from a menu is a second,
  // worse route to something the user is already looking at.
  describe('in the Simple goal thread', () => {
    it('drops the Goal View toggle, which the run header already owns', () => {
      renderMenu({ simple: true });
      expect(screen.queryByText('Goal View')).toBeNull();
      expect(screen.queryByText('Short')).toBeNull();
      expect(screen.queryByText('Full')).toBeNull();
    });

    it('drops Talk with Team-Lead, which the composer already is', () => {
      renderMenu({ simple: true });
      expect(screen.queryByText('Talk with Team-Lead')).toBeNull();
    });

    it('keeps everything else the menu is for', () => {
      renderMenu({ simple: true });
      expect(screen.getByText('Organizations Control')).toBeInTheDocument();
      expect(screen.getByText('Goal Settings')).toBeInTheDocument();
      expect(screen.getByText('Adopt to New Business')).toBeInTheDocument();
      expect(screen.getByText('Remove Goal')).toBeInTheDocument();
    });

    it('leaves the advanced menu untouched', () => {
      renderMenu();
      expect(screen.getByText('Goal View')).toBeInTheDocument();
      expect(screen.getByText('Talk with Team-Lead')).toBeInTheDocument();
    });
  });
});
