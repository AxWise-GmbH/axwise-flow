/**
 * The mission, its link list, and the pricing block under it.
 *
 * Pricing shares this section rather than getting its own because it is three
 * sentences: a section header, a heading and a rule for three lines would be
 * more furniture than content. It keeps its own anchor, since the nav points at
 * it.
 */
import { Box } from '@mui/material';
import { MISSION, PRICING } from '../standartCopy';
import { INK, NAV_H, SPACE, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import TwoToneHeading from '../primitives/TwoToneHeading';
import HairlineList from '../primitives/HairlineList';
import Pill from '../primitives/Pill';

export default function MissionBlock({ onGo }) {
  return (
    <>
      <SectionShell id="mission">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 5, md: 8 },
            alignItems: 'start',
          }}
        >
          <SectionReveal index={0} sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ ...TYPE.eyebrow, color: INK.dimmer }}>{MISSION.eyebrow}</Box>
            <TwoToneHeading bright={MISSION.heading.bright} dim={MISSION.heading.dim} />
            <Box component="p" sx={{ ...TYPE.lead, color: INK.dim, m: 0, maxWidth: 420 }}>
              {MISSION.body}
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Pill to={MISSION.ctas.primary.to} variant="solid">
                {MISSION.ctas.primary.label}
              </Pill>
              <Pill to={MISSION.ctas.secondary.to} variant="ghost">
                {MISSION.ctas.secondary.label}
              </Pill>
            </Box>
          </SectionReveal>

          <SectionReveal index={1} sx={{ minWidth: 0 }}>
            <HairlineList items={MISSION.links} arrow onSelect={(item) => onGo(item.sectionId)} />
          </SectionReveal>
        </Box>
      </SectionShell>

      {/* Its own anchor, because the nav points here, but not its own section
          furniture - three sentences do not need a heading and a rule. */}
      <Box
        component="section"
        id="pricing"
        data-standart-zone="pricing"
        sx={{
          position: 'relative',
          zIndex: 1,
          px: SPACE.gutter,
          pb: { xs: 8, md: 12 },
          scrollMarginTop: `${NAV_H + 12}px`,
          outline: 'none',
        }}
      >
        <Box sx={{ maxWidth: SPACE.maxWidth, mx: 'auto' }}>
          <SectionReveal sx={{ borderTop: `1px solid ${INK.line}`, pt: { xs: 4, md: 6 } }}>
            <Box component="h2" sx={{ ...TYPE.cardH, color: INK.bright, m: 0, mb: 3 }}>
              {PRICING.heading.bright}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: { xs: 3, md: 4 },
              }}
            >
              {PRICING.lines.map((line) => (
                <Box key={line.title} sx={{ display: 'grid', gap: 1, alignContent: 'start' }}>
                  <Box sx={{ ...TYPE.body, color: INK.bright, fontWeight: 500 }}>{line.title}</Box>
                  <Box sx={{ ...TYPE.body, color: INK.dim }}>{line.body}</Box>
                </Box>
              ))}
            </Box>
          </SectionReveal>
        </Box>
      </Box>
    </>
  );
}
