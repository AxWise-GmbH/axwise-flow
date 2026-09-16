import { alpha } from '@mui/material';

/**
 * The setup panels' surface, as one named scale instead of thirty literals.
 *
 * Both right-hand setup drawers - Assistant setup and Goal setup - were written
 * as a hardcoded dark surface: `#141414` for the paper, `#fff` for text, and an
 * `alpha('#fff', x)` ladder for everything in between, repeated across two
 * files that had already drifted apart. The values below are lifted from those
 * two files unchanged, so switching a panel onto this module is a rename, not a
 * restyle - `panelSurface.test.js` asserts exactly that.
 *
 * `mode` is the seam, not the change. The panels stay force-dark today: the
 * blast radius of making them theme-aware is not the drawers but SetupCardShell
 * and the six step cards inside them, none of which has ever been rendered on a
 * light panel. `mode: 'auto'` resolves the same scale off the palette and is
 * unit-tested, so the flip - when someone is ready to look at every card in
 * light mode - is a one-word edit at two call sites.
 */

/** The panel's own dark ground, independent of the app's light/dark mode. */
export const PANEL_DARK = Object.freeze({ bg: '#141414', fg: '#FFFFFF' });

/**
 * @param {object} theme
 * @param {{ mode?: 'dark' | 'auto' }} [opts]
 *   'dark' (default) pins the panel to its own dark ground; 'auto' follows
 *   `background.paper` / `text.primary`.
 */
export function panelSurfaceTokens(theme, { mode = 'dark' } = {}) {
  const forceDark = mode !== 'auto';
  const bg = forceDark ? PANEL_DARK.bg : theme.palette.background.paper;
  const fg = forceDark ? PANEL_DARK.fg : theme.palette.text.primary;
  const on = (a) => alpha(fg, a);

  const hairline = on(0.08);
  const fill = on(0.04);
  const fillHover = on(0.07);
  const controlBorder = on(0.15);

  return {
    bg,
    fg,
    /** Every border and Divider in both panels. */
    hairline,
    /** A label beside a control - "Cognitive overlay", "Speak replies". */
    textMuted: on(0.75),
    /** Section descriptions, row subtitles, the header's "Runs on:" line. */
    textDim: on(0.55),
    /** Eyebrow labels, empty notes, resting icon buttons. */
    textFaint: on(0.5),
    /** A row at rest, and under the cursor. */
    fill,
    fillHover,
    /** The neutral 30x30 glyph well on a row (sections use a tinted one). */
    iconWell: on(0.06),
    iconFg: on(0.8),
    controlBorder,

    /** The Drawer's paper. */
    paperSx: ({ width = 400, fullScreen = false } = {}) => ({
      width: fullScreen ? '100%' : width,
      maxWidth: '100%',
      bgcolor: bg,
      color: fg,
      borderLeft: `1px solid ${hairline}`,
      display: 'flex',
      flexDirection: 'column',
    }),

    /** The sticky header band. Opaque, or the body scrolls through it. */
    headerSx: {
      position: 'sticky',
      top: 0,
      zIndex: 2,
      bgcolor: bg,
      px: 2,
      pt: 2,
      pb: 1.25,
      borderBottom: `1px solid ${hairline}`,
    },

    /** The scrolling body below it. */
    bodySx: { flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1.5 },

    /** An outlined input on the dark ground. */
    fieldSx: {
      color: fg,
      '.MuiOutlinedInput-notchedOutline': { borderColor: controlBorder },
    },

    /** The small uppercase label above a control. */
    labelSx: { color: on(0.5), fontWeight: 700, letterSpacing: 0.5 },

    /**
     * Popovers opened from the panel. Without this a Select or Menu renders on
     * the app's own paper - a white card thrown out of a black drawer.
     */
    menuSlotProps: {
      paper: {
        sx: {
          bgcolor: bg,
          color: fg,
          border: `1px solid ${hairline}`,
          '& .MuiMenuItem-root:hover': { bgcolor: fillHover },
        },
      },
    },
  };
}
