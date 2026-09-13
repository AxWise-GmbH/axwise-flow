import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

import EntityCard from './EntityCard';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

function goalItem(over = {}) {
  return {
    id: 'g-1',
    name: 'Launch Beta',
    status: 'running',
    createdAt: '2026-06-01T00:00:00Z',
    usage: { calls: 42, totalTokens: 12400, cost: 1.2345, errorCalls: 0 },
    organization: { id: 'o-1', name: 'Acme' },
    consilium: null,
    team: { id: 't-1', name: 'Growth' },
    agentsUsed: 3,
    link: '/goals/g-1',
    ...over,
  };
}

beforeEach(() => {
  navigateMock.mockReset();
});

describe('EntityCard', () => {
  it('renders the name, formatted cost and a relation count', () => {
    render(
      <Wrap>
        <EntityCard entity="goal" item={goalItem()} onOpen={vi.fn()} />
      </Wrap>
    );
    expect(screen.getByText('Launch Beta')).toBeTruthy();
    // Cost formatted as currency ($1.2345 -> $1.23).
    expect(screen.getByText('$1.23')).toBeTruthy();
    // Compact token total.
    expect(screen.getByText('12.4k')).toBeTruthy();
    // Labeled relations: Organization / Team / Agents (consilium is null -> omitted).
    expect(screen.getByText('Organization')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('calls onOpen with the item when the card is clicked', () => {
    const onOpen = vi.fn();
    const item = goalItem();
    render(
      <Wrap>
        <EntityCard entity="goal" item={item} onOpen={onOpen} />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId('entity-card-g-1'));
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('navigates via the link button without triggering onOpen', () => {
    const onOpen = vi.fn();
    render(
      <Wrap>
        <EntityCard entity="goal" item={goalItem()} onOpen={onOpen} />
      </Wrap>
    );
    fireEvent.click(screen.getByLabelText('Open Launch Beta'));
    expect(navigateMock).toHaveBeenCalledWith('/goals/g-1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('omits the link button when item.link is null (e.g. organization)', () => {
    const org = {
      id: 'o-9',
      name: 'Holdco',
      status: 'active',
      createdAt: '2026-05-01T00:00:00Z',
      usage: { calls: 5, totalTokens: 500, cost: 0.05, errorCalls: 0 },
      orgType: 'holding',
      parentCompany: null,
      counts: { goals: 4, teams: 2, agents: 6 },
      link: null,
    };
    render(
      <Wrap>
        <EntityCard entity="organization" item={org} onOpen={vi.fn()} />
      </Wrap>
    );
    expect(screen.getByText('Holdco')).toBeTruthy();
    expect(screen.queryByLabelText('Open Holdco')).toBeNull();
    // Org-specific labeled counts.
    expect(screen.getByText('Goals')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('shows an error chip when usage has error calls', () => {
    render(
      <Wrap>
        <EntityCard
          entity="goal"
          item={goalItem({ usage: { calls: 10, totalTokens: 1000, cost: 0.1, errorCalls: 3 } })}
          onOpen={vi.fn()}
        />
      </Wrap>
    );
    expect(screen.getByText('3 errors')).toBeTruthy();
  });

  it('renders the status chip with the item status', () => {
    render(
      <Wrap>
        <EntityCard entity="goal" item={goalItem()} onOpen={vi.fn()} />
      </Wrap>
    );
    // Status chip (capitalized via CSS, raw text is "running").
    const card = screen.getByTestId('entity-card-g-1');
    expect(within(card).getByText('running')).toBeTruthy();
  });
});
