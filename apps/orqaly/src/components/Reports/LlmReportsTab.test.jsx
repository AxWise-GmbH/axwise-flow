import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// useLlmUsage is mocked so the metrics strip + facet selects have data without
// touching the network. Totals drive the stat cards; facets drive the selects.
vi.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: vi.fn(() => ({
    totals: {
      cost: 642.18,
      tokens: 86_500_000,
      promptTokens: 61_000_000,
      completionTokens: 25_500_000,
      cachedTokens: 12_400_000,
      calls: 38_420,
      errorCalls: 412,
      errorRate: 1.1,
      avgDurationMs: 1840,
      p95DurationMs: 4200,
      evaluations: 845,
      approved: 712,
      avgScore: 7.8,
    },
    facets: { providers: ['openai', 'anthropic'], models: ['gpt-4o'], sources: ['agent'] },
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

// Capture the props the tab hands the aggregate panel without rendering the
// real panel (which pulls in recharts + the data layer).
const panelPropsLog = [];
vi.mock('../LlmUsage/LlmUsagePanel', () => ({
  default: (props) => {
    panelPropsLog.push(props);
    return (
      <div
        data-testid="usage-panel"
        data-entity={props.entity}
        data-hidestats={String(Boolean(props.hideStats))}
        data-demo={props.demo ? 'yes' : 'no'}
      />
    );
  },
}));

// Stub the directory with a lightweight probe so we can assert the tab mounts
// it (and with which props) without exercising the real hook/service.
const directoryPropsLog = [];
vi.mock('../LlmUsage/EntityDirectory', () => ({
  default: (props) => {
    directoryPropsLog.push(props);
    return (
      <div
        data-testid="entity-directory"
        data-entity={props.entity}
        data-embedded={String(Boolean(props.embedded))}
        data-demo={props.demoItems ? 'yes' : 'no'}
      />
    );
  },
}));

import LlmReportsTab from './LlmReportsTab';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

/** Pick a category by clicking its tab in the tab row. */
function selectCategory(label) {
  fireEvent.click(screen.getByRole('tab', { name: label }));
}

beforeEach(() => {
  panelPropsLog.length = 0;
  directoryPropsLog.length = 0;
});

describe('LlmReportsTab', () => {
  it('renders the metrics strip with a Total Cost stat card', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );
    const totalCost = screen.getByTestId('stat-Total Cost');
    expect(totalCost).toBeTruthy();
    expect(within(totalCost).getByText('$642.18')).toBeTruthy();
  });

  it('mounts the aggregate panel (hideStats) for All by default', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );
    const panel = screen.getByTestId('usage-panel');
    expect(panel.getAttribute('data-entity')).toBe('all');
    expect(panel.getAttribute('data-hidestats')).toBe('true');
    expect(screen.queryByTestId('entity-directory')).toBeNull();
  });

  it('mounts the embedded directory for a specific category', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );

    selectCategory('Agent');

    const directory = screen.getByTestId('entity-directory');
    expect(directory.getAttribute('data-entity')).toBe('agent');
    expect(directory.getAttribute('data-embedded')).toBe('true');
    expect(screen.queryByTestId('usage-panel')).toBeNull();
  });

  it('passes demo props to the panel/directory when the demo switch is on', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );

    // Panel (All) receives a demo aggregate.
    fireEvent.click(screen.getByLabelText('Show demo data'));
    expect(screen.getByTestId('usage-panel').getAttribute('data-demo')).toBe('yes');

    // The directory receives demo items for a specific category.
    selectCategory('Goal');
    expect(screen.getByTestId('entity-directory').getAttribute('data-demo')).toBe('yes');
  });

  it('renders the full category tab row', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );

    const tabs = screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'));
    expect(tabs).toEqual(['All', 'Goal', 'Agent', 'Team', 'Consilium', 'Organization']);
    // All is selected by default.
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
  });

  it('returns to the aggregate panel when the All tab is clicked again', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );

    selectCategory('Team');
    expect(screen.getByTestId('entity-directory').getAttribute('data-entity')).toBe('team');

    selectCategory('All');
    expect(screen.getByTestId('usage-panel').getAttribute('data-entity')).toBe('all');
    expect(screen.queryByTestId('entity-directory')).toBeNull();
  });

  it('opens the filter popover and shows its fields (Category dropdown removed)', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );

    fireEvent.click(screen.getByLabelText('Filters'));
    const popover = screen.getByRole('presentation');
    expect(within(popover).getByText('Filters')).toBeTruthy();
    expect(within(popover).getByLabelText('From').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(within(popover).getByLabelText('Provider')).toBeTruthy();
    // Category now lives in the tab row, not the popover.
    expect(within(popover).queryByLabelText('Category')).toBeNull();
  });

  it('applies a quick-range preset and rewrites the From input', () => {
    render(
      <Wrap>
        <LlmReportsTab />
      </Wrap>
    );

    fireEvent.click(screen.getByLabelText('Filters'));
    const popover = screen.getByRole('presentation');
    // "All" sets a wide lower bound (not empty) so historical usage shows.
    fireEvent.click(within(popover).getByLabelText('Last All'));
    const fromVal = within(popover).getByLabelText('From').value;
    expect(fromVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fromVal < within(popover).getByLabelText('To').value).toBe(true);
  });
});
