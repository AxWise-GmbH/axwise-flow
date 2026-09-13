import { useState, useCallback } from 'react';
import {
  Fab,
  Box,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
  keyframes,
} from '@mui/material';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CircularProgress from '@mui/material/CircularProgress';
import AnimatedButton from '../Common/AnimatedButton';

import AppIcon from '../icons/AppIcon';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.05); }
`;

const sparkleShine = keyframes`
  0% { transform: scale(1) rotate(0deg); opacity: 1; filter: brightness(1); }
  15% { transform: scale(1.45) rotate(-12deg); opacity: 0.9; filter: brightness(1.4); }
  35% { transform: scale(1.35) rotate(14deg); opacity: 1; filter: brightness(1.5); }
  55% { transform: scale(1.2) rotate(-6deg); opacity: 1; filter: brightness(1.25); }
  75% { transform: scale(1.08) rotate(3deg); opacity: 1; filter: brightness(1.1); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; filter: brightness(1); }
`;

export default function VoiceControlButton({
  state,
  isSupported,
  error,
  onStart,
  onStop,
  onOpenTypeMode,
  variant = 'fab',
  voiceState,
  'aria-label': ariaLabel = 'Voice control',
}) {
  const theme = useTheme();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [sparkleAnimating, setSparkleAnimating] = useState(false);
  const effectiveState = voiceState ?? state;
  const isListening = effectiveState === 'listening';
  const isProcessing = effectiveState === 'processing';
  const isHeader = variant === 'header';

  const triggerSparkle = useCallback(() => {
    setSparkleAnimating(true);
    setTimeout(() => setSparkleAnimating(false), 900);
  }, []);

  const tooltipTitle = error
    ? error.includes('internet') || error.includes('network')
      ? 'Connection issue — use the dialog to type or try again'
      : error
    : isListening
      ? 'Recording... (stop in pop-up)'
      : isProcessing
        ? 'Processing...'
        : 'Click to open voice command';

  if (isHeader) {
    const placement = 'bottom';
    const isDark = theme.palette.mode === 'dark';
    const { main, light, dark } = theme.palette.primary;
    const sparkleGradient = `radial-gradient(circle at 35% 45%, ${light} 0%, ${main} 55%, ${dark} 100%)`;
    const shadowRest = isDark ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.06)';
    const innerCircle = (
      <Box
        component="span"
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isListening ? undefined : sparkleGradient,
          bgcolor: isListening ? 'error.main' : undefined,
          color: '#fff',
          boxShadow: shadowRest,
          transition: 'box-shadow 0.2s ease',
          animation: isListening ? `${pulse} 1.2s ease-in-out infinite` : 'none',
          pointerEvents: 'none',
        }}
      >
        {isProcessing ? (
          <CircularProgress size={16} sx={{ color: '#fff' }} />
        ) : (
          <AppIcon
            name="AutoAwesome"
            fallback={AutoAwesomeIcon}
            sx={{
              fontSize: 16,
              animation: sparkleAnimating ? `${sparkleShine} 0.9s ease-out` : 'none',
            }}
          />
        )}
      </Box>
    );

    return (
      <Tooltip
        title={tooltipTitle}
        placement={placement}
        open={tooltipOpen || !!error}
        onOpen={() => setTooltipOpen(true)}
        onClose={() => setTooltipOpen(false)}
      >
        {isListening || isProcessing ? (
          innerCircle
        ) : (
          <AnimatedButton size={28}>{innerCircle}</AnimatedButton>
        )}
      </Tooltip>
    );
  }

  if (!isSupported) {
    return (
      <Tooltip
        title="Voice needs Chrome/Edge on HTTPS — or click to type your command"
        placement="left"
      >
        <Fab
          color="primary"
          onClick={onOpenTypeMode}
          sx={{
            position: 'fixed',
            bottom: { xs: 20, sm: 24 },
            right: { xs: 20, sm: 24 },
            zIndex: theme.zIndex.speedDial,
            width: 56,
            height: 56,
            bgcolor: theme.palette.primary.main,
            color: '#fff',
            '&:hover': { bgcolor: theme.palette.primary.dark },
          }}
          aria-label="Open command dialog to type your command"
        >
          <AppIcon name="MicNoneOutlined" fallback={MicNoneOutlinedIcon} />
        </Fab>
      </Tooltip>
    );
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: 20, sm: 24 },
        right: { xs: 20, sm: 24 },
        zIndex: theme.zIndex.speedDial,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 1,
      }}
    >
      {(isListening || isProcessing) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.2),
          }}
        >
          {isProcessing ? (
            <>
              <CircularProgress size={20} sx={{ color: 'primary.main' }} />
              <Typography variant="body2" fontWeight={600} color="text.primary">
                Processing your request...
              </Typography>
            </>
          ) : (
            <>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: 'error.main',
                  animation: `${pulse} 1.2s ease-in-out infinite`,
                }}
              />
              <Typography variant="body2" fontWeight={600} color="text.primary">
                Listening...
              </Typography>
              <Tooltip title="Stop listening" placement="left">
                <IconButton
                  size="small"
                  onClick={onStop}
                  color="error"
                  aria-label="Stop listening"
                  sx={{ ml: 0.5 }}
                >
                  <AppIcon name="StopOutlined" fallback={StopOutlinedIcon} fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      )}
      <Tooltip
        title={tooltipTitle}
        placement="left"
        open={tooltipOpen || !!error}
        onOpen={() => setTooltipOpen(true)}
        onClose={() => setTooltipOpen(false)}
      >
        <Fab
          color="primary"
          onClick={(e) => {
            navigator.vibrate?.(50);
            (isListening ? onStop : onStart)(e);
          }}
          disabled={isProcessing}
          sx={{
            width: { xs: 64, sm: 56 },
            height: { xs: 64, sm: 56 },
            touchAction: 'manipulation',
            bgcolor: isListening ? theme.palette.error.main : theme.palette.primary.main,
            color: '#fff',
            animation: isListening ? `${pulse} 1.2s ease-in-out infinite` : 'none',
            '&:hover': {
              bgcolor: isListening ? theme.palette.error.dark : theme.palette.primary.dark,
            },
            '&.Mui-disabled': {
              bgcolor: theme.palette.action.disabledBackground,
              color: theme.palette.action.disabled,
            },
          }}
          aria-label={ariaLabel}
          aria-live="polite"
          aria-busy={isProcessing}
        >
          {isProcessing ? (
            <CircularProgress size={28} sx={{ color: 'inherit' }} />
          ) : (
            <AppIcon name="MicOutlined" fallback={MicOutlinedIcon} />
          )}
        </Fab>
      </Tooltip>
    </Box>
  );
}
