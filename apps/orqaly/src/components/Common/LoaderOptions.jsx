import { Box, keyframes, useTheme, alpha } from '@mui/material';

// --- Animations ---
const ripple = keyframes`0% { transform: scale(0); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; }`;

// --- Option 2: Ripple (Clean, minimal, high-tech) ---
export function LoaderRipple({ size = 50, color }) {
  const theme = useTheme();
  const c = color || theme.palette.primary.main;
  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: `2px solid ${c}`,
          opacity: 0,
          animation: `${ripple} 2s cubic-bezier(0, 0.2, 0.8, 1) infinite`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: `2px solid ${c}`,
          opacity: 0,
          animation: `${ripple} 2s cubic-bezier(0, 0.2, 0.8, 1) infinite`,
          animationDelay: '-1s',
        }}
      />
      <Box
        sx={{
          width: size * 0.24,
          height: size * 0.24,
          bgcolor: c,
          borderRadius: '50%',
          boxShadow: `0 0 20px ${c}`,
        }}
      />
    </Box>
  );
}
