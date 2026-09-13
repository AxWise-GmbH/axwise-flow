import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchProviderCatalog = vi.fn();
vi.mock('../services/providerCatalogService', () => ({
  fetchProviderCatalog: (...a) => fetchProviderCatalog(...a),
}));

const useProviderCatalogSearch = (await import('./useProviderCatalogSearch')).default;

beforeEach(() => {
  vi.clearAllMocks();
  fetchProviderCatalog.mockResolvedValue([{ id: 'x', name: 'X' }]);
});

describe('useProviderCatalogSearch', () => {
  it('does not fetch without a provider', async () => {
    const { result } = renderHook(() => useProviderCatalogSearch('models', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchProviderCatalog).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it('fetches for the initial provider and stores items', async () => {
    const { result } = renderHook(() => useProviderCatalogSearch('models', 'openrouter'));
    await waitFor(() => expect(fetchProviderCatalog).toHaveBeenCalled());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchProviderCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openrouter', category: 'models' })
    );
  });

  it('debounces the query into a single fetch', async () => {
    const { result } = renderHook(() => useProviderCatalogSearch('models', 'openrouter'));
    await waitFor(() => expect(fetchProviderCatalog).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.setQuery('c');
      result.current.setQuery('cl');
      result.current.setQuery('claude');
    });
    await waitFor(() =>
      expect(fetchProviderCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'claude' })
      )
    );
    // 1 initial + 1 debounced (not 3)
    expect(fetchProviderCatalog).toHaveBeenCalledTimes(2);
  });

  it('surfaces an error and clears items', async () => {
    fetchProviderCatalog.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useProviderCatalogSearch('models', 'openrouter'));
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.items).toEqual([]);
  });

  it('changing provider resets the query', async () => {
    const { result } = renderHook(() => useProviderCatalogSearch('models', 'openrouter'));
    await waitFor(() => expect(fetchProviderCatalog).toHaveBeenCalled());
    act(() => result.current.setQuery('mistral'));
    act(() => result.current.setProvider('huggingface'));
    expect(result.current.query).toBe('');
    expect(result.current.provider).toBe('huggingface');
  });
});
