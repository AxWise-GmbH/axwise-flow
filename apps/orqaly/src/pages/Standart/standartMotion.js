/**
 * [module: design-system]
 *
 * The /standart page's motion, in one place.
 *
 * The page borrows the platform's numbers rather than inventing its own, so the
 * marketing surface and the product move on the same clock. What is new here is
 * only the arrangement: which step applies where, and the zone table the scroll
 * orb reads.
 *
 * THREE EASINGS, NO FOURTH.
 *  - SETTLE  cubic-bezier(.22,1,.36,1)  every entrance (theme/settingsMotion.js)
 *  - STANDARD cubic-bezier(0.4,0,0.2,1) transitions (MUI's own, and --ease in
 *             MarketplaceLanding.css)
 *  - EXPO    cubic-bezier(0.16,1,0.3,1) the nav underline ONLY, because that is
 *            what StickyNav's underline already uses and the two navs should
 *            not disagree
 * Plain `ease` for colour and opacity. Anything else is drift.
 *
 * TWO STAGGER STEPS, DELIBERATELY.
 * The product cascades at 45ms (recordMotion's ROW_STEP_MS, which is the left
 * menu's own step). The existing marketing pages cascade at 120ms - see
 * SimpleHowItWorks and SimpleExamples, both `delay={idx * 120}`. Neither is
 * wrong; they are different scales. This page uses SECTION_STEP_MS between
 * blocks in a section and ROW_STEP_MS between rows inside a mockup: marketing
 * pace at page scale, product pace inside a picture of the product.
 */
import { REDUCED_MOTION, SETTLE } from '../../theme/settingsMotion';

const ROW_STEP_MS = 45;
const ROW_MAX_INDEX = 12;

export { REDUCED_MOTION, SETTLE, ROW_STEP_MS, ROW_MAX_INDEX };

/** MUI's standard curve. The same value as `--ease` in MarketplaceLanding.css. */
export const STANDARD_EASE = 'cubic-bezier(0.4,0,0.2,1)';

/** The nav underline's curve, matched to StickyNav's existing one. */
export const EXPO_EASE = 'cubic-bezier(0.16,1,0.3,1)';

/** Between blocks in a section. The marketing pace. */
export const SECTION_STEP_MS = 120;

/** How long one block takes to arrive. */
export const SECTION_DURATION_MS = 520;

/** Past this many blocks the cascade stops growing, so a long grid still lands. */
export const SECTION_MAX_INDEX = 8;

/** How far a block travels on the way in. Larger than a table row's 6px. */
export const SECTION_RISE_PX = 14;

/** Hover and small-state transitions. Matches NAV_LIFT_MS. */
export const HOVER_MS = 250;

/** The mega-menu's fade. Matched to StickyNav's Fade timeout. */
export const MENU_FADE_MS = 180;

/**
 * How long the menu waits before closing on mouse-out.
 *
 * StickyNav uses 400ms and no open delay at all. Copied rather than retuned: a
 * shorter grace makes the diagonal travel from a trigger to the far side of its
 * own panel drop the menu, which is the single most irritating megamenu bug.
 */
export const MENU_CLOSE_GRACE_MS = 400;

/** The chip-tab panel swap, on settingsMotion's paneSwapSx timing. */
export const PANE_SWAP_MS = 420;

/**
 * How long the hero holds each word before swapping to the next.
 *
 * Long enough to be read and not merely glimpsed. Under about 1800ms the eye is
 * pulled back to the headline it has already finished reading, which is exactly
 * the attention the paragraph underneath needs.
 */
export const ROTATE_MS = 2400;

/** One word's arrival. Shorter than a section's, or the swap reads as a page move. */
export const WORD_FADE_MS = 320;

/**
 * A section's entrance.
 *
 * Longhands, never the `animation` shorthand - and the reason is worth stating,
 * because it has already cost this codebase a silent bug. `standardTileSx` sets
 * `animation: 'none'` in mono. A shorthand later in the same sx object beats an
 * earlier one; longhands beat a later shorthand ONLY if they are spread after
 * it. `theme/recordMotion.render.test.jsx` asserts the failure mode explicitly,
 * because the dead version still emits the longhand and a naive presence check
 * passes.
 *
 * RULE FOR THIS PAGE: the reveal is spread LAST, always.
 *
 * `backwards` fill, not `both`, for the same reason recordMotion gives: `both`
 * retains the end frame's `transform: none` forever, which silently kills every
 * `&:hover { transform: translateY(-2px) }` on the cards underneath.
 *
 * @param {number} index the block's place in the cascade
 * @param {boolean} inView whether the section has been scrolled to yet
 * @param {{ step?: number, base?: number, max?: number, duration?: number }} [opts]
 */
export function sectionRevealSx(
  index = 0,
  inView = false,
  { step = SECTION_STEP_MS, base = 0, max = SECTION_MAX_INDEX, duration = SECTION_DURATION_MS } = {}
) {
  const safeIndex = Number.isFinite(index) && index > 0 ? index : 0;
  const safeMax = Number.isFinite(max) ? max : SECTION_MAX_INDEX;
  const delay = (Number.isFinite(base) ? base : 0) + Math.min(safeIndex, safeMax) * step;

  if (!inView) {
    return {
      opacity: 0,
      transform: `translateY(${SECTION_RISE_PX}px)`,
      // The finished state, not a paused animation. A reader with reduced motion
      // must never meet a block held at opacity 0 waiting for an observer that
      // `useInView` deliberately never armed.
      [REDUCED_MOTION]: { opacity: 1, transform: 'none', transition: 'none' },
    };
  }

  return {
    opacity: 1,
    transform: 'none',
    transitionProperty: 'opacity, transform',
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: SETTLE,
    transitionDelay: `${delay}ms`,
    [REDUCED_MOTION]: { opacity: 1, transform: 'none', transition: 'none' },
  };
}

/**
 * The house hover, as one helper.
 *
 * Standart's hover is not a lift and not a glow - `hoverGlow.js` returns NO_GLOW
 * under mono, and `standardTileSx` sets `transform: none`. What it does instead
 * is lift the LABEL to weight 600 and scale the GLYPH to 1.18 (NAV_ICON_ZOOM),
 * on the reasoning that the glyph is the thing with room to move. This page adds
 * a one-step background change on top, because a marketing card is a click
 * target in a way a nav row is not.
 *
 * TWO TRAPS, both already paid for elsewhere in this codebase:
 *  1. Two `@media (hover: hover)` keys in one sx object do NOT merge - the second
 *     replaces the first. That is why everything hover-gated is built into this
 *     single block rather than added alongside another one.
 *  2. The hover must be gated on `hover: hover` at all, or a tap on a phone
 *     leaves the card stuck in its hover state with nothing to un-stick it.
 *     `:focus-visible` carries the same paint, ungated, for keyboards.
 *
 * @param {{ lift?: string, base?: string }} [opts]
 */
export function hoverLiftSx({ lift, base } = {}) {
  const paint = lift ? { backgroundColor: lift } : null;
  return {
    transitionProperty: 'background-color, border-color',
    transitionDuration: `${HOVER_MS}ms`,
    transitionTimingFunction: STANDARD_EASE,
    ...(base ? { backgroundColor: base } : null),
    '@media (hover: hover)': {
      '&:hover': paint,
    },
    '&:focus-visible': paint,
    [REDUCED_MOTION]: { transition: 'none' },
  };
}

/**
 * The scroll orb's per-zone poses.
 *
 * Same shape as ScrollingOrb's SECTION_CFG, which is the component this one is
 * modelled on. Keys are the `data-standart-zone` values the sections carry.
 *
 *   side   'left' | 'center' | 'right' - horizontal anchor
 *   y      vertical position as a fraction of the viewport
 *   yDrift how far it slides while the section passes, in viewport fractions
 *   scale  size multiplier
 *   alpha  opacity
 *   lock   true parks it - no drift, for a section where it must sit still
 *
 * Zones not listed fall back to DEFAULT_ZONE. Note that ScrollingOrb has a live
 * bug of exactly this kind - its `ai-agent-dna` zone exists in the DOM with no
 * entry in SECTION_CFG, so it silently inherits the hero's pose. The test for
 * this module asserts every zone the page renders has an entry here.
 */
export const DEFAULT_ZONE = {
  side: 'center',
  y: 0.55,
  yDrift: 0.05,
  scale: 2.2,
  alpha: 0.16,
  lock: false,
};

export const ORB_ZONES = {
  // Large and very faint behind the headline, so the H1 stays readable.
  hero: { side: 'center', y: 0.52, yDrift: 0.08, scale: 5.2, alpha: 0.2, lock: false },
  // The demo is a picture of a browser window with a typing caret in it. An orb
  // behind it would sit inside the frame and read as a rendering fault, so this
  // is the third zone (with proof and standart) where the mark steps out.
  demo: { side: 'center', y: 0.5, yDrift: 0, scale: 0, alpha: 0, lock: true },
  platform: { side: 'right', y: 0.5, yDrift: 0.1, scale: 2.4, alpha: 0.2, lock: false },
  how: { side: 'left', y: 0.5, yDrift: 0.06, scale: 2.0, alpha: 0.14, lock: false },
  proof: { side: 'right', y: 0.5, yDrift: 0, scale: 0, alpha: 0, lock: true },
  features: { side: 'left', y: 0.45, yDrift: 0.12, scale: 2.0, alpha: 0.18, lock: false },
  work: { side: 'right', y: 0.5, yDrift: 0.08, scale: 2.6, alpha: 0.2, lock: false },
  many: { side: 'left', y: 0.5, yDrift: 0.08, scale: 2.2, alpha: 0.18, lock: false },
  // The namesake section shows the product. The orb gets out of its way.
  standart: { side: 'right', y: 0.5, yDrift: 0, scale: 0, alpha: 0, lock: true },
  suite: { side: 'center', y: 0.55, yDrift: 0.06, scale: 1.8, alpha: 0.14, lock: false },
  // Contracted and still: a security block should not have something drifting.
  security: { side: 'right', y: 0.48, yDrift: 0, scale: 1.4, alpha: 0.16, lock: true },
  principles: { side: 'left', y: 0.5, yDrift: 0.06, scale: 2.0, alpha: 0.16, lock: false },
  mission: { side: 'right', y: 0.5, yDrift: 0.08, scale: 2.6, alpha: 0.2, lock: false },
  pricing: { side: 'right', y: 0.5, yDrift: 0, scale: 1.6, alpha: 0.14, lock: true },
  news: { side: 'left', y: 0.5, yDrift: 0.1, scale: 2.0, alpha: 0.14, lock: false },
  // Opens up and parks dead centre behind the closing ask.
  cta: { side: 'center', y: 0.5, yDrift: 0, scale: 3.4, alpha: 0.24, lock: true },
};

/**
 * How fast the orb chases its target, per frame.
 *
 * ScrollingOrb's value. Critically damped in feel: high enough to keep up with a
 * fast scroll, low enough that it lags the page slightly, which is the whole
 * effect. Raising it makes the orb feel welded to the scrollbar.
 */
export const ORB_LERP = 0.07;

/**
 * Draw the canvas at twice its largest displayed size and scale back down.
 *
 * The hero pose is 5.2x, so a canvas sized for the smallest pose would be a
 * blurred disc there. Same trick, same reason, as ScrollingOrb's ORB_RENDER_SCALE.
 */
export const ORB_RENDER_SCALE = 2;

/**
 * When the zone rects are re-measured after mount, in ms.
 *
 * Twice, because sections below the fold contain mockups that mount lazily
 * behind their own observers, and a rect measured before they exist is short.
 * Copied from ScrollingOrb, which learned the same thing.
 */
export const ORB_REMEASURE_MS = [600, 1600];

/** Resize debounce for the same measurement pass. */
export const ORB_RESIZE_DEBOUNCE_MS = 200;
