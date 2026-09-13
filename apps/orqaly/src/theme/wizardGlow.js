import { alpha } from '@mui/material';
import { createHoverGlowShadow, GLOW_SPEC } from './hoverGlow';

/**
 * Shared glow + entrance helpers for the setup wizards (the /setup page and the
 * "Set up your AI Assistant" popup), so both look and animate the same.
 *
 * `glowPillSx`        - the outlined "Read More" pill (Back/Skip/Next/Finish).
 * `cardHoverGlowSx`   - the platform's canonical primary halo on hover (cards).
 * `stepEntranceSx`    - per-step staggered fade/slide-in for a stepper.
 */

/** Outlined "Read More" pill. `pulse` adds the breathing glow (reduced-motion gated). */
export function glowPillSx(theme, { pulse = false } = {}) {
  const tint = theme.palette.primary.main;
  return {
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: 2,
    px: 2.25,
    borderColor: alpha(tint, 0.5),
    color: tint,
    '&:hover': { borderColor: tint, bgcolor: alpha(tint, 0.08) },
    ...(pulse
      ? {
          animation: 'howWorksGlow 2s ease-in-out infinite',
          '@keyframes howWorksGlow': {
            '0%, 100%': { boxShadow: `0 0 6px ${alpha(tint, 0.3)}`, borderColor: alpha(tint, 0.5) },
            '50%': { boxShadow: `0 0 18px ${alpha(tint, 0.65)}`, borderColor: tint },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }
      : {}),
  };
}

/** Card halo on hover - the platform's canonical primary glow. */
export function cardHoverGlowSx(theme) {
  const tint = theme.palette.primary.main;
  return {
    transition: `box-shadow ${GLOW_SPEC.transitionMs}ms ease, border-color ${GLOW_SPEC.transitionMs}ms ease`,
    '&:hover': { boxShadow: createHoverGlowShadow(theme), borderColor: alpha(tint, 0.4) },
  };
}

/**
 * The open section of a setup panel, lit.
 *
 * The halo used to be a hover state on the card *inside* the open section,
 * which is why it read as arbitrary - it appeared under the cursor rather than
 * marking anything. Here it belongs to the section itself: a closed one lights
 * on hover like any other card, an open one stays lit.
 *
 * `cardHoverGlowSx` is spread first so its `&:hover` rule still wins on hover
 * while the resting border and shadow below override its resting state.
 *
 * The section contributes the halo and an edge but deliberately no fill - the
 * card nested inside it keeps the fill and a crisper edge, so the two read as
 * "this section is open" around "this is the thing you act on" rather than as
 * one mushy double ring.
 *
 * @param {object} theme
 * @param {{ open?: boolean, restingBorderColor?: string }} [opts]
 */
export function openSectionSx(theme, { open = false, restingBorderColor } = {}) {
  const tint = theme.palette.primary.main;
  return {
    ...cardHoverGlowSx(theme),
    borderColor: open ? alpha(tint, 0.35) : restingBorderColor,
    ...(open ? { boxShadow: createHoverGlowShadow(theme) } : null),
  };
}

/**
 * Per-step staggered fade/slide-in for a stepper. `mounted` flips false->true on
 * mount; each step's transition is delayed by its index so they appear one by
 * one. Reduced-motion shows everything instantly.
 */
export function stepEntranceSx(mounted, index, { base = 120, step = 90 } = {}) {
  const delay = base + index * step;
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(8px)',
    transition: `opacity 500ms cubic-bezier(.22,1,.36,1) ${delay}ms, transform 500ms cubic-bezier(.22,1,.36,1) ${delay}ms`,
    '@media (prefers-reduced-motion: reduce)': {
      opacity: 1,
      transform: 'none',
      transition: 'none',
    },
  };
}
