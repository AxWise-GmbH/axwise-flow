import { alpha } from '@mui/material';

/** Shared device-frame styles for Simple Mode UI screenshot mocks. */
export function simpleModeFrameSx(theme) {
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return {
    position: 'relative',
    borderRadius: 4,
    overflow: 'hidden',
    bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
  };
}

export function simpleModeLabelSx() {
  return {
    fontWeight: 800,
    fontSize: '0.72rem',
    color: 'text.secondary',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };
}
