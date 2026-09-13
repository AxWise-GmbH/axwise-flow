import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePagination from '../usePagination';

const sample = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('usePagination', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('slices data by the default page size', () => {
    const { result } = renderHook(() => usePagination(sample(70)));
    expect(result.current.paginatedData).toEqual(sample(10));
    expect(result.current.pageCount).toBe(7);
    expect(result.current.totalCount).toBe(70);
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(10);
  });

  it('returns the correct slice after setPage', () => {
    const { result } = renderHook(() => usePagination(sample(70)));
    act(() => result.current.setPage(2));
    expect(result.current.paginatedData).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });

  it('clamps page when data shrinks below current window', () => {
    const { result, rerender } = renderHook(({ data }) => usePagination(data), {
      initialProps: { data: sample(70) },
    });
    act(() => result.current.setPage(6));
    rerender({ data: sample(12) });
    // 12 items with size 10 → pageCount 2, page 6 clamps to 1
    expect(result.current.page).toBe(1);
    expect(result.current.paginatedData).toEqual([11, 12]);
  });

  it('persists rowsPerPage to localStorage when surfaceId is provided', () => {
    const { result, unmount } = renderHook(() =>
      usePagination(sample(100), { surfaceId: 'test.surface' })
    );
    act(() => result.current.setRowsPerPage(25));
    expect(JSON.parse(localStorage.getItem('orch_pagination_test.surface'))).toEqual({
      rowsPerPage: 25,
    });
    unmount();

    // Remount → should hydrate to 25
    const { result: r2 } = renderHook(() =>
      usePagination(sample(100), { surfaceId: 'test.surface' })
    );
    expect(r2.current.rowsPerPage).toBe(25);
  });

  it('ignores stored values not in rowsPerPageOptions', () => {
    localStorage.setItem('orch_pagination_test.weird', JSON.stringify({ rowsPerPage: 999 }));
    const { result } = renderHook(() =>
      usePagination(sample(50), { surfaceId: 'test.weird', defaultRowsPerPage: 10 })
    );
    expect(result.current.rowsPerPage).toBe(10);
  });

  it('loadAll renders the full dataset and collapseAll restores prior size', () => {
    const { result } = renderHook(() => usePagination(sample(70)));
    act(() => result.current.setRowsPerPage(25));
    act(() => result.current.loadAll());
    expect(result.current.allMode).toBe(true);
    expect(result.current.paginatedData.length).toBe(70);

    act(() => result.current.collapseAll());
    expect(result.current.allMode).toBe(false);
    expect(result.current.rowsPerPage).toBe(25);
    expect(result.current.paginatedData.length).toBe(25);
  });

  it('resets page to 0 when resetOn deps change', () => {
    const { result, rerender } = renderHook(
      ({ filter }) => usePagination(sample(70), { resetOn: [filter] }),
      { initialProps: { filter: 'a' } }
    );

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    rerender({ filter: 'b' });
    expect(result.current.page).toBe(0);
  });

  it('returns empty paginatedData for non-array input', () => {
    const { result } = renderHook(() => usePagination(null));
    expect(result.current.paginatedData).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.pageCount).toBe(1);
  });

  it('setRowsPerPage snaps page to 0', () => {
    const { result } = renderHook(() => usePagination(sample(100)));
    act(() => result.current.setPage(5));
    expect(result.current.page).toBe(5);
    act(() => result.current.setRowsPerPage(25));
    expect(result.current.page).toBe(0);
  });
});
