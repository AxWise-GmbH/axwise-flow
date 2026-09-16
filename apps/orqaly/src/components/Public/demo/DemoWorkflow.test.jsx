import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoWorkflow from './DemoWorkflow';

describe('DemoWorkflow', () => {
  it('renders workflow canvas label', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoWorkflow />
      </ThemeProvider>,
    );
    expect(screen.getByText(/Workflow · Refund auto-handler/i)).toBeInTheDocument();
  });
});
