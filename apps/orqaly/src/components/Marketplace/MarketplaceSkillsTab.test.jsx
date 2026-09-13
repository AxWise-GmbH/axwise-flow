import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// Capture the props handed to the toolbar; render nothing so we can drive
// onToggleFacet directly and let the real hook + grid do the filtering.
const h = vi.hoisted(() => ({ props: null }));
vi.mock('./MarketplaceToolbar', () => ({
  default: (props) => {
    h.props = props;
    return null;
  },
}));
vi.mock('./ImportLibraryDialog', () => ({
  default: () => null,
  ImportFromButton: () => null,
}));

const listSkills = vi.fn();
vi.mock('../../services/agentSkillsService', () => ({
  listSkills: (...a) => listSkills(...a),
  installSkill: vi.fn(),
}));
vi.mock('../../services/agentHubService', () => ({ getAgents: () => [] }));
vi.mock('../../services/marketplaceRatingService', () => ({
  getAllRatings: () => ({}),
  saveRating: vi.fn(),
  syncRatingsFromDB: () => Promise.resolve({}),
}));
vi.mock('../../hooks/useImportedLibraries', () => ({ default: () => ({ importedItems: [] }) }));

const MarketplaceSkillsTab = (await import('./MarketplaceSkillsTab')).default;

const SKILLS = [
  { id: 's1', slug: 's1', name: 'Alpha Skill', category: 'code-dev', tags: ['x'], description: 'a' },
  { id: 's2', slug: 's2', name: 'Bravo Skill', category: 'code-dev', tags: ['y'], description: 'b' },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.props = null;
  listSkills.mockResolvedValue(SKILLS);
});

describe('MarketplaceSkillsTab facets', () => {
  it('passes tag/role facets with options derived from the data', async () => {
    render(<MarketplaceSkillsTab />);
    await waitFor(() => expect(screen.getByText('Alpha Skill')).toBeInTheDocument());

    expect(h.props.facets.map((f) => f.key)).toEqual(['tags', 'compatible_roles']);
    expect(h.props.facetOptions.tags).toEqual([
      { value: 'x', label: 'x' },
      { value: 'y', label: 'y' },
    ]);
  });

  it('filters the grid to skills bearing the selected tag', async () => {
    render(<MarketplaceSkillsTab />);
    await waitFor(() => expect(screen.getByText('Alpha Skill')).toBeInTheDocument());
    expect(screen.getByText('Bravo Skill')).toBeInTheDocument();

    act(() => h.props.onToggleFacet('tags', 'x'));

    await waitFor(() => expect(screen.queryByText('Bravo Skill')).not.toBeInTheDocument());
    expect(screen.getByText('Alpha Skill')).toBeInTheDocument();
  });
});
