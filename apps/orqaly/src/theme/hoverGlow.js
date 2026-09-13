import { alpha } from '@mui/material';

/**
 * Single source of truth for the hover-glow effect across the platform.
 * To retune the glow app-wide, edit ONLY this object.
 */
export const GLOW_SPEC = {
  blurTight: 6,
  blurSoft: 10,
  opacityTight: 0.5,
  opacitySoft: 0.3,
  transitionMs: 250,
};

/**
 * Box-shadow string for a hover halo. Color is always primary.main.
 * Use inline on `&:hover` when a ::before pseudo can't be used (e.g. the
 * element has overflow: hidden that would clip the pseudo's outer blur).
 */
export function createHoverGlowShadow(theme) {
  const color = theme.palette.primary.main;
  return (
    `0 0 ${GLOW_SPEC.blurTight}px ${alpha(color, GLOW_SPEC.opacityTight)}, ` +
    `0 0 ${GLOW_SPEC.blurSoft}px ${alpha(color, GLOW_SPEC.opacitySoft)}`
  );
}

/**
 * sx factory that paints the hover halo on a ::before pseudo so it doesn't
 * collide with the host element's own :hover styles (color changes, etc.).
 *
 * @param {object} theme
 * @param {object} [opts]
 * @param {string|number} [opts.radius='50%'] borderRadius of the glow layer (match host shape)
 * @param {string|number} [opts.inset=0]      inset of the glow layer from the host edges
 */
export function createHoverGlowSx(theme, { radius = '50%', inset = 0 } = {}) {
  return {
    position: 'relative',
    '&::before': {
      content: '""',
      position: 'absolute',
      inset,
      borderRadius: radius,
      boxShadow: createHoverGlowShadow(theme),
      opacity: 0,
      transition: `opacity ${GLOW_SPEC.transitionMs}ms ease`,
      pointerEvents: 'none',
    },
    '&:hover::before': { opacity: 1 },
  };
}

/**
 * Ready-to-spread sx fragment: `{ '&:hover': { boxShadow: ... } }`.
 * Drop-in replacement for hand-rolled inline hover glows.
 */
export function createHoverGlowHover(theme) {
  return { '&:hover': { boxShadow: createHoverGlowShadow(theme) } };
}

/**
 * sx for the standout "Assistant" nav item: NO button chrome — just the emerald
 * icon + label, gently breathing with a glow halo on the glyphs themselves.
 * Honors prefers-reduced-motion (color stays, animation off).
 */
export function buildAssistantPulseSx(theme) {
  const color = theme.palette.primary.main;
  return {
    '& .MuiListItemIcon-root': {
      color,
      animation: 'assistantIconPulse 2.4s ease-in-out infinite',
    },
    '& .MuiTypography-root': {
      color,
      animation: 'assistantTextPulse 2.4s ease-in-out infinite',
    },
    '@keyframes assistantTextPulse': {
      '0%, 100%': { opacity: 0.78, textShadow: 'none' },
      '50%': { opacity: 1, textShadow: `0 0 10px ${alpha(color, 0.55)}` },
    },
    '@keyframes assistantIconPulse': {
      // drop-shadow glows the icon glyph; works whether AppIcon renders an svg or img
      '0%, 100%': { opacity: 0.78, filter: 'none' },
      '50%': { opacity: 1, filter: `drop-shadow(0 0 6px ${alpha(color, 0.6)})` },
    },
    '@media (prefers-reduced-motion: reduce)': {
      '& .MuiListItemIcon-root, & .MuiTypography-root': { animation: 'none', opacity: 1 },
    },
  };
}
