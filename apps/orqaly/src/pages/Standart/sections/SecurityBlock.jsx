/**
 * Six rows, written fresh.
 *
 * The tone is borrowed from src/data/security.js, which is the best enterprise
 * copy in the repo, but not one string of it: that file carries three claims
 * this page may not make - configurable retention, a certifications table, and a
 * payments entry - and the safety test would refuse them anyway.
 *
 * What is deliberately absent, and why, so nobody adds it back on a slow
 * afternoon: no certifications are held, no availability is committed to, and
 * there is no enterprise single sign-on - only Google. A buyer asks about the
 * last one on the first call, and being found out is worse than being asked.
 */
import { Box } from '@mui/material';
import { SECURITY } from '../standartCopy';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import HairlineList from '../primitives/HairlineList';
import MockFirstRun from '../mocks/MockFirstRun';
import MockAuditRows from '../mocks/MockAuditRows';

export default function SecurityBlock() {
  return (
    <SectionShell id="security" heading={SECURITY.heading}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 320px' },
          gap: { xs: 4, md: 6 },
          alignItems: 'start',
        }}
      >
        <SectionReveal index={0} sx={{ minWidth: 0 }}>
          <HairlineList items={SECURITY.rows} />
        </SectionReveal>

        <SectionReveal index={1} sx={{ display: 'grid', gap: 2 }}>
          <MockFirstRun />
          <MockAuditRows />
        </SectionReveal>
      </Box>
    </SectionShell>
  );
}
