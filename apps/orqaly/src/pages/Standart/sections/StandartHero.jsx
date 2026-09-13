/**
 * The hero.
 *
 * NO MARK OF ITS OWN, deliberately. StandartScrollOrb already holds a large
 * faint LineOrb behind this section - that is its hero pose, and LineOrb is
 * Standart's own mark, the same one on the sign-in screen and in the top bar.
 * An inline orb here as well put two copies of the same shape on top of each
 * other, which is what the first screenshot showed: a sharp orb sitting inside
 * a soft one, reading as a rendering fault rather than a design.
 *
 * One mark. The scrolling one, because it is the one that goes on to do
 * something.
 */
import { Box } from '@mui/material';
import { HERO } from '../standartCopy';
import { INK, NAV_H, RADII, SPACE, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';
import SectionReveal from '../primitives/SectionReveal';
import TwoToneHeading from '../primitives/TwoToneHeading';
import RotatingWord from '../primitives/RotatingWord';
import Pill from '../primitives/Pill';

export default function StandartHero({ onGo }) {
  return (
    <Box
      component="section"
      id="hero"
      data-standart-zone="hero"
      sx={{
        position: 'relative',
        zIndex: 1,
        px: SPACE.gutter,
        pt: { xs: 8, md: 12 },
        pb: { xs: 8, md: 14 },
        // The bar is sticky rather than fixed, so the hero does not need to
        // reserve its height - but a scroll to #hero lands under it without this.
        scrollMarginTop: `${NAV_H}px`,
        outline: 'none',
      }}
    >
      <Box
        sx={{
          maxWidth: SPACE.maxWidth,
          mx: 'auto',
          display: 'grid',
          gap: 4,
          justifyItems: 'center',
          textAlign: 'center',
        }}
      >
        <SectionReveal index={0}>
          <Box
            component="a"
            href={`#${HERO.pill.sectionId}`}
            onClick={(event) => {
              event.preventDefault();
              onGo(HERO.pill.sectionId);
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 1.75,
              py: 0.75,
              borderRadius: RADII.pill,
              border: `1px solid ${INK.line}`,
              bgcolor: INK.card,
              color: INK.dim,
              textDecoration: 'none',
              ...TYPE.body,
              transition: `color ${HOVER_MS}ms ${STANDARD_EASE}, border-color ${HOVER_MS}ms ${STANDARD_EASE}`,
              '@media (hover: hover)': {
                '&:hover': { color: INK.bright, borderColor: '#2A2A2A' },
              },
              '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 3 },
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: INK.bright }} />
            {HERO.pill.label}
            <Box aria-hidden="true" sx={{ color: INK.dimmer }}>
              &#8594;
            </Box>
          </Box>
        </SectionReveal>

        <SectionReveal index={1} sx={{ maxWidth: 900 }}>
          <TwoToneHeading
            bright={HERO.title.bright}
            dim={<RotatingWord words={HERO.title.rotating} />}
            size="hero"
            as="h1"
            // The rotator is hidden from assistive tech, so the heading has to
            // carry the sentence itself - otherwise the h1 announces four words
            // and stops. `aria-label` on a heading replaces its text, which is
            // what is wanted here: one full sentence, read once.
            aria-label={HERO.title.aria}
          />
        </SectionReveal>

        <SectionReveal index={2} sx={{ maxWidth: 640 }}>
          <Box component="p" sx={{ ...TYPE.lead, color: INK.dim, m: 0 }}>
            {HERO.lead}
          </Box>
        </SectionReveal>

        <SectionReveal
          index={3}
          sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}
        >
          <Pill to={HERO.ctas.primary.to} variant="solid">
            {HERO.ctas.primary.label}
          </Pill>
          <Pill to={HERO.ctas.secondary.to} variant="ghost">
            {HERO.ctas.secondary.label}
          </Pill>
        </SectionReveal>
      </Box>
    </Box>
  );
}
