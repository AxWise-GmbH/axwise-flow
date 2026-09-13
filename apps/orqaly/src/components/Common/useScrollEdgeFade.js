import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether a scrollable container has more content below the current
 * viewport, to drive a bottom fade/shadow "more content" affordance. Uses a
 * 1px sentinel at the true end of the scrollable content plus an
 * IntersectionObserver scoped to the container (`root`), so it stays correct
 * across content-height changes (a panel switching, items loading) without a
 * scroll-event listener.
 *
 * Falls back to `showBottomFade: false` when IntersectionObserver is
 * unavailable (jsdom/SSR) — the affordance is purely decorative.
 *
 * Usage:
 *   const { containerRef, sentinelRef, showBottomFade } = useScrollEdgeFade();
 *   <Box ref={containerRef} sx={{ overflowY: 'auto', ... }}>
 *     ...content...
 *     <Box ref={sentinelRef} aria-hidden sx={{ height: 1 }} />
 *   </Box>
 */
export default function useScrollEdgeFade() {
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    const root = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setShowBottomFade(!entry.isIntersecting), {
      root,
      threshold: 0,
    });
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return { containerRef, sentinelRef, showBottomFade };
}
