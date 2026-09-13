import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import CommunicatorPage from './CommunicatorPage';
import { COMM_PILLARS } from '../../../data/communicatorPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <CommunicatorPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public CommunicatorPage', () => {
  it('renders the communication control room hero copy', () => {
    renderPage();
    expect(screen.getAllByText('Monitor every goal. Deploy every channel.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Agent Workspace/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open Communicator')).toBeInTheDocument();
  });

  it('renders hub intro and pillar cards', () => {
    renderPage();
    expect(screen.getByText('Communication control room')).toBeInTheDocument();
    COMM_PILLARS.forEach((p) => {
      expect(screen.getAllByText(p.title).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders lifecycle spotlights', () => {
    renderPage();
    expect(screen.getByText(/See what is happening on every goal/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Team, Lead, and Agent/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Decisions and commands, recorded/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Voice, Telegram, and email/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders channel demos and feature mosaic', () => {
    renderPage();
    expect(screen.getByText('SMTP / IMAP')).toBeInTheDocument();
    expect(screen.getAllByText('Agent rooms per goal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Triage voice agent')).toBeInTheDocument();
  });

  it('renders related grid and closing CTA', () => {
    renderPage();
    expect(screen.getByText(/Monitor every goal\. Reach customers/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Communicator/i })).toHaveAttribute('href', '/communicator');
  });
});
