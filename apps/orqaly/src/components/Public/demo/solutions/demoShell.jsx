import { Box, alpha, useTheme } from '@mui/material';

export function useGlassPanelSx() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return {
    borderRadius: 4,
    overflow: 'hidden',
    bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
  };
}

export function GlassPanel({ children, sx = {} }) {
  const panel = useGlassPanelSx();
  return <Box sx={{ ...panel, ...sx }}>{children}</Box>;
}
