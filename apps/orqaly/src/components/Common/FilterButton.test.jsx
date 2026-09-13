import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import FilterButton from './FilterButton';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe('FilterButton', () => {
  it('renders a button with the default tooltip aria-label', () => {
    renderWithTheme(<FilterButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('reflects the active count in the aria-label', () => {
    renderWithTheme(<FilterButton onClick={() => {}} count={3} tooltip="Filters & layout" />);
    expect(screen.getByRole('button', { name: 'Filters & layout, 3 active' })).toBeInTheDocument();
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    renderWithTheme(<FilterButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
