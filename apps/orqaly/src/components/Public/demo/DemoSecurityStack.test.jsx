import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoSecurityStack from './DemoSecurityStack';

describe('DemoSecurityStack', () => {
  it('renders layered stack labels', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoSecurityStack />
      </ThemeProvider>,
    );
    expect(screen.getByText('Production stack')).toBeInTheDocument();
    expect(screen.getByText('Edge & app')).toBeInTheDocument();
    expect(screen.getByText('Vercel')).toBeInTheDocument();
    expect(screen.getByText('VirusTotal')).toBeInTheDocument();
  });
});
