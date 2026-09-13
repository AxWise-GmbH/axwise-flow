/**
 * [module: design-system]
 *
 * The page's buttons.
 *
 * Not `MarketingCtaButton`: that one is an outlined button carrying a pulsing
 * accent halo, scoped to `[data-landing-root]`. This page deliberately does not
 * set that attribute (see StandartLanding), because a coloured pulse has no
 * place in a monochrome design - and in mono the accent is near-white, so the
 * halo would read as a smear rather than a glow. Its `pulse` prop is discarded
 * by the component anyway, so there is no opting out of it.
 *
 * Three variants and no more:
 *   solid  the one action per screen. Near-white fill, near-black text.
 *   ghost  the alternative beside it. A hairline and nothing else.
 *   quiet  an inline text action inside a card.
 */
import { Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { INK, RADII, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';

const VARIANTS = {
  solid: {
    bgcolor: INK.bright,
    color: INK.ground,
    border: `1px solid ${INK.bright}`,
    '@media (hover: hover)': {
      '&:hover': { bgcolor: '#FFFFFF', borderColor: '#FFFFFF' },
    },
  },
  ghost: {
    bgcolor: 'transparent',
    color: INK.bright,
    border: `1px solid ${INK.line}`,
    '@media (hover: hover)': {
      '&:hover': { bgcolor: INK.cardLift, borderColor: '#2A2A2A' },
    },
  },
  quiet: {
    bgcolor: 'transparent',
    color: INK.dim,
    border: '1px solid transparent',
    px: 0,
    '@media (hover: hover)': {
      '&:hover': { bgcolor: 'transparent', color: INK.bright },
    },
  },
};

/**
 * @param {object} props
 * @param {'solid'|'ghost'|'quiet'} [props.variant]
 * @param {string} [props.to] an app route - rendered as a router link
 * @param {string} [props.href] an anchor on this page
 */
export default function Pill({ children, variant = 'solid', to, href, onClick, sx, ...rest }) {
  const linkProps = to ? { component: RouterLink, to } : href ? { component: 'a', href } : {};

  return (
    <Button
      disableElevation
      disableRipple
      onClick={onClick}
      {...linkProps}
      sx={{
        // A string. `borderRadius: 999` would be multiplied by shape.borderRadius
        // (10) into 9990px, which happens to look the same - but `borderRadius: 3`
        // for a card would silently become 30px, so the page has one rule: always
        // a string. See standartTokens.
        borderRadius: RADII.pill,
        px: variant === 'quiet' ? 0 : 2.75,
        py: variant === 'quiet' ? 0 : 1.1,
        minWidth: 0,
        fontSize: TYPE.body.fontSize,
        fontWeight: 500,
        lineHeight: 1.2,
        textTransform: 'none',
        whiteSpace: 'nowrap',
        transition: `background-color ${HOVER_MS}ms ${STANDARD_EASE}, border-color ${HOVER_MS}ms ${STANDARD_EASE}, color ${HOVER_MS}ms ${STANDARD_EASE}`,
        '&:focus-visible': {
          outline: `2px solid ${INK.bright}`,
          outlineOffset: 3,
        },
        [REDUCED_MOTION]: { transition: 'none' },
        ...VARIANTS[variant],
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}
