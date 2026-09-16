/**
 * [module: design-system]
 *
 * Anchor navigation for the /standart page.
 *
 * The nav on this page navigates only within the page: no link leaves it except
 * Sign in and Start free. So there is no router involved, and the three things
 * that need solving are scrolling to a section, knowing which one you are in,
 * and putting focus somewhere sensible afterwards.
 *
 * This generalises `useActiveAnchor` in Landing/sections/StickyNav.jsx, which
 * does the same job but hardcodes its id list and queries `[data-orb-section]`.
 * It also fixes a latent crash in that version - see the guard in observe().
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NAV_H } from './standartTokens';

/**
 * A little more than the bar, so a heading does not sit flush against it.
 */
const SCROLL_GAP_PX = 12;

/**
 * Does this reader want motion reduced?
 *
 * Read on demand rather than subscribed to, matching every other reader in this
 * codebase (useInView, ScrollingOrb, StickyNav). A reader who changes the OS
 * setting mid-visit keeps the old answer until the next mount, which is the same
 * bargain the rest of the app makes.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/** The same answer, as a hook, for components that want it in render. */
export function useReducedMotion() {
  return useMemo(() => prefersReducedMotion(), []);
}

/**
 * Scroll to a section and hand it focus.
 *
 * @param {string} id the section's DOM id
 * @param {{ reduced?: boolean }} [opts]
 * @returns {boolean} false when there is no such section, so a caller can fall
 *   back to a real navigation rather than silently doing nothing.
 */
export function scrollToSection(id, { reduced = prefersReducedMotion() } = {}) {
  if (typeof document === 'undefined' || !id) return false;
  const el = document.getElementById(id);
  if (!el) return false;

  const rect = el.getBoundingClientRect();
  const top = rect.top + window.scrollY - NAV_H - SCROLL_GAP_PX;

  // Reduced motion gets an instant jump, not a faster animation. A shortened
  // smooth scroll is still a scroll, and it is the movement that is the problem.
  window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });

  // replaceState, not pushState. With six anchors on one page, pushState turns
  // the Back button into a tour of the sections the reader already read.
  try {
    window.history.replaceState(null, '', `#${id}`);
  } catch {
    // Some embedded webviews refuse history writes. The scroll already happened,
    // and the hash is a nicety.
  }

  // Focus goes to the SECTION, not back to the trigger.
  //
  // This is the part that is easy to get backwards. Returning focus to the nav
  // trigger is right when the reader dismissed the menu (Escape) and wrong when
  // they chose something from it: a screen-reader user who picks "Security" and
  // is left at the top of the page has been told nothing happened.
  //
  // `preventScroll` is not optional. Without it the browser runs its own focus
  // scroll, which fights the smooth scroll above and lands the reader in the
  // middle of the animation.
  const hadTabIndex = el.hasAttribute('tabindex');
  if (!hadTabIndex) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (!hadTabIndex) {
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }

  return true;
}

/**
 * Which of `ids` is the reader currently in.
 *
 * @param {string[]} ids section ids, in page order
 * @returns {string|null}
 */
export function useActiveSection(ids) {
  const [activeId, setActiveId] = useState(null);
  // The array is rebuilt on every render at most call sites; key the effect on
  // its contents so it does not tear down and rebuild the observer each time.
  const key = Array.isArray(ids) ? ids.join('|') : '';

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const list = key ? key.split('|') : [];
    const nodes = list.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          // `entry.target` is guarded because src/test/setup.js stubs
          // IntersectionObserver with a callback fired as `cb([{ isIntersecting:
          // true }])` - no target at all. StickyNav's version reads
          // `visible.target.getAttribute(...)` unguarded and throws against that
          // stub, which is why this one does not.
          .filter((e) => e?.isIntersecting && e.target?.id)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (visible) setActiveId(visible.target.id);
      },
      // A band across the middle of the viewport: the active section is the one
      // the reader is looking at, not the one that has just crept into view.
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5] }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [key]);

  return activeId;
}

/**
 * The pair together: what is active, and how to go somewhere.
 *
 * @param {string[]} ids
 * @returns {{ activeId: string|null, go: (id: string) => boolean }}
 */
export default function useAnchorNav(ids) {
  const activeId = useActiveSection(ids);
  const reduced = useReducedMotion();

  // `reduced` is read once at mount by useReducedMotion, so it is stable for the
  // life of the hook and safe as a dependency. An earlier version parked it in a
  // ref written during render, which is the pattern react-hooks/refs exists to
  // catch: a ref assigned in the render body is not a subscription, it is a
  // side effect that happens to work until React renders twice.
  const go = useCallback((id) => scrollToSection(id, { reduced }), [reduced]);

  return { activeId, go };
}
