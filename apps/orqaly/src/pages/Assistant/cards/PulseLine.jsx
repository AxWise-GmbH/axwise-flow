import { Box, useTheme, alpha } from '@mui/material';
import { keyframes } from '@mui/system';

// Stylised ECG / heartbeat path: flat baseline, small P bump, sharp QRS spike,
// small T bump - repeated across the width. Built once (no Math.random) so
// renders and tests stay stable.
const BASE = 60;
const CYCLE = 160;
const CYCLES = 3;
const seg = (x) =>
  `L ${x + 34} ${BASE} L ${x + 44} ${BASE - 8} L ${x + 54} ${BASE} ` +
  `L ${x + 76} ${BASE} L ${x + 82} ${BASE + 10} L ${x + 88} ${BASE - 44} ` +
  `L ${x + 96} ${BASE + 44} L ${x + 102} ${BASE} L ${x + 112} ${BASE - 6} ` +
  `L ${x + 124} ${BASE} L ${x + 160} ${BASE}`;
const PULSE_PATH = `M 0 ${BASE} ${Array.from({ length: CYCLES }, (_, i) => seg(i * CYCLE)).join(' ')}`;

// A bright dash sweeps along the line like a heart-rate monitor. pathLength is
// normalised to 100 so the dash + offset maths is resolution-independent.
const sweep = keyframes`
  from { stroke-dashoffset: 100; }
  to { stroke-dashoffset: 0; }
`;

/**
 * Animated heartbeat pulse. Matches the Voice block's aesthetic: brand-coloured,
 * a smooth infinite loop, and a static fallback under prefers-reduced-motion.
 */
export default function PulseLine({ height = 120, ariaLabel = 'Assistant activity pulse' }) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;

  return (
    <Box
      sx={{ mt: 'auto', pt: 1.5, width: '100%', height }}
      role="img"
      aria-label={ariaLabel}
      data-testid="profile-pulse"
    >
      <Box
        component="svg"
        viewBox="0 0 480 120"
        preserveAspectRatio="none"
        sx={{ width: '100%', height: '100%', display: 'block' }}
      >
        {/* Faint full trace */}
        <path
          d={PULSE_PATH}
          fill="none"
          stroke={alpha(accent, 0.18)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Travelling pulse */}
        <Box
          component="path"
          d={PULSE_PATH}
          pathLength={100}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          sx={{
            strokeDasharray: '14 86',
            filter: `drop-shadow(0 0 3px ${alpha(accent, 0.7)})`,
            animation: `${sweep} 2.4s linear infinite`,
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              strokeDasharray: 'none',
            },
          }}
        />
      </Box>
    </Box>
  );
}
