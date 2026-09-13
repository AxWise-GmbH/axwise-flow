/**
 * useLibraryItems(lib, category, query, active) - paginated, searchable items
 * for one Import-dialog library.
 *
 *  - Live libraries (lib.live): fetch a page at a time from the library's public
 *    source via /api/app?path=marketplace-library-items, server-side filtered by
 *    `query`. loadMore() appends the next page. If the source is unavailable the
 *    hook transparently falls back to the library's bundled items.
 *  - Other libraries: paginate/filter lib.items locally; loadMore() reveals more.
 *
 * `active` gates fetching (pass true only when the card is expanded or a search
 * is in progress) so collapsed libraries never hit the network.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchLibraryItems } from '../services/importedLibrariesService';

const LOCAL_PAGE = 12;
const LIVE_PAGE = 50;

function hay(item) {
  const arr = (v) => (Array.isArray(v) ? v.join(' ') : '');
  return [
    item.name,
    item.description,
    item.role,
    item.category,
    item.slug,
    item.type,
    item.industry,
    item.exactModel,
    item.provider,
    item.connectionType,
    arr(item.tags),
    arr(item.capabilities),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function useLibraryItems(lib, category, query = '', active = false) {
  const isLive = !!lib?.live;
  const sourceId = lib?.id;
  const rawQ = (query || '').trim();
  const bundled = useMemo(() => (Array.isArray(lib?.items) ? lib.items : []), [lib]);

  // If the query matches the library's own name/author/tags, surface all of its
  // items (so typing a library name reveals everything it offers).
  const libMatches = useMemo(() => {
    if (!rawQ) return false;
    const tags = Array.isArray(lib?.tags) ? lib.tags.join(' ') : '';
    return `${lib?.name || ''} ${lib?.author || ''} ${tags}`
      .toLowerCase()
      .includes(rawQ.toLowerCase());
  }, [lib, rawQ]);
  const q = libMatches ? '' : rawQ;

  // Live state
  const [live, setLive] = useState({ items: [], total: 0, hasMore: false, ok: isLive });
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const reqRef = useRef(0);

  // Local (non-live / fallback) pagination
  const [visible, setVisible] = useState(LOCAL_PAGE);
  useEffect(() => {
    setVisible(LOCAL_PAGE);
  }, [q, sourceId]);

  // Live fetch: reset + load page 0 whenever the source/query changes while active.
  useEffect(() => {
    if (!isLive || !active) return undefined;
    const reqId = ++reqRef.current;
    offsetRef.current = 0;
    setLoading(true);
    fetchLibraryItems({ category, sourceId, offset: 0, limit: LIVE_PAGE, q })
      .then((r) => {
        if (reqRef.current !== reqId) return;
        if (!r.live) {
          setLive({ items: [], total: 0, hasMore: false, ok: false });
          return;
        }
        setLive({ items: r.items, total: r.total, hasMore: r.hasMore, ok: true });
        offsetRef.current = r.items.length;
      })
      .catch(() => {
        if (reqRef.current === reqId) setLive({ items: [], total: 0, hasMore: false, ok: false });
      })
      .finally(() => {
        if (reqRef.current === reqId) setLoading(false);
      });
    return undefined;
  }, [isLive, active, category, sourceId, q]);

  const useLiveData = isLive && live.ok;

  const local = useMemo(() => {
    const filtered = q ? bundled.filter((it) => hay(it).includes(q.toLowerCase())) : bundled;
    return {
      items: filtered.slice(0, visible),
      total: filtered.length,
      hasMore: visible < filtered.length,
    };
  }, [bundled, q, visible]);

  const loadMore = useCallback(async () => {
    if (useLiveData) {
      const reqId = reqRef.current; // append to the current query, don't invalidate
      setLoading(true);
      try {
        const r = await fetchLibraryItems({
          category,
          sourceId,
          offset: offsetRef.current,
          limit: LIVE_PAGE,
          q,
        });
        if (reqRef.current !== reqId) return;
        offsetRef.current += r.items.length;
        setLive((prev) => ({
          items: [...prev.items, ...r.items],
          total: r.total || prev.total,
          hasMore: r.hasMore,
          ok: true,
        }));
      } finally {
        if (reqRef.current === reqId) setLoading(false);
      }
    } else {
      setVisible((v) => v + LOCAL_PAGE);
    }
  }, [useLiveData, category, sourceId, q]);

  const view = useLiveData ? live : local;
  return {
    items: view.items,
    total: view.total,
    hasMore: view.hasMore,
    loading,
    loadMore,
    live: useLiveData,
  };
}
