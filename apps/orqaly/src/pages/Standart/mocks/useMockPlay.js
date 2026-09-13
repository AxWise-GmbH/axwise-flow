/**
 * [module: design-system]
 *
 * The one animation every mockup on this page uses.
 *
 * Each mockup performs its story ONCE, when the reader scrolls to it, and then
 * holds the finished state. Nothing on this page loops. A looping animation in a
 * card is a thing the eye keeps returning to while trying to read the paragraph
 * beside it - which is the opposite of what a mockup is for.
 *
 * Returns `[ref, played]`. Attach the ref to the mockup's frame; `played` counts
 * up from 0 to `count` and each element compares its own index against it.
 * Counting rather than a boolean per element means a mockup with eight rows
 * needs eight comparisons, not eight pieces of state.
 *
 * REDUCED MOTION lands the FINISHED state immediately, not a shorter animation
 * and not a paused one. That is the rule stated in five module headers across
 * theme/: "every helper answers prefers-reduced-motion: reduce with the finished
 * state, never a half-played one."
 *
 * STRICT MODE is on in this app, so the effect runs twice on mount in
 * development. Every timer is collected and cleared on teardown, so the second
 * run replaces the first rather than racing it.
 */
import { useEffect, useState } from 'react';
import useInView from '../../../components/Common/useInView';
import { ROW_STEP_MS } from '../standartMotion';
import { prefersReducedMotion } from '../useAnchorNav';

/**
 * @param {number} count how many steps the mockup has
 * @param {{ step?: number, start?: number }} [opts]
 *   step  gap between steps. Defaults to the product's own 45ms cascade - inside
 *         a picture of the product, the product's pace is the right one, even
 *         though the page itself cascades sections at the slower marketing 120ms.
 *   start a pause before the first step, so the mockup is legible for a moment
 *         before it starts moving.
 * @returns {[import('react').RefObject<HTMLElement>, number]}
 */
export default function useMockPlay(count, { step = ROW_STEP_MS, start = 260 } = {}) {
  const [ref, inView] = useInView();
  // Seeded from the finished state under reduced motion so there is not even a
  // single frame of the empty version.
  const [played, setPlayed] = useState(() => (prefersReducedMotion() ? count : 0));

  useEffect(() => {
    // Reduced motion needs no effect at all: the initial state above is already
    // the finished one. Setting it again here would be a redundant state write
    // during an effect, which is what react-hooks/set-state-in-effect flags.
    if (!inView || prefersReducedMotion()) return undefined;

    const timers = [];
    for (let i = 1; i <= count; i += 1) {
      timers.push(setTimeout(() => setPlayed(i), start + i * step));
    }
    return () => timers.forEach(clearTimeout);
  }, [inView, count, step, start]);

  return [ref, played];
}
