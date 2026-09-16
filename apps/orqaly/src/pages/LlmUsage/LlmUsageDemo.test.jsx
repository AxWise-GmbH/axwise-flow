import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { DEMO_AGGREGATE, DEMO_ITEMS, demoSnapshotFor } from './demoData';

// Lightweight probes for the panel + directory so we can assert the demo data
// is injected without pulling in recharts / the data layer.
const panelProps = [];
vi.mock('../../components/LlmUsage/LlmUsagePanel', () => ({
  default: (props) => {
    panelProps.push(props);
    return <div data-testid="usage-panel" data-demo={props.demo ? 'yes' : 'no'} />;
  },
}));
const dirProps = [];
vi.mock('../../components/LlmUsage/EntityDirectory', () => ({
  default: (props) => {
    dirProps.push(props);
    return (
      <div
        data-testid="entity-directory"
        data-entity={props.entity}
        data-count={props.demoItems?.length ?? 0}
      />
    );
  },
}));

import LlmUsageDemo from './LlmUsageDemo';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  panelProps.length = 0;
  dirProps.length = 0;
});

describe('LlmUsageDemo page', () => {
  it('shows the sample-data banner and the aggregate panel with demo data by default', () => {
    render(
      <Wrap>
        <LlmUsageDemo />
      </Wrap>
    );
    expect(screen.getByText(/sample data/i)).toBeTruthy();
    const panel = screen.getByTestId('usage-panel');
    expect(panel.getAttribute('data-demo')).toBe('yes');
    expect(panelProps[panelProps.length - 1].demo).toBe(DEMO_AGGREGATE);
  });

  it('renders the directory with demo items when a category is picked', () => {
    render(
      <Wrap>
        <LlmUsageDemo />
      </Wrap>
    );
    fireEvent.mouseDown(screen.getByLabelText('Category'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Goal'));
    const dir = screen.getByTestId('entity-directory');
    expect(dir.getAttribute('data-entity')).toBe('goal');
    expect(Number(dir.getAttribute('data-count'))).toBe(DEMO_ITEMS.goal.length);
    expect(typeof dirProps[dirProps.length - 1].demoSnapshot).toBe('function');
  });
});

describe('demoData', () => {
  it('has items for every entity type with usage rollups', () => {
    for (const k of ['goal', 'agent', 'team', 'consilium', 'organization']) {
      expect(Array.isArray(DEMO_ITEMS[k])).toBe(true);
      expect(DEMO_ITEMS[k].length).toBeGreaterThan(0);
      for (const it of DEMO_ITEMS[k]) {
        expect(it.id).toBeTruthy();
        expect(it.name).toBeTruthy();
        expect(it.usage).toBeTruthy();
      }
    }
    expect(DEMO_AGGREGATE.byModel.length).toBeGreaterThan(0);
    expect(DEMO_AGGREGATE.timeseries.length).toBe(30);
  });

  it('demoSnapshotFor builds a panel snapshot from an item', () => {
    const snap = demoSnapshotFor('goal', DEMO_ITEMS.goal[0]);
    expect(snap.totals.cost).toBe(DEMO_ITEMS.goal[0].usage.cost);
    expect(snap.byModel.length).toBeGreaterThan(0);
    expect(snap.source).toBe('demo');
  });
});
