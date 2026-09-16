import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoInvestorStack from './DemoInvestorStack';

describe('DemoInvestorStack', () => {
  it('renders stack header and pipeline steps', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoInvestorStack />
      </ThemeProvider>,
    );
    expect(screen.getByText('Orqaly stack')).toBeInTheDocument();
    expect(screen.getByText('From intent to revenue in one platform')).toBeInTheDocument();
    expect(screen.getByText('Council plans & votes')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Create virtual or real')).toBeInTheDocument();
    expect(screen.getByText('Second Brain')).toBeInTheDocument();
    expect(screen.getByText('Information in one place')).toBeInTheDocument();
    expect(screen.getByLabelText(/Orqaly platform stack/i)).toBeInTheDocument();
  });
});
