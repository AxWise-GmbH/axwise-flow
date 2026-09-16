/**
 * [module: design-system]
 *
 * A row of cards: a grid on a desk, a snapping scroller on a phone.
 *
 * Two details here are not obvious and both are borrowed from mistakes already
 * paid for in this codebase:
 *
 *  1. The scrollport carries padding on ALL sides, not just the bottom, and an
 *     equal negative margin to cancel it. `overflow-x: auto` computes
 *     `overflow-y` to `auto` as well, so the box clips vertically - and anything
 *     a card draws outside its own bounds gets cut off at the edge of the row.
 *     MarketplaceLanding.css.test.js guards exactly this for the marketplace.
 *  2. `scroll-padding-inline` matches the padding, or the first and last cards
 *     snap flush against the viewport edge with no breathing room.
 *
 * The active dot is tracked with an IntersectionObserver on the cards rather
 * than by arithmetic on scrollLeft. Card widths differ between breakpoints and
 * a computed index drifts by one at the ends; asking the browser which card is
 * actually in the middle does not.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { LANDING_HORIZONTAL_CAROUSEL_SX } from '../../../utils/mobileTouchScroll';
import CarouselDots from './CarouselDots';
import { prefersReducedMotion } from '../useAnchorNav';

const PAD = 10;

/**
 * @param {object} props
 * @param {number} props.count how many children, for the dots
 * @param {string} [props.label] what one card is, for the dots' accessible name
 * @param {object} [props.gridSx] the desktop grid template
 */
export default function CardScroller({ children, count, label = 'card', gridSx, sx }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrolling, setScrolling] = useState(false);

  // Only the phone layout scrolls, so only there do the dots mean anything.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const check = () => setScrolling(track.scrollWidth > track.clientWidth + 4);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(track);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === 'undefined') return undefined;
    const cards = Array.from(track.children);
    if (!cards.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e?.isIntersecting && e.target)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (!best) return;
        const index = cards.indexOf(best.target);
        if (index >= 0) setActiveIndex(index);
      },
      { root: track, threshold: [0.5, 0.75, 1] }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [count]);

  const goTo = useCallback((index) => {
    const track = trackRef.current;
    const card = track?.children?.[index];
    if (!track || !card) return;
    track.scrollTo({
      left: card.offsetLeft - track.offsetLeft - PAD,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, []);

  return (
    <Box sx={sx}>
      <Box
        ref={trackRef}
        sx={{
          display: { xs: 'flex', md: 'grid' },
          gap: { xs: 1.5, md: 2 },
          alignItems: 'stretch',
          overflowX: { xs: 'auto', md: 'visible' },
          scrollSnapType: { xs: 'x mandatory', md: 'none' },
          // Padding on every side, cancelled by the margin. See the note above.
          p: { xs: `${PAD}px`, md: 0 },
          m: { xs: `-${PAD}px`, md: 0 },
          scrollPaddingInline: `${PAD}px`,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': {
            scrollSnapAlign: { xs: 'center', md: 'none' },
            scrollSnapStop: 'always',
            flex: { xs: '0 0 82%', sm: '0 0 46%', md: 'unset' },
          },
          ...LANDING_HORIZONTAL_CAROUSEL_SX,
          ...gridSx,
        }}
      >
        {children}
      </Box>

      {scrolling && (
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <CarouselDots count={count} activeIndex={activeIndex} onSelect={goTo} label={label} />
        </Box>
      )}
    </Box>
  );
}
