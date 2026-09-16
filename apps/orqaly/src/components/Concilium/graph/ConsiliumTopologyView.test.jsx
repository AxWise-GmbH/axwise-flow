import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useState } from 'react';

// Mock the React Flow engine: render the node components for each node so we can
// assert per-kind rendering, and render panel/children so the toolbar appears.
// Stub the dialogs host so the click test stays focused (and avoids loading the
// real rich dialogs + their services).
vi.mock('./TopologyNodeDialogs', () => ({
  default: ({ node }) => (node ? <div data-testid="node-dialogs">{node.data.kind}</div> : null),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, nodes = [], nodeTypes = {}, onNodeClick }) => (
    <div data-testid="rf">
      {nodes.map((n) => {
        const C = nodeTypes[n.type];
        return C ? (
          <div key={n.id} data-testid={`node-${n.id}`} onClick={(e) => onNodeClick?.(e, n)}>
            <C data={n.data} />
          </div>
        ) : null;
      })}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }) => <div>{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Panel: ({ children }) => <div>{children}</div>,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  addEdge: (c, eds) => [...eds, c],
  useNodesState: (initial) => {
    const [n, setN] = useState(initial);
    return [n, setN, vi.fn()];
  },
  useEdgesState: (initial) => {
    const [e, setE] = useState(initial);
    return [e, setE, vi.fn()];
  },
}));

const getTopology = vi.fn();
const saveTopology = vi.fn(async () => ({ diagram: {}, version: 1 }));
vi.mock('../../../services/consiliumTopologyService', () => ({
  getTopology: (...a) => getTopology(...a),
  saveTopology: (...a) => saveTopology(...a),
  reseedTopology: vi.fn(async () => ({ diagram: { nodes: [], edges: [], current_version: 2 } })),
  restoreVersion: vi.fn(async () => ({ diagram: { nodes: [], edges: [], current_version: 3 } })),
  listVersions: vi.fn(async () => ({ versions: [] })),
  listActivity: vi.fn(async () => ({ activity: [] })),
}));

import ConsiliumTopologyView from './ConsiliumTopologyView';

const theme = createTheme();

const DIAGRAM = {
  id: 'd1',
  current_version: 4,
  nodes: [
    {
      id: 'org-o1',
      type: 'organization',
      position: { x: 0, y: 0 },
      data: { label: 'Traktor', kind: 'organization', subtitle: 'Division', statusKey: 'active' },
    },
    {
      id: 'consilium-o1-b1',
      type: 'consilium',
      position: { x: 0, y: 120 },
      data: { label: 'Eval Board', kind: 'consilium', subtitle: 'Active', statusKey: 'active' },
    },
    {
      id: 'team-o1-t1',
      type: 'team',
      position: { x: 0, y: 240 },
      data: { label: 'Process', kind: 'team', subtitle: 'Team', statusKey: 'active' },
    },
    {
      id: 'agent-o1-t1-m1',
      type: 'agent',
      position: { x: 0, y: 360 },
      data: { label: 'Chair', kind: 'agent', subtitle: 'Chairman', statusKey: 'active' },
    },
  ],
  edges: [],
};

function renderView(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ConsiliumTopologyView {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTopology.mockResolvedValue({ diagram: DIAGRAM });
});

describe('ConsiliumTopologyView', () => {
  it('loads the diagram and renders a node of each kind', async () => {
    renderView();
    expect(await screen.findByText('Traktor')).toBeTruthy();
    expect(screen.getByText('Eval Board')).toBeTruthy();
    expect(screen.getByText('Process')).toBeTruthy();
    expect(screen.getByText('Chair')).toBeTruthy();
    // Toolbar present
    expect(screen.getByText('Add')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('v4')).toBeTruthy();
  });

  it('adding a node enables Save and persists via the service', async () => {
    renderView();
    await screen.findByText('Traktor');

    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Organization' }));
    // Save becomes enabled; click it.
    const saveBtn = screen.getByText('Save').closest('button');
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(saveTopology).toHaveBeenCalled());
    const arg = saveTopology.mock.calls[0][0];
    expect(arg.expectedVersion).toBe(4);
    expect(Array.isArray(arg.nodes)).toBe(true);
    expect(arg.activities.some((a) => a.action === 'node_add')).toBe(true);
  });

  it('shows an error state and can retry', async () => {
    getTopology.mockRejectedValueOnce(new Error('nope'));
    renderView();
    expect(await screen.findByTestId('boards-graph-error')).toBeTruthy();
  });

  it('defaults to the standard chrome variant', async () => {
    renderView();
    expect(await screen.findByTestId('boards-graph-view')).toHaveAttribute(
      'data-variant',
      'default'
    );
  });

  it('threads variant="simple" down to the canvas for simple-mode styling', async () => {
    renderView({ variant: 'simple' });
    expect(await screen.findByTestId('boards-graph-view')).toHaveAttribute(
      'data-variant',
      'simple'
    );
  });

  it('shows the legend by default but hides it in simple mode', async () => {
    const { unmount } = renderView();
    await screen.findByText('Traktor');
    expect(screen.getByText('Agent')).toBeTruthy(); // legend key label
    unmount();

    renderView({ variant: 'simple' });
    await screen.findByText('Traktor');
    expect(screen.queryByText('Agent')).toBeNull(); // legend removed in simple mode
  });

  it('trims the toolbar to Add/Save/Refresh in simple mode (no Versions/Activity)', async () => {
    const { unmount } = renderView();
    await screen.findByText('Traktor');
    expect(screen.getByText('Versions')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    unmount();

    renderView({ variant: 'simple' });
    await screen.findByText('Traktor');
    // Kept
    expect(screen.getByText('Add')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Refresh')).toBeTruthy();
    // Removed
    expect(screen.queryByText('Versions')).toBeNull();
    expect(screen.queryByText('Activity')).toBeNull();
  });

  it('opens the node dialogs host when a node is clicked', async () => {
    renderView();
    fireEvent.click(await screen.findByTestId('node-org-o1'));
    expect(await screen.findByTestId('node-dialogs')).toHaveTextContent('organization');
  });
});
