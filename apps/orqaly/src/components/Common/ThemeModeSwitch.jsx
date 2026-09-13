import { useState } from 'react';
import { Box, useTheme } from '@mui/material';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import GlassIcon from '../icons/GlassIcon';

const trackWidth = 96;
const trackHeight = 40;
const thumbSize = 34;
const padding = 3;
const thumbOffset = padding;

/**
 * Theme switch: sun (light) and moon (dark). Click to toggle.
 * A sliding cover pill contains the active icon; inactive icon stays grayed in place.
 */
export default function ThemeModeSwitch({ mode, onClick, sx = {}, ...props }) {
  const isLight = mode === 'light';
  const [pressed, setPressed] = useState(false);
  const theme = useTheme();

  const handleClick = (e) => {
    setPressed(true);
    onClick(e);
    setTimeout(() => setPressed(false), 120);
  };

  const coverTranslateX = isLight ? 0 : trackWidth - thumbSize - thumbOffset * 2;
  const coverTop = (trackHeight - thumbSize) / 2;

  return (
    <Box
      role="switch"
      aria-checked={!isLight}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      onClick={handleClick}
      sx={{
        position: 'relative',
        width: trackWidth,
        height: trackHeight,
        minHeight: trackHeight,
        borderRadius: trackHeight / 2,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.25,
        transition: 'transform 0.15s ease',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        ...sx,
      }}
      {...props}
    >
      {/* Sliding cover — soft shadow only, no dark ring */}
      <Box
        sx={{
          position: 'absolute',
          left: thumbOffset,
          top: coverTop,
          width: thumbSize,
          height: thumbSize,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 2,
          transform: `translateX(${coverTranslateX}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isLight ? (
          <GlassIcon
            name="LightModeOutlined"
            fallback={LightModeOutlinedIcon}
            size={20}
            tone={theme.palette.warning.main}
          />
        ) : (
          <GlassIcon
            name="DarkModeOutlined"
            fallback={DarkModeOutlinedIcon}
            size={20}
            tone={theme.palette.primary.main}
          />
        )}
      </Box>

      {/* Sun icon — visible only when dark (inactive grayed); hidden when cover is on left */}
      <Box
        sx={{
          flex: 1,
          height: trackHeight,
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
          visibility: isLight ? 'hidden' : 'visible',
          opacity: isLight ? 0 : 0.5,
          transition: 'opacity 0.3s ease, visibility 0.2s ease',
        }}
      >
        <GlassIcon
          name="LightModeOutlined"
          fallback={LightModeOutlinedIcon}
          size={20}
          tone="neutral"
        />
      </Box>

      {/* Moon icon — visible only when light (inactive grayed); hidden when cover is on right */}
      <Box
        sx={{
          flex: 1,
          height: trackHeight,
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
          visibility: !isLight ? 'hidden' : 'visible',
          opacity: !isLight ? 0 : 0.5,
          transition: 'opacity 0.3s ease, visibility 0.2s ease',
        }}
      >
        <GlassIcon
          name="DarkModeOutlined"
          fallback={DarkModeOutlinedIcon}
          size={20}
          tone="neutral"
        />
      </Box>
    </Box>
  );
}
