import { Box, alpha, useTheme } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';

import AppIcon from '../icons/AppIcon';

/**
 * Hollow "glowing ring" step icon for the setup wizards - a transparent circle
 * with a colored border + number inside. The active step's ring glows; completed
 * steps show a check. Pass as the StepButton `icon` prop with the active/completed
 * state computed by the caller. Reduced-motion drops the transition only.
 */
export default function WizardStepIcon({ active = false, completed = false, number }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const on = active || completed;
  return (
    <Box
      sx={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid',
        borderColor: on ? tint : alpha(theme.palette.text.primary, 0.22),
        color: on ? tint : 'text.secondary',
        bgcolor: completed ? alpha(tint, 0.12) : 'transparent',
        fontWeight: 800,
        fontSize: '0.82rem',
        lineHeight: 1,
        boxShadow: active
          ? `0 0 0 4px ${alpha(tint, 0.14)}, 0 0 12px ${alpha(tint, 0.55)}`
          : 'none',
        transition: 'border-color 250ms ease, box-shadow 250ms ease, color 250ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {completed ? (
        <AppIcon name="CheckRounded" fallback={CheckRoundedIcon} sx={{ fontSize: 18 }} />
      ) : (
        number
      )}
    </Box>
  );
}
