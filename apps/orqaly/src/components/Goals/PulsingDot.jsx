/**
 * PulsingDot — small animated status indicator dot.
 *
 * Used in:
 *   - GoalNowExecuting header (live activity indicator)
 *   - GoalLiveCards active stage card (pulsing border accent)
 *
 * Reuses the `pulse` keyframes pattern from GoalLiveCards.jsx but
 * defines its own keyframes locally so it works standalone.
 */
import { Box, useTheme } from '@mui/material';
import { keyframes } from '@mui/system';

const pulseAnim = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 currentColor, 0 0 0 0 currentColor; opacity: 1; }
  50% { box-shadow: 0 0 0 4px transparent, 0 0 8px 2px currentColor; opacity: 0.85; }
`;

const STATUS_COLORS = {
  running: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
  paused: 'text.disabled',
  idle: 'text.disabled',
};

export default function PulsingDot({ status = 'running', size = 8, paused = false }) {
  const theme = useTheme();
  const colorKey = STATUS_COLORS[status] || STATUS_COLORS.running;
  // Resolve theme path like "success.main" → actual color
  const resolved = colorKey.split('.').reduce((acc, k) => acc?.[k], theme.palette) || colorKey;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: resolved,
        color: resolved, // currentColor in keyframes resolves to this
        flexShrink: 0,
        animation: paused ? 'none' : `${pulseAnim} 1.6s ease-in-out infinite`,
      }}
    />
  );
}
