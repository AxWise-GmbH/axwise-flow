import { alpha } from '@mui/material';

/**
 * The Settings page's motion, as tokens.
 *
 * Settings is the one page that swaps its whole body on a click, so it carries
 * more motion than the rest of the app: an aurora behind the header, an
 * indicator that springs between tabs, pills that lean toward the cursor, and a
 * pane that fades in rather than snapping. Keeping it here - pure functions
 * returning `sx`, the way `wizardGlow.js` does - is what stops those keyframes
 * being copied into four components and drifting.
 *
 * Every helper answers `prefers-reduced-motion: reduce` with the finished
 * state, never a half-played one: the aurora stops drifting but still tints,
 * the indicator still lands under the active tab, the pane is simply there.
 */

export const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

/** Overshooting ease - the indicator and the pills. */
export const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
/** Decelerating ease - anything that arrives and stays (panes, sections). */
export const SETTLE = 'cubic-bezier(.22,1,.36,1)';

/**
 * Two blurred lobes of primary/secondary drifting behind the page header.
 * Sits in an absolutely-positioned, pointer-transparent layer behind the rail.
 */
export function auroraHeaderSx(theme) {
  const isDark = theme.palette.mode === 'dark';
  const a = theme.palette.primary.main;
  const b = theme.palette.secondary?.main || theme.palette.primary.light;

  return {
    position: 'absolute',
    inset: '-40% -10% auto -10%',
    height: 320,
    zIndex: 0,
    pointerEvents: 'none',
    filter: 'blur(48px)',
    opacity: isDark ? 0.5 : 0.35,
    background: `
      radial-gradient(40% 60% at 22% 40%, ${alpha(a, isDark ? 0.34 : 0.22)} 0%, transparent 70%),
      radial-gradient(38% 55% at 74% 55%, ${alpha(b, isDark ? 0.26 : 0.16)} 0%, transparent 72%)
    `,
    animation: 'settingsAurora 18s ease-in-out infinite alternate',
    '@keyframes settingsAurora': {
      '0%': { transform: 'translate3d(-4%, 0, 0) scale(1)' },
      '50%': { transform: 'translate3d(3%, 2%, 0) scale(1.08)' },
      '100%': { transform: 'translate3d(6%, -2%, 0) scale(1.02)' },
    },
    [REDUCED_MOTION]: { animation: 'none', transform: 'none' },
  };
}

/**
 * The single pill that slides under the active tab.
 *
 * `ready` is false until the rail has measured itself; without it the indicator
 * animates in from x=0 on first paint, which reads as the page picking a tab
 * rather than opening on one.
 */
export function railIndicatorSx(theme, { x = 0, w = 0, ready = false } = {}) {
  const tint = theme.palette.primary.main;
  return {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 4,
    width: w,
    borderRadius: 2,
    pointerEvents: 'none',
    bgcolor: alpha(tint, theme.palette.mode === 'dark' ? 0.16 : 0.1),
    border: '1px solid',
    borderColor: alpha(tint, 0.35),
    transform: `translateX(${x}px)`,
    opacity: ready ? 1 : 0,
    transition: ready
      ? `transform 420ms ${SPRING}, width 420ms ${SPRING}, opacity 200ms ease`
      : 'none',
    [REDUCED_MOTION]: { transition: 'opacity 120ms linear' },
  };
}

/**
 * A pill that leans toward the pointer. The offset is written by the rail as
 * `--mx`/`--my` custom properties, so hovering costs a style write rather than
 * a React render. Pointer-fine only: on a touch screen there is no cursor to
 * lean toward, and the transform would fight the scroll.
 */
export function magneticPillSx() {
  return {
    '@media (pointer: fine)': {
      transition: `transform 220ms ${SPRING}`,
      transform: 'translate3d(calc(var(--mx, 0) * 1px), calc(var(--my, 0) * 1px), 0)',
    },
    [REDUCED_MOTION]: { transform: 'none', transition: 'none' },
  };
}

/** The body of a tab arriving. Keyed by tab id so it replays on every switch. */
export function paneSwapSx() {
  return {
    animation: `settingsPaneIn 420ms ${SETTLE} both`,
    '@keyframes settingsPaneIn': {
      from: { opacity: 0, transform: 'translateY(8px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    [REDUCED_MOTION]: { animation: 'none' },
  };
}

/**
 * Scroll-linked drift on a section's glyph. Uses `animation-timeline: view()`
 * where the browser has it and does nothing at all where it does not - there is
 * no JS fallback on purpose, because a scroll listener per section is a real
 * cost for an effect nobody misses.
 */
export function parallaxGlyphSx() {
  return {
    '@supports (animation-timeline: view())': {
      animation: 'settingsGlyphDrift linear both',
      animationTimeline: 'view()',
      animationRange: 'entry 0% cover 60%',
      '@keyframes settingsGlyphDrift': {
        from: { transform: 'translateY(6px) scale(0.94)' },
        to: { transform: 'translateY(0) scale(1)' },
      },
    },
    [REDUCED_MOTION]: { animation: 'none', transform: 'none' },
  };
}

/**
 * Run `apply` inside a View Transition when the browser supports one, so the
 * old pane cross-fades into the new one instead of being replaced mid-frame.
 * Falls back to calling it directly - the pane's own entrance still plays.
 */
export function withViewTransition(apply) {
  if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
    try {
      document.startViewTransition(apply);
      return;
    } catch {
      /* fall through to the direct call */
    }
  }
  apply();
}
