import { Box, Typography, Tooltip, useMediaQuery, useTheme, alpha } from '@mui/material';
import { useAxwise } from '../../hooks/useAxwise';
import { usePulseBarPref } from '../../hooks/usePulseBarPref';
import { usePulseFeed } from '../../hooks/usePulseFeed';

const SEVERITY_KEY = { ok: 'success', warn: 'warning', error: 'error' };

/**
 * Mobile-only AxWise pill for the app header, shown next to the avatar. On small
 * screens it IS the minimized representation of the PulseBar (the floating
 * corner pill is suppressed there). Tapping it opens the bar (collapsed view).
 * Self-gated: renders nothing on desktop, when AxWise is disabled/hidden, or
 * when the bar is not in the minimized view. Safe to mount unconditionally.
 */
export default function AxwiseHeaderPill() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isAxwiseEnabled } = useAxwise();
  const { hidden, view, setView } = usePulseBarPref();
  const active = isMobile && isAxwiseEnabled && !hidden && view === 'minimized';
  // Only poll while the pill is actually shown (avoids a second feed poll
  // alongside the PulseBar's, and any polling at all on desktop).
  const { summary } = usePulseFeed({ enabled: active });

  if (!active) return null;

  const key = SEVERITY_KEY[summary.worst] || 'success';
  const color = theme.palette[key].main;

  return (
    <Tooltip title="Show AxWise activity">
      <Box
        role="button"
        aria-label="Show AxWise status bar"
        onClick={() => setView('collapsed')}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.6,
          px: 1,
          py: 0.4,
          borderRadius: '999px',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          cursor: 'pointer',
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            bgcolor: color,
            boxShadow: `0 0 8px ${alpha(color, 0.7)}`,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: 'text.secondary', lineHeight: 1 }}
        >
          {summary.axwise}
        </Typography>
      </Box>
    </Tooltip>
  );
}
