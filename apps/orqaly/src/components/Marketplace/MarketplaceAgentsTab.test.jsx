import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ props: null, bulkProps: null, importedItems: [] }));
vi.mock('./MarketplaceToolbar', () => ({
  default: (props) => {
    h.props = props;
    return null;
  },
}));
vi.mock('./ImportLibraryDialog', () => ({ default: () => null, ImportFromButton: () => null }));
vi.mock('./MarketplaceAgentDetailDialog', () => ({ default: () => null }));
vi.mock('./BulkActivateAgentsDialog', () => ({
  default: (props) => {
    h.bulkProps = props;
    return null;
  },
}));
vi.mock('../AgentHub/AgentAvatar', () => ({ default: () => null }));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('../../config/predefinedAgents', () => ({
  PREDEFINED_AGENTS: [
    {
      role: 'Alpha',
      description: 'a',
      capabilities: ['research'],
      connection_type: 'groq',
      category: 'Development',
      cost_per_task: 0.05,
    },
    {
      role: 'Bravo',
      description: 'b',
      capabilities: ['writing'],
      connection_type: 'openai',
      category: 'Marketing & Sales',
      cost_per_task: 0.1,
    },
  ],
}));
vi.mock('../../config/predefinedAgentProfiles', () => ({ PREDEFINED_AGENT_PROFILES: [] }));
vi.mock('../../services/agentHubService', () => ({ getAgents: () => [], addAgent: vi.fn() }));
vi.mock('../../services/marketplaceRatingService', () => ({
  getAllRatings: () => ({}),
  saveRating: vi.fn(),
  syncRatingsFromDB: () => Promise.resolve({}),
}));
const importedItem = {
  _id: 'engineering-backend-architect',
  _imported: true,
  _sourceId: 'github:msitarzewski/agency-agents',
  name: 'Backend Architect',
  role: 'Backend Architect',
  description: 'Senior backend architect.',
  category: 'Engineering',
  capabilities: [],
  connection_type: 'glm',
  cost_per_task: 0,
  system_prompt: 'You are Backend Architect...',
};
vi.mock('../../hooks/useImportedLibraries', () => ({
  default: () => ({ importedItems: h.importedItems }),
}));

const marketplaceAgentsModule = await import('./MarketplaceAgentsTab');
const MarketplaceAgentsTab = marketplaceAgentsModule.default;

beforeEach(() => {
  vi.clearAllMocks();
  h.props = null;
  h.bulkProps = null;
  h.importedItems = [];
});

describe('MarketplaceAgentsTab facets', () => {
  it('passes connection + capabilities facets; connection labels merged from provider config', async () => {
    render(<MarketplaceAgentsTab />);
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0));

    expect(h.props.facets.map((f) => f.key)).toEqual(['connection_type', 'capabilities']);
    expect(h.props.facetOptions.connection_type).toEqual([
      { value: 'gemini', label: 'Google Gemini' },
    ]);
    expect(h.props.facetOptions.capabilities).toEqual([
      { value: 'research', label: 'research' },
      { value: 'writing', label: 'writing' },
    ]);
  });

  it('filters the grid by a selected capability, legacy category still works', async () => {
    render(<MarketplaceAgentsTab />);
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Bravo').length).toBeGreaterThan(0);

    // Capability facet: keep only agents with 'research'
    act(() => h.props.onToggleFacet('capabilities', 'research'));
    await waitFor(() => expect(screen.queryAllByText('Bravo').length).toBe(0));
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);

    // Clear facet, then legacy single-select category narrows to Marketing & Sales
    act(() => h.props.onToggleFacet('capabilities', 'research'));
    await waitFor(() => expect(screen.getAllByText('Bravo').length).toBeGreaterThan(0));
    act(() => h.props.onCategoryChange('Marketing & Sales'));
    await waitFor(() => expect(screen.queryAllByText('Alpha').length).toBe(0));
    expect(screen.getAllByText('Bravo').length).toBeGreaterThan(0);
  });
});

describe('MarketplaceAgentsTab bulk activate', () => {
  beforeEach(() => {
    h.importedItems = [importedItem];
  });

  it('selecting an imported agent shows the selection bar and opens the bulk dialog with it', async () => {
    render(<MarketplaceAgentsTab />);
    await waitFor(() => expect(screen.getAllByText('Backend Architect').length).toBeGreaterThan(0));

    expect(screen.queryByText(/agent selected/)).toBeNull();

    const [nameEl] = screen.getAllByText('Backend Architect');
    const card = nameEl.closest('.MuiPaper-root');
    fireEvent.click(within(card).getByRole('checkbox'));

    await waitFor(() => expect(screen.getByText('1 agent selected')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Activate 1' }));

    expect(h.bulkProps.open).toBe(true);
    expect(h.bulkProps.agents).toHaveLength(1);
    expect(h.bulkProps.agents[0].role).toBe('Backend Architect');
  });

  it('"Select all imported" selects every not-yet-added imported agent', async () => {
    render(<MarketplaceAgentsTab />);
    await waitFor(() => expect(screen.getAllByText('Backend Architect').length).toBeGreaterThan(0));

    // actionButton is handed to the (mocked) MarketplaceToolbar as a prop, so
    // mount it directly to interact with it — it's the same element/closures
    // as what the real toolbar would render.
    render(h.props.actionButton);
    fireEvent.click(screen.getByRole('button', { name: 'Select all imported (1)' }));

    await waitFor(() => expect(screen.getByText('1 agent selected')).toBeInTheDocument());
  });
});
