/**
 * [module: design-system]
 *
 * One word in a headline, swapped for the next every few seconds.
 *
 * NO LAYOUT SHIFT, and that is the whole reason this is a component rather than
 * three lines of state in the hero. Every word is rendered, stacked in a single
 * grid cell; the inactive ones are held at `visibility: hidden` rather than
 * removed, so the cell is permanently as wide as the LONGEST word and the line
 * above it can never reflow mid-swap. A naive version that renders one word at a
 * time re-wraps the headline every time it lands on "Business Operations", which
 * is the most distracting thing a hero can do.
 *
 * `visibility`, not `display: none`: a hidden-by-display element contributes no
 * width, which would defeat the point.
 *
 * ONE `<span>` OF TRUTH FOR SCREEN READERS. The whole stack is `aria-hidden`,
 * and the heading around it supplies an `aria-label` naming the first word. A
 * rotator left visible to assistive tech either reads six words in a row or,
 * worse, announces a new one every 2.4 seconds forever.
 *
 * REDUCED MOTION parks on the first word - no interval at all, not a slower one.
 * A word that silently swaps with no transition is still movement.
 */
import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { REDUCED_MOTION, ROTATE_MS, SETTLE, WORD_FADE_MS } from '../standartMotion';
import { prefersReducedMotion } from '../useAnchorNav';

/**
 * @param {object} props
 * @param {string[]} props.words at least one; the first is the still frame
 * @param {number} [props.intervalMs]
 */
export default function RotatingWord({ words = [], intervalMs = ROTATE_MS, sx }) {
  const reduced = prefersReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || words.length < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [reduced, words.length, intervalMs]);

  if (!words.length) return null;

  return (
    <Box
      aria-hidden="true"
      component="span"
      sx={{
        display: 'inline-grid',
        // Every word in the same cell. The cell takes the widest of them.
        gridTemplateAreas: '"word"',
        verticalAlign: 'bottom',
        color: INK.dim,
        ...sx,
      }}
    >
      {words.map((word, i) => {
        const active = i === index;
        return (
          <Box
            key={word}
            component="span"
            sx={{
              gridArea: 'word',
              whiteSpace: 'nowrap',
              visibility: active ? 'visible' : 'hidden',
              opacity: active ? 1 : 0,
              // Small enough to read as a settle rather than a slide. The
              // outgoing word is already invisible, so only the arrival is seen.
              transform: active ? 'none' : 'translateY(0.12em)',
              transition: `opacity ${WORD_FADE_MS}ms ${SETTLE}, transform ${WORD_FADE_MS}ms ${SETTLE}`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {word}
          </Box>
        );
      })}
    </Box>
  );
}
