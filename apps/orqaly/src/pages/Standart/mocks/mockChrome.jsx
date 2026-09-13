/**
 * [module: design-system]
 *
 * The chrome the /standart mockups share, on top of the onboarding mock kit.
 *
 * `components/Onboarding/standardMocks/mockKit.jsx` already establishes the
 * rules a picture of Standart has to follow, and its docblock is worth reading
 * before adding anything here: two type sizes, no accent, no eyebrows, 10px
 * gaps, rows in one recessed group separated by hairlines, radius from tokens,
 * and geometric marks rather than AppIcon - because outside Simple mode AppIcon
 * renders an Iconify element that drops `sx` entirely, so a size set that way is
 * a silent no-op and the glyph comes out at 24px.
 *
 * What this file adds is only what a MARKETING mockup needs and a welcome-deck
 * one does not: a frame sized for a card rather than a slide, and a couple of
 * shapes (a meter, a hand-drawn toggle) the deck never needed.
 *
 * Every mockup is `aria-hidden` and contains no focusable controls. They are
 * pictures. Everything a mockup says is repeated as real text in the card around
 * it, so nothing is available only to someone who can see it.
 */
import { Box, Typography } from '@mui/material';
import { STANDARD_PAGE } from '../standartProductTokens';
import { INK, RADII, TYPE } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';

/** The frame a mockup sits in, bled to the bottom edge of its card. */
export function MockFrame({ children, minHeight = 168, sx, ...rest }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        borderTopLeftRadius: RADII.mock,
        borderTopRightRadius: RADII.mock,
        border: `1px solid ${INK.line}`,
        borderBottom: 'none',
        bgcolor: INK.cardLift,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        // Reserved, so a mockup that animates in cannot shift the page under the
        // reader as it plays.
        minHeight,
        overflow: 'hidden',
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

/** A row inside a mockup. Hairline above every row but the first. */
export function MockLine({ children, played = true, index = 0, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        minHeight: 26,
        opacity: played ? 1 : 0,
        transform: played ? 'none' : 'translateY(6px)',
        transition: `opacity 320ms ${SETTLE}, transform 320ms ${SETTLE}`,
        '&:not(:first-of-type)': { borderTop: `1px solid ${INK.lineSoft}` },
        [REDUCED_MOTION]: { transition: 'none', opacity: 1, transform: 'none' },
        ...sx,
      }}
      data-mock-index={index}
    >
      {children}
    </Box>
  );
}

/** The label in a mock row. */
export function MockText({ children, tone = 'dim', strong = false, sx }) {
  const color = tone === 'bright' ? INK.bright : tone === 'faint' ? INK.dimmer : INK.dim;
  return (
    <Typography
      sx={{
        fontSize: STANDARD_PAGE.metaFontSize,
        fontWeight: strong ? 600 : 500,
        color,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

/** A small outlined tag. Weight and outline carry meaning; colour never does. */
export function MockTag({ children, strong = false }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 0.75,
        height: STANDARD_PAGE.chipHeight,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: RADII.chip,
        border: `1px solid ${strong ? INK.dim : INK.line}`,
        color: strong ? INK.bright : INK.dimmer,
        fontSize: '0.625rem',
        fontWeight: 500,
        lineHeight: 1,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * A hand-drawn toggle.
 *
 * NOT a MUI `Switch`. Two reasons, and the second is the load-bearing one:
 * a decorative control has no business owning an `<input>` that a screen reader
 * will announce as operable, and MUI 7's `slotProps.input` REPLACES rather than
 * merges, so getting the roles right on a Switch takes more care than drawing
 * two boxes.
 */
export function MockToggle({ on = false }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: 24,
        height: 13,
        borderRadius: '999px',
        border: `1px solid ${on ? INK.bright : INK.line}`,
        bgcolor: on ? INK.bright : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
        px: '2px',
        transition: `background-color 320ms ${SETTLE}, border-color 320ms ${SETTLE}, justify-content 0ms`,
        [REDUCED_MOTION]: { transition: 'none' },
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: on ? INK.ground : INK.dimmer,
        }}
      />
    </Box>
  );
}

/**
 * A meter, filled by transform rather than width.
 *
 * `scaleX` is composited; animating `width` is not, and a bar that reflows every
 * frame is the cheapest way to make a card feel slow.
 */
export function MockMeter({ value = 0, cap = null, height = 4 }) {
  return (
    <Box sx={{ position: 'relative', height, bgcolor: INK.line, borderRadius: '999px' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          transformOrigin: 'left center',
          transform: `scaleX(${Math.max(0, Math.min(1, value))})`,
          bgcolor: INK.bright,
          borderRadius: '999px',
          transition: `transform 640ms ${SETTLE}`,
          [REDUCED_MOTION]: { transition: 'none' },
        }}
      />
      {cap != null && (
        <Box
          sx={{
            position: 'absolute',
            top: -3,
            bottom: -3,
            left: `${Math.max(0, Math.min(1, cap)) * 100}%`,
            width: '1px',
            bgcolor: INK.dim,
          }}
        />
      )}
    </Box>
  );
}

/** The caption under a mockup, in the smallest ink. */
export function MockCaption({ children }) {
  return (
    <Typography sx={{ ...TYPE.proof, color: INK.dimmer, mt: 'auto', pt: 0.5 }}>
      {children}
    </Typography>
  );
}
