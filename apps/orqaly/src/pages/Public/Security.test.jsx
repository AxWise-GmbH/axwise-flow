import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import { HERO, PILLARS, OPERATED_STACK, DISCLOSURE } from '../../data/security';
import { PROVIDERS } from '../../data/providerCatalog';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

import SecurityPage from './Security';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <SecurityPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('Security public page', () => {
  it('renders hero and trust stats', () => {
    renderPage();
    expect(screen.getByText(HERO.title)).toBeInTheDocument();
    expect(screen.getByText('on every table')).toBeInTheDocument();
    expect(screen.getByText('file scanning')).toBeInTheDocument();
  });

  it('renders security pillars', () => {
    renderPage();
    PILLARS.forEach((pillar) => {
      expect(screen.getByText(pillar.title)).toBeInTheDocument();
    });
  });

  it('renders operated technology stack', () => {
    renderPage();
    expect(screen.getByText('Technology we run on')).toBeInTheDocument();
    OPERATED_STACK.forEach((group) => {
      expect(screen.getByText(group.category)).toBeInTheDocument();
    });
    expect(screen.getAllByText('Vercel').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Supabase').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Stripe Connect').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('VirusTotal').length).toBeGreaterThanOrEqual(2);
  });

  it('renders BYOK integrations catalog from provider catalog', () => {
    renderPage();
    expect(screen.getByText('BYOK integrations catalog')).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(`${PROVIDERS.length}\\+ providers`, 'i')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Composio API Key')).toBeInTheDocument();
  });

  it('renders stack demo and disclosure email', () => {
    renderPage();
    expect(screen.getByText('Production stack')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: DISCLOSURE.email })).toHaveAttribute(
      'href',
      `mailto:${DISCLOSURE.email}`,
    );
  });

  it('renders hero CTA', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Talk to security/i })).toHaveAttribute('href', '/contact');
    expect(screen.queryByText('Need a security review?')).not.toBeInTheDocument();
  });
});
