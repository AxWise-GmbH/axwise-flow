import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import HowItWorks from './HowItWorks';

function renderSection() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <HowItWorks />
    </ThemeProvider>
  );
}

describe('HowItWorks section', () => {
  it('renders section heading', () => {
    renderSection();
    expect(screen.getByText('Just Ask & Watch')).toBeInTheDocument();
  });

  it('exposes a touch-scrollable mobile steps list', () => {
    renderSection();
    const region = screen.getByRole('region', { name: 'How Orqaly works in five steps' });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('Define');
    expect(region).toHaveTextContent('Where you want');
  });
});
