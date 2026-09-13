import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock the data hook so nothing hits the network.
const useUsageDirectoryMock = vi.fn();
vi.mock('../../hooks/useUsageDirectory', () => ({
  useUsageDirectory: (...args) => useUsageDirectoryMock(...args),
}));

// Stub the heavy panel (recharts + data layer) with a lightweight probe.
vi.mock('./LlmUsagePanel', () => ({
  default: (props) => (
    <div data-testid="drill-panel" data-entity={props.entity} data-entityid={props.entityId || ''}>
      {props.title}
    </div>
  ),
}));

import EntityDirectory from './EntityDirectory';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

function goalItems() {
  return [
    {
      id: 'g-1',
      name: 'Launch Beta',
      status: 'running',
      createdAt: '2026-06-01T00:00:00Z',
      usage: { calls: 42, totalTokens: 12400, cost: 1.2345, errorCalls: 0 },
      organization: { id: 'o-1', name: 'Acme' },
      team: null,
      consilium: null,
      agentsUsed: 3,
      link: '/goals/g-1',
    },
    {
      id: 'g-2',
      name: 'Q3 Roadmap',
      status: 'completed',
      createdAt: '2026-05-10T00:00:00Z',
      usage: { calls: 7, totalTokens: 3200, cost: 0.42, errorCalls: 0 },
      organization: null,
      team: null,
      consilium: null,
      agentsUsed: 1,
      link: '/goals/g-2',
    },
  ];
}

function hookReturn(over = {}) {
  const items = over.items || goalItems();
  return {
    data: { items },
    items,
    totals: { calls: 49, totalTokens: 15600, cost: 1.6545 },
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  useUsageDirectoryMock.mockReset();
});

describe('EntityDirectory', () => {
  it('renders cards from the items array with name, cost and a count', () => {
    useUsageDirectoryMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    expect(screen.getByTestId('directory-grid')).toBeTruthy();
    expect(screen.getByText('Launch Beta')).toBeTruthy();
    expect(screen.getByText('Q3 Roadmap')).toBeTruthy();
    // Formatted cost on the first card.
    expect(screen.getByText('$1.23')).toBeTruthy();
    // A labeled relation value (the goal's organization name).
    expect(screen.getByText('Acme')).toBeTruthy();
    // Summary reflects totals.
    expect(screen.getByTestId('directory-summary').textContent).toContain('15.6k');
  });

  it('toggles between grid and list layouts', () => {
    useUsageDirectoryMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    expect(screen.getByTestId('directory-grid')).toBeTruthy();
    expect(screen.queryByTestId('directory-table')).toBeNull();

    fireEvent.click(screen.getByLabelText('List view'));

    expect(screen.getByTestId('directory-table')).toBeTruthy();
    expect(screen.queryByTestId('directory-grid')).toBeNull();
    // Table still lists the entities.
    expect(screen.getByText('Q3 Roadmap')).toBeTruthy();
  });

  it('opens the drill-down panel when a card is clicked', () => {
    useUsageDirectoryMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    expect(screen.queryByTestId('drill-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-card-g-1'));

    const panel = screen.getByTestId('drill-panel');
    expect(panel.getAttribute('data-entity')).toBe('goal');
    expect(panel.getAttribute('data-entityid')).toBe('g-1');
    // The entity name shows in the drawer header (and the card), no longer
    // duplicated as the panel's own title.
    expect(screen.getAllByText('Launch Beta').length).toBeGreaterThanOrEqual(2);
  });

  it('opens the drill-down panel from a table row', () => {
    useUsageDirectoryMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    fireEvent.click(screen.getByLabelText('List view'));
    fireEvent.click(screen.getByText('Q3 Roadmap'));

    const panel = screen.getByTestId('drill-panel');
    expect(panel.getAttribute('data-entityid')).toBe('g-2');
  });

  it('renders an empty state when there are no items', () => {
    useUsageDirectoryMock.mockReturnValue(
      hookReturn({ items: [], totals: { calls: 0, totalTokens: 0, cost: 0 } })
    );
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    const empty = screen.getByTestId('directory-empty');
    expect(empty.textContent).toMatch(/No goals with usage in this range yet\./i);
  });

  it('renders loading skeletons while loading', () => {
    useUsageDirectoryMock.mockReturnValue(hookReturn({ loading: true, items: [] }));
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    const loadingBlock = screen.getByTestId('directory-loading');
    expect(loadingBlock.querySelector('.MuiSkeleton-root')).toBeTruthy();
    expect(screen.queryByTestId('directory-grid')).toBeNull();
  });

  it('surfaces an error notice when the hook reports an error', () => {
    useUsageDirectoryMock.mockReturnValue(
      hookReturn({ error: new Error('Usage session expired') })
    );
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );
    expect(screen.getByText(/Usage session expired/i)).toBeTruthy();
  });

  it('filters items by the search box', () => {
    useUsageDirectoryMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <EntityDirectory entity="goal" from="2026-05-24" to="2026-06-23" />
      </Wrap>
    );

    fireEvent.click(screen.getByLabelText('Search and sort'));
    fireEvent.change(screen.getByPlaceholderText('Search goals...'), { target: { value: 'Beta' } });

    expect(screen.getByText('Launch Beta')).toBeTruthy();
    expect(screen.queryByText('Q3 Roadmap')).toBeNull();
  });
});
