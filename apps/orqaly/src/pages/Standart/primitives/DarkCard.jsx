/**
 * [module: design-system]
 *
 * The page's card: a plain sentence, one line of how, a proof line, and room
 * for a mockup at the bottom.
 *
 * The three text slots are the voice rule made structural. A card cannot be
 * built here that shows only a technical fact, because `proof` is drawn last, in
 * the dimmest ink, under a title that has to exist. That is deliberate - the
 * shape of the component is a cheaper guard than remembering the rule.
 *
 * NO GLOW, AND NO LIFT. Standart's hover is not a shadow (hoverGlow returns
 * NO_GLOW under mono) and not a translate (standardTileSx sets transform: none).
 * What a card does on hover is go one shade lighter and its border one step
 * brighter. That is the whole vocabulary, and it is enough because the page has
 * a hairline on everything and nothing else does.
 */
import { Box, Typography } from '@mui/material';
import { INK, RADII, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';

/**
 * @param {object} props
 * @param {string} [props.title] the plain sentence
 * @param {string} [props.body] one plain sentence saying how
 * @param {string} [props.proof] the technical fact, smallest and dimmest
 * @param {import('react').ReactNode} [props.mock] a mockup, bled to the bottom
 * @param {boolean} [props.interactive] hover paint. Off by default: a card that
 *   lights up but does nothing when clicked is a lie about what it is.
 */
export default function DarkCard({
  title,
  body,
  proof,
  mock,
  children,
  interactive = false,
  radius = RADII.card,
  sx,
  ...rest
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        // A string, never a number. See the multiplier trap in standartTokens.
        borderRadius: radius,
        border: `1px solid ${INK.line}`,
        bgcolor: INK.card,
        // The mockup inside bleeds to the bottom edge, so the corners have to cut.
        overflow: 'hidden',
        minWidth: 0,
        ...(interactive
          ? {
              transition: `background-color ${HOVER_MS}ms ${STANDARD_EASE}, border-color ${HOVER_MS}ms ${STANDARD_EASE}`,
              // Gated on `hover: hover`, or a tap on a phone leaves the card
              // stuck lit with nothing to un-stick it. Note that a second
              // `@media (hover: hover)` key in this same object would REPLACE
              // this one rather than merge with it - that has already cost
              // StandardNav the same lift twice - so anything else hover-gated
              // belongs inside this block.
              '@media (hover: hover)': {
                '&:hover': { bgcolor: INK.cardLift, borderColor: '#2A2A2A' },
              },
              '&:focus-within': { borderColor: '#2A2A2A' },
              [REDUCED_MOTION]: { transition: 'none' },
            }
          : null),
        ...sx,
      }}
      {...rest}
    >
      {(title || body || proof) && (
        <Box sx={{ p: { xs: 2.5, md: 3 }, display: 'grid', gap: 1.25 }}>
          {title && (
            <Typography component="h3" sx={{ ...TYPE.cardH, color: INK.bright, m: 0 }}>
              {title}
            </Typography>
          )}
          {body && <Typography sx={{ ...TYPE.body, color: INK.dim, m: 0 }}>{body}</Typography>}
          {proof && (
            <Typography sx={{ ...TYPE.proof, color: INK.dimmer, m: 0, mt: 0.25 }}>
              {proof}
            </Typography>
          )}
        </Box>
      )}
      {children}
      {mock && (
        <Box
          sx={{
            mt: 'auto',
            px: { xs: 2.5, md: 3 },
            pb: 0,
            // The mockup runs off the bottom of the card rather than sitting in
            // it. It is a glimpse of a screen, not a framed picture.
            pt: 1,
          }}
        >
          {mock}
        </Box>
      )}
    </Box>
  );
}
