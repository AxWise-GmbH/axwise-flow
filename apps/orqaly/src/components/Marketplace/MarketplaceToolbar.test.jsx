import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MarketplaceToolbar from './MarketplaceToolbar';

const CATEGORIES = [
  { value: 'a', label: 'Cat A', color: '#7C3AED' },
  { value: 'b', label: 'Cat B' },
];

const FACETS = [{ key: 'provider', label: 'Provider', field: 'provider' }];
const FACET_OPTIONS = {
  provider: [
    { value: 'groq', label: 'Groq' },
    { value: 'openai', label: 'OpenAI' },
  ],
};

function renderToolbar(props = {}) {
  return render(
    <MarketplaceToolbar
      searchQuery=""
      onSearchChange={() => {}}
      categories={CATEGORIES}
      categoryFilter=""
      onCategoryChange={() => {}}
      sortBy="name"
      onSortChange={() => {}}
      sortOptions={[{ value: 'name', label: 'Name' }]}
      resultCount={3}
      totalCount={3}
      {...props}
    />
  );
}

// The filter toggle is the first button in the compact bar.
function openPopover() {
  fireEvent.click(screen.getAllByRole('button')[0]);
}

describe('MarketplaceToolbar — backward compatibility', () => {
  it('renders single-select category chips and no facet groups when facets are absent', () => {
    renderToolbar();
    openPopover();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Cat A')).toBeInTheDocument();
    expect(screen.queryByText('Provider')).not.toBeInTheDocument();
  });

  it('clicking a category chip calls onCategoryChange', () => {
    const onCategoryChange = vi.fn();
    renderToolbar({ onCategoryChange });
    openPopover();
    fireEvent.click(screen.getByText('Cat A'));
    expect(onCategoryChange).toHaveBeenCalledWith('a');
  });
});

describe('MarketplaceToolbar — facets', () => {
  it('renders a facet group with one chip per option', () => {
    renderToolbar({ facets: FACETS, facetFilters: {}, facetOptions: FACET_OPTIONS });
    openPopover();
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('clicking a facet chip calls onToggleFacet without closing the popover', () => {
    const onToggleFacet = vi.fn();
    renderToolbar({ facets: FACETS, facetFilters: {}, facetOptions: FACET_OPTIONS, onToggleFacet });
    openPopover();
    fireEvent.click(screen.getByText('Groq'));
    expect(onToggleFacet).toHaveBeenCalledWith('provider', 'groq');
    // popover still open -> group header still visible
    expect(screen.getByText('Provider')).toBeInTheDocument();
  });

  it('shows active facet chips in the compact bar with a working delete', () => {
    const onToggleFacet = vi.fn();
    const { container } = renderToolbar({
      facets: FACETS,
      facetFilters: { provider: ['groq'] },
      facetOptions: FACET_OPTIONS,
      onToggleFacet,
    });
    // Compact-bar chip uses the option label
    const chip = within(container).getByText('Groq').closest('.MuiChip-root');
    expect(chip).toBeTruthy();
    const del = chip.querySelector('.MuiChip-deleteIcon');
    fireEvent.click(del);
    expect(onToggleFacet).toHaveBeenCalledWith('provider', 'groq');
  });

  it('renders multiple active facet chips', () => {
    const { container } = renderToolbar({
      facets: FACETS,
      facetFilters: { provider: ['groq', 'openai'] },
      facetOptions: FACET_OPTIONS,
    });
    const compactChips = container.querySelectorAll('.MuiChip-deleteIcon');
    expect(compactChips.length).toBe(2);
  });

  it('Clear all filters calls onClearFacets', () => {
    const onClearFacets = vi.fn();
    const onCategoryChange = vi.fn();
    const onSearchChange = vi.fn();
    renderToolbar({
      facets: FACETS,
      facetFilters: { provider: ['groq'] },
      facetOptions: FACET_OPTIONS,
      onClearFacets,
      onCategoryChange,
      onSearchChange,
    });
    openPopover();
    // The reset control is a deletable chip; its handler is on the delete icon.
    const resetChip = screen.getByText('Clear all filters').closest('.MuiChip-root');
    fireEvent.click(resetChip.querySelector('.MuiChip-deleteIcon'));
    expect(onClearFacets).toHaveBeenCalled();
    expect(onCategoryChange).toHaveBeenCalledWith('');
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('hides a facet group whose options list is empty', () => {
    renderToolbar({
      facets: [{ key: 'tags', label: 'Tags', field: 'tags', array: true }],
      facetFilters: {},
      facetOptions: { tags: [] },
    });
    openPopover();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('marks the filter toggle active when only a facet is selected', () => {
    const { container } = renderToolbar({
      facets: FACETS,
      facetFilters: { provider: ['groq'] },
      facetOptions: FACET_OPTIONS,
    });
    // active state renders the primary-dot badge (not invisible)
    const dot = container.querySelector('.MuiBadge-dot');
    expect(dot).toBeTruthy();
    expect(dot.className).not.toMatch(/invisible/);
  });
});
