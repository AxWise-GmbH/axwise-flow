import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import IndustrySolutionLayout from './IndustrySolutionLayout';
import { HUB_INTRO, PILLARS } from '../../../data/solutions/healthcarePage';

function renderLayout(slug = 'healthcare') {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <IndustrySolutionLayout slug={slug} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('IndustrySolutionLayout', () => {
  it('renders hub intro and pillar cards for healthcare', () => {
    renderLayout('healthcare');
    expect(screen.getByText(HUB_INTRO.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(HUB_INTRO.title)).toBeInTheDocument();
    PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders spotlights, agents, prompts, and closing for healthcare', () => {
    renderLayout('healthcare');
    expect(screen.getByText(/A patient call, end to end/i)).toBeInTheDocument();
    expect(screen.getByText(/What patients actually hear/i)).toBeInTheDocument();
    expect(screen.getByText('Agents you would hire')).toBeInTheDocument();
    expect(screen.getByText('Try a prompt')).toBeInTheDocument();
    expect(screen.getByText(/Try Orqaly for your clinic/i)).toBeInTheDocument();
  });
});
