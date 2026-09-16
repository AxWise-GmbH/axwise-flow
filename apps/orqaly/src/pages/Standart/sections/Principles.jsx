/**
 * 01 / 02 / 03.
 *
 * The numerals are the largest thing on the page after the hero and the dimmest,
 * which is the trick that makes them read as ornament rather than as data. They
 * are aria-hidden: a screen reader announcing "zero one" before every principle
 * would be counting out loud for no reason, and the ordered list markup carries
 * the sequence properly.
 */
import { Box } from '@mui/material';
import { PRINCIPLES } from '../standartCopy';
import { INK, RADII, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import Bento from '../primitives/Bento';

export default function Principles() {
  return (
    <SectionShell id="principles" heading={PRINCIPLES.heading} align="center">
      <Bento layout="three" component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {PRINCIPLES.items.map((item, i) => (
          <SectionReveal key={item.id} index={i} as="li" sx={{ display: 'flex' }}>
            <Box
              sx={{
                flex: 1,
                display: 'grid',
                gap: 1.5,
                alignContent: 'start',
                p: { xs: 3, md: 4 },
                borderRadius: RADII.card,
                border: `1px solid ${INK.line}`,
                bgcolor: INK.card,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  fontSize: 'clamp(2.5rem, 2rem + 2vw, 3.75rem)',
                  lineHeight: 1,
                  fontWeight: 500,
                  letterSpacing: '-0.04em',
                  color: INK.dimmer,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.num}
              </Box>
              <Box sx={{ height: '1px', bgcolor: INK.line, my: 1 }} />
              <Box component="h3" sx={{ ...TYPE.cardH, color: INK.bright, m: 0 }}>
                {item.title}
              </Box>
              <Box sx={{ ...TYPE.body, color: INK.dim }}>{item.body}</Box>
            </Box>
          </SectionReveal>
        ))}
      </Bento>
    </SectionShell>
  );
}
