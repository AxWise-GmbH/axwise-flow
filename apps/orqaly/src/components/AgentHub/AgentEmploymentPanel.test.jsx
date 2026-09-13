import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import AgentEmploymentPanel, { fmtEmploymentDate } from './AgentEmploymentPanel';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

describe('AgentEmploymentPanel', () => {
  it('renders org, consilium and assigned date plus teams', () => {
    render(
      <Wrap>
        <AgentEmploymentPanel
          employment={{
            orgs: [
              {
                org_id: 'o1',
                org_name: 'Orqaly Inc.',
                consilium_id: 'b1',
                consilium_name: 'Main Consilium',
                assigned_at: '2026-03-31T00:00:00Z',
              },
            ],
            teams: [
              {
                team_id: 't1',
                team_name: 'Growth Pod',
                role: 'lead',
                joined_at: '2026-04-01T00:00:00Z',
              },
            ],
          }}
        />
      </Wrap>
    );
    expect(screen.getByText('Orqaly Inc.')).toBeInTheDocument();
    expect(screen.getByText('Main Consilium')).toBeInTheDocument();
    expect(screen.getByText(/Assigned 31\.03\.26/)).toBeInTheDocument();
    expect(screen.getByText('Growth Pod')).toBeInTheDocument();
    expect(screen.getByText('lead')).toBeInTheDocument();
  });

  it('shows "No board" when the org has no consilium', () => {
    render(
      <Wrap>
        <AgentEmploymentPanel
          employment={{
            orgs: [
              {
                org_id: 'o1',
                org_name: 'Traktor',
                consilium_id: null,
                consilium_name: null,
                assigned_at: '2026-03-31T00:00:00Z',
              },
            ],
            teams: [],
          }}
        />
      </Wrap>
    );
    expect(screen.getByText('No board')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is assigned', () => {
    render(
      <Wrap>
        <AgentEmploymentPanel employment={{ orgs: [], teams: [] }} />
      </Wrap>
    );
    expect(screen.getByText('Not assigned to any organization yet.')).toBeInTheDocument();
  });

  it('formats dates as dd.mm.yy', () => {
    expect(fmtEmploymentDate('2026-03-31T00:00:00Z')).toMatch(/^\d{2}\.\d{2}\.26$/);
    expect(fmtEmploymentDate(null)).toBe('—');
  });
});
