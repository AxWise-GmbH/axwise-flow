/**
 * Silhouette: two pass/fail columns resolving to one outcome.
 *
 * The only mockup with a verdict box at the bottom, which is what separates it
 * from the other list shapes. Both columns have to be shown passing before the
 * outcome appears, because the claim is that BOTH suites must pass - a drawing
 * where the outcome lands first would say the tests are a formality.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import { MockCaption, MockFrame, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const SUITES = [
  { label: 'Behaviour', checks: ['Does the job', 'Stays in scope'] },
  { label: 'Break it', checks: ['Refuses tricks', 'Keeps secrets'] },
];

export default function MockSkillForge() {
  const [ref, played] = useMockPlay(5, { step: 200, start: 320 });

  return (
    <MockFrame ref={ref}>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {SUITES.map((suite, col) => (
          <Box key={suite.label} sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.5 }}>
            <MockText tone="faint">{suite.label}</MockText>
            {suite.checks.map((check, row) => {
              const step = col * 2 + row;
              return (
                <Box
                  key={check}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    opacity: played > step ? 1 : 0.25,
                    transition: `opacity 280ms ${SETTLE}`,
                    [REDUCED_MOTION]: { transition: 'none', opacity: 1 },
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      flexShrink: 0,
                      borderRadius: '2px',
                      border: `1px solid ${played > step ? INK.bright : INK.line}`,
                      bgcolor: played > step ? INK.bright : 'transparent',
                    }}
                  />
                  <MockText sx={{ fontSize: '0.625rem' }}>{check}</MockText>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          mt: 'auto',
          mb: 0.5,
          px: 1,
          py: 0.75,
          borderRadius: '8px',
          border: `1px solid ${played > 4 ? INK.dim : INK.line}`,
          textAlign: 'center',
          opacity: played > 4 ? 1 : 0.3,
          transition: `opacity 320ms ${SETTLE}, border-color 320ms ${SETTLE}`,
          [REDUCED_MOTION]: { transition: 'none', opacity: 1 },
        }}
      >
        <MockText tone="bright" strong sx={{ textAlign: 'center' }}>
          Held for review
        </MockText>
      </Box>

      <MockCaption>Both suites, or it does not reach anyone</MockCaption>
    </MockFrame>
  );
}
