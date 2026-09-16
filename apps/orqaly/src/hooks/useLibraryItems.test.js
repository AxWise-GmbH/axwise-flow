import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchLibraryItems = vi.fn();
vi.mock('../services/importedLibrariesService', () => ({
  fetchLibraryItems: (...a) => fetchLibraryItems(...a),
}));

const useLibraryItems = (await import('./useLibraryItems')).default;

const bundledLib = {
  id: 'bundled-lib',
  items: Array.from({ length: 20 }, (_, i) => ({
    id: `b-${i}`,
    name: `Item ${i}`,
    tags: i === 3 ? ['special'] : [],
  })),
};

const liveLib = { id: 'awesome-chatgpt-prompts', live: true, items: [{ id: 'sample', name: 'Sample' }] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLibraryItems - non-live', () => {
  it('paginates local items and Load More reveals more', async () => {
    const { result } = renderHook(() => useLibraryItems(bundledLib, 'skills', '', true));
    expect(result.current.items).toHaveLength(12); // LOCAL_PAGE
    expect(result.current.total).toBe(20);
    expect(result.current.hasMore).toBe(true);
    expect(fetchLibraryItems).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items).toHaveLength(20);
    expect(result.current.hasMore).toBe(false);
  });

  it('filters local items by query', async () => {
    const { result } = renderHook(() => useLibraryItems(bundledLib, 'skills', 'special', true));
    expect(result.current.total).toBe(1);
    expect(result.current.items[0].name).toBe('Item 3');
  });
});

describe('useLibraryItems - live', () => {
  it('fetches page 0 when active and appends on Load More', async () => {
    fetchLibraryItems
      .mockResolvedValueOnce({ items: [{ id: 'a', name: 'A' }], total: 3, hasMore: true, live: true })
      .mockResolvedValueOnce({ items: [{ id: 'b', name: 'B' }], total: 3, hasMore: false, live: true });

    const { result } = renderHook(() => useLibraryItems(liveLib, 'skills', '', true));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.live).toBe(true);
    expect(result.current.total).toBe(3);
    expect(fetchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'awesome-chatgpt-prompts', offset: 0 })
    );

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not fetch while inactive', async () => {
    renderHook(() => useLibraryItems(liveLib, 'skills', '', false));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchLibraryItems).not.toHaveBeenCalled();
  });

  it('falls back to bundled items when the source is not live', async () => {
    fetchLibraryItems.mockResolvedValue({ items: [], total: 0, hasMore: false, live: false });
    const { result } = renderHook(() => useLibraryItems(liveLib, 'skills', '', true));
    await waitFor(() => expect(result.current.live).toBe(false));
    // fell back to the library's bundled sample items
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Sample');
  });
});
