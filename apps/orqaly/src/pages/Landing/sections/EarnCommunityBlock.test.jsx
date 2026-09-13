import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import EarnCommunityBlock from './EarnCommunityBlock';
import { EARN_HERO, EARN_PILLARS } from '../../../data/earnEconomy';

function renderBlock() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <EarnCommunityBlock />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('EarnCommunityBlock', () => {
  it('renders the section hero title', () => {
    renderBlock();
    expect(screen.getByText(EARN_HERO.title)).toBeInTheDocument();
  });

  it('hides pillar headings until Explore more is clicked', () => {
    renderBlock();
    EARN_PILLARS.forEach((pillar) => {
      expect(screen.getByText(pillar.title)).not.toBeVisible();
    });
    fireEvent.click(screen.getByRole('button', { name: /Explore more/i }));
    EARN_PILLARS.forEach((pillar) => {
      expect(screen.getByText(pillar.title)).toBeVisible();
    });
  });

  it('links to the full earn page when expanded', () => {
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: /Explore more/i }));
    const link = screen.getByRole('link', { name: /See full earn page/i });
    expect(link.getAttribute('href')).toBe('/earn');
  });

  it('links to signup for contributors when expanded', () => {
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: /Explore more/i }));
    const link = screen.getByRole('link', { name: /Start contributing/i });
    expect(link.getAttribute('href')).toBe('/signup');
  });
});
