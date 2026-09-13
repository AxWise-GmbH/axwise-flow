/**
 * A visual summary of the focused launch workspace: Assistant, Goals, and
 * personal Settings. The surrounding section layout is retained from PR #59.
 */
import { Box } from '@mui/material';
import { STANDART_MODE } from '../standartCopy';
import { INK, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import Pill from '../primitives/Pill';
import MockMonoTable from '../mocks/MockMonoTable';

export default function StandartMode() {
  return (
    <SectionShell id="standart" heading={STANDART_MODE.heading} lead={STANDART_MODE.body}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px 1fr' },
          gap: { xs: 4, md: 6 },
          alignItems: 'start',
        }}
      >
        <SectionReveal index={0} sx={{ display: 'grid', gap: 3 }}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
            {STANDART_MODE.facts.map((fact) => (
              <Box
                component="li"
                key={fact}
                sx={{ ...TYPE.body, color: INK.dim, pl: 2, borderLeft: `1px solid ${INK.line}` }}
              >
                {fact}
              </Box>
            ))}
          </Box>

          <Box sx={{ ...TYPE.proof, color: INK.dimmer, maxWidth: 260 }}>{STANDART_MODE.note}</Box>

          <Box>
            <Pill to={STANDART_MODE.cta.to} variant="ghost">
              {STANDART_MODE.cta.label}
            </Pill>
          </Box>
        </SectionReveal>

        <SectionReveal index={1} sx={{ minWidth: 0 }}>
          <MockMonoTable />
        </SectionReveal>
      </Box>
    </SectionShell>
  );
}
