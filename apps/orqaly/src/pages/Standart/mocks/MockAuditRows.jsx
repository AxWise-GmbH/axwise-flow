/**
 * Silhouette: a dense timestamped log.
 *
 * Denser than every other mockup on the page, on purpose - the point is that
 * there is a LOT of it, kept without anyone deciding to keep it. Four columns at
 * the smallest size, tabular figures on the clock so the column does not shiver
 * as rows arrive.
 */
import { Box } from '@mui/material';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import { MockCaption, MockFrame, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const ROWS = [
  { at: '09:14', who: 'Goal', did: 'Scope compiled', cost: 'saved' },
  { at: '09:15', who: 'You', did: 'Scope approved', cost: 'recorded' },
  { at: '09:17', who: 'Goal', did: 'Plan compiled', cost: 'saved' },
  { at: '09:18', who: 'You', did: 'Plan approved', cost: 'recorded' },
  { at: '09:22', who: 'Goal', did: 'Markdown ready', cost: 'saved' },
];

export default function MockAuditRows() {
  const [ref, played] = useMockPlay(ROWS.length, { step: 90 });

  return (
    <MockFrame ref={ref}>
      {ROWS.map((row, i) => (
        <Box
          key={row.at}
          sx={{
            display: 'grid',
            gridTemplateColumns: '34px 1fr auto',
            alignItems: 'center',
            gap: 1,
            minHeight: 22,
            opacity: played > i ? 1 : 0,
            transform: played > i ? 'none' : 'translateY(4px)',
            transition: `opacity 260ms ${SETTLE}, transform 260ms ${SETTLE}`,
            [REDUCED_MOTION]: { transition: 'none', opacity: 1, transform: 'none' },
          }}
        >
          <MockText tone="faint" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.625rem' }}>
            {row.at}
          </MockText>
          <MockText sx={{ fontSize: '0.625rem' }}>
            {row.who} - {row.did}
          </MockText>
          <MockText tone="faint" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.625rem' }}>
            {row.cost}
          </MockText>
        </Box>
      ))}
      <MockCaption>Progress, approvals, and artifacts stay with the Goal</MockCaption>
    </MockFrame>
  );
}
