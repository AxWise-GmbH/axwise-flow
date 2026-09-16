import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Capture the props the page hands to the aggregate panel without rendering the
// real panel (which would pull in recharts + the data layer).
const panelPropsLog = [];
vi.mock('../../components/LlmUsage/LlmUsagePanel', () => ({
  default: (props) => {
    panelPropsLog.push(props);
    return (
      <div
        data-testid="usage-panel"
        data-entity={props.entity}
        data-entityid={props.entityId || ''}
      />
    );
  },
}));

// Stub the directory with a lightweight probe so we can assert the page mounts
// it (and with which entity) without exercising the real hook/service.
const directoryPropsLog = [];
vi.mock('../../components/LlmUsage/EntityDirectory', () => ({
  default: (props) => {
    directoryPropsLog.push(props);
    return <div data-testid="entity-directory" data-entity={props.entity} />;
  },
}));

// Service is mocked so nothing hits the network even if reached transitively.
vi.mock('../../services/usageService', () => ({
  fetchUsage: vi.fn(async () => ({ totals: {}, byModel: [], source: 'server' })),
  emptyUsageSnapshot: vi.fn(() => ({ totals: {}, byModel: [], source: 'client' })),
}));

import LlmUsage from './LlmUsage';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  panelPropsLog.length = 0;
  directoryPropsLog.length = 0;
});

describe('LlmUsage page', () => {
  it('renders the heading and mounts the aggregate panel for All by default', () => {
    render(
      <Wrap>
        <LlmUsage />
      </Wrap>
    );
    expect(screen.getByText('LLM Usage')).toBeTruthy();
    const panel = screen.getByTestId('usage-panel');
    expect(panel.getAttribute('data-entity')).toBe('all');
    // No directory while category is All.
    expect(screen.queryByTestId('entity-directory')).toBeNull();
  });

  it('renders the directory (not the aggregate panel) when a specific category is picked', () => {
    render(
      <Wrap>
        <LlmUsage />
      </Wrap>
    );

    fireEvent.mouseDown(screen.getByLabelText('Category'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Agent'));

    const directory = screen.getByTestId('entity-directory');
    expect(directory.getAttribute('data-entity')).toBe('agent');
    expect(screen.queryByTestId('usage-panel')).toBeNull();
  });

  it('passes the date range down to the directory', () => {
    render(
      <Wrap>
        <LlmUsage />
      </Wrap>
    );

    fireEvent.mouseDown(screen.getByLabelText('Category'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Goal'));

    const last = directoryPropsLog[directoryPropsLog.length - 1];
    expect(last.entity).toBe('goal');
    expect(typeof last.from).toBe('string');
    expect(typeof last.to).toBe('string');
  });

  it('applies a quick-range preset and rewrites the From input', () => {
    render(
      <Wrap>
        <LlmUsage />
      </Wrap>
    );

    // "All" preset sets a wide lower bound (not empty), so historical usage
    // shows instead of only the last 30 days.
    fireEvent.click(screen.getByLabelText('Last All'));
    const fromVal = screen.getByLabelText('From').value;
    expect(fromVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fromVal < screen.getByLabelText('To').value).toBe(true);
  });
});
