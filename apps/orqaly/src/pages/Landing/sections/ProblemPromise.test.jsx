import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import ProblemPromise from './ProblemPromise';

function renderSection() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <div data-landing-root>
          <ProblemPromise />
        </div>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('ProblemPromise section', () => {
  it('renders comparison headline copy', () => {
    renderSection();
    expect(screen.getByText('AI tools today are toys.')).toBeInTheDocument();
    expect(screen.getByText('Orqaly is a workforce.')).toBeInTheDocument();
  });

  it('links to the Simple Mode control page', () => {
    renderSection();
    expect(screen.getByRole('link', { name: 'View Simple Mode' })).toHaveAttribute(
      'href',
      '/control/simple-mode'
    );
  });

  it('exposes a touch-scrollable mobile comparison list', () => {
    renderSection();
    const region = screen.getByRole('region', { name: 'How Orqaly compares to typical AI tools' });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('One-shot prompts');
    expect(region).toHaveTextContent('Goal with Results.');
  });
});
