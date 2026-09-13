/**
 * [module: design-system]
 *
 * The pill dots under a horizontal card row.
 *
 * Lifted from `pages/Landing/sections/WhoItsFor.jsx`, where it is an inner
 * function and not exported. It was already the right thing - real buttons in a
 * `role="tablist"`, an 8px dot that grows to 22px when active, a focus ring -
 * and re-typing it would have meant a second version to keep in step. The only
 * changes are that the label is now a prop rather than hardcoded to "use case",
 * and the colours come from this page's ink rather than the accent, since the
 * accent here is near-white and an active dot needs to sit above the inactive
 * ones rather than beside them.
 */
import { Box, Stack, alpha } from '@mui/material';
import { INK } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';

/**
 * @param {object} props
 * @param {number} props.count
 * @param {number} props.activeIndex
 * @param {(index: number) => void} props.onSelect
 * @param {string} [props.label] what the reader is paging through, for the
 *   accessible name: "Go to card 3 of 5" reads better as "Go to job 3 of 8"
 */
export default function CarouselDots({ count, activeIndex, onSelect, label = 'card' }) {
  if (!count || count < 2) return null;

  return (
    <Stack
      direction="row"
      spacing={1}
      role="tablist"
      aria-label={`${label} navigation`}
      sx={{ justifyContent: 'center', mt: 3 }}
    >
      {Array.from({ length: count }).map((_, idx) => {
        const isActive = idx === activeIndex;
        return (
          <Box
            key={idx}
            component="button"
            type="button"
            role="tab"
            aria-selected={isActive}
            // A number alone ("3") tells a screen reader nothing about where it
            // sits or how much is left.
            aria-label={`Go to ${label} ${idx + 1} of ${count}`}
            onClick={() => onSelect(idx)}
            sx={{
              cursor: 'pointer',
              border: 'none',
              p: 0,
              width: isActive ? 22 : 8,
              height: 8,
              borderRadius: '999px',
              bgcolor: isActive ? INK.bright : alpha(INK.bright, 0.22),
              transition: `width ${HOVER_MS}ms ${STANDARD_EASE}, background-color ${HOVER_MS}ms ${STANDARD_EASE}`,
              '&:focus-visible': {
                outline: `2px solid ${INK.bright}`,
                outlineOffset: 3,
              },
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          />
        );
      })}
    </Stack>
  );
}
