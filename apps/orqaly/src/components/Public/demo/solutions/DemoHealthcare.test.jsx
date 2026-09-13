import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { DemoHealthcareHub } from './DemoHealthcare';

describe('DemoHealthcareHub', () => {
  it('renders voice agent metrics', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoHealthcareHub />
      </ThemeProvider>,
    );
    expect(screen.getByText(/Triage voice agent/i)).toBeInTheDocument();
    expect(screen.getAllByText(/142 calls today/i).length).toBeGreaterThanOrEqual(1);
  });
});
