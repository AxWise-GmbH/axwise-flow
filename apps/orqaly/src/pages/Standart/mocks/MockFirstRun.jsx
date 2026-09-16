/**
 * Silhouette: ticked checkbox rows.
 *
 * The simplest drawing on the page, deliberately. The claim is "day one is not
 * an empty screen", and a list of things already done is the most direct way to
 * say it. Anything more elaborate would be arguing.
 */
import { MockCaption, MockFrame, MockLine, MockText } from './mockChrome';
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import useMockPlay from './useMockPlay';

const STEPS = [
  'Personal account created',
  'Clerk session verified',
  'Assistant ready',
  'Goal started',
  'Scope recorded',
  'Plan ready to review',
];

export default function MockFirstRun() {
  const [ref, played] = useMockPlay(STEPS.length, { step: 110 });

  return (
    <MockFrame ref={ref}>
      {STEPS.map((step, i) => (
        <MockLine key={step} index={i} sx={{ '&:not(:first-of-type)': { borderTop: 'none' } }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              flexShrink: 0,
              borderRadius: '2px',
              border: `1px solid ${played > i ? INK.bright : INK.line}`,
              bgcolor: played > i ? INK.bright : 'transparent',
              transition: `background-color 280ms ${SETTLE}, border-color 280ms ${SETTLE}`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          />
          <MockText tone={played > i ? 'dim' : 'faint'}>{step}</MockText>
        </MockLine>
      ))}
      <MockCaption>The launch path stays personal and focused</MockCaption>
    </MockFrame>
  );
}
