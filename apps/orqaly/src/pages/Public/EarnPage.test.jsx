import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

import EarnPage from './EarnPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <EarnPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('EarnPage public page', () => {
  it('renders the hero title', () => {
    renderPage();
    expect(screen.getByText('Share and Earn')).toBeInTheDocument();
  });

  it('renders hero CTAs', () => {
    renderPage();
    expect(screen.getAllByRole('link', { name: /Start contributing/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Join USDT waitlist/i }).length).toBeGreaterThan(0);
  });

  it('renders all four earning pillars', () => {
    renderPage();
    expect(screen.getByText('You serve. They bring their keys.')).toBeInTheDocument();
    expect(screen.getByText('Build for other users, publish to earn')).toBeInTheDocument();
    expect(screen.getByText('Share storage with other members')).toBeInTheDocument();
    expect(screen.getByText('Peer earnings, settled on-chain')).toBeInTheDocument();
  });

  it('renders the closing CTA', () => {
    renderPage();
    expect(screen.getByText('Users serve users. Orqaly connects the dots.')).toBeInTheDocument();
  });

  it('sets document.title', () => {
    renderPage();
    expect(document.title).toBe('Earn with Orqaly - Orqaly');
  });
});
