/**
 * [module: design-system]
 *
 * The /standart landing page's own scale.
 *
 * This page is a marketing surface drawn in Standart's language: near-black,
 * monochrome, hairline-ruled. It is NOT an app page, so it does not consume the
 * `standard*Sx` helpers - those encode dense working-page geometry and carry
 * hover/selection behaviour a landing page must not inherit. What it does share
 * is the palette, which comes from the mono theme in `standartTheme.js`, and the
 * motion, which comes from `theme/recordMotion.js` via `standartMotion.js`.
 *
 * THE RADIUS TRAP, and why every value here is a string.
 * `getEnterpriseTheme` sets `shape.borderRadius: 10`, and MUI MULTIPLIES the
 * `borderRadius: N` shorthand by it. So `borderRadius: 3` is 30px, not 12px, and
 * `borderRadius: 4` is 40px - which is exactly why the marketing demos in
 * `components/Public/demo/` look over-rounded. Per-corner properties are not
 * scaled, and neither is a string. Every radius on this page is therefore a px
 * string from RADII, and `standartTokens.test.js` fails if one is a bare number.
 */

/**
 * The ink.
 *
 * Six values, and they are the mono dark palette rather than a new set: `ground`
 * is MONO.dark.onAccent, `card` is background.paper, `bright` is MONO.dark.accent
 * and `dim` is text.secondary. Only `cardLift`, `line` and `lineSoft` are new,
 * and they exist because a marketing card needs a hover step and a rule that
 * reads on the card as well as on the ground - the theme's own divider (#1a1a1a)
 * disappears against #0f0f0f.
 */
export const INK = {
  /** The page ground. */
  ground: '#0A0A0A',
  /** A card at rest. */
  card: '#0F0F0F',
  /** A hovered card, and the ground of a mockup nested inside one. */
  cardLift: '#141414',
  /** The hairline. One step above the theme's divider so it reads on a card. */
  line: '#1F1F1F',
  /** A rule inside a mockup, where the full hairline would be too loud. */
  lineSoft: '#161616',
  /** Headline line one, and the solid pill's fill. */
  bright: '#F5F5F5',
  /** Headline line two, and every line of body copy. */
  dim: '#8B949E',
  /**
   * Captions, proof lines, and the 01/02/03 numerals.
   *
   * ~3.3:1 on `ground`, which is below the 4.5:1 body-text bar. It is therefore
   * restricted to text that is decorative or duplicated: a proof line always
   * sits under a title that carries the same meaning in `dim`, and the giant
   * numerals are ornament beside a real heading. Do not promote it to body.
   */
  dimmer: '#5A6069',
};

/**
 * Radii, as strings. See the trap in the module docblock.
 */
export const RADII = {
  /** The large marketing card. */
  card: '28px',
  /** A card nested inside a bento cell. */
  cardSm: '20px',
  /** A mockup's frame. */
  mock: '14px',
  /** A chip, a tag, a small control. */
  chip: '10px',
  /** Buttons. */
  pill: '999px',
  /** The mock app window's title bar. */
  window: '12px',
  /** The phone mock's bezel. */
  phone: '44px',
};

/**
 * The sticky bar's height, in px.
 *
 * Shared by the bar itself, the page's top padding, and the anchor scroll
 * offset in `useAnchorNav`. One number, or a jump lands a heading under the bar.
 */
export const NAV_H = 64;

/** Vertical rhythm between sections, and the page's side gutter. */
export const SPACE = {
  section: { xs: 10, md: 16 },
  gutter: { xs: 3, md: 5 },
  /** The content column. Wider than a reading measure - this page has bentos. */
  maxWidth: 1280,
  /**
   * The demo window's column. Narrower than the page, because a browser mock
   * stretched to 1280px stops reading as a browser and starts reading as the
   * page's own chrome.
   */
  demoWidth: 900,
};

/**
 * The type ramp.
 *
 * The display sizes are `clamp()` rather than breakpoint objects. Nothing else
 * in the codebase uses clamp - the app steps at breakpoints, which is right for
 * a dense working UI where a heading shares a row with controls. A landing page
 * headline has the whole viewport and should scale with it, so a 4.6rem headline
 * does not jump to 2.6rem one pixel under `md`. Scoped to this page only.
 *
 * Weight 500 on the display sizes, not 700. At 4.6rem, 700 reads as shouting;
 * 500 with tightened tracking is what makes a large headline look drawn rather
 * than enlarged. Inter is already loaded at 400-800 by index.html.
 */
export const TYPE = {
  hero: {
    fontSize: 'clamp(2.5rem, 1.2rem + 5.4vw, 4.6rem)',
    lineHeight: 1.02,
    letterSpacing: '-0.035em',
    fontWeight: 500,
  },
  h2: {
    fontSize: 'clamp(1.9rem, 1.1rem + 3.1vw, 3rem)',
    lineHeight: 1.06,
    letterSpacing: '-0.03em',
    fontWeight: 500,
  },
  /** A card's title. */
  cardH: { fontSize: '1.0625rem', lineHeight: 1.35, letterSpacing: '-0.01em', fontWeight: 600 },
  /** Body copy, and a card's one sentence. */
  body: { fontSize: '0.9375rem', lineHeight: 1.55, fontWeight: 400 },
  /** The lead paragraph under a hero. */
  lead: { fontSize: 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)', lineHeight: 1.55, fontWeight: 400 },
  /** An announcement pill, a section eyebrow. */
  eyebrow: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  /**
   * The proof line, and a mockup's meta.
   *
   * `tnum` because a mockup full of figures that shift width as they count is
   * the one thing that makes a still drawing look broken.
   */
  proof: {
    fontSize: '0.6875rem',
    lineHeight: 1.45,
    fontWeight: 400,
    fontFeatureSettings: "'tnum' 1",
  },
};

/**
 * The font stack.
 *
 * Inter arrives from Google Fonts with `display=swap`, so the headline paints in
 * the fallback first. The fallback is named explicitly rather than left to
 * `sans-serif` so the reflow is a size change rather than a typeface change.
 */
export const FONT_STACK =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
