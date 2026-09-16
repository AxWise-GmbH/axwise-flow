import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../icons/AppIcon', () => ({ default: () => null }));
vi.mock('./DownloadModelCard', () => ({
  default: ({ model }) => <div data-testid="card">{model.repoId}</div>,
}));
// Stub each shelf so we can assert one-shelf-per-category and drive "Show all".
vi.mock('./CategoryShelf', () => ({
  default: ({ category, onShowAll }) => (
    <button data-testid="shelf" onClick={() => onShowAll(category)}>
      shelf:{category.value}
    </button>
  ),
  SHELF_CACHE: new Map(),
}));

const searchHuggingFaceModels = vi.fn();
const resolveCuratedModels = vi.fn();
const listModelFiles = vi.fn();
vi.mock('../../services/huggingfaceModelsService', () => ({
  searchHuggingFaceModels: (...a) => searchHuggingFaceModels(...a),
  resolveCuratedModels: (...a) => resolveCuratedModels(...a),
  listModelFiles: (...a) => listModelFiles(...a),
}));

import { MODEL_CATEGORIES } from '../../config/modelCategories';
import { SHELF_CACHE } from './CategoryShelf';
const MarketplaceDownloadModels = (await import('./MarketplaceDownloadModels')).default;

function makeModels(n, prefix = 'vendor/model') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, repoId: `${prefix}-${i}` }));
}

beforeEach(() => {
  SHELF_CACHE.clear();
  searchHuggingFaceModels.mockReset();
  resolveCuratedModels.mockReset();
  listModelFiles.mockReset();
});

describe('MarketplaceDownloadModels', () => {
  it('renders one shelf per category, with Uncensored first', () => {
    render(<MarketplaceDownloadModels />);
    const shelves = screen.getAllByTestId('shelf');
    expect(shelves).toHaveLength(MODEL_CATEGORIES.length);
    expect(MODEL_CATEGORIES[0].value).toBe('uncensored');
    expect(shelves[0]).toHaveTextContent('shelf:uncensored');
    expect(searchHuggingFaceModels).not.toHaveBeenCalled();
  });

  it('opens a curated focused grid (rank order) when the Uncensored shelf Show all fires', async () => {
    resolveCuratedModels.mockResolvedValue([
      { id: 'u0', repoId: 'org/first', rank: 1 },
      { id: 'u1', repoId: 'org/second', rank: 2 },
    ]);
    render(<MarketplaceDownloadModels />);
    fireEvent.click(screen.getByText('shelf:uncensored'));

    await screen.findByText('org/first');
    expect(resolveCuratedModels).toHaveBeenCalledWith(MODEL_CATEGORIES[0].curated);
    expect(screen.getByText(/curated top/i)).toBeInTheDocument();
    expect(screen.queryByTestId('shelf')).not.toBeInTheDocument();
  });

  it('opens a focused top-20 grid when a shelf Show all fires, and Back returns', async () => {
    searchHuggingFaceModels.mockResolvedValue(makeModels(20, 'coding'));
    render(<MarketplaceDownloadModels />);

    // Click the Coding shelf's Show all.
    const codingShelf = screen.getByText('shelf:coding');
    fireEvent.click(codingShelf);

    await screen.findByText('coding-0');
    expect(searchHuggingFaceModels).toHaveBeenCalledWith('', { limit: 20, category: 'coding' });
    expect(screen.getByText(/top 20 by downloads/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(20);
    // Shelves are hidden in the focused view.
    expect(screen.queryByTestId('shelf')).not.toBeInTheDocument();

    // Back returns to the shelves.
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getAllByTestId('shelf')).toHaveLength(MODEL_CATEGORIES.length);
  });

  it('shows a flat search grid while typing', async () => {
    searchHuggingFaceModels.mockResolvedValue(makeModels(4, 'search'));
    render(<MarketplaceDownloadModels />);

    fireEvent.change(screen.getByPlaceholderText(/search hugging face/i), {
      target: { value: 'llama' },
    });

    await waitFor(() =>
      expect(searchHuggingFaceModels).toHaveBeenCalledWith('llama', { limit: 24 })
    );
    await screen.findByText('search-0');
    expect(screen.getAllByTestId('card')).toHaveLength(4);
    expect(screen.queryByTestId('shelf')).not.toBeInTheDocument();
  });
});
