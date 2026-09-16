/**
 * Four facts where a logo wall would normally go.
 *
 * There are no customers to name, so there are no logos. Putting four things
 * that are true in the slot a reader expects social proof to occupy is more
 * useful than an empty band, and it does not fabricate a record about a company
 * that has not agreed to appear here.
 */
import { Box } from '@mui/material';
import { PROOF } from '../standartCopy';
import { INK, TYPE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';

export default function ProofStrip() {
  return (
    <SectionShell id="proof" sx={{ py: { xs: 6, md: 8 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: { xs: 3, md: 0 },
        }}
      >
        {PROOF.items.map((item, i) => (
          <SectionReveal
            key={item.title}
            index={i}
            sx={{
              display: 'grid',
              gap: 1,
              px: { md: 3 },
              '&:not(:first-of-type)': { borderLeft: { md: `1px solid ${INK.line}` } },
            }}
          >
            <Box sx={{ ...TYPE.cardH, color: INK.bright }}>{item.title}</Box>
            <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{item.proof}</Box>
          </SectionReveal>
        ))}
      </Box>
    </SectionShell>
  );
}
