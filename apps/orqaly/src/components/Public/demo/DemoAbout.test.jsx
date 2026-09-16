import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoAbout from './DemoAbout';

describe('DemoAbout', () => {
  it('renders workspace overview copy', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoAbout />
      </ThemeProvider>,
    );
    expect(screen.getByText('Operating system for goals')).toBeInTheDocument();
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText('Council')).toBeInTheDocument();
    expect(screen.getByText('Deliverable')).toBeInTheDocument();
  });
});
