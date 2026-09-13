import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import TechTrust from './TechTrust';

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe('TechTrust landing section', () => {
  it('renders the section headline and intro copy', () => {
    renderWithTheme(<TechTrust />);
    expect(screen.getByText('Your : Keys & Storage')).toBeInTheDocument();
    expect(screen.getByText('Your setup - Your Rules')).toBeInTheDocument();
    expect(
      screen.getByText('Stay independent. Connect your own cloud storage, databases.')
    ).toBeInTheDocument();
  });

  it('renders both pillar titles', () => {
    renderWithTheme(<TechTrust />);
    expect(screen.getByText(/You Control/i)).toBeInTheDocument();
    expect(screen.getByText(/Add and customize/i)).toBeInTheDocument();
  });

  it('renders the VirusTotal proof tile under pillar 2', () => {
    renderWithTheme(<TechTrust />);
    expect(screen.getByText('VirusTotal pass.')).toBeInTheDocument();
  });

  it('renders the reassurance band', () => {
    renderWithTheme(<TechTrust />);
    expect(screen.getByText(/No vendor lock-in/i)).toBeInTheDocument();
  });
});
