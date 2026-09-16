/**
 * The demo: a heading, and a browser window that types a job into itself.
 *
 * Centred rather than the page's usual left-aligned heading, because the thing
 * underneath it is one wide object rather than a grid - a left-set heading over
 * a centred window reads as a mistake.
 *
 * The drawing is `MockTeamBuild`, and the section is deliberately thin: it owns
 * the heading and the rhythm, and nothing else. The scroll orb is configured OFF
 * for this zone (`ORB_ZONES.demo`) so nothing sits inside the window frame.
 */
import { Box } from '@mui/material';
import { TEAM_DEMO } from '../standartCopy';
import { SPACE } from '../standartTokens';
import SectionShell from '../primitives/SectionShell';
import SectionReveal from '../primitives/SectionReveal';
import MockTeamBuild from '../mocks/MockTeamBuild';

export default function TeamBuildDemo() {
  return (
    <SectionShell id="demo" heading={TEAM_DEMO.heading} lead={TEAM_DEMO.lead} align="center">
      <SectionReveal index={1} sx={{ display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: '100%', maxWidth: SPACE.demoWidth }}>
          <MockTeamBuild />
        </Box>
      </SectionReveal>
    </SectionShell>
  );
}
