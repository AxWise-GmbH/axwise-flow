/**
 * How tall the goal thread is allowed to be.
 *
 * The thread has its own scroller, but a scroller only bounds anything if an
 * ancestor has a definite height. While the surface merely had a min-height and
 * was free to grow, a long run pushed the page taller than the viewport: the
 * conversation scrolled off the bottom and took the composer with it, which is
 * the one thing that must never leave the screen.
 *
 * So the surface is given exactly the space the shell leaves it, and everything
 * longer than that scrolls inside. The arithmetic mirrors getAppMainScrollSx -
 * it is the same layout read from the other end - which is why it lives here,
 * next to a test, rather than inline in a 5000-line page.
 */
import { HEADER_HEIGHT, HEADER_OFFSET, SIDEBAR_INSET } from '../../utils/constants';

/** What <main> is pushed down by: the fixed header and its floating inset. */
export const HEADER_OFFSET_PX = HEADER_HEIGHT + SIDEBAR_INSET;

/**
 * What <main> already reserves at the bottom for the dock.
 *
 * Mirrors the `pb` in getAppMainScrollSx. The surface adds none of its own on
 * top - padding it twice is what left a band of dead space under the composer.
 */
export const DOCK_CLEARANCE_PX = { xs: 80, sm: 96 };

/** The surface's own top padding, so the thread starts just under the header. */
export const SURFACE_TOP_PAD_PX = 4;
export const TYPING_CLEARANCE_PX = { xs: 12, sm: 16 };

/**
 * The MUI responsive height value for the goal surface.
 *
 * dvh rather than vh: on mobile browsers the toolbar collapses on scroll, and
 * vh keeps measuring the tall viewport, so the composer sits below the fold for
 * as long as the toolbar is showing.
 */
export function goalSurfaceHeight({
  headerOffset = HEADER_OFFSET,
  topPad = SURFACE_TOP_PAD_PX,
  bottomClearance = DOCK_CLEARANCE_PX,
} = {}) {
  const offset =
    typeof headerOffset === 'number' ? { xs: headerOffset, sm: headerOffset } : headerOffset;
  const clearance =
    typeof bottomClearance === 'number'
      ? { xs: bottomClearance, sm: bottomClearance }
      : bottomClearance;
  const at = (header, bottom) =>
    `calc(100dvh - ${header}px - ${bottom}px - env(safe-area-inset-bottom, 0px) - ${topPad}px)`;
  return {
    xs: at(offset.xs, clearance.xs),
    sm: at(offset.sm, clearance.sm),
  };
}

export function heroMinHeight({ headerOffset = HEADER_OFFSET } = {}) {
  const offset =
    typeof headerOffset === 'number' ? { xs: headerOffset, sm: headerOffset } : headerOffset;
  return { xs: `calc(100dvh - ${offset.xs}px)`, sm: `calc(100dvh - ${offset.sm}px)` };
}
