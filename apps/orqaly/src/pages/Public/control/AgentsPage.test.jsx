import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import { AGENT_HUB_SURFACES, HUB_INTRO } from '../../../data/agentsPage';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import { HUB_TAB_LABELS } from '../../../components/Public/demo/DemoAgentHubMap';

vi.mock('../../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

import AgentsPage from './AgentsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <AgentsPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('AgentsPage', () => {
  it('renders hero with updated subtitle and hub map tabs', () => {
    renderPage();
    const item = ITEMS_BY_SLUG['control:agents'];
    expect(screen.getByText(item.hero.title)).toBeInTheDocument();
    expect(screen.getByText(item.hero.subtitle)).toBeInTheDocument();
    HUB_TAB_LABELS.forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Agent orchestration hub')).toBeInTheDocument();
  });

  it('renders all seven Agent Hub surfaces', () => {
    renderPage();
    expect(screen.getByText(HUB_INTRO.title)).toBeInTheDocument();
    AGENT_HUB_SURFACES.forEach((surface) => {
      expect(screen.getAllByText(surface.label).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(surface.title)).toBeInTheDocument();
    });
  });

  it('renders tab spotlights and expanded mosaic', () => {
    renderPage();
    expect(screen.getByText('One agent, fully equipped.')).toBeInTheDocument();
    expect(screen.getByText('Specialists that work together.')).toBeInTheDocument();
    expect(screen.getByText('Work that runs on its own.')).toBeInTheDocument();
    expect(screen.getByText('Full capability map')).toBeInTheDocument();
    expect(screen.getAllByText('Teams tab').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pulse tab').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Prompt Lab tab').length).toBeGreaterThanOrEqual(1);
  });

  it('renders comparison extras and CTAs', () => {
    renderPage();
    expect(screen.getByText('Multi-agent teams built-in')).toBeInTheDocument();
    expect(screen.getByText('Autonomous Pulse scheduling')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Agent Hub/i })).toHaveAttribute('href', '/agent-hub');
  });

  it('renders the refreshed competitor columns and Orqaly-only moats', () => {
    renderPage();
    ['Odysseus AI', 'Hermes AI', 'OpenClaw', 'CrewAI'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText('Consilium AI board & governance')).toBeInTheDocument();
    expect(screen.getByText('Built-in knowledge base (RAG)')).toBeInTheDocument();
    expect(screen.getByText('Per-run cost & usage tracking')).toBeInTheDocument();
  });
});
