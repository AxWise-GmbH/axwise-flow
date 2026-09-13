import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DecisionPanel from './DecisionPanel';

const theme = createTheme();

function dept(over = {}) {
  return {
    id: 'marketing',
    label: 'Marketing',
    stakes: 'low',
    monthlyVolume: 108,
    recommendation: 'hand_over',
    confidence: 'good',
    reasons: ['Agents won 34 of 41 decided jobs.'],
    stats: {
      n: 41,
      winRate: 0.83,
      coverage: 0.38,
      avgStars: { people: 3.8, agents: 4.6 },
      avgCost: { people: 142, agents: 0.35 },
      avgMinutes: { people: 190, agents: 4 },
      reworkRate: { people: 0.08, agents: 0.04 },
    },
    money: { projectedSaving: 12200, capacityReleasedHours: 285, monthlyAgentSpend: 14 },
    ...over,
  };
}

function setup(departments, extra = {}) {
  const onSetRates = vi.fn();
  const onOpenDepartment = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <DecisionPanel
        decision={{ departments, advisoryOnly: true }}
        onSetRates={onSetRates}
        onOpenDepartment={onOpenDepartment}
        {...extra}
      />
    </ThemeProvider>
  );
  return { onSetRates, onOpenDepartment };
}

describe('DecisionPanel', () => {
  it('states the recommendation and its confidence', () => {
    setup([dept()]);
    expect(screen.getByText('Hand over')).toBeInTheDocument();
    expect(screen.getByText('confidence good')).toBeInTheDocument();
  });

  it('shows every number behind the call, so it can be argued with', () => {
    setup([dept()]);
    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
    expect(screen.getByText('3.8 / 4.6')).toBeInTheDocument();
    expect(screen.getByText('€142.00 → €0.35')).toBeInTheDocument();
  });

  it('labels the projection as a projection per month', () => {
    setup([dept()]);
    expect(screen.getByText('projected saving / month')).toBeInTheDocument();
    expect(screen.getByText('€12,200')).toBeInTheDocument();
    expect(screen.getByText('285 h')).toBeInTheDocument();
  });

  it('says out loud that it never acts on its own', () => {
    setup([dept()]);
    expect(screen.getByText(/never reassigns work by itself/i)).toBeInTheDocument();
  });

  it('warns against acting on a thin keep-human call', () => {
    setup([dept({ recommendation: 'keep_human', confidence: 'low', stakes: 'high' })]);
    expect(screen.getByText(/Do not act on this yet/i)).toBeInTheDocument();
    expect(screen.getByText('high stakes')).toBeInTheDocument();
  });

  it('hides the detail grid for a department with too little evidence', () => {
    setup([dept({ recommendation: 'not_enough_yet', reasons: ['Only 2 jobs compared.'] })]);
    expect(screen.getByText('Not enough yet')).toBeInTheDocument();
    expect(screen.queryByText('jobs compared')).not.toBeInTheDocument();
  });

  it('asks for rates when no money could be worked out', () => {
    const { onSetRates } = setup([
      dept({ money: { projectedSaving: null, capacityReleasedHours: null } }),
    ]);
    expect(screen.getByText(/does not know what your people cost/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Set what people cost/i }));
    expect(onSetRates).toHaveBeenCalledTimes(1);
  });

  it('jumps to the jobs behind a department', () => {
    const { onOpenDepartment } = setup([dept()]);
    fireEvent.click(screen.getByRole('button', { name: /See the jobs/i }));
    expect(onOpenDepartment).toHaveBeenCalledWith('marketing');
  });

  it('says there is nothing to decide when nothing has been compared', () => {
    setup([dept({ stats: { n: 0 }, recommendation: 'not_enough_yet', money: {} })]);
    expect(screen.getByText('Nothing to decide yet')).toBeInTheDocument();
  });
});
