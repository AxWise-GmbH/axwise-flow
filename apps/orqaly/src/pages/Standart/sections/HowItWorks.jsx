/**
 * Five steps on a rail.
 *
 * ADAPTED FROM `/`'s HowItWorks, not copied. That one hangs a tinted glass
 * illustration over each step inside a glowing glass banner; neither survives
 * the trip. What carries the sequence here is a single hairline drawn THROUGH
 * five small rings - the one drawing on the page that says "and then", which is
 * the whole content of a How-it-works block.
 *
 * WHY NOT NUMERALS. `Principles` already owns the big 01/02/03 silhouette
 * further down, and two numbered blocks on one page teach the reader that the
 * numbers mean nothing. The numerals here are proof-sized and sit ON the rail.
 *
 * The rail is a `::before` on the row rather than a border on each cell, so it
 * runs continuously behind the rings instead of stopping in each gap. It is
 * hidden below `md`, where the steps stack and a horizontal rail would point at
 * nothing.
 */
import { Box } from '@mui/material';
import { HOW_IT_WORKS } from '../standartCopy';
import { INK, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';

const RING = 11;

export default function HowItWorks() {
  return (
    <SectionShell
      id="how"
      eyebrow={HOW_IT_WORKS.eyebrow}
      heading={HOW_IT_WORKS.heading}
      align="center"
    >
      <Box
        component="ol"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          position: 'relative',
          display: 'grid',
          gap: { xs: 4, md: 3 },
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
          // The rail. Inset by half a column at each end so it starts and ends
          // at a ring rather than running off into the gutter.
          '&::before': {
            content: '""',
            display: { xs: 'none', md: 'block' },
            position: 'absolute',
            top: `${RING / 2}px`,
            left: '10%',
            right: '10%',
            height: '1px',
            bgcolor: INK.line,
          },
        }}
      >
        {HOW_IT_WORKS.steps.map((step, i) => (
          <SectionReveal
            key={step.title}
            as="li"
            index={i}
            sx={{ position: 'relative', display: 'grid', gap: 1.25, justifyItems: 'center' }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: RING,
                height: RING,
                borderRadius: '50%',
                border: `1px solid ${INK.dim}`,
                // Opaque, so the rail passes behind the ring rather than through it.
                bgcolor: INK.ground,
              }}
            />
            <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{step.num}</Box>
            <Box component="h3" sx={{ ...TYPE.cardH, color: INK.bright, m: 0 }}>
              {step.title}
            </Box>
            <Box
              component="p"
              sx={{ ...TYPE.body, color: INK.dim, m: 0, maxWidth: 240, textAlign: 'center' }}
            >
              {step.body}
            </Box>
          </SectionReveal>
        ))}
      </Box>
    </SectionShell>
  );
}
