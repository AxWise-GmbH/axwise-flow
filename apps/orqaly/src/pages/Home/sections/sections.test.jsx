import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { buildDemoData, buildDemoOrgs } from '../demoData';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import KpiStrip from './KpiStrip';
import SparkStatRow from './SparkStatRow';
import PerformanceChart from './PerformanceChart';
import GoalsLoopsTables from './GoalsLoopsTables';
import ActivityCommsTables from './ActivityCommsTables';
import UsageDonut from './UsageDonut';
import DataOperationsCard from './DataOperationsCard';
import ActivityTable from './ActivityTable';
import AgentDirectory from './AgentDirectory';
import OrgMetrics from './OrgMetrics';
import OrgStructure from './OrgStructure';
import PanelCard from './PanelCard';

// Stub the KB document dialog so we can assert it opens with the clicked doc id.
vi.mock('../../../components/KnowledgeBase/KBDocumentViewDialog', () => ({
  default: ({ open, doc }) => (open ? <div>kb-doc-dialog:{doc?.id}</div> : null),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia =
    window.matchMedia ||
    ((query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
});

const demo = buildDemoData(7);
const demoOrgs = buildDemoOrgs();

function Wrap({ children }) {
  return <ThemeProvider theme={createTheme()}>{children}</ThemeProvider>;
}

describe('Home sections', () => {
  it('KpiStrip renders KPI labels', () => {
    render(
      <Wrap>
        <KpiStrip kpis={demo.kpis} />
      </Wrap>
    );
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
  });

  it('SparkStatRow renders all stat labels (fillHeight default on)', () => {
    render(
      <Wrap>
        <SparkStatRow stats={demo.sparkStats} />
      </Wrap>
    );
    for (const label of [
      'Cost (USD)',
      'Total Calls',
      'Avg Tokens / Call',
      'Cost / 1M tok',
      'Slowest Response (s)',
      'Avg Work Quality',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('SparkStatRow still renders with fillHeight disabled', () => {
    render(
      <Wrap>
        <SparkStatRow stats={demo.sparkStats} fillHeight={false} />
      </Wrap>
    );
    expect(screen.getByText('Avg Tokens / Call')).toBeInTheDocument();
  });

  it('PerformanceChart renders its title', () => {
    render(
      <Wrap>
        <PerformanceChart performance={demo.performance} />
      </Wrap>
    );
    expect(screen.getByText('Agents Performance Overview')).toBeInTheDocument();
  });

  it('GoalsLoopsTables renders both panels and shows empty states with no rows', () => {
    const { rerender } = render(
      <Wrap>
        <GoalsLoopsTables goals={demo.goals} loops={demo.loops} />
      </Wrap>
    );
    expect(screen.getByText('Goals in Action')).toBeInTheDocument();
    expect(screen.getByText('Loops from Agents')).toBeInTheDocument();

    rerender(
      <Wrap>
        <GoalsLoopsTables goals={{ rows: [] }} loops={{ rows: [] }} />
      </Wrap>
    );
    // Goals panel (RankedTable) shows the generic empty state; the custom Loops
    // table shows its own copy.
    expect(screen.getByText('No data available.')).toBeInTheDocument();
    expect(screen.getByText('No active loops yet.')).toBeInTheDocument();
  });

  it('ActivityCommsTables renders the chat panel and its empty state', () => {
    const { rerender } = render(
      <Wrap>
        <ActivityCommsTables activity={demo.activity} chat={demo.chat} />
      </Wrap>
    );
    expect(screen.getByText('Communicator')).toBeInTheDocument();

    rerender(
      <Wrap>
        <ActivityCommsTables activity={{ rows: [], spark: [] }} chat={{ messages: [] }} />
      </Wrap>
    );
    expect(screen.getByText('No live conversations yet.')).toBeInTheDocument();
  });

  it('UsageDonut renders the total label and an empty state', () => {
    const { rerender } = render(
      <Wrap>
        <UsageDonut rows={demo.usageDonut.rows} />
      </Wrap>
    );
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    rerender(
      <Wrap>
        <UsageDonut rows={[]} />
      </Wrap>
    );
    expect(screen.getByText('No usage recorded for this window.')).toBeInTheDocument();
  });

  it('ActivityTable renders Persona/Instrument/Action and fires onPersonaClick', () => {
    const onPersonaClick = vi.fn();
    render(
      <Wrap>
        <ActivityTable rows={demo.activity.rows} onPersonaClick={onPersonaClick} />
      </Wrap>
    );
    expect(screen.getAllByText('Workflow').length).toBeGreaterThan(0); // instrument chip
    expect(screen.getAllByText('create').length).toBeGreaterThan(0); // action chip
    fireEvent.click(screen.getByRole('button', { name: /Backend Developer/i }));
    expect(onPersonaClick).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'demo-agent-backend' })
    );
  });

  it('ActivityTable shows an empty state', () => {
    render(
      <Wrap>
        <ActivityTable rows={[]} />
      </Wrap>
    );
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
  });

  it('DataOperationsCard renders the table with a clickable agent (Name (position))', () => {
    const onAgentClick = vi.fn();
    render(
      <Wrap>
        <DataOperationsCard rows={demo.dataOps.rows} onAgentClick={onAgentClick} />
      </Wrap>
    );
    expect(screen.getByText('Data Operations')).toBeInTheDocument();
    expect(screen.getAllByText('Documents').length).toBeGreaterThan(0);
    expect(screen.getAllByText('create').length).toBeGreaterThan(0);
    // The new "Name" column renders the document name.
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Q3 Growth Brief')).toBeInTheDocument();
    // Clickable agent fires onAgentClick with the row.
    fireEvent.click(screen.getByRole('button', { name: /Bogdan Stancu/i }));
    expect(onAgentClick).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'demo-agent-bogdan' })
    );
  });

  it('opens the KB document dialog when a Name or Type is clicked', () => {
    const { unmount } = render(
      <Wrap>
        <DataOperationsCard rows={demo.dataOps.rows} />
      </Wrap>
    );
    // Click the document name -> dialog opens with that doc id.
    fireEvent.click(screen.getByText('Q3 Growth Brief'));
    expect(screen.getByText('kb-doc-dialog:demo-doc-1')).toBeInTheDocument();
    unmount();

    // The Type chip opens it too.
    render(
      <Wrap>
        <DataOperationsCard rows={demo.dataOps.rows} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Documents'));
    expect(screen.getByText('kb-doc-dialog:demo-doc-1')).toBeInTheDocument();
  });

  it('AgentDirectory lists agents, filters by search, and shows an empty state', () => {
    render(
      <Wrap>
        <AgentDirectory agents={demo.agents} />
      </Wrap>
    );
    expect(screen.getByText('Bogdan Stancu')).toBeInTheDocument();
    expect(screen.getByText('Ops Orchestrator')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search agents...'), {
      target: { value: 'bogdan' },
    });
    expect(screen.getByText('Bogdan Stancu')).toBeInTheDocument();
    expect(screen.queryByText('Ops Orchestrator')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search agents...'), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText('No agents match your filters yet.')).toBeInTheDocument();
  });

  it('OrgMetrics renders the 6 metric labels', () => {
    render(
      <Wrap>
        <OrgMetrics metrics={demoOrgs[0].metrics} />
      </Wrap>
    );
    for (const label of ['Units', 'Teams', 'Consilium', 'Agents', 'Tools', 'Tasks']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('OrgMetrics does not render the removed ROI and Invested tiles', () => {
    render(
      <Wrap>
        <OrgMetrics metrics={demoOrgs[0].metrics} />
      </Wrap>
    );
    expect(screen.queryByText('ROI')).not.toBeInTheDocument();
    expect(screen.queryByText('Invested')).not.toBeInTheDocument();
  });

  it('OrgMetrics tiles are clickable and fire onMetricClick with the metric key', () => {
    const onMetricClick = vi.fn();
    render(
      <Wrap>
        <OrgMetrics metrics={demoOrgs[0].metrics} onMetricClick={onMetricClick} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /open Units/i }));
    expect(onMetricClick).toHaveBeenCalledWith('units');
    fireEvent.click(screen.getByRole('button', { name: /open Tasks/i }));
    expect(onMetricClick).toHaveBeenCalledWith('tasks');
  });

  it('OrgStructure shows hierarchy, sub-organizations, and the Add Investment action', () => {
    const onAdd = vi.fn();
    render(
      <Wrap>
        <OrgStructure orgs={demoOrgs} selectedId="demo-holding" onAddInvestment={onAdd} />
      </Wrap>
    );
    expect(screen.getByText('Organization structure')).toBeInTheDocument();
    expect(screen.getByText('Sub-organizations (2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Investment/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  // The emotion-injected stylesheet text for the whole document; lets us assert
  // hover styles (a pseudo-class jsdom won't compute on an element directly).
  // Whitespace after commas is normalized because emotion drops the space that
  // joins the two glow shadow layers ("a, b" -> "a,b").
  function injectedStyles() {
    return Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n')
      .replace(/,\s+/g, ',');
  }
  const glow = (theme) => createHoverGlowShadow(theme).replace(/,\s+/g, ',');

  it('PanelCard keeps the brand hover glow (not clobbered by the no-lift override)', () => {
    const theme = createTheme();
    render(
      <ThemeProvider theme={theme}>
        <PanelCard title="Goals in Action">content</PanelCard>
      </ThemeProvider>
    );
    expect(screen.getByText('Goals in Action')).toBeInTheDocument();
    // The glow box-shadow must appear in the injected :hover rule.
    expect(injectedStyles()).toContain(glow(theme));
  });

  it('OrgMetrics interactive tiles use the brand hover glow', () => {
    const theme = createTheme();
    render(
      <ThemeProvider theme={theme}>
        <OrgMetrics metrics={demoOrgs[0].metrics} onMetricClick={() => {}} />
      </ThemeProvider>
    );
    expect(injectedStyles()).toContain(glow(theme));
  });
});
