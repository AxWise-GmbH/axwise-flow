/**
 * [module: frontend]
 * Smoke test — PulseScheduleFields must render without ReferenceError.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import PulseScheduleFields from './PulseScheduleFields';

describe('PulseScheduleFields', () => {
  it('renders frequency select without SCHEDULE_KINDS ReferenceError', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <PulseScheduleFields
          scheduleKind="once"
          onScheduleKindChange={() => {}}
          runAt="2026-05-30T21:00"
          onRunAtChange={() => {}}
          timeOfDay="09:00"
          onTimeOfDayChange={() => {}}
          weekday={1}
          onWeekdayChange={() => {}}
          dayOfMonth={1}
          onDayOfMonthChange={() => {}}
        />
      </ThemeProvider>
    );
    expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
    expect(screen.getByLabelText('Date & time')).toBeInTheDocument();
  });
});
