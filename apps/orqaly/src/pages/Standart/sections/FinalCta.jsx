/** The closing ask. */
import { Box } from '@mui/material';
import { FINAL_CTA } from '../standartCopy';
import { INK, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import TwoToneHeading from '../primitives/TwoToneHeading';
import Pill from '../primitives/Pill';

export default function FinalCta() {
  return (
    <SectionShell id="cta">
      <SectionReveal
        sx={{
          display: 'grid',
          gap: 3,
          justifyItems: 'center',
          textAlign: 'center',
          py: { xs: 4, md: 8 },
        }}
      >
        <Box sx={{ maxWidth: 720 }}>
          <TwoToneHeading bright={FINAL_CTA.heading.bright} dim={FINAL_CTA.heading.dim} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill to={FINAL_CTA.ctas.primary.to} variant="solid">
            {FINAL_CTA.ctas.primary.label}
          </Pill>
          <Pill to={FINAL_CTA.ctas.secondary.to} variant="ghost">
            {FINAL_CTA.ctas.secondary.label}
          </Pill>
        </Box>
        <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{FINAL_CTA.note}</Box>
      </SectionReveal>
    </SectionShell>
  );
}
