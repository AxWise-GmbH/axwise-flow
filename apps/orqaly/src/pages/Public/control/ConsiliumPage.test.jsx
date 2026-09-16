import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import ConsiliumPage from './ConsiliumPage';
import { CONSILIUM_PILLARS } from '../../../data/consiliumPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ConsiliumPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public ConsiliumPage', () => {
  it('renders the decision layer hero copy', () => {
    renderPage();
    expect(screen.getAllByText('Debate, Vote - Record').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        /Actively involved in decision-making throughout the platform/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Open Consilium')).toBeInTheDocument();
  });

  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText('Decision layer')).toBeInTheDocument();
    CONSILIUM_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders lifecycle spotlights and council demo', () => {
    renderPage();
    expect(screen.getByText(/Boards, members, and criteria/i)).toBeInTheDocument();
    expect(screen.getByText(/Propose, argue, vote, deliver/i)).toBeInTheDocument();
    expect(screen.getByText(/Should we launch the Pro tier/i)).toBeInTheDocument();
    expect(screen.getByText(/Every vote in the decision log/i)).toBeInTheDocument();
    expect(screen.getByText(/Behind agents, goals, and workflows/i)).toBeInTheDocument();
  });

  it('does not render removed before/after and timeline sections', () => {
    renderPage();
    expect(screen.queryByText('One model vs. a council')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'How a council deliberates' })).not.toBeInTheDocument();
    expect(screen.queryByText('Who Leads Decisions')).not.toBeInTheDocument();
    expect(screen.queryByText('Frequently asked')).not.toBeInTheDocument();
  });

  it('renders related grid and closing CTA', () => {
    renderPage();
    expect(screen.getAllByText('Communicator').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Stop guessing\. Start deliberating/i)).toBeInTheDocument();
  });
});
