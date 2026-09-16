import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../icons/AppIcon', () => ({ default: () => null }));
// Render each card as a simple marker so we assert on the shelf, not the card.
vi.mock('./DownloadModelCard', () => ({
  default: ({ model }) => <div data-testid="card">{model.repoId}</div>,
}));

const searchHuggingFaceModels = vi.fn();
const resolveCuratedModels = vi.fn();
vi.mock('../../services/huggingfaceModelsService', () => ({
  searchHuggingFaceModels: (...a) => searchHuggingFaceModels(...a),
  resolveCuratedModels: (...a) => resolveCuratedModels(...a),
}));

const mod = await import('./CategoryShelf');
const CategoryShelf = mod.default;
const { SHELF_CACHE } = mod;

const CATEGORY = { value: 'video', label: 'Video', icon: 'MovieOutlined' };

function makeModels(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, repoId: `vendor/model-${i}` }));
}

beforeEach(() => {
  SHELF_CACHE.clear();
  searchHuggingFaceModels.mockReset();
  resolveCuratedModels.mockReset();
});

describe('CategoryShelf', () => {
  it('fetches its category top-20 and renders preview cards', async () => {
    searchHuggingFaceModels.mockResolvedValue(makeModels(3));
    render(<CategoryShelf category={CATEGORY} onOpenDownload={vi.fn()} onShowAll={vi.fn()} />);

    await screen.findByText('vendor/model-0');
    expect(searchHuggingFaceModels).toHaveBeenCalledWith('', { limit: 20, category: 'video' });
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('shows at most the preview count and a trailing Show all tile when overflowing', async () => {
    searchHuggingFaceModels.mockResolvedValue(makeModels(20));
    render(<CategoryShelf category={CATEGORY} onOpenDownload={vi.fn()} onShowAll={vi.fn()} />);

    await screen.findByText('vendor/model-0');
    // Only the first 6 preview cards render inline.
    expect(screen.getAllByTestId('card')).toHaveLength(6);
    expect(screen.getByText('20 models')).toBeInTheDocument();
  });

  it('fires onShowAll from the header button', async () => {
    const onShowAll = vi.fn();
    searchHuggingFaceModels.mockResolvedValue(makeModels(3));
    render(<CategoryShelf category={CATEGORY} onOpenDownload={vi.fn()} onShowAll={onShowAll} />);

    await screen.findByText('vendor/model-0');
    fireEvent.click(screen.getByRole('button', { name: /show all/i }));
    expect(onShowAll).toHaveBeenCalledWith(CATEGORY);
  });

  it('renders nothing when the category has no models', async () => {
    searchHuggingFaceModels.mockResolvedValue([]);
    const { container } = render(
      <CategoryShelf category={CATEGORY} onOpenDownload={vi.fn()} onShowAll={vi.fn()} />
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText('Video')).not.toBeInTheDocument();
  });

  it('serves from the shared cache without refetching', async () => {
    SHELF_CACHE.set('video', makeModels(2));
    render(<CategoryShelf category={CATEGORY} onOpenDownload={vi.fn()} onShowAll={vi.fn()} />);
    expect(screen.getByText('vendor/model-0')).toBeInTheDocument();
    expect(searchHuggingFaceModels).not.toHaveBeenCalled();
  });

  it('resolves a curated list instead of the category search', async () => {
    const curated = [
      { name: 'Alpha', query: 'alpha' },
      { name: 'Beta', query: 'beta' },
    ];
    resolveCuratedModels.mockResolvedValue([
      { id: 'a', repoId: 'org/alpha', rank: 1 },
      { id: 'b', repoId: 'org/beta', rank: 2 },
    ]);
    const CURATED = { value: 'uncensored', label: 'Uncensored', icon: 'LockOpenOutlined', curated };
    render(<CategoryShelf category={CURATED} onOpenDownload={vi.fn()} onShowAll={vi.fn()} />);

    await screen.findByText('org/alpha');
    expect(resolveCuratedModels).toHaveBeenCalledWith(curated);
    expect(searchHuggingFaceModels).not.toHaveBeenCalled();
    expect(screen.getByText('Uncensored')).toBeInTheDocument();
  });
});
