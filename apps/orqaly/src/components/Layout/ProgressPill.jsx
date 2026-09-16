/**
 * ProgressPill - a compact top-bar pill with a circular progress ring, a centered
 * `done/total` counter, a label, and a status subtitle. Extracted from the Setup
 * header so the same pill can back Setup, Organizations, and any future flow.
 */
import { Box, alpha, useTheme } from '@mui/material';

export default function ProgressPill({
  label,
  done = 0,
  total = 0,
  loading = false,
  allDone = false,
  subtitle,
  ariaLabel,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const controlSize = 40;
  const shadowRest = isDark
    ? '0 4px 12px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)'
    : '0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)';
  const shadowHover = isDark
    ? '0 8px 24px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.2)'
    : '0 8px 24px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)';

  const frac = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const circumference = 2 * Math.PI * 11;

  return (
    <Box
      role="heading"
      aria-level={1}
      aria-label={ariaLabel || `${label} progress: ${done} of ${total}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        height: controlSize,
        pl: 0.6,
        pr: 1.75,
        borderRadius: controlSize / 2,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: allDone ? alpha(theme.palette.primary.main, 0.4) : 'divider',
        boxShadow: allDone
          ? `${shadowRest}, 0 0 12px ${alpha(theme.palette.primary.main, 0.15)}`
          : shadowRest,
        transition: 'all 0.3s ease',
        '&:hover': { boxShadow: shadowHover },
        overflow: 'visible',
      }}
    >
      {/* Circular progress ring */}
      <Box sx={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
        <svg
          width={28}
          height={28}
          viewBox="0 0 28 28"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Track ring */}
          <circle
            cx={14}
            cy={14}
            r={11}
            fill="none"
            stroke={alpha(theme.palette.primary.main, isDark ? 0.12 : 0.1)}
            strokeWidth={2.5}
          />
          {/* Progress arc */}
          <circle
            cx={14}
            cy={14}
            r={11}
            fill="none"
            stroke={theme.palette.primary.main}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - (loading ? 0 : frac))}`}
            style={{
              transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>
        {/* Counter text in the center */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.6rem',
            fontWeight: 800,
            fontFeatureSettings: '"tnum" 1',
            color: allDone ? 'primary.main' : 'text.secondary',
            lineHeight: 1,
          }}
        >
          {loading ? '…' : `${done}/${total}`}
        </Box>
      </Box>

      {/* Label + subtitle */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            color: 'text.primary',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: '0.58rem',
            fontWeight: 600,
            letterSpacing: '0.03em',
            lineHeight: 1,
            color: allDone ? 'primary.main' : 'text.disabled',
            whiteSpace: 'nowrap',
            transition: 'color 0.3s ease',
          }}
        >
          {loading ? 'Loading…' : allDone ? 'Complete ✓' : subtitle}
        </Box>
      </Box>
    </Box>
  );
}
