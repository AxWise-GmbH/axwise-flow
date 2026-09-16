import { Box, ToggleButton, ToggleButtonGroup, Typography, alpha, useTheme } from '@mui/material';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';

import AppIcon from '../icons/AppIcon';

/**
 * Two-segment pill: switches the assistant between **Do** (execute) and
 * **Talk** (brainstorm — no tool calls). Renders just above the input bar.
 */
export default function ModePill({ mode = 'execute', onChange }) {
  const theme = useTheme();
  const { main, light } = theme.palette.primary;
  const isDark = theme.palette.mode === 'dark';

  const handleChange = (_e, next) => {
    if (next && next !== mode) onChange?.(next);
  };

  const helper =
    mode === 'talk'
      ? 'Think out loud — no actions will run.'
      : 'Ask anything — I’ll run the right action.';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        mb: 1,
        width: '100%',
      }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={handleChange}
        aria-label="Assistant mode"
        sx={{
          bgcolor: alpha(isDark ? '#ffffff' : main, isDark ? 0.06 : 0.1),
          border: '1px solid',
          borderColor: alpha(isDark ? '#ffffff' : light, isDark ? 0.1 : 0.2),
          borderRadius: 100,
          p: 0.25,
          '& .MuiToggleButtonGroup-grouped': {
            border: 0,
            borderRadius: 100,
            mx: 0.25,
            px: 1.5,
            py: 0.25,
            color: alpha('#ffffff', 0.55),
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.72rem',
            letterSpacing: 0.3,
            transition: 'all 0.2s ease',
            '&.Mui-selected': {
              bgcolor: alpha(main, 0.4),
              color: '#fff',
              boxShadow: `0 2px 10px ${alpha(main, 0.3)}`,
            },
            '&.Mui-selected:hover': {
              bgcolor: alpha(main, 0.5),
            },
            '&:hover': {
              bgcolor: alpha('#ffffff', 0.06),
              color: '#fff',
            },
          },
        }}
      >
        <ToggleButton value="execute" aria-label="Do mode — execute actions">
          <AppIcon name="BoltRounded" fallback={BoltRoundedIcon} sx={{ fontSize: 14, mr: 0.5 }} />
          Do
        </ToggleButton>
        <ToggleButton value="talk" aria-label="Talk mode — brainstorm only">
          <AppIcon
            name="ChatBubbleOutlineRounded"
            fallback={ChatBubbleOutlineRoundedIcon}
            sx={{ fontSize: 14, mr: 0.5 }}
          />
          Talk
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography
        variant="caption"
        sx={{
          color: alpha('#ffffff', 0.4),
          fontSize: '0.66rem',
          letterSpacing: 0.2,
        }}
      >
        {helper}
      </Typography>
    </Box>
  );
}
