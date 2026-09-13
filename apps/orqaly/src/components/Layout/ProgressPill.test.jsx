import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ProgressPill from './ProgressPill';

const theme = createTheme();
const r = (props) =>
  render(
    <ThemeProvider theme={theme}>
      <ProgressPill {...props} />
    </ThemeProvider>
  );

describe('ProgressPill', () => {
  it('renders the label, the done/total counter, and the subtitle', () => {
    r({ label: 'Organizations', done: 1, total: 4, subtitle: '1 of 4 steps' });
    expect(screen.getByText('Organizations')).toBeTruthy();
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByText('1 of 4 steps')).toBeTruthy();
  });

  it('shows a loading state', () => {
    r({ label: 'Setup', done: 0, total: 5, loading: true, subtitle: 'ignored' });
    expect(screen.getByText('…')).toBeTruthy();
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows a complete state when allDone', () => {
    r({ label: 'Setup', done: 5, total: 5, allDone: true, subtitle: 'ignored' });
    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByText('Complete ✓')).toBeTruthy();
  });

  it('colours the progress arc from the theme accent', () => {
    const red = createTheme({ palette: { primary: { main: '#DC2626' } } });
    const { container } = render(
      <ThemeProvider theme={red}>
        <ProgressPill label="X" done={1} total={2} subtitle="s" />
      </ThemeProvider>
    );
    const arc = container.querySelector('circle[stroke-linecap="round"]');
    expect(arc.getAttribute('stroke')).toBe('#DC2626');
  });
});
