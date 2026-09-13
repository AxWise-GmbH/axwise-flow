import { useEffect, useRef, useState } from 'react';

/**
 * Show instantly when motion is reduced or IntersectionObserver is missing
 * (jsdom/SSR). Shared by Reveal (section fade-up), the row-stagger helper, and
 * ChartReveal (chart draw-in) so all home-page entrance motion uses one trigger.
 */
function initialInView() {
  if (typeof window === 'undefined') return true;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return Boolean(prefersReduced) || typeof IntersectionObserver === 'undefined';
}

/**
 * Returns `[ref, inView]`. Attach `ref` to an element; `inView` flips true when
 * it scrolls into the viewport. With `once` (default), it stays true after the
 * first intersection. Falls back to immediately-true when motion is reduced or
 * IntersectionObserver is unavailable.
 *
 * @param {{ threshold?: number, rootMargin?: string, once?: boolean }} [opts]
 */
export default function useInView({
  threshold = 0.12,
  rootMargin = '0px 0px -10% 0px',
  once = true,
} = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(initialInView);

  useEffect(() => {
    if (inView && once) return undefined;
    // Safety net FIRST — armed even when `ref.current` is null at mount. Blocks
    // that render a loading state attach the observed element only after data
    // loads, so on mount `el` is null; without this the observer is never set
    // up and `inView` would stay false forever, leaving staggered rows/cards
    // permanently at opacity:0 (headers visible, body invisible). Revealing
    // after a short delay guarantees data is never hidden; the entrance
    // animation still plays.
    const fallback = setTimeout(() => setInView(true), 600);
    const el = ref.current;
    if (!el) return () => clearTimeout(fallback);
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setInView(true);
          else if (!once) setInView(false);
        }),
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, inView];
}
