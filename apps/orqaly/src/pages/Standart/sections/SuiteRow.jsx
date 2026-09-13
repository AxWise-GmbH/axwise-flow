/**
 * Five cards, plainly named.
 *
 * The reference puts a price at the foot of each card. There is no per-part
 * price to quote here - the product has one free tier - so the slot carries a
 * capability line instead. An invented price would be the single most damaging
 * thing this page could say, because it is the one claim a buyer will test
 * against a sales call within the hour.
 *
 * Each card's arrow scrolls to the section that proves it rather than to a
 * product page that does not exist yet.
 */
import { Box } from '@mui/material';
import { SUITE } from '../standartCopy';
import { INK, RADII, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import CardScroller from '../primitives/CardScroller';

export default function SuiteRow({ onGo }) {
  return (
    <SectionShell id="suite" heading={SUITE.heading} align="center">
      <CardScroller
        count={SUITE.cards.length}
        label="part"
        gridSx={{
          gridTemplateColumns: {
            md: 'repeat(3, 1fr)',
            lg: `repeat(${SUITE.cards.length}, 1fr)`,
          },
        }}
      >
        {SUITE.cards.map((card, i) => (
          <SectionReveal key={card.id} index={i} sx={{ display: 'flex' }}>
            <Box
              component="a"
              href={`#${card.sectionId}`}
              onClick={(event) => {
                event.preventDefault();
                onGo(card.sectionId);
              }}
              sx={{
                flex: 1,
                display: 'grid',
                gap: 1,
                alignContent: 'start',
                p: 2.5,
                borderRadius: RADII.cardSm,
                border: `1px solid ${INK.line}`,
                bgcolor: INK.card,
                textDecoration: 'none',
                transition: `background-color ${HOVER_MS}ms ${STANDARD_EASE}, border-color ${HOVER_MS}ms ${STANDARD_EASE}`,
                '@media (hover: hover)': {
                  '&:hover': { bgcolor: INK.cardLift, borderColor: '#2A2A2A' },
                  '&:hover .suite-name': { fontWeight: 600 },
                },
                '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 3 },
                [REDUCED_MOTION]: { transition: 'none' },
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '6px',
                  border: `1px solid ${INK.line}`,
                  mb: 1,
                }}
              />
              <Box
                className="suite-name"
                sx={{
                  ...TYPE.cardH,
                  color: INK.bright,
                  transition: `font-weight ${HOVER_MS}ms ${STANDARD_EASE}`,
                  [REDUCED_MOTION]: { transition: 'none' },
                }}
              >
                {card.label}
              </Box>
              <Box sx={{ ...TYPE.body, color: INK.dim }}>{card.body}</Box>
              <Box sx={{ ...TYPE.proof, color: INK.dimmer, mt: 1.5 }}>{card.proof}</Box>
            </Box>
          </SectionReveal>
        ))}
      </CardScroller>
    </SectionShell>
  );
}
