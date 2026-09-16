import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ArenaStatusCard from './ArenaStatusCard';

const theme = createTheme();

const ARENA = {
  compared: 11,
  wins: { people: 4, agents: 6, tie: 1 },
  savedMoney: 412,
  savedMinutes: 560,
  departments: [
    { id: 'marketing', label: 'Marketing', people: 1, agents: 4, n: 5 },
    { id: 'legal', label: 'Legal', people: 2, agents: 0, n: 2 },
    { id: 'management', label: 'Management', people: 0, agents: 0, n: 0 },
  ],
  headline: 'Marketing looks ready to hand over',
  warning: 'Legal still needs people',
};

function setup(props = {}) {
  const onSetUp = vi.fn();
  const onOpen = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <ArenaStatusCard onSetUp={onSetUp} onOpen={onOpen} {...props} />
    </ThemeProvider>
  );
  return { onSetUp, onOpen };
}

describe('ArenaStatusCard before setup', () => {
  it('invites the user to set Arena up', () => {
    setup({ arena: null });
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    expect(screen.getByText(/same daily jobs/i)).toBeInTheDocument();
  });

  it('fires onSetUp so the page can open on the department picker', () => {
    const { onSetUp } = setup({ arena: null });
    fireEvent.click(screen.getByRole('button', { name: /Set up Arena/i }));
    expect(onSetUp).toHaveBeenCalledTimes(1);
  });

  it('shows no scoreboard when there is nothing to score', () => {
    setup({ arena: null });
    expect(screen.queryByText('Marketing')).not.toBeInTheDocument();
  });
});

describe('ArenaStatusCard once set up', () => {
  it('reports the week back to the console', () => {
    setup({ arena: ARENA });
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('€412.00')).toBeInTheDocument();
  });

  it('lists every department with its score', () => {
    setup({ arena: ARENA });
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText('1 - 4')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('2 - 0')).toBeInTheDocument();
  });

  it('says so plainly when a department has no jobs yet', () => {
    setup({ arena: ARENA });
    expect(screen.getByText('no jobs yet')).toBeInTheDocument();
  });

  it('surfaces the most actionable headline and the risk', () => {
    setup({ arena: ARENA });
    expect(screen.getByText(/ready to hand over/)).toBeInTheDocument();
    expect(screen.getByText(/still needs people/)).toBeInTheDocument();
  });

  it('opens Arena from the header', () => {
    const { onOpen } = setup({ arena: ARENA });
    fireEvent.click(screen.getByRole('button', { name: /Open/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves money out entirely when no rate resolved, rather than showing zero', () => {
    setup({ arena: { ...ARENA, savedMoney: null, savedMinutes: null } });
    expect(screen.queryByText(/agents saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText('€0.00')).not.toBeInTheDocument();
  });
});
