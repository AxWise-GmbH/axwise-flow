/**
 * [module: design-system]
 *
 * The brand mark: a live LineOrb, at the size of a favicon.
 *
 * The page's mark used to be the word "Standart" set in the body face. This is
 * the drawing instead - the same orb that fills the hero behind the headline and
 * the same one on the sign-in screen, so the mark in the corner and the mark on
 * the page are one shape rather than two.
 *
 * SUPERSAMPLED, WHICH IS THE WHOLE TRICK. LineOrb documents a floor of about
 * 120px: below it the four stroke fields stop pulling apart, the crescents never
 * open, and what is left is a fuzzy disc that RadialSpokeOrb draws better and
 * for nothing. So this does NOT ask for a 28px orb. It draws a `RENDER_PX` one -
 * comfortably above the floor, where the geometry resolves - and scales the
 * finished canvas down with a transform. The fields are computed large and
 * minified optically, which is a fine mark rather than a soft one.
 *
 * `transform` on a wrapper of fixed `DISPLAY_PX`, not `width`/`height` on the
 * canvas: scaling the element would resample what the browser drew, which is the
 * blur this is avoiding.
 *
 * THE COST, STATED. This is a canvas with its own rAF loop on chrome that is
 * mounted for the whole visit, which LineOrb's header calls out as a battery
 * decision rather than a free one. Two things make it affordable: the component
 * parks itself when the tab is hidden or the orb scrolls out of view, and
 * reduced motion leaves it on a single finished frame. It is one loop, not one
 * per mark - the nav and the footer each mount their own, and the footer's is
 * below the fold and therefore parked until it is reached.
 */
import { Box } from '@mui/material';
import LineOrb from '../../../components/Common/LineOrb';
import { INK } from '../standartTokens';

/** The mark's size on the page. */
const DISPLAY_PX = 28;

/** What the canvas actually draws, above LineOrb's ~120px resolving floor. */
const RENDER_PX = 120;

export default function BrandOrb({ size = DISPLAY_PX, title = 'Orqaly' }) {
  const scale = size / RENDER_PX;

  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        // The big canvas is absolutely placed and scaled from its own centre, so
        // it takes exactly `size` in layout no matter what RENDER_PX is.
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <LineOrb
        size={RENDER_PX}
        accent={INK.bright}
        title={title}
        sx={{
          position: 'absolute',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}
