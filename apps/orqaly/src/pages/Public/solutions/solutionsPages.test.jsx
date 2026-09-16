import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import { SOLUTION_PAGES } from './index';
import { getSolutionPageData } from '../../../data/solutions';
import { PERSONA_BY_SLUG } from '../../../data/personas';

function renderPage(Page) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Solutions industry pages', () => {
  Object.entries(SOLUTION_PAGES).forEach(([slug, Page]) => {
    const data = getSolutionPageData(slug);
    const persona = PERSONA_BY_SLUG[slug];

    it(`${slug} renders hero and hub intro`, () => {
      renderPage(Page);
      expect(screen.getAllByText(persona.hero.title).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(data.hubIntro.title).length).toBeGreaterThanOrEqual(1);
    });

    it(`${slug} renders four pillars`, () => {
      renderPage(Page);
      data.pillars.forEach((p) => {
        expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
      });
    });

    it(`${slug} renders closing CTA`, () => {
      renderPage(Page);
      expect(screen.getByText(data.closingCta)).toBeInTheDocument();
    });
  });
});
