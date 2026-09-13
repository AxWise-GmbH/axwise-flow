import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import GoalProgressRail, {
  railIndex,
  RAIL_STAGES,
  SCOPE_FIRST_RAIL_STAGES,
} from './GoalProgressRail';

const theme = createTheme();
const show = (props) =>
  render(
    <ThemeProvider theme={theme}>
      <GoalProgressRail {...props} />
    </ThemeProvider>
  );

describe('railIndex', () => {
  it('maps each pipeline status to its own stage', () => {
    RAIL_STAGES.forEach((stage, i) => expect(railIndex(stage.key)).toBe(i));
  });

  it('counts a finished goal as past the last stage', () => {
    expect(railIndex('completed')).toBe(RAIL_STAGES.length);
  });

  it('marks a stopped goal as off the rail entirely', () => {
    expect(railIndex('failed')).toBe(-1);
    expect(railIndex('cancelled')).toBe(-1);
  });

  // A goal waiting on the user has not moved past the stage it is waiting in.
  it('holds a waiting goal at the stage it is parked in', () => {
    expect(railIndex('awaiting_context_approval')).toBe(2);
    expect(railIndex('awaiting_tools')).toBe(5);
    expect(railIndex('awaiting_approval')).toBe(6);
  });

  it('falls back to the first stage for anything unrecognised', () => {
    expect(railIndex('some_new_status')).toBe(0);
    expect(railIndex(undefined)).toBe(0);
  });

  it('maps Smart Request scope admission ahead of the legacy feasibility fallback', () => {
    expect(railIndex('analyzing', true)).toBe(0);
    expect(railIndex('awaiting_context_approval', true)).toBe(0);
    expect(railIndex('feasibility', true)).toBe(0);
    expect(railIndex('planning', true)).toBe(2);
    expect(railIndex('completed', true)).toBe(SCOPE_FIRST_RAIL_STAGES.length);
  });
});

describe('GoalProgressRail', () => {
  it('says how far along the run is', () => {
    show({ status: 'planning' });
    expect(screen.getByText('Stage 4 of 9')).toBeInTheDocument();
  });

  it('names the stage currently in flight', () => {
    show({ status: 'forming_team' });
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Agents and roles')).toBeInTheDocument();
  });

  it('shows the scope-first Smart Request sequence without pretending feasibility already ran', () => {
    show({ status: 'analyzing', scopeFirst: true });
    expect(screen.getByText('Stage 1 of 8')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Outcome, assumptions, constraints')).toBeInTheDocument();
  });

  it('says so when every stage is done', () => {
    show({ status: 'completed' });
    expect(screen.getByText('All stages done')).toBeInTheDocument();
  });

  it('says so when the run stopped', () => {
    show({ status: 'failed' });
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('shows an estimate while there is still work left', () => {
    show({ status: 'planning', eta: '~2m 10s' });
    expect(screen.getByText('~2m 10s')).toBeInTheDocument();
  });

  it('drops the estimate once the run is over', () => {
    show({ status: 'completed', eta: '~2m 10s' });
    expect(screen.queryByText('~2m 10s')).toBeNull();
  });

  // The bar answers "how far along"; the list answers "which stage", and only
  // one of those is needed at a glance.
  it('keeps the full stage list behind a disclosure', () => {
    show({ status: 'planning' });
    const toggle = screen.getByRole('button', { name: /All stages/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    RAIL_STAGES.forEach((stage) => {
      expect(screen.getAllByText(stage.label).length).toBeGreaterThan(0);
    });
  });

  // The stage arrays this mirrors carry emoji; this design has none.
  it('carries no emoji', () => {
    const { container } = show({ status: 'planning' });
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('renders without a status rather than throwing', () => {
    expect(() => show({})).not.toThrow();
  });
});
