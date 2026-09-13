/**
 * [module: design-system]
 *
 * The page's headline shape: one bright line, one dim line.
 *
 * It is the whole typographic idea of the design. With no colour available to
 * separate a claim from its qualifier, the split does that work instead: the
 * first line is the thing being said, the second is the condition on it. A
 * reader skimming gets the first line and loses nothing.
 *
 * `dim` is optional. A section that only needs one line passes `bright` alone
 * rather than an empty string, and the second span is not rendered at all - an
 * empty span still occupies a line box and pushes the following block down.
 *
 * `dim` may also be a NODE rather than a string, which is what lets the hero
 * hand it a `RotatingWord`. The colour is set on the wrapping span, so a node
 * inherits `INK.dim` without having to know about it.
 *
 * Anything else passed in reaches the `<Typography>`. That exists for exactly
 * one caller: a heading whose dim half is a rotator has to carry its own
 * `aria-label`, because the rotator is hidden from assistive tech and an h1 that
 * announced only its first half would be worse than no rotation at all.
 */
import { Box, Typography } from '@mui/material';
import { INK, TYPE } from '../standartTokens';

/**
 * @param {object} props
 * @param {string} props.bright
 * @param {string|import('react').ReactNode} [props.dim] the qualifying line, or
 *   a node that draws one
 * @param {'hero'|'h2'} [props.size]
 * @param {'h1'|'h2'|'h3'} [props.as] the heading level. Chosen by the section,
 *   not by the size: there is exactly one h1 on the page and it is the hero.
 */
export default function TwoToneHeading({ bright, dim, size = 'h2', as = 'h2', sx, ...rest }) {
  const scale = size === 'hero' ? TYPE.hero : TYPE.h2;

  return (
    <Typography component={as} sx={{ ...scale, color: INK.bright, m: 0, ...sx }} {...rest}>
      {bright}
      {dim ? (
        <>
          {/* A space rather than a <br>, so the two lines reflow together on a
              narrow screen instead of breaking at a point chosen for a desktop. */}{' '}
          <Box component="span" sx={{ color: INK.dim }}>
            {dim}
          </Box>
        </>
      ) : null}
    </Typography>
  );
}
