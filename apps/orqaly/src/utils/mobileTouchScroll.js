/**
 * Layout + scroll-container helpers for one-finger vertical pan on mobile browsers.
 * iOS/Android treat `overflow: auto` flex children as nested scrollports even when
 * content does not overflow, which breaks single-finger page scroll.
 */

const BODY_SCROLL_LOCK_PROPS = [
  'position',
  'top',
  'left',
  'right',
  'width',
  'overflow',
  'paddingRight',
];

/**
 * Clear iOS/mobile body scroll lock (StickyNav drawer or MUI modal leftovers).
 * @param {{ restoreY?: number | null, scrollToTop?: boolean }} [opts]
 */
export function releaseBodyScrollLock({ restoreY = null, scrollToTop = false } = {}) {
  if (typeof document === 'undefined') return;

  const { style } = document.body;
  const wasFixed = style.position === 'fixed';
  const savedY =
    wasFixed && style.top
      ? Math.abs(parseInt(String(style.top).replace('px', ''), 10)) || 0
      : window.scrollY;

  BODY_SCROLL_LOCK_PROPS.forEach((prop) => {
    style[prop] = '';
  });

  const root = document.documentElement.style;
  root.overflow = '';
  root.paddingRight = '';
  root.position = '';

  if (scrollToTop) {
    window.scrollTo(0, 0);
  } else if (restoreY != null) {
    window.scrollTo(0, restoreY);
  } else if (wasFixed) {
    window.scrollTo(0, savedY);
  }
}

/** Minimum input font size on touch UIs — iOS Safari auto-zooms below 16px. */
export const MOBILE_INPUT_FONT_SIZE = '16px';

/** True when the primary pointer is touch (phones/tablets). */
export function isCoarsePointer() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Desktop-only autofocus — avoids iOS Safari zoom on post-login hero input. */
export function shouldAutofocusTextInput() {
  return !isCoarsePointer();
}

/** Hero prompt textarea font size by touch vs fine pointer. */
export function getHeroInputFontSize(isMobileTouch) {
  return isMobileTouch ? MOBILE_INPUT_FONT_SIZE : '0.9375rem';
}

/** Authenticated app shell root — horizontal clip + full width on mobile. */
export const APP_SHELL_ROOT_SX = {
  width: '100%',
  maxWidth: '100%',
  overflowX: 'clip',
};

/** sx fragment for intentional nested scroll areas (dialogs, side panels). */
export const TOUCH_SCROLL_CONTAINER_SX = {
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
  overscrollBehaviorY: 'contain',
};

/** Marketing / landing page root — document scroll on touch; clip horizontal bleed on desktop only. */
export const LANDING_PAGE_ROOT_SX = {
  minHeight: '100dvh',
  touchAction: 'pan-y',
  overscrollBehaviorY: 'auto',
  width: '100%',
  maxWidth: '100%',
  // overflow-x: clip/hidden + overflow-y: visible computes y to `auto` (CSS spec),
  // which traps one-finger scroll on iOS/Android. Clip only on fine-pointer desktop.
  '@media (hover: hover) and (pointer: fine)': {
    overflowX: 'clip',
  },
};

/** Auto-animating or clipped blocks: vertical swipes scroll the page, not the box. */
export const LANDING_PASS_VERTICAL_TOUCH_SX = {
  touchAction: 'pan-y',
};

/** Public/marketing `<main>` — document scroll on touch (no flex scrollport). */
export const PUBLIC_MAIN_SX = {
  pt: { xs: 9, md: 11 },
  touchAction: 'pan-y',
  overflow: 'visible',
  minHeight: 0,
};

/** Horizontal carousels: sideways pan here, vertical pan goes to the page. */
export const LANDING_HORIZONTAL_CAROUSEL_SX = {
  touchAction: 'pan-x',
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorX: 'contain',
};

/**
 * Send the app shell back to the top, whichever element is doing the scrolling.
 *
 * getAppMainScrollSx hands the scroll to the document at xs/sm and to <main> at
 * md+, so a bare window.scrollTo works on a phone and silently does nothing on a
 * desktop. Both are asked here; the one that is not the scroller ignores it.
 *
 * Two frames of delay, not one: the caller is usually reacting to a state change
 * that is about to reflow the page (a thread mounting above the fold), and a
 * smooth scroll started before that reflow lands gets cut short.
 */
export function scrollAppShellToTop() {
  if (typeof window === 'undefined') return;
  const run = () => {
    document.querySelector('[data-app-main]')?.scrollTo?.({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  if (typeof window.requestAnimationFrame !== 'function') {
    run();
    return;
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
}

/**
 * @param {object} opts
 * @param {{ xs?: number, sm?: number, md?: number }} [opts.contentPadding]
 * @param {boolean} [opts.useSimpleDock]
 * @param {number|{ xs: number, sm: number }} opts.headerOffset — px from top
 */
export function getAppMainScrollSx({ contentPadding, useSimpleDock, headerOffset }) {
  const offset =
    typeof headerOffset === 'number' ? { xs: headerOffset, sm: headerOffset } : headerOffset;
  return {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    mt: { xs: `${offset.xs}px`, sm: `${offset.sm}px` },
    pt: 0,
    px: useSimpleDock ? 0 : contentPadding,
    pb: useSimpleDock
      ? {
          xs: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          sm: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        }
      : contentPadding,
    minWidth: 0,
    touchAction: 'pan-y',
    overflowX: useSimpleDock ? { xs: 'clip', md: 'visible' } : { xs: 'clip', md: 'hidden' },
    // Document scroll on touch breakpoints; desktop keeps a bounded main pane.
    overflowY: { xs: 'visible', md: 'auto' },
    height: { md: `calc(100dvh - ${offset.sm}px)` },
    maxHeight: { md: `calc(100dvh - ${offset.sm}px)` },
    WebkitOverflowScrolling: { md: 'touch' },
    overscrollBehaviorY: { xs: 'auto', md: 'contain' },
  };
}
