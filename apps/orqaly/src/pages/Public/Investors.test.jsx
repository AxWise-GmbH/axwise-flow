import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

import Investors from './Investors';
import { HERO, INVESTOR_EMAIL, INVESTOR_FAQ } from '../Landing/data/investor';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <Investors />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public Investors page', () => {
  it('renders hero headline from investor data', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: HERO.headline })).toBeInTheDocument();
  });

  it('renders investor stack diagram labels', () => {
    renderPage();
    expect(screen.getByText('Orqaly stack')).toBeInTheDocument();
    expect(screen.getByText('From intent to revenue in one platform')).toBeInTheDocument();
    expect(screen.getByText('Council plans & votes')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Second Brain')).toBeInTheDocument();
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
  });

  it('renders competitive comparison table', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /Orqaly vs alternatives/i });
    expect(table).toBeInTheDocument();
    expect(table.querySelector('th')?.textContent).toContain('Capability');
  });

  it('renders product spotlights and FAQ', () => {
    renderPage();
    expect(screen.getByText('Consilium for Strategic Decisions')).toBeInTheDocument();
    expect(screen.getByText(INVESTOR_FAQ[0].q)).toBeInTheDocument();
  });

  it('links email CTA to mailto', () => {
    renderPage();
    const mailLinks = screen.getAllByRole('link', { name: INVESTOR_EMAIL });
    expect(mailLinks.length).toBeGreaterThanOrEqual(1);
    expect(mailLinks[0]).toHaveAttribute('href', expect.stringContaining('mailto:invest@orqaly.com'));
  });

  it('sets document title', () => {
    renderPage();
    expect(document.title).toBe('For investors - Orqaly');
  });
});
