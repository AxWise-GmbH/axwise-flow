import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let catalogState;
const setProvider = vi.fn();
const setQuery = vi.fn();
vi.mock('../../hooks/useProviderCatalogSearch', () => ({
  default: () => ({ setProvider, setQuery, ...catalogState }),
}));

const importItems = vi.fn();
let importedItems = [];
vi.mock('../../hooks/useImportedLibraries', () => ({
  default: () => ({ importedItems, importItems }),
}));

let currentCategory = 'models';
const setSearchParams = vi.fn();
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams({ category: currentCategory }), setSearchParams],
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/marketplace/import', search: '', hash: '', state: null }),
  Link: ({ children }) => children,
}));

// Stub the curated dialog (it pulls in other hooks we don't exercise here).
vi.mock('../../components/Marketplace/ImportLibraryDialog', () => ({
  default: () => null,
}));

const MarketplaceImport = (await import('./MarketplaceImport')).default;

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* jsdom */
  }
  currentCategory = 'models';
  importedItems = [];
  catalogState = {
    provider: 'openrouter',
    query: '',
    items: [
      { id: 'or-claude', name: 'Claude Sonnet', exactModel: 'anthropic/claude', description: 'x' },
      { id: 'or-gpt', name: 'GPT-4o', exactModel: 'openai/gpt-4o', description: 'y' },
    ],
    loading: false,
    error: null,
  };
  importItems.mockResolvedValue(undefined);
});

describe('MarketplaceImport', () => {
  it('renders provider results and imports the selected item', async () => {
    render(<MarketplaceImport />);
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select Claude Sonnet'));
    const importBtn = screen.getByRole('button', { name: /Import selected \(1\)/ });
    fireEvent.click(importBtn);
    await waitFor(() => expect(importItems).toHaveBeenCalled());
    const [lib, items] = importItems.mock.calls[0];
    expect(lib.id).toBe('openrouter-live');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Claude Sonnet');
  });

  it('marks already-imported items and disables their checkbox', () => {
    importedItems = [{ id: 'or-claude', name: 'Claude Sonnet' }];
    render(<MarketplaceImport />);
    const cb = screen.getByLabelText('Select Claude Sonnet');
    expect(cb).toBeChecked();
    expect(cb).toBeDisabled();
  });

  it('shows an error alert when the hook reports an error', () => {
    catalogState.error = 'OpenRouter returned 502';
    catalogState.items = [];
    render(<MarketplaceImport />);
    expect(screen.getByText('OpenRouter returned 502')).toBeInTheDocument();
  });

  it('shows a no-live-catalog message for a curated-only category', () => {
    currentCategory = 'orgs';
    catalogState.provider = '';
    catalogState.items = [];
    render(<MarketplaceImport />);
    expect(screen.getByText(/No live catalog for/i)).toBeInTheDocument();
  });

  it('renders skeletons while loading', () => {
    catalogState.loading = true;
    catalogState.items = [];
    const { container } = render(<MarketplaceImport />);
    expect(container.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });

  it('paginates results (12 per page) and navigates pages', () => {
    catalogState.items = Array.from({ length: 15 }, (_, i) => ({
      id: `m-${i}`,
      name: `Model ${i}`,
      exactModel: `x/${i}`,
    }));
    render(<MarketplaceImport />);
    // first page shows Model 0..11, not Model 12
    expect(screen.getByLabelText('Select Model 0')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select Model 12')).not.toBeInTheDocument();
    // go to page 2
    fireEvent.click(screen.getByLabelText('Go to page 2'));
    expect(screen.getByLabelText('Select Model 12')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select Model 0')).not.toBeInTheDocument();
  });

  it('select-all-on-page ticks every visible item', () => {
    catalogState.items = Array.from({ length: 15 }, (_, i) => ({
      id: `m-${i}`,
      name: `Model ${i}`,
      exactModel: `x/${i}`,
    }));
    render(<MarketplaceImport />);
    fireEvent.click(screen.getByLabelText('Select all on this page'));
    // 12 visible on page 1 -> Import selected (12)
    expect(screen.getByRole('button', { name: /Import selected \(12\)/ })).toBeInTheDocument();
  });
});
