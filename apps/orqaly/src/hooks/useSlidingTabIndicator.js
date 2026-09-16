import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The measurement half of Standart's Button-strip tab indicator.
 *
 * A real MUI `<Tabs>` slides one shared `<span>` between tabs because it owns
 * every tab's position. `PillTabStrip` and the hand-rolled page strips are a
 * row of independent `Button`/`ToggleButton` elements instead - nothing
 * measures them as a set - so there was no indicator to animate, only each
 * tab's own on/off underline (`standardTabSx`'s `boxShadow`). This hook is
 * that missing measurement: it watches whichever tab is `activeKey` and
 * reports its position relative to the strip's own container, in the same
 * shape MUI's own `Tabs.js` computes internally (`getBoundingClientRect()`
 * diffs against the container, not `offsetLeft` - so a positioned wrapper
 * between the container and a tab can't throw the reading off).
 *
 * The paired presentational half is `standardTabIndicatorSx` in
 * `theme/standardPage.js`, which only paints `{ left, width, ready }` - this
 * hook has no opinion on colour, height or the transition curve, so the two
 * families of tab strip (Button rows here, real `<Tabs>` via
 * `standardOverlayTabsSx`/`standardPageTabsSx`) can never draw a different
 * mark by construction.
 *
 * Usage - identical shape at every call site:
 * ```jsx
 * const { containerRef, registerTab, indicator } =
 *   useSlidingTabIndicator(activeTab, { enabled: theme.mono });
 * ...
 * <Box ref={containerRef} sx={{ position: 'relative', ... }}>
 *   {theme.mono && <Box aria-hidden sx={standardTabIndicatorSx(theme, indicator)} />}
 *   {tabs.map((t) => (
 *     <Button key={t.id} ref={registerTab(t.id)} ...>{t.label}</Button>
 *   ))}
 * </Box>
 * ```
 *
 * `enabled` (pass `mono`) keeps the hook fully inert outside Standart - no
 * `ResizeObserver`, no listeners, no state churn - so Simple/Punk pay nothing
 * for a mechanism they never render.
 *
 * @param {string|number|null|undefined} activeKey the currently selected
 *   tab's own key - whatever value the call site already uses to decide
 *   `selected`
 * @param {{enabled?: boolean}} [options]
 */
export function useSlidingTabIndicator(activeKey, options = {}) {
  const { enabled = true } = options;
  const containerRef = useRef(null);
  const tabRefs = useRef(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  // A stable-per-key setter, so `ref={registerTab(t.id)}` can be written
  // straight into JSX without a new function identity fighting React's
  // callback-ref reconciliation on every render.
  const registerTab = useCallback(
    (key) => (node) => {
      if (node) tabRefs.current.set(key, node);
      else tabRefs.current.delete(key);
    },
    []
  );

  const measure = useCallback(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const tab = tabRefs.current.get(activeKey);
    if (!container || !tab) return;
    const c = container.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    setIndicator({ left: t.left - c.left + container.scrollLeft, width: t.width, ready: true });
  }, [activeKey, enabled]);

  // Layout, not passive: paints the moved bar in the same frame as the tab
  // change rather than one frame after, which is what a visible jump-then-
  // slide would otherwise look like.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Re-measures on anything that can move the active tab without changing
  // `activeKey` itself - a `fullWidth` strip re-flowing at a breakpoint, a
  // label going from one line to two, a window resize. Both the container
  // AND the active tab are observed: a `fullWidth` flip can resize the
  // buttons without resizing the container that holds them.
  useEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    const active = tabRefs.current.get(activeKey);
    if (active) ro.observe(active);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, enabled, activeKey]);

  return { containerRef, registerTab, indicator };
}
