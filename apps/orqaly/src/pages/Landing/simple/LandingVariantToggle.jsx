import { Box, Typography, alpha, useTheme } from '@mui/material';

/**
 * Two-way pill toggle between the Simple and Full landing pages. Follows the
 * DESIGN_SYSTEM.md "Tabs (Pill Style)" convention (Button-in-a-Box, not MUI
 * Tabs) rather than a plain Switch, so intent ("Simple" vs "Full") is always
 * legible instead of relying on an on/off connotation.
 */
export default function LandingVariantToggle({ variant, onChange }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  const optionSx = (active) => ({
    px: 1.25,
    py: 0.5,
    borderRadius: 2.5,
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    color: active ? 'primary.main' : 'text.secondary',
    bgcolor: active ? alpha(primary, 0.1) : 'transparent',
    boxShadow: active ? `0 2px 4px ${alpha(primary, 0.1)}` : 'none',
    transition: 'background-color 180ms ease, color 180ms ease',
    minHeight: 32,
    display: 'inline-flex',
    alignItems: 'center',
  });

  return (
    <Box
      role="group"
      aria-label="Landing page style"
      sx={{
        display: 'inline-flex',
        gap: 0.25,
        p: 0.35,
        borderRadius: 3,
        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.04),
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => onChange('simple')}
        aria-pressed={variant === 'simple'}
        sx={{ ...optionSx(variant === 'simple'), border: 'none', font: 'inherit' }}
      >
        Simple
      </Box>
      <Box
        component="button"
        type="button"
        onClick={() => onChange('full')}
        aria-pressed={variant === 'full'}
        sx={{ ...optionSx(variant === 'full'), border: 'none', font: 'inherit' }}
      >
        Full
      </Box>
    </Box>
  );
}
