import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EmptyState from '../EmptyState';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe('EmptyState', () => {
  it('renders title + description', () => {
    renderWithTheme(<EmptyState title="Nothing here" description="Add something." />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Add something.')).toBeInTheDocument();
  });

  it('accepts icon as a component reference (preferred form)', () => {
    expect(() => renderWithTheme(<EmptyState icon={InfoOutlinedIcon} title="x" />)).not.toThrow();
  });

  it('accepts icon as a rendered JSX element (defensive form)', () => {
    expect(() =>
      renderWithTheme(<EmptyState icon={<InfoOutlinedIcon sx={{ fontSize: 48 }} />} title="x" />)
    ).not.toThrow();
  });

  it('renders without an icon', () => {
    expect(() => renderWithTheme(<EmptyState title="x" />)).not.toThrow();
  });
});
