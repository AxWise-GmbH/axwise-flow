/**
 * The thread's design tokens: one radius scale, one type scale, one tone scale.
 *
 * They live apart from the components so a message shape can never quietly
 * define its own - which is how seven renderers ended up with twelve.
 */
/**
 * One radius scale, in theme units - MUI multiplies these by the theme's 10px
 * base, but only for the shorthand `borderRadius` key.
 */
export const THREAD_RADIUS = { card: 3, inner: 2, pill: 1.5 };

/**
 * The bubble's corners, in px, and why they are not in the scale above.
 *
 * MUI theme-scales the `borderRadius` shorthand and nothing else: the
 * per-corner properties are passed through as raw CSS, so a number becomes
 * `1px`, not `10px`. The bubble sets all four corners and then overrides one,
 * so it was silently mixing units - a 35px shorthand against a 1px override -
 * and came out with two fully rounded top corners over a flat bottom edge.
 * Every short message rendered as a dome. Written in px throughout, the shape
 * is whatever it says it is.
 *
 * 14px is chosen against the bubble's own minimum height rather than by eye: a
 * single line of text plus its padding is about 46px, and past half of that a
 * rounded rectangle stops being a rectangle. It holds from one word to twenty
 * lines.
 */
export const THREAD_BUBBLE_RADIUS_PX = 14;

/**
 * The one tighter corner, pointing the bubble at whoever said it. Small enough
 * to read as an anchor rather than as a second radius.
 */
export const THREAD_BUBBLE_TAIL_PX = 5;

/** One type scale, in the order a message is read. */
export const THREAD_TYPE = {
  title: '0.8rem',
  body: '0.86rem',
  detail: '0.78rem',
  label: '0.58rem',
};

/** One tone scale. `accent` is the brand voice; the rest are states. */
export function threadToneColor(theme, tone) {
  if (tone === 'warn') return theme.palette.warning.main;
  if (tone === 'error') return theme.palette.error.main;
  if (tone === 'ok' || tone === 'accent') return theme.palette.primary.main;
  return theme.palette.text.disabled;
}

export const threadClock = (at) =>
  at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

/**
 * How a marker moves while its thing is still happening.
 *
 * One place, because a thread where each renderer invented its own tempo reads
 * as several things loading rather than one run progressing. Three states and
 * no more:
 *
 *   spin       something is turning over - a retry, a re-check, a reset
 *   work       something is being made right now; the glyph breathes
 *   attention  the run is held open until the user does something
 *
 * Attention is deliberately the widest and slowest of the three. The row that
 * needs a person is the one that has to be found on a screen they have stopped
 * watching, and a bigger, lazier pulse carries further than a faster one.
 *
 * Anything finished stays perfectly still. A thread that animates completed
 * work is not livelier, it is lying about what is happening.
 */
export function threadMarkerMotion({ live = false, tone = 'info', spin = false } = {}) {
  if (!live) return {};

  const reduced = { '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 } };

  if (spin) {
    return {
      animation: 'threadSpin 2.4s linear infinite',
      '@keyframes threadSpin': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
      ...reduced,
    };
  }

  if (tone === 'warn') {
    return {
      animation: 'threadAttention 2.2s ease-in-out infinite',
      '@keyframes threadAttention': {
        '0%, 100%': { opacity: 0.55, transform: 'scale(1)' },
        '50%': { opacity: 1, transform: 'scale(1.22)' },
      },
      ...reduced,
    };
  }

  return {
    animation: 'threadWork 1.6s ease-in-out infinite',
    '@keyframes threadWork': {
      '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
      '50%': { opacity: 1, transform: 'scale(1.12)' },
    },
    ...reduced,
  };
}
