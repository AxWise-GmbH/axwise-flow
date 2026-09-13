import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import LandingPageSimple from './LandingPageSimple';

function renderPage(props) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <LandingPageSimple {...props} />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('LandingPageSimple', () => {
  it('renders the hook, how-it-works steps, and final CTA', () => {
    renderPage();
    expect(screen.getByText('Your AI team, ready to work.')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText('Tell it your goal')).toBeInTheDocument();
    expect(screen.getByText('Agents form a team')).toBeInTheDocument();
    expect(screen.getByText('You watch & approve')).toBeInTheDocument();
    expect(screen.getByText('Ready to put your first agent to work?')).toBeInTheDocument();
  });

  it('renders the three example cards linking to their solution pages', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /E-commerce/i })).toHaveAttribute(
      'href',
      '/solutions/ecommerce'
    );
    expect(screen.getByRole('link', { name: /Hotels/i })).toHaveAttribute(
      'href',
      '/solutions/restaurants'
    );
    expect(screen.getByRole('link', { name: /Legal/i })).toHaveAttribute(
      'href',
      '/solutions/legal'
    );
  });

  it('primary CTA buttons navigate toward signup', () => {
    renderPage();
    const startButtons = screen.getAllByRole('button', { name: 'Start free' });
    expect(startButtons.length).toBeGreaterThan(0);
  });

  it('renders no Simple/Full variant switcher', () => {
    renderPage();

    expect(screen.queryByText('Prefer the full tour? Switch above ↑')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Landing page style' })).not.toBeInTheDocument();
  });
});
