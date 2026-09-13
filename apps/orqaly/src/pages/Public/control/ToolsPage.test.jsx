import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import ToolsPage from './ToolsPage';
import { TOOLS_PILLARS } from '../../../data/toolsPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ToolsPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public ToolsPage', () => {
  it('renders the tools hub hero copy', () => {
    renderPage();
    expect(screen.getAllByText('Connectors your agents actually use.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/MCP catalog via Composio/i)).toBeInTheDocument();
    expect(screen.getByText('Open Tools')).toBeInTheDocument();
  });

  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText('Agent toolbox')).toBeInTheDocument();
    TOOLS_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders lifecycle spotlights and demos', () => {
    renderPage();
    expect(screen.getByText(/MCP catalog and your connectors/i)).toBeInTheDocument();
    expect(screen.getByText(/The right agent gets the right capability/i)).toBeInTheDocument();
    expect(screen.getByText(/Test before agents depend on it/i)).toBeInTheDocument();
    expect(screen.getByText(/Sandboxed\. Scanned\. Defensible/i)).toBeInTheDocument();
    expect(screen.getByText('Toolbox · this workspace')).toBeInTheDocument();
    expect(screen.getByText(/Every publish, scanned/i)).toBeInTheDocument();
  });

  it('renders feature mosaic and related grid', () => {
    renderPage();
    expect(screen.getAllByText(/Inside the Tools surface/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/earn crypto on installs/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders closing CTA', () => {
    renderPage();
    expect(screen.getByText(/Powerful, permissioned, and never going rogue/i)).toBeInTheDocument();
  });
});
