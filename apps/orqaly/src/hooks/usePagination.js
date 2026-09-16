import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

const STORAGE_PREFIX = 'orch_pagination_';
const DEFAULT_OPTIONS = [10, 25, 50];

function loadStoredRowsPerPage(surfaceId, fallback, allowed) {
  if (!surfaceId) return fallback;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${surfaceId}`);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    const n = typeof parsed === 'number' ? parsed : parsed?.rowsPerPage;
    if (typeof n === 'number' && allowed.includes(n)) return n;
    return fallback;
  } catch {
    return fallback;
  }
}

function saveStoredRowsPerPage(surfaceId, rowsPerPage) {
  if (!surfaceId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${surfaceId}`, JSON.stringify({ rowsPerPage }));
  } catch {
    // ignore quota/unavailable
  }
}

/**
 * Shared pagination state for tables and card grids.
 *
 * @param {Array} data - the full dataset to paginate (client-side slicing).
 * @param {object} [opts]
 * @param {string} [opts.surfaceId]          Unique key for localStorage persistence.
 * @param {number} [opts.defaultRowsPerPage] Fallback page size (default 10).
 * @param {number[]} [opts.rowsPerPageOptions] Allowed page sizes (default [10, 25, 50]).
 * @param {Array} [opts.resetOn]             Dependency array; when any value changes, page resets to 0.
 */
export default function usePagination(data, opts = {}) {
  const {
    surfaceId,
    defaultRowsPerPage = 10,
    rowsPerPageOptions = DEFAULT_OPTIONS,
    resetOn,
  } = opts;

  const [rowsPerPage, setRowsPerPageState] = useState(() =>
    loadStoredRowsPerPage(surfaceId, defaultRowsPerPage, rowsPerPageOptions)
  );
  const [page, setPage] = useState(0);
  const [allMode, setAllMode] = useState(false);

  // Remember the last non-all rowsPerPage so we can restore on collapse.
  const prevRowsPerPageRef = useRef(rowsPerPage);

  const totalCount = Array.isArray(data) ? data.length : 0;
  const effectiveRowsPerPage = allMode ? Math.max(totalCount, 1) : rowsPerPage;
  const pageCount = Math.max(1, Math.ceil(totalCount / effectiveRowsPerPage));

  // Clamp page if data shrinks below current page window.
  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  // Reset to first page when external filters/tabs change.
  useEffect(
    () => {
      setPage(0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    Array.isArray(resetOn) ? resetOn : []
  );

  const setRowsPerPage = useCallback(
    (value) => {
      const next = Number(value);
      if (!Number.isFinite(next) || next <= 0) return;
      prevRowsPerPageRef.current = next;
      setRowsPerPageState(next);
      setPage(0);
      saveStoredRowsPerPage(surfaceId, next);
    },
    [surfaceId]
  );

  const loadAll = useCallback(() => {
    prevRowsPerPageRef.current = rowsPerPage;
    setAllMode(true);
    setPage(0);
  }, [rowsPerPage]);

  const collapseAll = useCallback(() => {
    setAllMode(false);
    setRowsPerPageState(prevRowsPerPageRef.current);
    setPage(0);
  }, []);

  const startIndex = page * effectiveRowsPerPage;
  const endIndex = Math.min(startIndex + effectiveRowsPerPage, totalCount);

  const paginatedData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.slice(startIndex, endIndex);
  }, [data, startIndex, endIndex]);

  return {
    page,
    rowsPerPage: effectiveRowsPerPage,
    storedRowsPerPage: rowsPerPage,
    setPage,
    setRowsPerPage,
    paginatedData,
    totalCount,
    pageCount,
    startIndex,
    endIndex,
    allMode,
    loadAll,
    collapseAll,
    rowsPerPageOptions,
  };
}
