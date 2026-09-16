import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import MarketplacePublic from './MarketplacePublic';
import { MARKETPLACE_PILLARS } from '../../data/marketplacePreviewPage';
import { MARKETPLACE_PUBLIC_CATEGORIES } from '../../data/marketplaceCategories';

const INTRO_REMOVED =
  'The marketplace is organized by category so you can find exactly what you need';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <MarketplacePublic />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public MarketplacePublic', () => {
  it('renders the marketplace hub hero copy', () => {
    renderPage();
    expect(screen.getAllByText('Browse, install, upload, and publish in one place.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Seven category tabs in \/marketplace/i)).toBeInTheDocument();
    expect(screen.getByText('Agent marketplace')).toBeInTheDocument();
  });

  it('renders hub pillars and category links', () => {
    renderPage();
    MARKETPLACE_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Categories in the app')).toBeInTheDocument();
    MARKETPLACE_PUBLIC_CATEGORIES.forEach((cat) => {
      expect(screen.getAllByText(cat.label).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders lifecycle spotlights', () => {
    renderPage();
    expect(screen.getByText(/Seven tabs\. One marketplace/i)).toBeInTheDocument();
    expect(screen.getByText(/From listing to live agent/i)).toBeInTheDocument();
    expect(screen.getByText('Bring agents, tools, and knowledge.')).toBeInTheDocument();
    expect(screen.getByText(/Ship listings\. Earn crypto/i)).toBeInTheDocument();
    expect(screen.getByText('Builders earn crypto')).toBeInTheDocument();
  });

  it('does not render removed intro sections', () => {
    renderPage();
    expect(screen.queryByText(INTRO_REMOVED, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('Select or Upload')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Builders keep 85%/i)).not.toBeInTheDocument();
  });

  it('links browse CTAs to the in-app marketplace', () => {
    renderPage();
    const browseLinks = screen.getAllByRole('link', { name: /Browse marketplace/i });
    expect(browseLinks.length).toBeGreaterThanOrEqual(1);
    browseLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/marketplace');
    });
  });
});
